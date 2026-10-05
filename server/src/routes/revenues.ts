import { Router, type Request, type RequestHandler } from 'express';
import multer from 'multer';
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
import { computeKpi, summarizeKpi } from '../services/revenueKpi.ts';
import {
  buildTemplate,
  parseWorkbook,
  validateRow,
  type ParsedRow,
} from '../services/revenueImport.ts';
import type { ContractKind, ContractTerm, ServiceStatus } from '@workflow/contracts';

const router = Router();

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

const lineSchema = z.object({
  customer_id: z.number().int(),
  service_id: z.number().int().nullable().optional(),
  contract_id: z.number().int().nullable().optional(),
  /** AM la mot nguoi dung cua he thong; cot chu `am` tu dong bo theo ten nguoi do. */
  am_user_id: z.number().int().positive().nullable().optional(),
  contract_kind: z.enum(CONTRACT_KINDS).optional(),
  contract_term: z.enum(CONTRACT_TERMS).optional(),
  status: z.enum(SERVICE_STATUSES).optional(),
  start_date: dateOnly.optional(),
  end_date: dateOnly.optional(),
  notes: z.string().optional(),
  /** Moc phan nhom; doi o form sua thi giao dien da xem truoc va hoi lai. */
  revenue_anchor_mode: z.enum(['auto', 'manual', 'base']).optional(),
  revenue_anchor_period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Ky phai co dang YYYY-MM')
    .nullable()
    .optional(),
  /** Chi khi tao dong: TB thang nam truoc cua dong Nen. */
  baseline: z
    .object({
      year: z.number().int().min(2000).max(2100),
      avg_monthly_vnd: z.number().int().min(0),
    })
    .optional(),
});

/** Ten hien thi cua nguoi dung lam AM; nem 422 neu khong co nguoi do. */
function amUserName(id: number | null | undefined): string | null {
  if (id === null || id === undefined) return null;
  const user = db
    .prepare(
      `SELECT COALESCE(NULLIF(TRIM(full_name), ''), username) AS name FROM users WHERE id = ?`
    )
    .get(id) as { name: string } | undefined;
  if (!user) throw new HttpError(422, 'AM phải là một người dùng trong hệ thống');
  return user.name;
}

