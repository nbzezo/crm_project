import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { assertPicklistValue, ensurePicklistValue } from '../lib/picklists.ts';
import { assertInScope, defaultOwner, pushScope, scopeWhereOrUnowned } from '../lib/scope.ts';
import { HttpError, intParam, parseBody, required } from '../lib/validate.ts';
import { buildSearchText, fold } from '../lib/viSearch.ts';
import { ORG_KINDS, normalizeOrgName } from '@workflow/contracts';
import { assertOrgKindChange } from '../lib/entityRelations.ts';
import { actorContactId } from '../middleware/currentUser.ts';
import {
  CARE_TIERS,
  addDaysStr,
  birthdaySchema,
  applyAftercare,
  careEventsBetween,
  careStatusOf,
  churnRiskOf,
  customerTimeline,
  expiringItems,
  refreshSuggestions,
  revenueSummary,
  suggestionStats,
  todayOf,
  type SuggestionRow,
} from '../services/customerCare.ts';

const router = Router();

const customerSchema = z.object({
  name: z.string().trim().min(1, 'Ten khach hang khong duoc de trong'),
  short_name: z.string().nullable().optional(),
  tax_code: z.string().trim().nullable().optional(),
  industry: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  website: z.string().trim().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().trim().nullable().optional(),
  size: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  status: z.enum(['prospect', 'customer', 'inactive']).optional(),
  /** Loai to chuc — 'own'/'partner'/'vendor' khong phai khach hang nen nam ngoai pipeline. */
  org_kind: z.enum(ORG_KINDS).optional(),
  notes: z.string().optional(),
  /** v54: hang cham soc va nhip lien he (NULL = theo hang). */
  care_tier: z.enum(CARE_TIERS).optional(),
  care_cadence_days: z.number().int().min(1).max(365).nullable().optional(),
});

function clean(value: string | null | undefined): string | null {
  const next = value?.trim() ?? '';
  return next.length > 0 ? next : null;
}

function normalizedTaxCode(value: string | null | undefined): string | null {
  return clean(value)?.toLocaleUpperCase('vi') ?? null;
}

function normalizedEmail(value: string | null | undefined): string | null {
  return clean(value)?.toLocaleLowerCase('vi') ?? null;
}

function assertTaxCodeAvailable(taxCode: string | null, excludeId = 0): void {
  if (!taxCode) return;
  const duplicate = db
    .prepare(`SELECT id, name FROM customers WHERE id <> ? AND upper(trim(tax_code)) = ? LIMIT 1`)
    .get(excludeId, taxCode.toUpperCase()) as { id: number; name: string } | undefined;
  if (duplicate) {
    throw new HttpError(409, `Mã số thuế đã được dùng bởi “${duplicate.name}”`, {
      code: 'DUPLICATE_TAX_CODE',
      customer_id: duplicate.id,
    });
  }
}

/**
 * Loc theo loai to chuc cho MOI truy van liet ke khach hang.
 *
 * `customers` giu ca cong ty cua chinh minh, doi tac va nha cung cap tu v15. Neu
 * quen loc, "cong ty toi" se hien trong pipeline, doanh thu, bao cao va canh bao AI
 * nhu mot khach hang that. Mac dinh la chi 'customer'; truyen ?org_kind=all de xem
 * toan bo so danh ba (trang To chuc & nhan su dung duong nay).
 */
function orgKindFilter(raw: unknown, alias = 'c'): { sql: string; params: unknown[] } {
  const value = String(raw ?? '').trim();
  if (value === 'all') return { sql: '', params: [] };
  if ((ORG_KINDS as readonly string[]).includes(value)) {
    return { sql: `${alias}.org_kind = ?`, params: [value] };
  }
  return { sql: `${alias}.org_kind = 'customer'`, params: [] };
}

