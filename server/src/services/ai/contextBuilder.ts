import type { Database } from 'better-sqlite3';
import { required } from '../../lib/validate.ts';
import { fold } from '../../lib/viSearch.ts';

function rows(db: Database, sql: string, params: unknown[] = [], limit = 40): unknown[] {
  return db.prepare(`${sql} LIMIT ${Math.max(1, Math.min(limit, 100))}`).all(...params);
}

/**
 * Pham vi du lieu ma tro ly AI duoc doc.
 *
 * `null` = khong gioi han. Mot mang = danh sach contact id duoc phep.
 *
 * DAY LA DUONG RO RI NGUY HIEM NHAT trong ca he phan quyen. Cac man hinh deu loc
 * theo pham vi, nhung neu ngu canh gui cho AI thi khong, bat ky ai cung moi duoc
 * du lieu cua phong khac ra chi bang mot cau hoi thuong — va khong man hinh nao
 * lam lo ra dieu do. Moi truy van o day phai di qua `scoped()`.
 */
export type AiScope = number[] | null;

/** Dieu kien `IN (...)` cho mot cot, hoac chuoi rong khi khong gioi han. */
function scopeClause(scope: AiScope, column: string): { sql: string; params: number[] } {
  if (scope === null) return { sql: '', params: [] };
  if (scope.length === 0) return { sql: ` AND 1 = 0`, params: [] };
  return { sql: ` AND ${column} IN (${scope.map(() => '?').join(',')})`, params: [...scope] };
}

/**
 * Pham vi cho TUNG loai du lieu, gop lai thanh mot doi tuong.
 *
 * Khong dung mot pham vi chung cho ca tro ly: mot nguoi co the doc duoc hop
 * dong ma khong doc duoc pipeline, va cau tra loi cua AI phai phan anh dung
 * dieu do. Doi tuong nay duoc dung mot lan moi request o routes/ai.ts tu
 * `Access.visibleContactIds`, roi truyen xuong day — tang service khong biet gi
 * ve Request, nen test goi duoc truc tiep khong can dung mot may chu.
 */
export interface AiScopes {
  customers: AiScope;
  deals: AiScope;
  contracts: AiScope;
  tasks: AiScope;
  notes: AiScope;
  /** Contact cua chinh nguoi hoi — viec giao cho ho thi luon doc duoc. */
  me: number | null;
}

/** Khong gioi han gi — dung cho che do tat xac thuc va cho quan tri he thong. */
export const OPEN_SCOPES: AiScopes = {
  customers: null,
  deals: null,
  contracts: null,
  tasks: null,
  notes: null,
  me: null,
};

/**
 * Tra cuu CRM theo tu khoa de lam ngu canh cho mot cau hoi.
 *
 * MOI TRUY VAN O DAY PHAI MANG DIEU KIEN PHAM VI — xem ghi chu o `AiScope`.
 * Tach khoi routes/ai.ts de test dem duoc so dong tra ve cho tung vi tri
 * (server/src/test/aiScope.test.ts), thay vi phai goi that mot nha cung cap AI.
 */
export function buildSearchContext(db: Database, query: string, scopes: AiScopes) {
  const like = `%${fold(query)}%`;
  const customers = scopeClause(scopes.customers, 'c.owner_contact_id');
  const deals = scopeClause(scopes.deals, 'd.owner_contact_id');
  /* Hop dong va ghi chu hop khong co cot chu so huu rieng — suy tu khach hang
     va tu co hoi qua JOIN san co, dung nguyen tac "khong co ban sao thi khong
     the lech" da ghi trong docs/ARCHITECTURE.md. */
  const contracts = scopeClause(scopes.contracts, 'c.owner_contact_id');
  const notes = scopeClause(scopes.notes, 'n.owner_contact_id');
  const tasks = taskClause(scopes);

  return {
    customers: db
      .prepare(
        `SELECT c.id, c.name, c.industry, c.status, c.notes FROM customers c
          WHERE c.org_kind = 'customer' AND c.search_text LIKE ?${customers.sql}
          ORDER BY c.updated_at DESC LIMIT 8`
      )
      .all(like, ...customers.params),
    deals: db
      .prepare(
        `SELECT d.id, d.title, d.stage, d.value_vnd, d.next_action, d.next_action_date,
                c.name AS customer_name,
                (SELECT MAX(i.occurred_at) FROM interactions i WHERE i.deal_id = d.id) AS last_interaction
           FROM deals d JOIN customers c ON c.id = d.customer_id AND c.org_kind = 'customer'
          WHERE (d.search_text LIKE ? OR c.search_text LIKE ?)${deals.sql}
          ORDER BY d.updated_at DESC LIMIT 12`
      )
      .all(like, like, ...deals.params),
    contracts: db
      .prepare(
        `SELECT k.id, k.name, k.number, k.status, k.value_vnd, k.end_date, c.name AS customer_name
           FROM contracts k JOIN customers c ON c.id = k.customer_id AND c.org_kind = 'customer'
          WHERE (k.search_text LIKE ? OR c.search_text LIKE ?)${contracts.sql}
          ORDER BY k.end_date LIMIT 8`
      )
      .all(like, like, ...contracts.params),
    tasks: db
      .prepare(
        `SELECT k.id, k.title, k.priority, k.due_date, k.is_done, c.name AS customer_name,
                d.title AS deal_title
           FROM cards k
           LEFT JOIN customers c ON c.id = k.customer_id
           LEFT JOIN deals d ON d.id = k.deal_id
           LEFT JOIN lists l ON l.id = k.list_id
           LEFT JOIN boards b ON b.id = l.board_id
          WHERE k.search_text LIKE ? AND k.is_archived = 0${tasks.sql}
          ORDER BY k.updated_at DESC LIMIT 12`
      )
      .all(like, ...tasks.params),
    meeting_notes: db
      .prepare(
        `SELECT n.id, n.title, n.meeting_at, n.deal_id, n.project_id,
                d.title AS deal_title, p.name AS project_name
           FROM meeting_notes n
           LEFT JOIN deals d ON d.id = n.deal_id
           LEFT JOIN projects p ON p.id = n.project_id
          WHERE n.deleted_at IS NULL AND n.search_text LIKE ?${notes.sql}
          ORDER BY n.updated_at DESC LIMIT 8`
      )
      .all(like, ...notes.params),
  };
}