function assertAnchor(mode: unknown, period: unknown): void {
  if (mode === 'manual' && !period)
    throw new HttpError(422, 'Chọn tháng mốc khi đặt mốc phân nhóm bằng tay');
}

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
         s.name AS service_name, k.name AS contract_name, k.number AS contract_number,
         COALESCE(NULLIF(TRIM(au.full_name), ''), au.username) AS am_name
    FROM customer_services cs
    JOIN customers c ON c.id = cs.customer_id AND c.org_kind = 'customer'
    LEFT JOIN services s ON s.id = cs.service_id
    LEFT JOIN contracts k ON k.id = cs.contract_id
    LEFT JOIN users au ON au.id = cs.am_user_id`;

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
  /* Bo loc o tieu de cot Khach hang: chon nhieu khach, gui dang "1,2,3". */
  const customerIds = String(query.customer_ids ?? '')
    .split(',')
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
  if (customerIds.length > 0) {
    where.push(`cs.customer_id IN (${inList(customerIds)})`);
    params.push(...customerIds);
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
  if (query.am_user_id === 'none') {
    where.push('cs.am_user_id IS NULL');
  } else if (query.am_user_id) {
    where.push('cs.am_user_id = ?');
    params.push(Number(query.am_user_id));
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
  /* "Chi dong con cong no": con tien o buoc xuat hoa don ma chua thu, tinh tren
     cac thang thuoc nhom dang xem — cung cach giao dien tinh cot Cong no. */
  const debtOnly = req.query.has_debt === '1';
  return {
    only,
    lines: attached.filter(
      (line) =>
        (!only || Object.values(line.groups).some((g) => only.has(g))) &&
        (!debtOnly || line.totals.stage_invoiced_vnd > 0)
    ),
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
  assertAnchor(body.revenue_anchor_mode, body.revenue_anchor_period);
  const am = amUserName(body.am_user_id);
  const anchorMode = body.revenue_anchor_mode ?? 'auto';
  const info = db
    .prepare(
      `INSERT INTO customer_services (customer_id, service_id, contract_id, am, am_user_id, contract_kind,
                                      contract_term, status, start_date, end_date, notes, search_text,
                                      owner_contact_id, revenue_anchor_mode, revenue_anchor_period,
                                      revenue_anchor_updated_by, revenue_anchor_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               CASE WHEN ? = 'auto' THEN NULL ELSE datetime('now','localtime') END)`
    )
    .run(
      body.customer_id,
      body.service_id ?? null,
      body.contract_id ?? null,
      am,
      body.am_user_id ?? null,
      body.contract_kind ?? 'new',
      body.contract_term ?? 'long',
      body.status ?? 'using',
      body.start_date ?? null,
      body.end_date ?? null,
      body.notes ?? '',
      buildSearchText(am, body.notes),
      defaultOwner(req),
      anchorMode,
      anchorMode === 'manual' ? body.revenue_anchor_period : null,
      anchorMode === 'auto' ? null : actorContactId(req),
      anchorMode
    );
  const id = Number(info.lastInsertRowid);
  if (body.baseline) {
    db.prepare(
      `INSERT INTO revenue_baselines (line_id, year, avg_monthly_vnd) VALUES (?, ?, ?)`
    ).run(id, body.baseline.year, body.baseline.avg_monthly_vnd);
  }
  res.status(201).json(reloadLine(id, new Date().getFullYear()));
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
  const am =
    body.am_user_id !== undefined ? amUserName(body.am_user_id) : (current.am as string | null);

  if (body.revenue_anchor_mode !== undefined) {
    assertAnchor(body.revenue_anchor_mode, body.revenue_anchor_period);
    db.prepare(
      `UPDATE customer_services SET revenue_anchor_mode = ?, revenue_anchor_period = ?,
              revenue_anchor_updated_by = ?, revenue_anchor_updated_at = datetime('now','localtime')
        WHERE id = ?`
    ).run(
      body.revenue_anchor_mode,
      body.revenue_anchor_mode === 'manual' ? body.revenue_anchor_period : null,
      actorContactId(req),
      id
    );
  }

  db.prepare(
    `UPDATE customer_services SET customer_id = ?, service_id = ?, contract_id = ?, am = ?, am_user_id = ?,
            contract_kind = ?, contract_term = ?, status = ?, start_date = ?, end_date = ?,
            notes = ?, search_text = ?, updated_at = datetime('now','localtime')
      WHERE id = ?`
  ).run(
    merged.customer_id,
    merged.service_id ?? null,
    merged.contract_id ?? null,
    am,
    merged.am_user_id ?? null,
    merged.contract_kind ?? 'new',
    merged.contract_term ?? 'long',
    merged.status ?? 'using',
    merged.start_date ?? null,
    merged.end_date ?? null,
    merged.notes ?? '',
    buildSearchText(am, merged.notes as string),
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

/* ---------- KPI doanh thu theo AM ---------- */

/** am_user_id cua nhom "Chua gan AM" trong KPI. */
const NO_AM = 0;

/** TB thang nam truoc cua tung dong: so nhap tay, khong co thi tu tinh tu nam truoc. */
function prevAverages(ids: number[], year: number): Map<number, number | null> {
  const manual = loadBaselines(ids, year);
  const sums = new Map<number, { total: number; months: number }>();
  for (const cell of loadCells(ids, `${year - 1}-%`)) {
    if (cell.amount_vnd <= 0) continue;
    const s = sums.get(cell.line_id) ?? { total: 0, months: 0 };
    s.total += cell.amount_vnd;
    s.months += 1;
    sums.set(cell.line_id, s);
  }
  return new Map(
    ids.map((id) => {
      if (manual.has(id)) return [id, manual.get(id)!];
      const s = sums.get(id);
      return [id, s ? Math.round(s.total / s.months) : null];
    })
  );
}

/** Ten hien thi cua moi nguoi dung — AM tren KPI, file mau va bo loc. */
function userNames(): Map<number, { name: string; active: boolean }> {
  return new Map(
    (
      db
        .prepare(
          `SELECT id, COALESCE(NULLIF(TRIM(full_name), ''), username) AS name, is_active FROM users`
        )
        .all() as { id: number; name: string; is_active: number }[]
    ).map((u) => [u.id, { name: u.name, active: u.is_active === 1 }])
  );
}

/**
 * KPI cua nam: 12 thang (chi tieu, Moi, Mo rong, Mo rong tu Nen, Lost), bang theo
 * AM va chi tiet tung dong. AM la nguoi dung; 0 = "Chua gan AM". Loc theo AM thi
 * chi tieu cung chi lay cua AM do.
 */
router.get('/kpi', (req, res) => {
  const year = resolveYear(req.query.year);
  const { sql, params } = buildFilters(req);
  const raw = db
    .prepare(`${LINE_SELECT} ${sql} ORDER BY c.name COLLATE NOCASE, s.name COLLATE NOCASE, cs.id`)
    .all(...params) as Record<string, unknown>[];
  const lines = attachMonths(raw, year);
  const prev = prevAverages(
    lines.map((l) => Number(l.id)),
    year
  );
  const current = currentPeriod();
  const entries = computeKpi(
    lines.map((line) => ({
      line_id: Number(line.id),
      am_user_id: Number(line.am_user_id ?? NO_AM),
      groups: line.groups,
      cells: line.months,
      prev_avg_vnd: prev.get(Number(line.id)) ?? null,
    })),
    year,
    current
  );

  const filter = req.query.am_user_id;
  const amFilter = filter === 'none' ? NO_AM : filter ? Number(filter) : null;
  const targetRows = db
    .prepare(
      `SELECT am_user_id, period, target_vnd FROM revenue_kpi_targets
        WHERE period LIKE ? ${amFilter !== null ? 'AND am_user_id = ?' : ''}`
    )
    .all(`${year}-%`, ...(amFilter !== null ? [amFilter] : [])) as {
    am_user_id: number;
    period: string;
    target_vnd: number;
  }[];

  /* AM hien trong bang chi tieu: nguoi co dong doanh thu, co chi tieu, hoac moi
     nguoi dung dang hoat dong — de dat chi tieu truoc khi co doanh thu. */
  const names = userNames();
  const amIds = new Set<number>(targetRows.map((t) => t.am_user_id));
  for (const line of lines) amIds.add(Number(line.am_user_id ?? NO_AM));
  if (amFilter !== null) {
    amIds.clear();
    amIds.add(amFilter);
  } else {
    for (const [id, user] of names) if (user.active) amIds.add(id);
  }
  const nameOf = (id: number) => (id === NO_AM ? '' : (names.get(id)?.name ?? `#${id}`));

  const targetsTotal: Record<string, number> = {};
  const targetsByAm = new Map<number, Record<string, number>>();
  for (const t of targetRows) {
    targetsTotal[t.period] = (targetsTotal[t.period] ?? 0) + t.target_vnd;
    const own = targetsByAm.get(t.am_user_id) ?? {};
    own[t.period] = t.target_vnd;
    targetsByAm.set(t.am_user_id, own);
  }

  const byAm = [...amIds]
    .map((id) => ({ am_user_id: id, am_name: nameOf(id) }))
    .sort((a, b) =>
      a.am_user_id === NO_AM
        ? 1
        : b.am_user_id === NO_AM
          ? -1
          : a.am_name.localeCompare(b.am_name, 'vi')
    )
    .map((am) => ({
      ...am,
      months: summarizeKpi(
        entries.filter((e) => e.am_user_id === am.am_user_id),
        year,
        targetsByAm.get(am.am_user_id) ?? {}
      ),
    }));

  const info = new Map(lines.map((l) => [Number(l.id), l]));
  res.json({
    year,
    current_period: current,
    months: summarizeKpi(entries, year, targetsTotal),
    by_am: byAm,
    entries: entries.map((e) => {
      const line = info.get(e.line_id)!;
      return {
        ...e,
        am_name: nameOf(e.am_user_id),
        customer_id: line.customer_id,
        customer_name: line.customer_name,
        service_name: line.service_name,
      };
    }),
  });
});