const LIST_SQL = `
  SELECT c.*,
         (SELECT COUNT(*) FROM deals d WHERE d.customer_id = c.id AND d.stage_category = 'open') AS open_deal_count,
         (SELECT COUNT(*) FROM deals d WHERE d.customer_id = c.id) AS deal_count,
         (SELECT COUNT(*) FROM cards k WHERE k.customer_id = c.id AND k.is_done = 0 AND k.is_archived = 0) AS open_task_count,
         (SELECT COUNT(*) FROM cards k
           WHERE k.customer_id = c.id AND k.is_done = 0 AND k.is_archived = 0
             AND k.due_date IS NOT NULL
             AND substr(k.due_date, 1, 10) < date('now','localtime')) AS overdue_task_count,
         (SELECT COALESCE(SUM(d.value_vnd), 0) FROM deals d WHERE d.customer_id = c.id AND d.stage_category = 'won') AS total_won_vnd,
         (SELECT COALESCE(SUM(d.value_vnd), 0) FROM deals d WHERE d.customer_id = c.id AND d.stage_category = 'open') AS open_pipeline_vnd,
         (SELECT COUNT(*) FROM contracts k WHERE k.customer_id = c.id AND k.status = 'active') AS active_contract_count,
         (SELECT MAX(i.occurred_at) FROM interactions i WHERE i.customer_id = c.id) AS last_activity_at,
         (SELECT COUNT(*) FROM deals d
           WHERE d.customer_id = c.id AND d.stage_category = 'open'
             AND trim(COALESCE(d.next_action, '')) = '') AS deals_without_next_action_count,
         (SELECT COUNT(*) FROM deals d
           WHERE d.customer_id = c.id AND d.stage_category = 'open'
             AND d.next_action_date IS NOT NULL
             AND substr(d.next_action_date, 1, 10) < date('now','localtime')) AS overdue_next_action_count,
         (SELECT d.next_action FROM deals d
           WHERE d.customer_id = c.id AND d.stage_category = 'open'
             AND trim(COALESCE(d.next_action, '')) <> ''
           ORDER BY d.next_action_date IS NULL, d.next_action_date, d.updated_at DESC LIMIT 1) AS next_deal_action,
         (SELECT d.next_action_date FROM deals d
           WHERE d.customer_id = c.id AND d.stage_category = 'open'
             AND trim(COALESCE(d.next_action, '')) <> ''
           ORDER BY d.next_action_date IS NULL, d.next_action_date, d.updated_at DESC LIMIT 1) AS next_deal_action_date,
         (SELECT k.title FROM cards k
           WHERE k.customer_id = c.id AND k.is_done = 0 AND k.is_archived = 0
           ORDER BY k.due_date IS NULL, k.due_date, k.updated_at DESC LIMIT 1) AS next_task_title,
         (SELECT k.due_date FROM cards k
           WHERE k.customer_id = c.id AND k.is_done = 0 AND k.is_archived = 0
           ORDER BY k.due_date IS NULL, k.due_date, k.updated_at DESC LIMIT 1) AS next_task_due_date,
         (SELECT r.title FROM reminders r
           WHERE r.customer_id = c.id AND r.is_done = 0
           ORDER BY r.due_at LIMIT 1) AS next_reminder_title,
         (SELECT r.due_at FROM reminders r
           WHERE r.customer_id = c.id AND r.is_done = 0
           ORDER BY r.due_at LIMIT 1) AS next_reminder_due_at
    FROM customers c`;

router.get('/', (req, res) => {
  const q = fold(String(req.query.q ?? '').trim());
  const status = String(req.query.status ?? '');
  const kind = orgKindFilter(req.query.org_kind);
  const where: string[] = [];
  const params: unknown[] = [];
  if (kind.sql) {
    where.push(kind.sql);
    params.push(...kind.params);
  }
  if (q) {
    where.push(`c.search_text LIKE '%' || ? || '%'`);
    params.push(q);
  }
  if (['prospect', 'customer', 'inactive'].includes(status)) {
    where.push(`c.status = ?`);
    params.push(status);
  }
  /* Pham vi du lieu. `OrUnowned` vi so danh ba co the chua ban ghi chua ai nhan
     — chung chi hien voi nguoi co pham vi toan cong ty. */
  pushScope(where, params, scopeWhereOrUnowned(req, 'customers', 'read', 'c.owner_contact_id'));
  /* `fields=basic`: chi cot goc, bo 16 truy van con dem co hoi / viec / hop dong. Dung
     cho o chon khach hang (mo the viec, tao viec, loc bang...) — chi can ten. Ban day
     du ton hang giay khi co vai nghin khach, va may chu mot luong bat moi nguoi cho. */
  const select = req.query.fields === 'basic' ? 'SELECT c.* FROM customers c' : LIST_SQL;
  const sql = `${select} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.name COLLATE NOCASE`;
  res.json(db.prepare(sql).all(...params));
});

