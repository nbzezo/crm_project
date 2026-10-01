import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { defaultOwner, pushScope, scopeWhereOrUnowned } from '../lib/scope.ts';
import { intParam, parseBody, required } from '../lib/validate.ts';
import { buildSearchText, fold } from '../lib/viSearch.ts';
import { CONTRACT_KINDS, CONTRACT_TERMS, REVENUE_STAGES, SERVICE_STATUSES } from '../lib/crm.ts';
import { assertCrmCustomer, assertEntityLinks } from '../lib/entityRelations.ts';
import { HttpError } from '../lib/validate.ts';
import { mergeRevenueCell, type RevenueCell as MonthCell } from '../services/revenueService.ts';
import {
  baseFromPeriod,
  compareLine,
  effectiveAnchor,
  groupOf,
  parseGroupFilter,
  yearPeriods,
  type AnchorMode,
  type LineAnchor,
  type RevenueGroup,
} from '../services/revenueSegments.ts';
import { actorContactId } from '../middleware/currentUser.ts';
import type { ContractKind, ServiceStatus } from '@workflow/contracts';

const router = Router();

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

const lineSchema = z.object({
  customer_id: z.number().int(),
  service_id: z.number().int().nullable().optional(),
  contract_id: z.number().int().nullable().optional(),
  am: z.string().nullable().optional(),
  contract_kind: z.enum(CONTRACT_KINDS).optional(),
  contract_term: z.enum(CONTRACT_TERMS).optional(),
  status: z.enum(SERVICE_STATUSES).optional(),
  start_date: dateOnly.optional(),
  end_date: dateOnly.optional(),
  notes: z.string().optional(),
});

const revenueSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Ky phai co dang YYYY-MM'),
  amount_vnd: z.number().int().min(0).optional(),
  forecast_vnd: z.number().int().min(0).optional(),
  stage: z.enum(REVENUE_STAGES).optional(),
  note: z.string().optional(),
});

function assertLineDates(value: Record<string, unknown>): void {
  const start = value.start_date as string | null | undefined;
  const end = value.end_date as string | null | undefined;
  if (start && end && end < start) {
    throw new HttpError(422, 'Ngày kết thúc dịch vụ không được trước ngày bắt đầu', {
      code: 'INVALID_DATE_RANGE',
    });
  }
}

const LINE_SELECT = `
  SELECT cs.*, c.name AS customer_name, c.short_name AS customer_short_name, c.status AS customer_status,
         s.name AS service_name, k.name AS contract_name, k.number AS contract_number
    FROM customer_services cs
    JOIN customers c ON c.id = cs.customer_id AND c.org_kind = 'customer'
    LEFT JOIN services s ON s.id = cs.service_id
    LEFT JOIN contracts k ON k.id = cs.contract_id`;

/**
 * Tong cua mot pham vi: so tien tong + so du kien ban dau + so tien dang nam o tung giai doan
 * (cac o stage_* la tong ROI NHAU, phia hien thi tu cong don thanh phieu neu can).
 */
interface Totals {
  amount_vnd: number;
  forecast_vnd: number;
  stage_forecast_vnd: number;
  stage_reconciled_vnd: number;
  stage_invoiced_vnd: number;
  stage_paid_vnd: number;
}

function emptyTotals(): Totals {
  return {
    amount_vnd: 0,
    forecast_vnd: 0,
    stage_forecast_vnd: 0,
    stage_reconciled_vnd: 0,
    stage_invoiced_vnd: 0,
    stage_paid_vnd: 0,
  };
}

/** Nam hop le, mac dinh la nam hien tai theo gio may. */
function resolveYear(value: unknown): number {
  const year = Number(value);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : new Date().getFullYear();
}

/**
 * Bo loc dung chung cho danh sach dong va bang tong hop.
 *
 * Nhan ca `req` chu khong chi `query`: dieu kien pham vi du lieu phai ghep o
 * DAY, khong phai o tung endpoint. `/summary` nhung lai bo loc nay vao bon truy
 * van tong hop khac nhau — them o mot cho ma quen ba cho kia se cho ra nhung con
 * so khong khop voi danh sach ben canh.
 */