const upsertKpiTarget = db.prepare(
  `INSERT INTO revenue_kpi_targets (am_user_id, period, target_vnd, updated_by) VALUES (?, ?, ?, ?)
   ON CONFLICT(am_user_id, period) DO UPDATE SET target_vnd = excluded.target_vnd,
     updated_by = excluded.updated_by, updated_at = datetime('now','localtime')`
);

/** Dat / xoa chi tieu mot thang cua mot AM (am_user_id = 0: doanh thu chua gan AM). */
router.put('/kpi-targets', (req, res) => {
  const body = parseBody(
    z.object({
      am_user_id: z.number().int().min(0),
      period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Ky phai co dang YYYY-MM'),
      target_vnd: z.number().int().min(0).nullable(),
    }),
    req
  );
  if (body.am_user_id !== NO_AM) amUserName(body.am_user_id);
  if (body.target_vnd === null) {
    db.prepare(`DELETE FROM revenue_kpi_targets WHERE am_user_id = ? AND period = ?`).run(
      body.am_user_id,
      body.period
    );
  } else {
    upsertKpiTarget.run(body.am_user_id, body.period, body.target_vnd, actorContactId(req));
  }
  res.json(body);
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

/* ---------- Nhap / xuat Excel ---------- */

/** File mau cua nam, dien san cac dong theo bo loc dang xem. */
router.get('/import-template.xlsx', async (req, res) => {
  const year = resolveYear(req.query.year);
  const { sql, params } = buildFilters(req);
  const raw = db
    .prepare(`${LINE_SELECT} ${sql} ORDER BY c.name COLLATE NOCASE, s.name COLLATE NOCASE, cs.id`)
    .all(...params) as Record<string, unknown>[];
  const lines = attachMonths(raw, year).map((line) => ({
    id: Number(line.id),
    customer_name: line.customer_name as string,
    service_name: (line.service_name as string | null) ?? null,
    am: (line.am_name as string | null) ?? null,
    contract_kind: line.contract_kind as ContractKind,
    contract_term: line.contract_term as ContractTerm,
    status: line.status as ServiceStatus,
    start_date: (line.start_date as string | null) ?? null,
    end_date: (line.end_date as string | null) ?? null,
    revenue_anchor_mode: line.anchor.mode,
    revenue_anchor_period: line.anchor.manual_period,
    baseline_avg_vnd: line.baseline_avg_vnd,
    months: yearPeriods(year).map((p) => line.months[p]?.amount_vnd),
  }));

  const customerWhere: string[] = [`c.org_kind = 'customer'`];
  const customerParams: unknown[] = [];
  pushScope(
    customerWhere,
    customerParams,
    scopeWhereOrUnowned(req, 'customers', 'read', 'c.owner_contact_id')
  );
  const customers = (
    db
      .prepare(
        `SELECT c.name FROM customers c WHERE ${customerWhere.join(' AND ')} ORDER BY c.name COLLATE NOCASE`
      )
      .all(...customerParams) as { name: string }[]
  ).map((r) => r.name);
  const services = (
    db.prepare(`SELECT name FROM services ORDER BY name COLLATE NOCASE`).all() as {
      name: string;
    }[]
  ).map((r) => r.name);

  /* Sheet KPI: moi nguoi dung dang hoat dong + AM da co chi tieu / doanh thu. */
  const names = userNames();
  const kpiRows = db
    .prepare(`SELECT am_user_id, period, target_vnd FROM revenue_kpi_targets WHERE period LIKE ?`)
    .all(`${year}-%`) as { am_user_id: number; period: string; target_vnd: number }[];
  const kpiIds = new Set<number>(kpiRows.map((r) => r.am_user_id));
  for (const line of raw) if (line.am_user_id) kpiIds.add(Number(line.am_user_id));
  for (const [id, user] of names) if (user.active) kpiIds.add(id);
  const kpi = [...kpiIds]
    .map((id) => ({ id, am: id === NO_AM ? '' : (names.get(id)?.name ?? '') }))
    .filter((k) => k.id === NO_AM || k.am)
    .sort((a, b) => (a.id === NO_AM ? 1 : b.id === NO_AM ? -1 : a.am.localeCompare(b.am, 'vi')))
    .map((k) => ({
      am: k.am,
      months: yearPeriods(year).map(
        (p) => kpiRows.find((r) => r.am_user_id === k.id && r.period === p)?.target_vnd
      ),
    }));
  const amChoices = [...names.values()]
    .filter((u) => u.active)
    .map((u) => u.name)
    .sort((a, b) => a.localeCompare(b, 'vi'));

  const buffer = await buildTemplate(year, lines, customers, services, kpi, amChoices);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename=nhap-doanh-thu-${year}.xlsx`);
  res.send(buffer);
});

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/\.xlsx$/i.test(file.originalname))
      return cb(new HttpError(422, 'Chỉ nhận file Excel .xlsx (tải file mẫu để điền)'));
    cb(null, true);
  },
});

/** Loi cua multer (qua dung luong...) thanh 422 co loi nhan doc duoc, khong phai 500. */
const acceptImportFile: RequestHandler = (req, res, next) =>
  importUpload.single('file')(req, res, (error: unknown) =>
    next(
      error instanceof multer.MulterError
        ? new HttpError(
            422,
            error.code === 'LIMIT_FILE_SIZE' ? 'File vượt quá 5 MB' : error.message
          )
        : error
    )
  );

interface ExistingLine {
  id: number;
  customer_id: number;
  service_id: number | null;
  start_date: string | null;
  end_date: string | null;
}

type PlannedRow = ParsedRow & {
  action: 'create' | 'update' | 'error';
  target_id?: number;
  customer_id?: number;
  service_id?: number | null;
  customer_name?: string;
  /** AM da ghep voi nguoi dung (null = bo trong o AM de go AM). */
  am_user_id?: number | null;
  am_name?: string | null;
  service_name?: string | null;
};

/**
 * Ghep tung dong Excel voi du lieu that: tim khach hang, dich vu, dong dang co.
 * Chi khop voi dong ma nguoi dung duoc phep sua — mot ma dong ngoai pham vi
 * duoc bao "khong tim thay", khong lo ra la no ton tai.
 */
function planImport(req: Request, parsedRows: ParsedRow[], year: number): PlannedRow[] {
  const customers = new Map<string, { id: number; name: string }[]>();
  for (const c of db
    .prepare(`SELECT id, name, short_name FROM customers WHERE org_kind = 'customer'`)
    .all() as { id: number; name: string; short_name: string | null }[]) {
    for (const key of new Set([fold(c.name.trim()), fold(c.short_name?.trim())])) {
      if (!key) continue;
      customers.set(key, [...(customers.get(key) ?? []), { id: c.id, name: c.name }]);
    }
  }
  const services = new Map<string, { id: number; name: string }>();
  for (const s of db.prepare(`SELECT id, name FROM services`).all() as {
    id: number;
    name: string;
  }[])
    services.set(fold(s.name.trim()), s);

  const where: string[] = [];
  const params: unknown[] = [];
  pushScope(where, params, scopeWhereOrUnowned(req, 'revenues', 'update', 'cs.owner_contact_id'));
  const existing = db
    .prepare(
      `SELECT cs.id, cs.customer_id, cs.service_id, cs.start_date, cs.end_date
         FROM customer_services cs
         JOIN customers c ON c.id = cs.customer_id AND c.org_kind = 'customer'
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`
    )
    .all(...params) as ExistingLine[];
  const byId = new Map(existing.map((l) => [l.id, l]));
  const customerNames = new Map<number, string>();
  for (const list of customers.values()) for (const c of list) customerNames.set(c.id, c.name);
  const serviceNames = new Map([...services.values()].map((s) => [s.id, s.name]));

  /* So tien dang co cua nam: file mau dien san moi thang, nen o trung so cu phai
     bo qua — neu khong, cot "Trang thai" se ghi de len ca nhung thang khong sua. */
  const currentAmounts = new Map<string, number>();
  for (const cell of db
    .prepare(`SELECT line_id, period, amount_vnd FROM service_revenues WHERE period LIKE ?`)
    .all(`${year}-%`) as { line_id: number; period: string; amount_vnd: number }[])
    currentAmounts.set(`${cell.line_id}:${Number(cell.period.slice(5, 7))}`, cell.amount_vnd);

  /* AM ghep theo ho ten, ten dang nhap hoac email — giong cach v47 ghep du lieu cu. */
  const usersByKey = new Map<string, Set<number>>();
  const userNameById = new Map<number, string>();
  for (const u of db
    .prepare(
      `SELECT id, username, email, COALESCE(NULLIF(TRIM(full_name), ''), username) AS name FROM users`
    )
    .all() as { id: number; username: string; email: string | null; name: string }[]) {
    userNameById.set(u.id, u.name);
    for (const key of [u.name, u.username, u.email]) {
      const folded = fold(key?.trim());
      if (!folded) continue;
      if (!usersByKey.has(folded)) usersByKey.set(folded, new Set());
      usersByKey.get(folded)!.add(u.id);
    }
  }

  const claimed = new Map<number, number>();
  return parsedRows.map((row): PlannedRow => {
    const planned: PlannedRow = {
      ...row,
      months: new Map(row.months),
      errors: [...row.errors],
      action: 'error',
    };
    const err = (text: string) => planned.errors.push(text);

    let customerId: number | undefined;
    if (row.customer !== undefined) {
      const matches = customers.get(fold(row.customer)) ?? [];
      const unique = [...new Map(matches.map((m) => [m.id, m])).values()];
      if (unique.length === 0) err(`Không tìm thấy khách hàng "${row.customer}" trong CRM`);
      else if (unique.length > 1) err(`Có ${unique.length} khách hàng tên "${row.customer}"`);
      else customerId = unique[0].id;
    }
    if (row.am !== undefined) {
      const ids = usersByKey.get(fold(row.am.trim()));
      if (!ids || ids.size === 0) err(`AM "${row.am}" không phải người dùng trong hệ thống`);
      else if (ids.size > 1) err(`Có ${ids.size} người dùng khớp AM "${row.am}"`);
      else {
        planned.am_user_id = [...ids][0];
        planned.am_name = userNameById.get(planned.am_user_id) ?? row.am;
      }
    }
    let serviceId: number | null | undefined;
    if (row.service !== undefined) {
      const service = services.get(fold(row.service));
      if (!service) err(`Dịch vụ "${row.service}" chưa có trong danh mục dịch vụ`);
      else serviceId = service.id;
    }

    let target: ExistingLine | undefined;
    if (row.line_id !== undefined) {
      target = byId.get(row.line_id);
      if (!target) err(`Mã dòng ${row.line_id} không tồn tại hoặc bạn không có quyền sửa`);
      else if (customerId !== undefined && customerId !== target.customer_id)
        err(`Mã dòng ${row.line_id} thuộc khách hàng khác — không đổi khách hàng qua file`);
    } else if (customerId !== undefined) {
      const candidates = existing.filter(
        (l) => l.customer_id === customerId && l.service_id === (serviceId ?? null)
      );
      if (candidates.length > 1)
        err(
          `Có ${candidates.length} dòng cùng khách hàng và dịch vụ — điền "Mã dòng" để chọn đúng dòng`
        );
      else target = candidates[0];
    }

    if (target) {
      for (const [month, amount] of planned.months) {
        if (currentAmounts.get(`${target.id}:${month}`) === amount) planned.months.delete(month);
      }
      const start = row.start_date ?? target.start_date;
      const end = row.end_date ?? target.end_date;
      if (start && end && end < start)
        err('Ngày kết thúc trước ngày bắt đầu (so với dữ liệu đang có)');
      const earlier = claimed.get(target.id);
      if (earlier !== undefined) err(`Trùng dòng với dòng ${earlier} trong file`);
      else claimed.set(target.id, row.row);
    }

    planned.customer_id = target?.customer_id ?? customerId;
    planned.service_id = serviceId !== undefined ? serviceId : (target?.service_id ?? null);
    planned.customer_name = planned.customer_id
      ? customerNames.get(planned.customer_id)
      : row.customer;
    planned.service_name =
      planned.service_id !== null && planned.service_id !== undefined
        ? serviceNames.get(planned.service_id)
        : (row.service ?? null);
    if (planned.errors.length === 0) {
      planned.action = target ? 'update' : 'create';
      planned.target_id = target?.id;
    }
    return planned;
  });
}

function applyRow(req: Request, row: PlannedRow, year: number): number {
  let lineId = row.target_id;
  if (row.action === 'create') {
    lineId = Number(
      db
        .prepare(
          `INSERT INTO customer_services (customer_id, service_id, am, am_user_id, contract_kind, contract_term,
                                          status, start_date, end_date, notes, search_text, owner_contact_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)`
        )
        .run(
          row.customer_id,
          row.service_id ?? null,
          row.am_name ?? null,
          row.am_user_id ?? null,
          row.contract_kind ?? 'new',
          row.contract_term ?? 'long',
          row.status ?? 'using',
          row.start_date ?? null,
          row.end_date ?? null,
          buildSearchText(row.am_name),
          defaultOwner(req)
        ).lastInsertRowid
    );
  } else {
    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      if (value === undefined) return;
      sets.push(`${column} = ?`);
      values.push(value);
    };
    if (row.service !== undefined) set('service_id', row.service_id);
    if (row.am_user_id !== undefined) {
      set('am', row.am_name);
      set('am_user_id', row.am_user_id);
    }
    set('contract_kind', row.contract_kind);
    set('contract_term', row.contract_term);
    set('status', row.status);
    set('start_date', row.start_date);
    set('end_date', row.end_date);
    if (sets.length) {
      db.prepare(
        `UPDATE customer_services SET ${sets.join(', ')}, updated_at = datetime('now','localtime') WHERE id = ?`
      ).run(...values, lineId);
      if (row.am_user_id !== undefined) {
        const { notes } = db
          .prepare(`SELECT notes FROM customer_services WHERE id = ?`)
          .get(lineId) as { notes: string };
        db.prepare(`UPDATE customer_services SET search_text = ? WHERE id = ?`).run(
          buildSearchText(row.am_name, notes),
          lineId
        );
      }
    }
  }
  const id = lineId as number;

  if (row.anchor) {
    db.prepare(
      `UPDATE customer_services SET revenue_anchor_mode = ?, revenue_anchor_period = ?,
              revenue_anchor_updated_by = ?, revenue_anchor_updated_at = datetime('now','localtime')
        WHERE id = ?`
    ).run(row.anchor.mode, row.anchor.period, actorContactId(req), id);
  }
  if (row.baseline !== undefined) {
    db.prepare(
      `INSERT INTO revenue_baselines (line_id, year, avg_monthly_vnd, note) VALUES (?, ?, ?, 'Nhập từ Excel')
       ON CONFLICT(line_id, year) DO UPDATE SET avg_monthly_vnd = excluded.avg_monthly_vnd,
         note = excluded.note, updated_at = datetime('now','localtime')`
    ).run(id, year, row.baseline);
  }
  for (const [month, amount] of row.months) {
    const period = `${year}-${String(month).padStart(2, '0')}`;
    const next = mergeRevenueCell(readCell(id, period), { amount_vnd: amount, stage: row.stage });
    upsertCell.run(id, period, next.amount_vnd, next.forecast_vnd, next.stage, next.note);
  }
  return id;
}

/**
 * Nhap file. `?commit=1` moi ghi; mac dinh chi xem truoc. Khi ghi, cac dong loi
 * bi bo qua, cac dong hop le ghi trong mot giao dich.
 */
router.post('/import', acceptImportFile, async (req, res) => {
  if (!req.file) throw new HttpError(422, 'Chưa chọn file');
  let parsed;
  try {
    parsed = await parseWorkbook(req.file.buffer);
  } catch {
    throw new HttpError(422, 'Không đọc được file Excel — hãy dùng file mẫu .xlsx');
  }
  const year = parsed.year ?? resolveYear(req.query.year);
  if (parsed.rows.length > 5000) throw new HttpError(422, 'File quá 5.000 dòng');
  const planned = planImport(req, parsed.rows.map(validateRow), year);
  const commit = req.query.commit === '1';

  /* Chi tieu KPI: chi ghi o khac so dang co; 0 = xoa chi tieu. */
  const currentTargets = new Map(
    (
      db
        .prepare(
          `SELECT am_user_id, period, target_vnd FROM revenue_kpi_targets WHERE period LIKE ?`
        )
        .all(`${year}-%`) as { am_user_id: number; period: string; target_vnd: number }[]
    ).map((r) => [`${r.am_user_id}|${r.period}`, r.target_vnd])
  );
  const userIdByName = new Map<string, number[]>();
  for (const [id, user] of userNames()) {
    const key = fold(user.name.trim());
    userIdByName.set(key, [...(userIdByName.get(key) ?? []), id]);
  }
  const seenAm = new Map<number, number>();
  const kpiChanges: { am_user_id: number; period: string; value: number }[] = [];
  const kpiErrors: { row: number; am: string; errors: string[] }[] = [];
  for (const item of parsed.kpi) {
    const errors = [...item.errors];
    let amId: number | null = NO_AM;
    if (item.am) {
      const ids = userIdByName.get(fold(item.am)) ?? [];
      amId = ids.length === 1 ? ids[0] : null;
      if (ids.length === 0) errors.push(`AM "${item.am}" không phải người dùng trong hệ thống`);
      else if (ids.length > 1) errors.push(`Có ${ids.length} người dùng tên "${item.am}"`);
    }
    if (amId !== null) {
      const earlier = seenAm.get(amId);
      if (earlier !== undefined) errors.push(`Trùng AM với dòng ${earlier} trong sheet KPI`);
      else seenAm.set(amId, item.row);
    }
    if (errors.length || amId === null) {
      kpiErrors.push({ row: item.row, am: item.am, errors });
      continue;
    }
    for (const [month, value] of item.months) {
      const period = `${year}-${String(month).padStart(2, '0')}`;
      const now = currentTargets.get(`${amId}|${period}`);
      if (value === 0 ? now !== undefined : now !== value)
        kpiChanges.push({ am_user_id: amId, period, value });
    }
  }

  if (commit) {
    db.transaction(() => {
      for (const row of planned) {
        if (row.action !== 'error') row.target_id = applyRow(req, row, year);
      }
      for (const change of kpiChanges) {
        if (change.value === 0)
          db.prepare(`DELETE FROM revenue_kpi_targets WHERE am_user_id = ? AND period = ?`).run(
            change.am_user_id,
            change.period
          );
        else
          upsertKpiTarget.run(change.am_user_id, change.period, change.value, actorContactId(req));
      }
    })();
  }

  const ok = planned.filter((r) => r.action !== 'error');
  res.json({
    year,
    year_from_file: parsed.year !== null,
    committed: commit,
    summary: {
      total: planned.length,
      create: planned.filter((r) => r.action === 'create').length,
      update: planned.filter((r) => r.action === 'update').length,
      error: planned.filter((r) => r.action === 'error').length,
      cells: ok.reduce((sum, r) => sum + r.months.size, 0),
      amount_vnd: ok.reduce((sum, r) => sum + [...r.months.values()].reduce((a, b) => a + b, 0), 0),
    },
    kpi: {
      cells: kpiChanges.length,
      ams: new Set(kpiChanges.map((c) => c.am_user_id)).size,
      errors: kpiErrors,
    },
    rows: planned.map((r) => ({
      row: r.row,
      action: r.action,
      line_id: r.target_id ?? r.line_id ?? null,
      customer_name: r.customer_name ?? null,
      service_name: r.service_name ?? null,
      months: r.months.size,
      amount_vnd: [...r.months.values()].reduce((a, b) => a + b, 0),
      baseline: r.baseline ?? null,
      anchor: r.anchor ?? null,
      errors: r.errors,
    })),
  });
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

/**
 * AM chon duoc: nguoi dung dang hoat dong, cong nhung nguoi da nghi nhung con
 * dung tren dong doanh thu (de bo loc va form sua van hien dung ten).
 */
router.get('/ams', (_req, res) => {
  res.json(
    db
      .prepare(
        `SELECT u.id, COALESCE(NULLIF(TRIM(u.full_name), ''), u.username) AS name,
                u.is_active = 1 AS is_active
           FROM users u
          WHERE u.is_active = 1 OR u.id IN (SELECT am_user_id FROM customer_services)
          ORDER BY u.is_active DESC, name COLLATE NOCASE`
      )
      .all()
  );
});

/**
 * Khach hang chon duoc o bo loc cot Khach hang: nhung khach co dong doanh thu
 * ma nguoi xem duoc phep thay. Khong phu thuoc bo loc dang bat, de danh sach
 * khong co lai khi da chon mot vai khach.
 */
router.get('/customers', (req, res) => {
  const where: string[] = [];
  const params: unknown[] = [];
  pushScope(where, params, scopeWhereOrUnowned(req, 'revenues', 'read', 'cs.owner_contact_id'));
  res.json(
    db
      .prepare(
        `SELECT c.id, c.name, COUNT(cs.id) AS line_count
           FROM customer_services cs
           JOIN customers c ON c.id = cs.customer_id AND c.org_kind = 'customer'
           ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          GROUP BY c.id
          ORDER BY c.name COLLATE NOCASE`
      )
      .all(...params)
  );
});

export default router;