/**
 * FR-ACC-04: canh bao trung khi tao moi — doi chieu ten (bo dau), ma so thue va ten mien.
 * Ten/website chi canh bao; ma so thue trung chinh xac duoc chan o duong ghi.
 */
router.get('/duplicates', (req, res) => {
  const name = fold(String(req.query.name ?? '').trim());
  const taxCode = String(req.query.tax_code ?? '').trim();
  const website = String(req.query.website ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');

  if (!name && !taxCode && !website) {
    res.json([]);
    return;
  }
  const rows = db
    .prepare(
      `SELECT id, name, tax_code, website, status FROM customers
        WHERE org_kind = 'customer'
          AND ((? <> '' AND search_text LIKE '%' || ? || '%')
            OR (? <> '' AND upper(trim(tax_code)) = upper(?))
            OR (? <> '' AND lower(replace(replace(COALESCE(website,''), 'https://', ''), 'www.', '')) LIKE ? || '%'))
        LIMIT 5`
    )
    .all(name, name, taxCode, taxCode, website, website);
  res.json(rows);
});

/** Gia tri cua mot khach hang moi — cung hinh voi body POST /api/customers. */
export type NewCustomer = z.infer<typeof customerSchema>;

/**
 * Tao khach hang va tra ve dong vua tao. Dung chung cho POST /api/customers va luong
 * "tai hop dong len" (tao khach hang ngay khi hop dong chua co trong so).
 */
export function insertCustomer(input: NewCustomer, ownerContactId: number | null) {
  // Ten to chuc luon luu dang "Viet Hoa Chu Dau" — ke ca khi tao tu luong hop dong.
  const body = {
    ...input,
    name: normalizeOrgName(input.name),
    /* Danh muc luu nhan (v63). Ham nay con phuc vu luong tai hop dong len (AI doc ra
       nganh), nen o day chi chuan hoa/them muc; route POST da kiem chat truoc do. */
    industry: ensurePicklistValue(db, 'customer_industry', input.industry),
    size: ensurePicklistValue(db, 'customer_size', input.size),
    source: ensurePicklistValue(db, 'customer_source', input.source),
  };
  const taxCode = normalizedTaxCode(body.tax_code);
  const email = normalizedEmail(body.email);
  const website = clean(body.website);
  const orgKind = body.org_kind ?? 'customer';
  const status = orgKind === 'customer' ? (body.status ?? 'prospect') : 'inactive';
  assertTaxCodeAvailable(taxCode);
  const info = db
    .prepare(
      `INSERT INTO customers (name, short_name, tax_code, industry, address, website, phone, email,
                              size, source, status, org_kind, notes, search_text, owner_contact_id,
                              care_tier, care_cadence_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      body.name,
      body.short_name ?? null,
      taxCode,
      body.industry ?? null,
      body.address ?? null,
      website,
      body.phone ?? null,
      email,
      body.size ?? null,
      body.source ?? null,
      status,
      orgKind,
      body.notes ?? '',
      buildSearchText(
        body.name,
        body.short_name,
        body.industry,
        body.notes,
        body.phone,
        email,
        taxCode
      ),
      ownerContactId,
      body.care_tier ?? 'standard',
      body.care_cadence_days ?? null
    );
  return db.prepare(`SELECT * FROM customers WHERE id = ?`).get(info.lastInsertRowid) as {
    id: number;
    name: string;
  };
}

router.post('/', (req, res) => {
  const body = parseBody(customerSchema, req);
  body.industry = assertPicklistValue(db, 'customer_industry', body.industry);
  body.size = assertPicklistValue(db, 'customer_size', body.size);
  body.source = assertPicklistValue(db, 'customer_source', body.source);
  res.status(201).json(insertCustomer(body, defaultOwner(req)));
});

router.get('/:id/full', (req, res) => {
  const id = intParam(req.params.id);
  const customer = required(
    db.prepare(`${LIST_SQL} WHERE c.id = ?`).get(id),
    'Khong tim thay khach hang'
  ) as Record<string, unknown>;
  assertInScope(req, 'customers', 'read', customer.owner_contact_id as number | null);

  /* Kem don vi va VI TRI cua tung nguoi.

     Danh ba tung chi hien `contacts.title` — mot chuoi tu do go tay. Tu khi co
     phan quyen, chuoi do trong y het ten vi tri that ("Truong phong") nhung
     khong mang quyen gi: sua no khong doi duoc nguoi do thay gi, va khong man
     hinh nao lam lo ra su lech do. Nguoi da co tai khoan thi VI TRI moi la su
     that; `title` chi con dung cho nguoi chua co tai khoan (nguoi lien he ben
     khach hang, nhan su chua duoc cap tai khoan). */
  const contacts = db
    .prepare(
      `SELECT c.*, o.name AS org_unit_name,
              (SELECT p.name FROM users u
                 JOIN user_positions up ON up.user_id = u.id
                 JOIN positions p ON p.id = up.position_id
                WHERE u.contact_id = c.id
                ORDER BY up.is_primary DESC, p.position
                LIMIT 1) AS position_name
         FROM contacts c
         LEFT JOIN org_units o ON o.id = c.org_unit_id
        WHERE c.customer_id = ?
        ORDER BY c.is_primary DESC, c.full_name`
    )
    .all(id);
  const deals = db
    .prepare(
      `SELECT d.*, ct.full_name AS contact_name FROM deals d
         LEFT JOIN contacts ct ON ct.id = d.contact_id
        WHERE d.customer_id = ? ORDER BY d.updated_at DESC`
    )
    .all(id);
  const interactions = db
    .prepare(
      `SELECT i.*, ct.full_name AS contact_name, d.title AS deal_title
         FROM interactions i
         LEFT JOIN contacts ct ON ct.id = i.contact_id
         LEFT JOIN deals d ON d.id = i.deal_id
        WHERE i.customer_id = ?
        ORDER BY i.occurred_at DESC LIMIT 30`
    )
    .all(id);
  const tasks = db
    .prepare(
      `SELECT k.id, k.title, k.due_date, k.start_date, k.priority, k.is_done, k.parent_id,
              k.list_id, k.customer_id, k.deal_id,
              (SELECT COUNT(*) FROM cards sc WHERE sc.parent_id = k.id AND sc.is_archived = 0) AS subtask_total,
              (SELECT COUNT(*) FROM cards sc WHERE sc.parent_id = k.id AND sc.is_archived = 0 AND sc.is_done = 1) AS subtask_done,
              l.name AS list_name, b.id AS board_id, b.name AS board_name, c.name AS customer_name
         FROM cards k
         JOIN lists l ON l.id = k.list_id
         JOIN boards b ON b.id = l.board_id
         LEFT JOIN customers c ON c.id = k.customer_id
        WHERE k.customer_id = ? AND k.is_archived = 0
        ORDER BY k.is_done, k.due_date IS NULL, k.due_date`
    )
    .all(id);
  const reminders = db
    .prepare(`SELECT * FROM reminders WHERE customer_id = ? ORDER BY is_done, due_at`)
    .all(id);
  const boards = db
    .prepare(`SELECT id, name, color FROM boards WHERE customer_id = ? AND is_archived = 0`)
    .all(id);
  const quotations = db
    .prepare(
      `SELECT q.*, d.title AS deal_title FROM quotations q
         LEFT JOIN deals d ON d.id = q.deal_id
        WHERE q.customer_id = ? ORDER BY q.quote_date DESC, q.version DESC`
    )
    .all(id);
  const contracts = db
    .prepare(
      `SELECT k.*, CASE WHEN k.end_date IS NULL THEN NULL
                        ELSE CAST(julianday(k.end_date) - julianday(date('now','localtime')) AS INTEGER)
                   END AS days_left
         FROM contracts k WHERE k.customer_id = ? ORDER BY k.end_date IS NULL, k.end_date`
    )
    .all(id);
  const documents = db
    .prepare(
      `SELECT * FROM documents WHERE customer_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`
    )
    .all(id);
  // Dich vu dang su dung + doanh thu da nhap (moi nam) cua tung dong
  const services = db
    .prepare(
      `SELECT cs.*, s.name AS service_name, k.name AS contract_name, k.number AS contract_number,
              (SELECT COALESCE(SUM(r.amount_vnd), 0) FROM service_revenues r WHERE r.line_id = cs.id) AS amount_vnd,
              (SELECT COALESCE(SUM(r.forecast_vnd), 0) FROM service_revenues r WHERE r.line_id = cs.id) AS forecast_vnd,
              (SELECT COALESCE(SUM(r.amount_vnd), 0) FROM service_revenues r
                WHERE r.line_id = cs.id AND r.stage = 'paid') AS paid_vnd
         FROM customer_services cs
         LEFT JOIN services s ON s.id = cs.service_id
         LEFT JOIN contracts k ON k.id = cs.contract_id
        WHERE cs.customer_id = ?
        ORDER BY cs.status, s.name COLLATE NOCASE`
    )
    .all(id);

  res.json({
    ...customer,
    contacts,
    deals,
    interactions,
    tasks,
    reminders,
    boards,
    quotations,
    contracts,
    documents,
    services,
  });
});

/* ---------- Ho so 360°: cham soc, goi y, dong thoi gian (v54) ---------- */

/** Ti le chap nhan goi y toan he thong — cho bao cao. */
router.get('/suggestions/stats', (_req, res) => {
  res.json(suggestionStats(db));
});

function loadInScope(
  req: Parameters<typeof assertInScope>[0],
  id: number,
  action: 'read' | 'update'
) {
  const customer = required(
    db
      .prepare(
        `SELECT id, name, owner_contact_id, care_tier, care_cadence_days, created_at
           FROM customers WHERE id = ?`
      )
      .get(id),
    'Khong tim thay khach hang'
  ) as {
    id: number;
    name: string;
    owner_contact_id: number | null;
    care_tier: string;
    care_cadence_days: number | null;
    created_at: string;
  };
  assertInScope(req, 'customers', action, customer.owner_contact_id);
  return customer;
}

router.get('/:id/overview', (req, res) => {
  const customer = loadInScope(req, intParam(req.params.id), 'read');
  const today = todayOf(db);
  const care = careStatusOf(db, customer);
  res.json({
    care,
    churn: churnRiskOf(db, customer.id, care),
    revenue: revenueSummary(db, customer.id),
    expiring: expiringItems(db, customer.id),
    upcoming: careEventsBetween(db, today, addDaysStr(today, 60), { customerId: customer.id }),
    timeline: customerTimeline(db, customer.id),
    suggestions: refreshSuggestions(db, customer.id),
    suggestion_stats: suggestionStats(db, customer.id),
  });
});

function loadSuggestion(customerId: number, suggestionId: number): SuggestionRow {
  const row = required(
    db
      .prepare(`SELECT * FROM customer_suggestions WHERE id = ? AND customer_id = ?`)
      .get(suggestionId, customerId),
    'Khong tim thay goi y'
  ) as SuggestionRow;
  if (row.status !== 'open') throw new HttpError(409, 'Gợi ý này đã được xử lý');
  return row;
}

const acceptSchema = z.object({
  /** Co hoi vua tao tu goi y (gia han, ban cheo, mo lai). Kich ban sau ban thi bo trong. */
  deal_id: z.number().int().positive().nullable().optional(),
});

router.post('/:id/suggestions/:sid/accept', (req, res) => {
  const customer = loadInScope(req, intParam(req.params.id), 'update');
  const suggestion = loadSuggestion(customer.id, intParam(req.params.sid));
  const body = parseBody(acceptSchema, req);
  let reminderIds: number[] = [];
  let dealId: number | null = null;
  db.transaction(() => {
    if (suggestion.kind === 'aftercare') {
      if (!suggestion.source_deal_id) throw new HttpError(400, 'Gợi ý thiếu cơ hội nguồn');
      reminderIds = applyAftercare(db, {
        customerId: customer.id,
        dealId: suggestion.source_deal_id,
        ownerContactId: actorContactId(req),
      });
    } else {
      if (!body.deal_id) throw new HttpError(400, 'Cần tạo cơ hội từ gợi ý trước');
      const deal = db
        .prepare(`SELECT id FROM deals WHERE id = ? AND customer_id = ?`)
        .get(body.deal_id, customer.id);
      if (!deal) throw new HttpError(400, 'Cơ hội không thuộc khách hàng này');
      dealId = body.deal_id;
    }
    db.prepare(
      `UPDATE customer_suggestions SET status = 'accepted', result_deal_id = ?, decided_by = ?,
              decided_at = datetime('now','localtime'), updated_at = datetime('now','localtime')
        WHERE id = ?`
    ).run(dealId, actorContactId(req), suggestion.id);
  })();
  res.json({ ok: true, deal_id: dealId, reminder_ids: reminderIds });
});

const dismissSchema = z.object({ reason: z.string().trim().max(500).optional() });

router.post('/:id/suggestions/:sid/dismiss', (req, res) => {
  const customer = loadInScope(req, intParam(req.params.id), 'update');
  const suggestion = loadSuggestion(customer.id, intParam(req.params.sid));
  const body = parseBody(dismissSchema, req);
  db.prepare(
    `UPDATE customer_suggestions SET status = 'dismissed', dismiss_reason = ?, decided_by = ?,
            decided_at = datetime('now','localtime'), updated_at = datetime('now','localtime')
      WHERE id = ?`
  ).run(body.reason || null, actorContactId(req), suggestion.id);
  res.json({ ok: true });
});

router.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(customerSchema.partial(), req);
  const current = required(
    db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id),
    'Khong tim thay khach hang'
  ) as Record<string, string | null>;
  /* Chan danh sach thoi thi chua du: khong co dong nay, doan id la sua duoc ban
     ghi cua nguoi khac. 404 chu khong 403 — ngoai pham vi thi "khong ton tai" va
     "khong duoc xem" phai khong phan biet duoc. */
  assertInScope(req, 'customers', 'update', current.owner_contact_id as number | null);

  if (body.industry !== undefined)
    body.industry = assertPicklistValue(db, 'customer_industry', body.industry, current.industry);
  if (body.size !== undefined)
    body.size = assertPicklistValue(db, 'customer_size', body.size, current.size);
  if (body.source !== undefined)
    body.source = assertPicklistValue(db, 'customer_source', body.source, current.source);
  const merged = { ...current, ...body };
  // Chi chuan hoa khi ten DUOC GUI LEN: sua truong khac khong lang le doi ten cu.
  if (body.name !== undefined) merged.name = normalizeOrgName(body.name);
  const orgKind = merged.org_kind ?? 'customer';
  if (body.org_kind !== undefined && body.org_kind !== current.org_kind) {
    assertOrgKindChange(db, id, body.org_kind);
  }
  const taxCode = normalizedTaxCode(merged.tax_code);
  const email = normalizedEmail(merged.email);
  const website = clean(merged.website);
  const status = orgKind === 'customer' ? (merged.status ?? 'prospect') : 'inactive';
  assertTaxCodeAvailable(taxCode, id);
  db.prepare(
    `UPDATE customers SET name = ?, short_name = ?, tax_code = ?, industry = ?, address = ?,
            website = ?, phone = ?, email = ?, size = ?, source = ?, status = ?, org_kind = ?,
            notes = ?, search_text = ?, care_tier = ?, care_cadence_days = ?,
            updated_at = datetime('now','localtime')
      WHERE id = ?`
  ).run(
    merged.name,
    merged.short_name ?? null,
    taxCode,
    merged.industry ?? null,
    merged.address ?? null,
    website,
    merged.phone ?? null,
    email,
    merged.size ?? null,
    merged.source ?? null,
    status,
    orgKind,
    merged.notes ?? '',
    buildSearchText(
      merged.name,
      merged.short_name,
      merged.industry,
      merged.notes,
      merged.phone,
      email,
      taxCode
    ),
    merged.care_tier ?? 'standard',
    (merged as Record<string, unknown>).care_cadence_days ?? null,
    id
  );
  res.json(db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id));
});

/** BR-09: bao truoc so ban ghi lien quan se bi xoa theo. */
router.get('/:id/impact', (req, res) => {
  const id = intParam(req.params.id);
  res.json(
    db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM contacts WHERE customer_id = ?) AS contacts,
           (SELECT COUNT(*) FROM deals WHERE customer_id = ?) AS deals,
           (SELECT COUNT(*) FROM contracts WHERE customer_id = ?) AS contracts,
           (SELECT COUNT(*) FROM quotations WHERE customer_id = ?) AS quotations,
           (SELECT COUNT(*) FROM documents WHERE customer_id = ? AND deleted_at IS NULL) AS documents,
           (SELECT COUNT(*) FROM interactions WHERE customer_id = ?) AS interactions,
           (SELECT COUNT(*) FROM customer_services WHERE customer_id = ?) AS services,
           (SELECT COUNT(*) FROM cards WHERE customer_id = ?) AS tasks`
      )
      .get(id, id, id, id, id, id, id, id)
  );
});

