import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { intParam, parseBody, required } from '../lib/validate.ts';
import { buildSearchText, fold } from '../lib/viSearch.ts';

const router = Router();

const customerSchema = z.object({
  name: z.string().trim().min(1, 'Ten khach hang khong duoc de trong'),
  short_name: z.string().nullable().optional(),
  tax_code: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  status: z.enum(['prospect', 'customer', 'inactive']).optional(),
  notes: z.string().optional(),
});

const LIST_SQL = `
  SELECT c.*,
         (SELECT COUNT(*) FROM deals d WHERE d.customer_id = c.id AND d.stage NOT IN ('won','lost')) AS open_deal_count,
         (SELECT COUNT(*) FROM deals d WHERE d.customer_id = c.id) AS deal_count,
         (SELECT COUNT(*) FROM cards k WHERE k.customer_id = c.id AND k.is_done = 0 AND k.is_archived = 0) AS open_task_count,
         (SELECT COUNT(*) FROM cards k
           WHERE k.customer_id = c.id AND k.is_done = 0 AND k.is_archived = 0
             AND k.due_date IS NOT NULL
             AND substr(k.due_date, 1, 10) < date('now','localtime')) AS overdue_task_count,
         (SELECT COALESCE(SUM(d.value_vnd), 0) FROM deals d WHERE d.customer_id = c.id AND d.stage = 'won') AS total_won_vnd,
         (SELECT COALESCE(SUM(d.value_vnd), 0) FROM deals d WHERE d.customer_id = c.id AND d.stage NOT IN ('won','lost')) AS open_pipeline_vnd,
         (SELECT COUNT(*) FROM contracts k WHERE k.customer_id = c.id AND k.status = 'active') AS active_contract_count,
         (SELECT MAX(i.occurred_at) FROM interactions i WHERE i.customer_id = c.id) AS last_activity_at,
         (SELECT COUNT(*) FROM deals d
           WHERE d.customer_id = c.id AND d.stage NOT IN ('won','lost')
             AND trim(COALESCE(d.next_action, '')) = '') AS deals_without_next_action_count,
         (SELECT COUNT(*) FROM deals d
           WHERE d.customer_id = c.id AND d.stage NOT IN ('won','lost')
             AND d.next_action_date IS NOT NULL
             AND substr(d.next_action_date, 1, 10) < date('now','localtime')) AS overdue_next_action_count,
         (SELECT d.next_action FROM deals d
           WHERE d.customer_id = c.id AND d.stage NOT IN ('won','lost')
             AND trim(COALESCE(d.next_action, '')) <> ''
           ORDER BY d.next_action_date IS NULL, d.next_action_date, d.updated_at DESC LIMIT 1) AS next_deal_action,
         (SELECT d.next_action_date FROM deals d
           WHERE d.customer_id = c.id AND d.stage NOT IN ('won','lost')
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
  const where: string[] = [];
  const params: unknown[] = [];
  if (q) {
    where.push(`c.search_text LIKE '%' || ? || '%'`);
    params.push(q);
  }
  if (['prospect', 'customer', 'inactive'].includes(status)) {
    where.push(`c.status = ?`);
    params.push(status);
  }
  const sql = `${LIST_SQL} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.name COLLATE NOCASE`;
  res.json(db.prepare(sql).all(...params));
});

/**
 * FR-ACC-04: canh bao trung khi tao moi — doi chieu ten (bo dau), ma so thue va ten mien.
 * Chi canh bao, khong chan tao moi.
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
        WHERE (? <> '' AND search_text LIKE '%' || ? || '%')
           OR (? <> '' AND tax_code = ?)
           OR (? <> '' AND lower(replace(replace(COALESCE(website,''), 'https://', ''), 'www.', '')) LIKE ? || '%')
        LIMIT 5`
    )
    .all(name, name, taxCode, taxCode, website, website);
  res.json(rows);
});

router.post('/', (req, res) => {
  const body = parseBody(customerSchema, req);
  const info = db
    .prepare(
      `INSERT INTO customers (name, short_name, tax_code, industry, address, website, phone, email,
                              size, source, status, notes, search_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      body.name,
      body.short_name ?? null,
      body.tax_code ?? null,
      body.industry ?? null,
      body.address ?? null,
      body.website ?? null,
      body.phone ?? null,
      body.email ?? null,
      body.size ?? null,
      body.source ?? null,
      body.status ?? 'prospect',
      body.notes ?? '',
      buildSearchText(
        body.name,
        body.short_name,
        body.industry,
        body.notes,
        body.phone,
        body.email,
        body.tax_code
      )
    );
  res
    .status(201)
    .json(db.prepare(`SELECT * FROM customers WHERE id = ?`).get(info.lastInsertRowid));
});

router.get('/:id/full', (req, res) => {
  const id = intParam(req.params.id);
  const customer = required(
    db.prepare(`${LIST_SQL} WHERE c.id = ?`).get(id),
    'Khong tim thay khach hang'
  ) as Record<string, unknown>;

  const contacts = db
    .prepare(`SELECT * FROM contacts WHERE customer_id = ? ORDER BY is_primary DESC, full_name`)
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

router.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(customerSchema.partial(), req);
  const current = required(
    db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id),
    'Khong tim thay khach hang'
  ) as Record<string, string | null>;

  const merged = { ...current, ...body };
  db.prepare(
    `UPDATE customers SET name = ?, short_name = ?, tax_code = ?, industry = ?, address = ?,
            website = ?, phone = ?, email = ?, size = ?, source = ?, status = ?, notes = ?,
            search_text = ?, updated_at = datetime('now','localtime')
      WHERE id = ?`
  ).run(
    merged.name,
    merged.short_name ?? null,
    merged.tax_code ?? null,
    merged.industry ?? null,
    merged.address ?? null,
    merged.website ?? null,
    merged.phone ?? null,
    merged.email ?? null,
    merged.size ?? null,
    merged.source ?? null,
    merged.status ?? 'prospect',
    merged.notes ?? '',
    buildSearchText(
      merged.name,
      merged.short_name,
      merged.industry,
      merged.notes,
      merged.phone,
      merged.email,
      merged.tax_code
    ),
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
  notes: z.string().optional(),
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
    const info = db
      .prepare(
        `INSERT INTO contacts (customer_id, full_name, title, department, phone, email, zalo,
                               linkedin, buying_role, relationship, is_primary, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        body.notes ?? ''
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
