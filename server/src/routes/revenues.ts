import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { intParam, parseBody, required } from '../lib/validate.ts';
import { buildSearchText, fold } from '../lib/viSearch.ts';
import { CONTRACT_KINDS, CONTRACT_TERMS, REVENUE_STAGES, SERVICE_STATUSES } from '../lib/crm.ts';
import { assertCrmCustomer, assertEntityLinks } from '../lib/entityRelations.ts';
import { HttpError } from '../lib/validate.ts';
import { mergeRevenueCell, type RevenueCell as MonthCell } from '../services/revenueService.ts';

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

/** Cac cot tong hop dung chung cho summary — theo tung giai doan roi nhau. */
const TOTAL_COLUMNS = `
  COALESCE(SUM(r.amount_vnd), 0) AS amount_vnd,
  COALESCE(SUM(r.forecast_vnd), 0) AS forecast_vnd,
  COALESCE(SUM(CASE WHEN r.stage = 'forecast' THEN r.amount_vnd ELSE 0 END), 0) AS stage_forecast_vnd,
  COALESCE(SUM(CASE WHEN r.stage = 'reconciled' THEN r.amount_vnd ELSE 0 END), 0) AS stage_reconciled_vnd,
  COALESCE(SUM(CASE WHEN r.stage = 'invoiced' THEN r.amount_vnd ELSE 0 END), 0) AS stage_invoiced_vnd,
  COALESCE(SUM(CASE WHEN r.stage = 'paid' THEN r.amount_vnd ELSE 0 END), 0) AS stage_paid_vnd`;

/** Nam hop le, mac dinh la nam hien tai theo gio may. */
function resolveYear(value: unknown): number {
  const year = Number(value);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : new Date().getFullYear();
}

/** Bo loc dung chung cho danh sach dong va bang tong hop. */
function buildFilters(query: Record<string, unknown>): { sql: string; params: unknown[] } {
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
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

/** Gan ma tran 12 thang cua nam vao tung dong + tong cua dong. */
function attachMonths(lines: Record<string, unknown>[], year: number) {
  const ids = lines.map((l) => Number(l.id));
  const cells =
    ids.length === 0
      ? []
      : (db
          .prepare(
            `SELECT line_id, period, amount_vnd, forecast_vnd, stage, note FROM service_revenues
              WHERE period LIKE ? AND line_id IN (${ids.map(() => '?').join(',')})`
          )
          .all(`${year}-%`, ...ids) as (MonthCell & { line_id: number; period: string })[]);

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
    const months = byLine.get(Number(line.id)) ?? {};
    const totals = emptyTotals();
    for (const cell of Object.values(months)) {
      totals.amount_vnd += cell.amount_vnd;
      totals.forecast_vnd += cell.forecast_vnd;
      if (cell.stage === 'forecast') totals.stage_forecast_vnd += cell.amount_vnd;
      else if (cell.stage === 'reconciled') totals.stage_reconciled_vnd += cell.amount_vnd;
      else if (cell.stage === 'invoiced') totals.stage_invoiced_vnd += cell.amount_vnd;
      else totals.stage_paid_vnd += cell.amount_vnd;
    }
    return { ...line, months, totals };
  });
}

/* ---------- Dong dich vu (khach hang x dich vu dang su dung) ---------- */

router.get('/lines', (req, res) => {
  const year = resolveYear(req.query.year);
  const { sql, params } = buildFilters(req.query as Record<string, unknown>);
  const lines = db
    .prepare(
      `${LINE_SELECT} ${sql}
        ORDER BY c.name COLLATE NOCASE, s.name COLLATE NOCASE, cs.id`
    )
    .all(...params) as Record<string, unknown>[];
  res.json({ year, lines: attachMonths(lines, year) });
});

router.post('/lines', (req, res) => {
  const body = parseBody(lineSchema, req);
  assertEntityLinks(db, body);
  assertCrmCustomer(db, body.customer_id);
  assertLineDates(body);
  const info = db
    .prepare(
      `INSERT INTO customer_services (customer_id, service_id, contract_id, am, contract_kind,
                                      contract_term, status, start_date, end_date, notes, search_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      buildSearchText(body.am, body.notes)
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
 * kem tong ca nam, co cau theo dich vu va top khach hang.
 */
router.get('/summary', (req, res) => {
  const year = resolveYear(req.query.year);
  const { sql, params } = buildFilters(req.query as Record<string, unknown>);
  const lineFilter = `SELECT cs.id FROM customer_services cs JOIN customers c ON c.id = cs.customer_id AND c.org_kind = 'customer' ${sql}`;

  const months = db
    .prepare(
      `SELECT r.period, ${TOTAL_COLUMNS}
         FROM service_revenues r
        WHERE r.period LIKE ? AND r.line_id IN (${lineFilter})
        GROUP BY r.period ORDER BY r.period`
    )
    .all(`${year}-%`, ...params) as ({ period: string } & Totals)[];

  const totals = emptyTotals();
  for (const row of months) {
    totals.amount_vnd += row.amount_vnd;
    totals.forecast_vnd += row.forecast_vnd;
    totals.stage_forecast_vnd += row.stage_forecast_vnd;
    totals.stage_reconciled_vnd += row.stage_reconciled_vnd;
    totals.stage_invoiced_vnd += row.stage_invoiced_vnd;
    totals.stage_paid_vnd += row.stage_paid_vnd;
  }

  const byService = db
    .prepare(
      `SELECT COALESCE(s.name, 'Chưa gán dịch vụ') AS name,
              COUNT(DISTINCT cs.id) AS line_count, ${TOTAL_COLUMNS}
         FROM customer_services cs
         JOIN customers c ON c.id = cs.customer_id AND c.org_kind = 'customer'
         LEFT JOIN services s ON s.id = cs.service_id
         LEFT JOIN service_revenues r ON r.line_id = cs.id AND r.period LIKE ?
        ${sql}
        GROUP BY COALESCE(s.name, 'Chưa gán dịch vụ')
        ORDER BY amount_vnd DESC`
    )
    .all(`${year}-%`, ...params);

  const byCustomer = db
    .prepare(
      `SELECT c.id, c.name, ${TOTAL_COLUMNS}
         FROM customer_services cs
         JOIN customers c ON c.id = cs.customer_id AND c.org_kind = 'customer'
         LEFT JOIN service_revenues r ON r.line_id = cs.id AND r.period LIKE ?
        ${sql}
        GROUP BY c.id, c.name
        HAVING amount_vnd > 0
        ORDER BY amount_vnd DESC LIMIT 10`
    )
    .all(`${year}-%`, ...params);

  const line_count = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM customer_services cs JOIN customers c ON c.id = cs.customer_id AND c.org_kind = 'customer' ${sql}`
      )
      .get(...params) as { n: number }
  ).n;

  res.json({ year, months, totals, line_count, by_service: byService, by_customer: byCustomer });
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