/**
 * Viec: cua bang thuoc pham vi cua minh, bang chua co chu, HOAC duoc giao cho
 * chinh minh. Giong luat cua man hinh Cong viec — mot nguoi phai luon doc duoc
 * viec cua chinh ho, ke ca khi no nam tren bang cua phong khac.
 */
function taskClause(scopes: AiScopes): { sql: string; params: number[] } {
  if (scopes.tasks === null) return { sql: '', params: [] };
  const owned = scopeClause(scopes.tasks, 'b.owner_contact_id');
  const body = owned.sql === ' AND 1 = 0' ? '1 = 0' : owned.sql.slice(' AND '.length);
  const mine = scopes.me == null ? '' : ` OR k.assignee_contact_id = ?`;
  return {
    sql: ` AND (${body} OR b.owner_contact_id IS NULL${mine})`,
    params: scopes.me == null ? owned.params : [...owned.params, scopes.me],
  };
}

/** Ghi chu nhanh la du lieu CA NHAN — mac dinh chi chu so huu doc duoc. */
export function buildQuickNoteContext(db: Database, scope: AiScope) {
  const notes = scopeClause(scope, 'owner_contact_id');
  return db
    .prepare(
      `SELECT id, title, substr(content_text, 1, 2000) AS content, tags, is_pinned,
              reminder_at, reminder_status, updated_at
         FROM quick_notes
        WHERE deleted_at IS NULL AND archived_at IS NULL${notes.sql}
        ORDER BY is_pinned DESC, updated_at DESC LIMIT 12`
    )
    .all(...notes.params);
}

export function buildTodayContext(db: Database, scope: AiScope = null) {
  /* Cong viec: cua toi hoac giao cho toi. Ngu canh "hom nay" von la ve viec cua
     chinh nguoi dang hoi, nen loc theo nguoi phu trach la dung nghia chu khong
     chi dung ky thuat. */
  const tasks = scopeClause(scope, 'k.assignee_contact_id');
  const deals = scopeClause(scope, 'd.owner_contact_id');
  const contracts = scopeClause(scope, 'c.owner_contact_id');
  const reminders = scopeClause(scope, 'owner_contact_id');
  return {
    generated_at: new Date().toISOString(),
    overdue_tasks: rows(
      db,
      `SELECT k.id, k.title, k.priority, k.due_date, c.name AS customer_name, d.title AS deal_title
         FROM cards k
         LEFT JOIN customers c ON c.id = k.customer_id
         LEFT JOIN deals d ON d.id = k.deal_id
        WHERE k.is_done = 0 AND k.is_archived = 0 AND k.due_date < date('now','localtime')${tasks.sql}
        ORDER BY k.due_date, CASE k.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END`,
      tasks.params,
      25
    ),
    tasks_today: rows(
      db,
      `SELECT k.id, k.title, k.priority, k.due_date, c.name AS customer_name, d.title AS deal_title
         FROM cards k
         LEFT JOIN customers c ON c.id = k.customer_id
         LEFT JOIN deals d ON d.id = k.deal_id
        WHERE k.is_done = 0 AND k.is_archived = 0 AND date(k.due_date) = date('now','localtime')${tasks.sql}
        ORDER BY CASE k.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END`,
      tasks.params,
      25
    ),
    overdue_next_actions: rows(
      db,
      `SELECT d.id, d.title, d.stage, d.value_vnd, d.next_action, d.next_action_date,
              c.name AS customer_name
         FROM deals d JOIN customers c ON c.id = d.customer_id AND c.org_kind = 'customer'
        WHERE d.stage NOT IN ('won','lost') AND d.next_action_date < date('now','localtime')${deals.sql}
        ORDER BY d.value_vnd DESC`,
      deals.params,
      20
    ),
    deals_without_next_action: rows(
      db,
      `SELECT d.id, d.title, d.stage, d.value_vnd, c.name AS customer_name
         FROM deals d JOIN customers c ON c.id = d.customer_id AND c.org_kind = 'customer'
        WHERE d.stage NOT IN ('won','lost') AND TRIM(COALESCE(d.next_action,'')) = ''${deals.sql}
        ORDER BY d.value_vnd DESC`,
      deals.params,
      20
    ),
    expiring_contracts: rows(
      db,
      `SELECT k.id, k.name, k.number, k.end_date, k.value_vnd, c.name AS customer_name
         FROM contracts k JOIN customers c ON c.id = k.customer_id AND c.org_kind = 'customer'
        WHERE k.status = 'active' AND k.end_date BETWEEN date('now','localtime')
              AND date('now','localtime','+30 days')${contracts.sql}
        ORDER BY k.end_date`,
      contracts.params,
      20
    ),
    upcoming_reminders: rows(
      db,
      `SELECT id, title, note, due_at, customer_id, deal_id FROM reminders
        WHERE is_done = 0 AND due_at <= strftime('%Y-%m-%dT%H:%M', datetime('now','localtime','+7 days'))${reminders.sql}
        ORDER BY due_at`,
      reminders.params,
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