router.delete('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const current = required(
    db.prepare(`SELECT owner_contact_id FROM customers WHERE id = ?`).get(id),
    'Khong tim thay khach hang'
  ) as { owner_contact_id: number | null };
  assertInScope(req, 'customers', 'delete', current.owner_contact_id);
  /* Xoa to chuc keo theo moi contact (ON DELETE CASCADE) — voi "cong ty minh" la
     ca danh ba nhan su. Cung rao nhu DELETE /api/contacts/:id. */
  const linked = db
    .prepare(
      `SELECT COUNT(*) AS n FROM users u JOIN contacts ct ON ct.id = u.contact_id
        WHERE ct.customer_id = ?`
    )
    .get(id) as { n: number };
  if (linked.n > 0) {
    throw new HttpError(
      409,
      `Tổ chức này có ${linked.n} người đang có tài khoản đăng nhập — gỡ liên kết ở màn Người dùng trước`
    );
  }
  db.prepare(`DELETE FROM customers WHERE id = ?`).run(id);
  res.json({ ok: true });
});

/* ---- Contacts thuoc khach hang ---- */
const contactSchema = z.object({
  full_name: z.string().trim().min(1, 'Ho ten khong duoc de trong'),
  title: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  zalo: z.string().nullable().optional(),
  linkedin: z.string().nullable().optional(),
  buying_role: z.string().nullable().optional(),
  relationship: z.string().nullable().optional(),
  is_primary: z.boolean().optional(),
  is_me: z.boolean().optional(),
  is_active: z.boolean().optional(),
  notes: z.string().optional(),
  /** v54: 'MM-DD' hoac 'YYYY-MM-DD' — nhac sinh nhat. */
  birthday: birthdaySchema,
});

