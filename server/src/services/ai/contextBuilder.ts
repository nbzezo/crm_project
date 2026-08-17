import type { Database } from 'better-sqlite3';
import { required } from '../../lib/validate.ts';

function rows(db: Database, sql: string, params: unknown[] = [], limit = 40): unknown[] {
  return db.prepare(`${sql} LIMIT ${Math.max(1, Math.min(limit, 100))}`).all(...params);
}

export function buildTodayContext(db: Database) {
  return {
    generated_at: new Date().toISOString(),
    overdue_tasks: rows(
      db,
      `SELECT k.id, k.title, k.priority, k.due_date, c.name AS customer_name, d.title AS deal_title
         FROM cards k
         LEFT JOIN customers c ON c.id = k.customer_id
         LEFT JOIN deals d ON d.id = k.deal_id
        WHERE k.is_done = 0 AND k.is_archived = 0 AND k.due_date < date('now','localtime')
        ORDER BY k.due_date, CASE k.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END`,
      [],
      25
    ),
    tasks_today: rows(
      db,
      `SELECT k.id, k.title, k.priority, k.due_date, c.name AS customer_name, d.title AS deal_title
         FROM cards k
         LEFT JOIN customers c ON c.id = k.customer_id
         LEFT JOIN deals d ON d.id = k.deal_id
        WHERE k.is_done = 0 AND k.is_archived = 0 AND date(k.due_date) = date('now','localtime')
        ORDER BY CASE k.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END`,
      [],
      25
    ),
    overdue_next_actions: rows(
      db,
      `SELECT d.id, d.title, d.stage, d.value_vnd, d.next_action, d.next_action_date,
              c.name AS customer_name
         FROM deals d JOIN customers c ON c.id = d.customer_id AND c.org_kind = 'customer'
        WHERE d.stage NOT IN ('won','lost') AND d.next_action_date < date('now','localtime')
        ORDER BY d.value_vnd DESC`,
      [],
      20
    ),
    deals_without_next_action: rows(
      db,
      `SELECT d.id, d.title, d.stage, d.value_vnd, c.name AS customer_name
         FROM deals d JOIN customers c ON c.id = d.customer_id AND c.org_kind = 'customer'
        WHERE d.stage NOT IN ('won','lost') AND TRIM(COALESCE(d.next_action,'')) = ''
        ORDER BY d.value_vnd DESC`,
      [],
      20
    ),
    expiring_contracts: rows(
      db,
      `SELECT k.id, k.name, k.number, k.end_date, k.value_vnd, c.name AS customer_name
         FROM contracts k JOIN customers c ON c.id = k.customer_id AND c.org_kind = 'customer'
        WHERE k.status = 'active' AND k.end_date BETWEEN date('now','localtime')
              AND date('now','localtime','+30 days')
        ORDER BY k.end_date`,
      [],
      20
    ),
    upcoming_reminders: rows(
      db,
      `SELECT id, title, note, due_at, customer_id, deal_id FROM reminders
        WHERE is_done = 0 AND due_at <= strftime('%Y-%m-%dT%H:%M', datetime('now','localtime','+7 days'))
        ORDER BY due_at`,
      [],
      20
    ),
  };
}

export function buildCustomerContext(db: Database, customerId: number) {
  const customer = required(
    db
      .prepare(
        `SELECT c.id, c.name, c.short_name, c.industry, c.size, c.source, c.status,
                c.phone, c.email, c.address, c.notes,
                (SELECT COALESCE(SUM(d.value_vnd), 0) FROM deals d
                  WHERE d.customer_id = c.id AND d.stage = 'won') AS total_won_vnd,
                (SELECT COALESCE(SUM(d.value_vnd), 0) FROM deals d
                  WHERE d.customer_id = c.id AND d.stage NOT IN ('won','lost')) AS open_pipeline_vnd,
                (SELECT COUNT(*) FROM contracts k
                  WHERE k.customer_id = c.id AND k.status = 'active') AS active_contract_count
           FROM customers c WHERE c.id = ?`
      )
      .get(customerId),
    'Không tìm thấy khách hàng'
  );
  return {
    customer,
    contacts: rows(
      db,
      `SELECT id, full_name, title, department, buying_role, relationship, notes
         FROM contacts WHERE customer_id = ? ORDER BY relationship DESC, full_name`,
      [customerId],
      30
    ),
    deals: rows(
      db,
      `SELECT id, title, product, stage, probability, value_vnd, expected_close_date,
              next_action, next_action_date, bant_total, p4_total, notes
         FROM deals WHERE customer_id = ? ORDER BY updated_at DESC`,
      [customerId],
      30
    ),
    interactions: rows(
      db,
      `SELECT i.id, i.type, i.occurred_at, i.summary, i.result, ct.full_name AS contact_name,
              d.title AS deal_title
         FROM interactions i
         LEFT JOIN contacts ct ON ct.id = i.contact_id
         LEFT JOIN deals d ON d.id = i.deal_id
        WHERE i.customer_id = ? ORDER BY i.occurred_at DESC`,
      [customerId],
      30
    ),
    open_tasks: rows(
      db,
      `SELECT id, title, priority, due_date FROM cards
        WHERE customer_id = ? AND is_done = 0 AND is_archived = 0 ORDER BY due_date IS NULL, due_date`,
      [customerId],
      30
    ),
    contracts: rows(
      db,
      `SELECT id, name, number, status, value_vnd, start_date, end_date, payment_terms, notes
         FROM contracts WHERE customer_id = ? ORDER BY end_date DESC`,
      [customerId],
      20
    ),
    documents: rows(
      db,
      `SELECT id, name, doc_type, file_name, description, tags, effective_date, expires_at,
              confidentiality
         FROM documents
        WHERE customer_id = ? AND deleted_at IS NULL AND confidentiality <> 'confidential'
        ORDER BY created_at DESC`,
      [customerId],
      20
    ),
  };
}