function buildFilters(req: Request): { sql: string; params: unknown[] } {
  const query = req.query as Record<string, unknown>;
  const where: string[] = [];
  const params: unknown[] = [];

  const q = fold(String(query.q ?? '').trim());
  if (q) {
    where.push(`(cs.search_text LIKE '%' || ? || '%' OR c.search_text LIKE '%' || ? || '%')`);
    params.push(q, q);
  }
  if (query.customer_id) {
    where.push('cs.customer_id = ?');
    params.push(Number(query.customer_id));
  }
  if (query.service_id) {
    where.push('cs.service_id = ?');
    params.push(Number(query.service_id));
  }
  if (query.status) {
    where.push('cs.status = ?');
    params.push(String(query.status));
  }
  if (query.contract_kind) {
    where.push('cs.contract_kind = ?');
    params.push(String(query.contract_kind));
  }
  if (query.contract_term) {
    where.push('cs.contract_term = ?');
    params.push(String(query.contract_term));
  }
  if (query.am) {
    where.push('cs.am = ?');
    params.push(String(query.am));
  }
  pushScope(where, params, scopeWhereOrUnowned(req, 'revenues', 'read', 'cs.owner_contact_id'));
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

function addCell(totals: Totals, cell: MonthCell): void {
  totals.amount_vnd += cell.amount_vnd;
  totals.forecast_vnd += cell.forecast_vnd;
  if (cell.stage === 'forecast') totals.stage_forecast_vnd += cell.amount_vnd;
  else if (cell.stage === 'reconciled') totals.stage_reconciled_vnd += cell.amount_vnd;
  else if (cell.stage === 'invoiced') totals.stage_invoiced_vnd += cell.amount_vnd;
  else totals.stage_paid_vnd += cell.amount_vnd;
}

function inList(ids: number[]): string {
  return ids.map(() => '?').join(',');
}

/** Thang dau tien co doanh thu > 0 cua tung dong (moi nam) — moc tu dong. */
function loadFirstPeriods(ids: number[]): Map<number, string> {
  if (ids.length === 0) return new Map();
  const rows = db
    .prepare(
      `SELECT line_id, MIN(period) AS period FROM service_revenues
        WHERE amount_vnd > 0 AND line_id IN (${inList(ids)}) GROUP BY line_id`
    )
    .all(...ids) as { line_id: number; period: string }[];
  return new Map(rows.map((r) => [r.line_id, r.period]));
}

/** TB thang nam truoc nhap tay, dung de so voi nam `year`. */
function loadBaselines(ids: number[], year: number): Map<number, number> {
  if (ids.length === 0) return new Map();
  const rows = db
    .prepare(
      `SELECT line_id, avg_monthly_vnd FROM revenue_baselines
        WHERE year = ? AND line_id IN (${inList(ids)})`
    )
    .all(year, ...ids) as { line_id: number; avg_monthly_vnd: number }[];
  return new Map(rows.map((r) => [r.line_id, r.avg_monthly_vnd]));
}

function anchorOf(line: Record<string, unknown>, first: Map<number, string>): LineAnchor {
  return {
    mode: (line.revenue_anchor_mode as AnchorMode | undefined) ?? 'auto',
    manual_period: (line.revenue_anchor_period as string | null | undefined) ?? null,
    first_period: first.get(Number(line.id)) ?? null,
  };
}

/** Nhom cua tung thang trong nam cho mot dong. */
function groupsOf(line: Record<string, unknown>, anchor: LineAnchor, year: number) {
  const kind = line.contract_kind as ContractKind;
  return Object.fromEntries(yearPeriods(year).map((p) => [p, groupOf(p, kind, anchor)])) as Record<
    string,
    RevenueGroup
  >;
}

function loadCells(ids: number[], yearPattern: string) {
  if (ids.length === 0) return [];
  return db
    .prepare(
      `SELECT line_id, period, amount_vnd, forecast_vnd, stage, note FROM service_revenues
        WHERE period LIKE ? AND line_id IN (${inList(ids)})`
    )
    .all(yearPattern, ...ids) as (MonthCell & { line_id: number; period: string })[];
}

/**
 * Gan ma tran 12 thang cua nam vao tung dong + tong cua dong + nhom tung thang.
 * Khi co `only`, tong cua dong chi cong cac thang thuoc nhom dang xem.
 */
function attachMonths<L extends Record<string, unknown>>(
  lines: L[],
  year: number,
  only: Set<RevenueGroup> | null = null
) {
  const ids = lines.map((l) => Number(l.id));
  const cells = loadCells(ids, `${year}-%`);
  const first = loadFirstPeriods(ids);
  const baselines = loadBaselines(ids, year);

  const byLine = new Map<number, Record<string, MonthCell>>();
  for (const cell of cells) {
    if (!byLine.has(cell.line_id)) byLine.set(cell.line_id, {});
    byLine.get(cell.line_id)![cell.period] = {
      amount_vnd: cell.amount_vnd,
      forecast_vnd: cell.forecast_vnd,
      stage: cell.stage,
      note: cell.note,
    };
  }

  return lines.map((line) => {
    const id = Number(line.id);
    const months = byLine.get(id) ?? {};
    const anchor = anchorOf(line, first);
    const groups = groupsOf(line, anchor, year);
    const totals = emptyTotals();
    for (const [period, cell] of Object.entries(months)) {
      if (!only || only.has(groups[period])) addCell(totals, cell);
    }
    return {
      ...line,
      months,
      totals,
      groups,
      anchor: {
        ...anchor,
        effective: effectiveAnchor(anchor),
        base_from: baseFromPeriod(anchor),
      },
      baseline_avg_vnd: baselines.get(id) ?? null,
    };
  });
}

/* ---------- Dong dich vu (khach hang x dich vu dang su dung) ---------- */

/** Dong theo bo loc; khi co `group`, chi giu dong co it nhat mot thang thuoc nhom do. */
function selectLines(req: Request, year: number) {
  const only = parseGroupFilter(req.query.group);
  const { sql, params } = buildFilters(req);
  const lines = db
    .prepare(
      `${LINE_SELECT} ${sql}
        ORDER BY c.name COLLATE NOCASE, s.name COLLATE NOCASE, cs.id`
    )
    .all(...params) as Record<string, unknown>[];
  const attached = attachMonths(lines, year, only);
  return {
    only,
    lines: only
      ? attached.filter((line) => Object.values(line.groups).some((g) => only.has(g)))
      : attached,
  };
}

router.get('/lines', (req, res) => {
  const year = resolveYear(req.query.year);
  res.json({ year, lines: selectLines(req, year).lines });
});

router.post('/lines', (req, res) => {
  const body = parseBody(lineSchema, req);
  assertEntityLinks(db, body);
  assertCrmCustomer(db, body.customer_id);
  assertLineDates(body);
  const info = db
    .prepare(
      `INSERT INTO customer_services (customer_id, service_id, contract_id, am, contract_kind,
                                      contract_term, status, start_date, end_date, notes, search_text,
                                      owner_contact_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      body.customer_id,
      body.service_id ?? null,
      body.contract_id ?? null,
      body.am ?? null,
      body.contract_kind ?? 'new',
      body.contract_term ?? 'long',
      body.status ?? 'using',
      body.start_date ?? null,
      body.end_date ?? null,
      body.notes ?? '',
      buildSearchText(body.am, body.notes),
      defaultOwner(req)
    );
  res.status(201).json(reloadLine(Number(info.lastInsertRowid), new Date().getFullYear()));
});

router.get('/lines/:id', (req, res) => {
  const id = intParam(req.params.id);
  const year = resolveYear(req.query.year);
  res.json(required(reloadLine(id, year), 'Khong tim thay dong dich vu'));
});

router.patch('/lines/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(lineSchema.partial(), req);
  const current = required(
    db.prepare(`SELECT * FROM customer_services WHERE id = ?`).get(id),
    'Khong tim thay dong dich vu'
  ) as Record<string, unknown>;
  const merged = { ...current, ...body };
  assertEntityLinks(db, {
    customer_id: merged.customer_id as number,
    service_id: merged.service_id as number | null,
    contract_id: merged.contract_id as number | null,
  });
  assertCrmCustomer(db, merged.customer_id as number);
  assertLineDates(merged);

  db.prepare(
    `UPDATE customer_services SET customer_id = ?, service_id = ?, contract_id = ?, am = ?,
            contract_kind = ?, contract_term = ?, status = ?, start_date = ?, end_date = ?,
            notes = ?, search_text = ?, updated_at = datetime('now','localtime')
      WHERE id = ?`
  ).run(
    merged.customer_id,
    merged.service_id ?? null,
    merged.contract_id ?? null,
    merged.am ?? null,
    merged.contract_kind ?? 'new',
    merged.contract_term ?? 'long',
    merged.status ?? 'using',
    merged.start_date ?? null,
    merged.end_date ?? null,
    merged.notes ?? '',
    buildSearchText(merged.am as string, merged.notes as string),
    id
  );
  res.json(reloadLine(id, resolveYear(req.query.year)));
});

router.delete('/lines/:id', (req, res) => {
  const id = intParam(req.params.id);
  db.prepare(`DELETE FROM customer_services WHERE id = ?`).run(id);
  res.json({ ok: true });
});

function reloadLine(id: number, year: number) {
  const line = db.prepare(`${LINE_SELECT} WHERE cs.id = ?`).get(id) as
    Record<string, unknown> | undefined;
  if (!line) return undefined;
  return attachMonths([line], year)[0];
}

/* ---------- Nhap doanh thu thang: mot so tien + mot giai doan ---------- */

const upsertCell = db.prepare(
  `INSERT INTO service_revenues (line_id, period, amount_vnd, forecast_vnd, stage, note)
   VALUES (?, ?, ?, ?, ?, ?)
   ON CONFLICT(line_id, period) DO UPDATE SET
     amount_vnd = excluded.amount_vnd,
     forecast_vnd = excluded.forecast_vnd,
     stage = excluded.stage,
     note = excluded.note,
     updated_at = datetime('now','localtime')`
);

/**
 * Gop du lieu gui len voi o dang co.
 * Quy tac so du kien: khi con o giai doan "du kien" thi so du kien bam theo so dang nhap;
 * tu luc chuyen giai doan tro di, so du kien duoc giu nguyen lam moc doi chieu.
 * Neu o chua tung co so du kien (bang 0 — vi du doi trang thai truoc roi moi nhap tien)
 * thi lay chinh so dang nhap lam moc, tranh bao chenh lech ao.
 */
function readCell(lineId: number, period: string): MonthCell | undefined {
  return db
    .prepare(
      `SELECT amount_vnd, forecast_vnd, stage, note FROM service_revenues
        WHERE line_id = ? AND period = ?`
    )
    .get(lineId, period) as MonthCell | undefined;
}

router.put('/lines/:id/revenue', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(revenueSchema, req);
  required(
    db.prepare(`SELECT id FROM customer_services WHERE id = ?`).get(id),
    'Khong tim thay dong dich vu'
  );

  const next = mergeRevenueCell(readCell(id, body.period), body);
  upsertCell.run(id, body.period, next.amount_vnd, next.forecast_vnd, next.stage, next.note);
  res.json({ line_id: id, period: body.period, ...next });
});

/** Nhap nhanh nhieu thang cho mot dong (bang nhap 12 thang). */
router.put('/lines/:id/revenue-bulk', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(z.object({ cells: z.array(revenueSchema).max(24) }), req);
  required(
    db.prepare(`SELECT id FROM customer_services WHERE id = ?`).get(id),
    'Khong tim thay dong dich vu'
  );

  db.transaction(() => {
    for (const cell of body.cells) {
      const next = mergeRevenueCell(readCell(id, cell.period), cell);
      upsertCell.run(id, cell.period, next.amount_vnd, next.forecast_vnd, next.stage, next.note);
    }
  })();

  const year = body.cells.length
    ? Number(body.cells[0].period.slice(0, 4))
    : resolveYear(undefined);
  res.json(reloadLine(id, year));
});

/**
 * Chuyen giai doan hang loat cho mot ky — vi du ca thang da thu tien xong.
 * Chi dong vao o da co so lieu, khong tu tao o moi.
 */
router.put('/period-stage', (req, res) => {
  const body = parseBody(
    z.object({
      period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Ky phai co dang YYYY-MM'),
      stage: z.enum(REVENUE_STAGES),
      line_ids: z.array(z.number().int()).min(1).max(2000),
    }),
    req
  );
  const placeholders = body.line_ids.map(() => '?').join(',');
  const existing = db
    .prepare(`SELECT COUNT(*) AS n FROM customer_services WHERE id IN (${placeholders})`)
    .get(...body.line_ids) as { n: number };
  if (existing.n !== new Set(body.line_ids).size)
    throw new HttpError(422, 'Danh sach dong doanh thu co phan tu khong ton tai');
  const info = db
    .prepare(
      `UPDATE service_revenues SET stage = ?, updated_at = datetime('now','localtime')
        WHERE period = ? AND amount_vnd > 0 AND line_id IN (${placeholders})`
    )
    .run(body.stage, body.period, ...body.line_ids);
  res.json({ updated: info.changes });
});

/* ---------- Tong hop doanh thu ---------- */

/**
 * Tong doanh thu theo thang cua nam (ap dung cung bo loc voi danh sach dong),
 * kem tong ca nam, co cau theo dich vu, top khach hang va tach theo nhom
 * Moi / Mo rong / Nen.
 *
 * Tinh o TypeScript chu khong bang SQL: nhom cua mot o phu thuoc moc cua dong
 * (xem revenueSegments.ts) — giu MOT noi phan nhom de bang dong va bang tong
 * khong bao gio lech nhau.
 */
router.get('/summary', (req, res) => {
  const year = resolveYear(req.query.year);
  const { only, lines } = selectLines(req, year);

  const months = new Map<string, Totals>();
  const totals = emptyTotals();
  const byService = new Map<string, { name: string; line_count: number } & Totals>();
  const byCustomer = new Map<number, { id: number; name: string } & Totals>();
  const byGroup: Record<RevenueGroup, { totals: Totals; months: Record<string, number> }> = {
    new: { totals: emptyTotals(), months: {} },
    expansion: { totals: emptyTotals(), months: {} },
    base: { totals: emptyTotals(), months: {} },
  };

  for (const line of lines) {
    const serviceName = (line.service_name as string | null) ?? 'Chưa gán dịch vụ';
    const service = byService.get(serviceName) ?? {
      name: serviceName,
      line_count: 0,
      ...emptyTotals(),
    };
    service.line_count += 1;
    byService.set(serviceName, service);
    const customerId = Number(line.customer_id);
    const customer = byCustomer.get(customerId) ?? {
      id: customerId,
      name: line.customer_name as string,
      ...emptyTotals(),
    };
    byCustomer.set(customerId, customer);

    for (const [period, cell] of Object.entries(line.months)) {
      const group = line.groups[period];
      if (only && !only.has(group)) continue;
      if (!months.has(period)) months.set(period, emptyTotals());
      addCell(months.get(period)!, cell);
      addCell(totals, cell);
      addCell(service, cell);
      addCell(customer, cell);
      addCell(byGroup[group].totals, cell);
      byGroup[group].months[period] = (byGroup[group].months[period] ?? 0) + cell.amount_vnd;
    }
  }

  res.json({
    year,
    months: [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, value]) => ({ period, ...value })),
    totals,
    line_count: lines.length,
    by_service: [...byService.values()].sort((a, b) => b.amount_vnd - a.amount_vnd),
    by_customer: [...byCustomer.values()]
      .filter((c) => c.amount_vnd > 0)
      .sort((a, b) => b.amount_vnd - a.amount_vnd)
      .slice(0, 10),
    by_group: byGroup,
  });
});

/** Thang hien tai theo gio may — moc tach "da qua" va "sap toi" cho so du kien. */
function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * So sanh voi nam truoc va du kien ca nam, tung dong, chi tren cac thang thuoc
 * nhom dang xem (mac dinh Nen; `group=all` lay moi thang).
 */
router.get('/comparison', (req, res) => {
  const year = resolveYear(req.query.year);
  const groupParam = req.query.group ?? 'base';
  const only = groupParam === 'all' ? null : parseGroupFilter(groupParam);
  if (groupParam !== 'all' && !only) throw new HttpError(422, 'Nhom doanh thu khong hop le');
  const { sql, params } = buildFilters(req);
  const raw = db
    .prepare(`${LINE_SELECT} ${sql} ORDER BY c.name COLLATE NOCASE, s.name COLLATE NOCASE, cs.id`)
    .all(...params) as Record<string, unknown>[];
  const lines = attachMonths(raw, year, only);
  const ids = lines.map((l) => Number(l.id));
  const prevByLine = new Map<number, Record<string, number>>();
  for (const cell of loadCells(ids, `${year - 1}-%`)) {
    if (cell.amount_vnd <= 0) continue;
    if (!prevByLine.has(cell.line_id)) prevByLine.set(cell.line_id, {});
    prevByLine.get(cell.line_id)![cell.period] = cell.amount_vnd;
  }

  const current = currentPeriod();
  const rows = [];
  for (const line of lines) {
    const periods = yearPeriods(year).filter((p) => !only || only.has(line.groups[p]));
    if (periods.length === 0) continue;
    const months = Object.fromEntries(
      Object.entries(line.months).map(([p, cell]) => [p, cell.amount_vnd])
    );
    const comparison = compareLine({
      year,
      current,
      months,
      prevMonths: prevByLine.get(Number(line.id)) ?? {},
      status: line.status as ServiceStatus,
      start_date: (line.start_date as string | null) ?? null,
      end_date: (line.end_date as string | null) ?? null,
      periods,
      baselineAvg: line.baseline_avg_vnd,
    });
    rows.push({
      line_id: line.id,
      customer_id: line.customer_id,
      customer_name: line.customer_name,
      service_name: line.service_name,
      contract_name: line.contract_name,
      contract_kind: line.contract_kind,
      status: line.status,
      anchor: line.anchor,
      groups: line.groups,
      periods,
      months,
      prev_months: prevByLine.get(Number(line.id)) ?? {},
      baseline_avg_vnd: line.baseline_avg_vnd,
      ...comparison,
    });
  }
  res.json({ year, current_period: current, lines: rows });
});

/* ---------- Moc phan nhom (sua tay, co canh bao) ---------- */

const anchorSchema = z
  .object({
    mode: z.enum(['auto', 'manual', 'base']),
    period: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Ky phai co dang YYYY-MM')
      .nullable()
      .optional(),
  })
  .refine((v) => v.mode !== 'manual' || Boolean(v.period), {
    message: 'Chon thang moc khi sua tay',
    path: ['period'],
  });

/** Moi o doanh thu cua dong se doi nhom neu ap moc moi. */
function anchorImpact(id: number, next: { mode: AnchorMode; period?: string | null }) {
  const line = required(
    db.prepare(`SELECT * FROM customer_services WHERE id = ?`).get(id),
    'Khong tim thay dong dich vu'
  ) as Record<string, unknown>;
  const first = loadFirstPeriods([id]);
  const before = anchorOf(line, first);
  const after: LineAnchor = {
    mode: next.mode,
    manual_period: next.mode === 'manual' ? (next.period ?? null) : null,
    first_period: before.first_period,
  };
  const kind = line.contract_kind as ContractKind;
  const cells = db
    .prepare(
      `SELECT period, amount_vnd FROM service_revenues
        WHERE line_id = ? AND amount_vnd > 0 ORDER BY period`
    )
    .all(id) as { period: string; amount_vnd: number }[];
  const moved = cells
    .map((c) => ({
      ...c,
      from: groupOf(c.period, kind, before),
      to: groupOf(c.period, kind, after),
    }))
    .filter((c) => c.from !== c.to);
  return {
    before: { ...before, effective: effectiveAnchor(before), base_from: baseFromPeriod(before) },
    after: { ...after, effective: effectiveAnchor(after), base_from: baseFromPeriod(after) },
    moved,
    moved_count: moved.length,
    moved_amount_vnd: moved.reduce((sum, c) => sum + c.amount_vnd, 0),
    years: [...new Set(moved.map((c) => Number(c.period.slice(0, 4))))],
  };
}

/** Xem truoc hau qua — giao dien hien canh bao truoc khi luu. */
router.post('/lines/:id/anchor-preview', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(anchorSchema, req);
  res.json(anchorImpact(id, body));
});

router.put('/lines/:id/anchor', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(anchorSchema, req);
  const impact = anchorImpact(id, body);
  db.prepare(
    `UPDATE customer_services SET revenue_anchor_mode = ?, revenue_anchor_period = ?,
            revenue_anchor_updated_by = ?, revenue_anchor_updated_at = datetime('now','localtime'),
            updated_at = datetime('now','localtime')
      WHERE id = ?`
  ).run(body.mode, body.mode === 'manual' ? body.period : null, actorContactId(req), id);
  res.json({ line: reloadLine(id, resolveYear(req.query.year)), impact });
});

/* ---------- TB thang nam truoc (muc so sanh cua doanh thu Nen) ---------- */

router.put('/lines/:id/baseline', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(
    z.object({
      year: z.number().int().min(2000).max(2100),
      avg_monthly_vnd: z.number().int().min(0).nullable(),
      note: z.string().optional(),
    }),
    req
  );
  required(
    db.prepare(`SELECT id FROM customer_services WHERE id = ?`).get(id),
    'Khong tim thay dong dich vu'
  );
  if (body.avg_monthly_vnd === null) {
    db.prepare(`DELETE FROM revenue_baselines WHERE line_id = ? AND year = ?`).run(id, body.year);
  } else {
    db.prepare(
      `INSERT INTO revenue_baselines (line_id, year, avg_monthly_vnd, note)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(line_id, year) DO UPDATE SET
         avg_monthly_vnd = excluded.avg_monthly_vnd,
         note = excluded.note,
         updated_at = datetime('now','localtime')`
    ).run(id, body.year, body.avg_monthly_vnd, body.note ?? '');
  }
  res.json({ line_id: id, year: body.year, avg_monthly_vnd: body.avg_monthly_vnd });
});

/**
 * "Lay tu du lieu nam truoc": dien TB thang nam truoc = tong / so thang co so
 * lieu cua nam truoc. Mac dinh khong ghi de so da nhap tay.
 */
router.post('/baselines/fill', (req, res) => {
  const body = parseBody(
    z.object({
      year: z.number().int().min(2000).max(2100),
      line_ids: z.array(z.number().int()).min(1).max(2000),
      overwrite: z.boolean().optional(),
    }),
    req
  );
  const rows = db
    .prepare(
      `SELECT line_id, SUM(amount_vnd) AS total, COUNT(*) AS months FROM service_revenues
        WHERE period LIKE ? AND amount_vnd > 0 AND line_id IN (${inList(body.line_ids)})
        GROUP BY line_id`
    )
    .all(`${body.year - 1}-%`, ...body.line_ids) as {
    line_id: number;
    total: number;
    months: number;
  }[];
  const insert = db.prepare(
    `INSERT INTO revenue_baselines (line_id, year, avg_monthly_vnd, note)
     VALUES (?, ?, ?, 'Tự tính từ dữ liệu năm trước')
     ON CONFLICT(line_id, year) DO ${body.overwrite ? `UPDATE SET avg_monthly_vnd = excluded.avg_monthly_vnd, note = excluded.note, updated_at = datetime('now','localtime')` : 'NOTHING'}`
  );
  let filled = 0;
  db.transaction(() => {
    for (const row of rows) {
      filled += insert.run(row.line_id, body.year, Math.round(row.total / row.months)).changes;
    }
  })();
  res.json({ filled, no_data: body.line_ids.length - rows.length });
});

/** Cac nam da co so lieu — dung cho o chon nam. */
router.get('/years', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT DISTINCT substr(period, 1, 4) AS year FROM service_revenues ORDER BY year DESC`
    )
    .all() as { year: string }[];
  const years = rows.map((r) => Number(r.year));
  const current = new Date().getFullYear();
  if (!years.includes(current)) years.unshift(current);
  res.json(years.sort((a, b) => b - a));
});

/** Danh sach AM da nhap — goi y cho o loc va o nhap. */
router.get('/ams', (_req, res) => {
  res.json(
    (
      db
        .prepare(
          `SELECT DISTINCT am FROM customer_services WHERE am IS NOT NULL AND am <> '' ORDER BY am`
        )
        .all() as { am: string }[]
    ).map((r) => r.am)
  );
});

export default router;