router.post('/:id/contacts', (req, res) => {
  const customerId = intParam(req.params.id);
  const body = parseBody(contactSchema, req);
  required(
    db.prepare(`SELECT id FROM customers WHERE id = ?`).get(customerId),
    'Khong tim thay khach hang'
  );

  const id = db.transaction(() => {
    if (body.is_primary)
      db.prepare(`UPDATE contacts SET is_primary = 0 WHERE customer_id = ?`).run(customerId);
    // "Toi" la duy nhat trong toan bo so danh ba, khong phai trong mot to chuc.
    if (body.is_me) db.prepare(`UPDATE contacts SET is_me = 0`).run();
    const info = db
      .prepare(
        `INSERT INTO contacts (customer_id, full_name, title, department, phone, email, zalo,
                               linkedin, buying_role, relationship, is_primary, is_me, is_active,
                               notes, birthday)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        customerId,
        body.full_name,
        body.title ?? null,
        body.department ?? null,
        body.phone ?? null,
        body.email ?? null,
        body.zalo ?? null,
        body.linkedin ?? null,
        body.buying_role ?? null,
        body.relationship ?? null,
        body.is_primary ? 1 : 0,
        body.is_me ? 1 : 0,
        body.is_active === false ? 0 : 1,
        body.notes ?? '',
        body.birthday ?? null
      );
    return Number(info.lastInsertRowid);
  })();

  res.status(201).json(db.prepare(`SELECT * FROM contacts WHERE id = ?`).get(id));
});

router.get('/:id/interactions', (req, res) => {
  const id = intParam(req.params.id);
  res.json(
    db
      .prepare(
        `SELECT i.*, ct.full_name AS contact_name, d.title AS deal_title
           FROM interactions i
           LEFT JOIN contacts ct ON ct.id = i.contact_id
           LEFT JOIN deals d ON d.id = i.deal_id
          WHERE i.customer_id = ?
          ORDER BY i.occurred_at DESC`
      )
      .all(id)
  );
});

export default router;