export function buildDealContext(db: Database, dealId: number) {
  const deal = required(
    db
      .prepare(
        `SELECT d.*, c.name AS customer_name, s.quadrant, s.v1_no_event, s.v2_no_economic,
                s.score_age_days
           FROM deals d JOIN customers c ON c.id = d.customer_id AND c.org_kind = 'customer'
           LEFT JOIN deal_scorecard s ON s.deal_id = d.id
          WHERE d.id = ?`
      )
      .get(dealId),
    'Không tìm thấy cơ hội'
  ) as Record<string, unknown>;
  const customerId = Number(deal.customer_id);
  return {
    deal,
    scores: rows(
      db,
      `SELECT factor, score, evidence, challenge, status, verified, scored_at
         FROM deal_scores WHERE deal_id = ? ORDER BY factor`,
      [dealId],
      20
    ),
    committee: rows(
      db,
      `SELECT ct.full_name, ct.title, ct.buying_role, dc.stance, dc.is_champion, dc.influence
         FROM deal_committee dc JOIN contacts ct ON ct.id = dc.contact_id
        WHERE dc.deal_id = ? ORDER BY dc.influence DESC`,
      [dealId],
      30
    ),
    competitors: rows(
      db,
      `SELECT name, incumbent, price_position, shaped_requirements, note
         FROM deal_competitors WHERE deal_id = ? ORDER BY name`,
      [dealId],
      20
    ),
    interactions: rows(
      db,
      `SELECT i.id, i.type, i.occurred_at, i.summary, i.result, ct.full_name AS contact_name
         FROM interactions i LEFT JOIN contacts ct ON ct.id = i.contact_id
        WHERE i.deal_id = ? ORDER BY i.occurred_at DESC`,
      [dealId],
      30
    ),
    tasks: rows(
      db,
      `SELECT id, title, priority, due_date, is_done FROM cards
        WHERE deal_id = ? AND is_archived = 0 ORDER BY is_done, due_date IS NULL, due_date`,
      [dealId],
      30
    ),
    documents: rows(
      db,
      `SELECT id, name, doc_type, file_name, description, tags, effective_date, expires_at
         FROM documents
        WHERE deal_id = ? AND deleted_at IS NULL AND confidentiality <> 'confidential'
        ORDER BY created_at DESC`,
      [dealId],
      20
    ),
    customer_summary: db
      .prepare(`SELECT id, name, industry, size, status, notes FROM customers WHERE id = ?`)
      .get(customerId),
  };
}

/**
 * Ngu canh cho viec dien not cac truong con thieu cua mot cong viec.
 *
 * Diem khac cac builder con lai: ngoai phan tom tat de hieu boi canh, no con liet ke
 * TAP UNG VIEN KEM ID (nguoi lien he, co hoi, hop dong, bao gia cua dung khach hang
 * do). Mo hinh phai chon tu tap nay chu khong duoc bia ten — route sau do loai bo
 * moi id khong nam trong tap da gui di.
 */
export function buildTaskAssistContext(
  db: Database,
  links: {
    customer_id?: number | null;
    contact_id?: number | null;
    deal_id?: number | null;
    contract_id?: number | null;
    quotation_id?: number | null;
  }
) {
  const customerId = links.customer_id ?? null;
  const scoped = (sql: string, limit = 30) =>
    customerId === null ? [] : rows(db, sql, [customerId], limit);

  return {
    today: new Date().toISOString().slice(0, 10),
    current_links: links,
    customer: customerId
      ? db
          .prepare(`SELECT id, name, industry, status, notes FROM customers WHERE id = ?`)
          .get(customerId)
      : null,
    deal: links.deal_id
      ? db
          .prepare(
            `SELECT id, title, stage, probability, value_vnd, need, next_action,
                    next_action_date, expected_close_date
               FROM deals WHERE id = ?`
          )
          .get(links.deal_id)
      : null,
    contract: links.contract_id
      ? db
          .prepare(
            `SELECT id, name, number, status, start_date, end_date, payment_terms
               FROM contracts WHERE id = ?`
          )
          .get(links.contract_id)
      : null,
    recent_interactions: customerId
      ? rows(
          db,
          `SELECT type, occurred_at, summary, result FROM interactions
            WHERE customer_id = ? ORDER BY occurred_at DESC`,
          [customerId],
          10
        )
      : [],
    open_tasks: customerId
      ? rows(
          db,
          `SELECT id, title, priority, due_date FROM cards
            WHERE customer_id = ? AND is_done = 0 AND is_archived = 0
            ORDER BY due_date IS NULL, due_date`,
          [customerId],
          15
        )
      : [],
    /* Tap ung vien — mo hinh chi duoc chon id tu day. */
    candidates: {
      contacts: scoped(
        `SELECT id, full_name, title, buying_role FROM contacts WHERE customer_id = ?
          ORDER BY is_primary DESC, full_name`
      ),
      deals: scoped(`SELECT id, title, stage FROM deals WHERE customer_id = ? ORDER BY id DESC`),
      contracts: scoped(
        `SELECT id, name, number, status FROM contracts WHERE customer_id = ? ORDER BY id DESC`
      ),
      quotations: scoped(
        `SELECT id, code, version, status FROM quotations WHERE customer_id = ? ORDER BY id DESC`
      ),
    },
  };
}

export function compactJson(value: unknown, maxChars = 45_000): string {
  const text = JSON.stringify(value);
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n[Đã cắt bớt dữ liệu]`;
}
