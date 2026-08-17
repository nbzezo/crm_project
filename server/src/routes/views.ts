import { Router } from 'express';
import { db } from '../db/connection.ts';
import { fold } from '../lib/viSearch.ts';
import { QUADRANTS, STAGES, STALE_DAYS } from '../lib/crm.ts';
import { getScoringSettings } from '../lib/scoring.ts';

const router = Router();

const TASK_SELECT = `
  SELECT k.id, k.title, k.description, k.priority, k.start_date, k.due_date, k.is_done,
         k.status, k.blocked_reason, k.blocked_since, k.recur_rule,
         k.completed_at, k.position, k.list_id, k.parent_id,
         (SELECT COUNT(*) FROM task_nudges n WHERE n.card_id = k.id) AS nudge_count,
         (SELECT MAX(n.sent_at) FROM task_nudges n WHERE n.card_id = k.id) AS last_nudged_at,
         (SELECT COUNT(*) FROM checklist_items ci WHERE ci.card_id = k.id) AS checklist_total,
         (SELECT COUNT(*) FROM checklist_items ci WHERE ci.card_id = k.id AND ci.is_done = 1) AS checklist_done,
         (SELECT COUNT(*) FROM cards sc WHERE sc.parent_id = k.id AND sc.is_archived = 0) AS subtask_total,
         (SELECT COUNT(*) FROM cards sc WHERE sc.parent_id = k.id AND sc.is_archived = 0 AND sc.is_done = 1) AS subtask_done,
         l.name AS list_name, b.id AS board_id, b.name AS board_name, b.color AS board_color,
         k.customer_id, c.name AS customer_name, k.deal_id, d.title AS deal_title,
         k.assignee_contact_id, k.assignee_org_id, ac.full_name AS assignee_name,
         ac.phone AS assignee_phone, ac.email AS assignee_email, ac.zalo AS assignee_zalo,
         ao.name AS assignee_org_name, ao.org_kind AS assignee_org_kind,
         /* Du an suy tu BANG (v19) — cards khong con cot project_id. */
         b.project_id, pr.name AS project_name, l.status_mapping,
         k.estimate_hours, k.spent_hours, k.is_milestone, k.baseline_due_date,
         (SELECT COUNT(*) FROM card_due_changes dc WHERE dc.card_id = k.id) AS slip_count,
         CAST(julianday(k.due_date) - julianday(k.baseline_due_date) AS INTEGER) AS slip_days
    FROM cards k
    JOIN lists l ON l.id = k.list_id
    JOIN boards b ON b.id = l.board_id
    LEFT JOIN customers c ON c.id = k.customer_id
    LEFT JOIN deals d ON d.id = k.deal_id
    LEFT JOIN contacts ac ON ac.id = k.assignee_contact_id
    LEFT JOIN customers ao ON ao.id = k.assignee_org_id
    LEFT JOIN projects pr ON pr.id = b.project_id`;

/** Cot phu canh bao cho co hoi (FR-PIP-04, FR-DSH-05, BR-06, BR-07). */
const DEAL_ATTENTION_SELECT = `
  SELECT d.id, d.title, d.stage, d.value_vnd, d.probability, d.expected_close_date,
         d.next_action, d.next_action_date, c.name AS customer_name,
         CAST(julianday('now','localtime') -
              julianday(COALESCE((SELECT MAX(substr(i.occurred_at,1,10)) FROM interactions i WHERE i.deal_id = d.id),
                                 substr(d.created_at,1,10))) AS INTEGER) AS days_idle
    FROM deals d JOIN customers c ON c.id = d.customer_id AND c.org_kind = 'customer'
   WHERE d.stage NOT IN ('won','lost')`;

function attachLabels(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  if (rows.length === 0) return rows;
  const links = db.prepare(`SELECT card_id, label_id FROM card_labels`).all() as {
    card_id: number;
    label_id: number;
  }[];
  const map = new Map<number, number[]>();
  for (const l of links) {
    const arr = map.get(l.card_id) ?? [];
    arr.push(l.label_id);
    map.set(l.card_id, arr);
  }
  for (const row of rows) row.label_ids = map.get(row.id as number) ?? [];
  return rows;
}

/** Danh sach cong viec phang — dung cho trang Cong viec va Bang tinh. */
router.get('/tasks', (req, res) => {
  const where: string[] = ['b.is_archived = 0', 'k.is_archived = 0'];
  const params: unknown[] = [];

  const q = fold(String(req.query.q ?? '').trim());
  if (q) {
    where.push(`k.search_text LIKE '%' || ? || '%'`);
    params.push(q);
  }
  if (req.query.priority) {
    where.push(`k.priority = ?`);
    params.push(String(req.query.priority));
  }
  if (req.query.customer_id) {
    where.push(`k.customer_id = ?`);
    params.push(Number(req.query.customer_id));
  }
  if (req.query.board_id) {
    where.push(`b.id = ?`);
    params.push(Number(req.query.board_id));
  }
  if (req.query.project_id) {
    where.push(`b.project_id = ?`);
    params.push(Number(req.query.project_id));
  }
  if (req.query.assignee_contact_id) {
    where.push(`k.assignee_contact_id = ?`);
    params.push(Number(req.query.assignee_contact_id));
  }
  if (req.query.assignee_org_id) {
    where.push(`k.assignee_org_id = ?`);
    params.push(Number(req.query.assignee_org_id));
  }
  /* "Viec cua toi" doc tu contacts.is_me thay vi bat client nho id — mot cho khai bao. */
  if (req.query.mine === '1') where.push(`ac.is_me = 1`);
  if (req.query.unassigned === '1') where.push(`k.assignee_contact_id IS NULL`);
  if (req.query.done === '1') where.push(`k.is_done = 1`);
  if (req.query.done === '0') where.push(`k.is_done = 0`);
  if (req.query.card_status) {
    where.push(`k.status = ?`);
    params.push(String(req.query.card_status));
  }
  /* Viec dang cho ben ngoai: 'blocked' + 'waiting_customer'. Day la tap ma man
     "Can nhac" quan tam — chung khong tre vi luoi, ma vi dang doi ai do. */
  if (req.query.waiting === '1') where.push(`k.status IN ('blocked','waiting_customer')`);
  if (req.query.overdue === '1')
    where.push(`k.is_done = 0 AND k.due_date IS NOT NULL AND k.due_date < date('now','localtime')`);

  const rows = db
    .prepare(
      `${TASK_SELECT} WHERE ${where.join(' AND ')}
        ORDER BY k.is_done, k.due_date IS NULL, k.due_date, k.id DESC`
    )
    .all(...params) as Record<string, unknown>[];

  res.json(attachLabels(rows));
});

/** Su kien cho trang Lich — cong viec, nhac hen, ngay chot du kien, han hop dong. */
router.get('/calendar', (req, res) => {
  const from = String(req.query.from ?? '1970-01-01');
  const to = String(req.query.to ?? '2999-12-31');
  // Khi xem trong mot bang — hoac mot du an (v19) — thi chi lay du lieu pham vi do
  const boardId = req.query.board_id ? Number(req.query.board_id) : null;
  const projectId = req.query.project_id ? Number(req.query.project_id) : null;

  const cards = db
    .prepare(
      `${TASK_SELECT} WHERE b.is_archived = 0 AND k.is_archived = 0 AND k.due_date IS NOT NULL
        AND k.due_date BETWEEN ? AND ?
        AND (? IS NULL OR b.id = ?) AND (? IS NULL OR b.project_id = ?)`
    )
    .all(from, to, boardId, boardId, projectId, projectId) as Record<string, unknown>[];

  const reminders = db
    .prepare(
      `SELECT r.id, r.title, r.due_at, r.is_done, r.card_id FROM reminders r
         LEFT JOIN cards k ON k.id = r.card_id
         LEFT JOIN lists l ON l.id = k.list_id
         LEFT JOIN boards b ON b.id = l.board_id
        WHERE substr(r.due_at, 1, 10) BETWEEN ? AND ?
          AND (? IS NULL OR l.board_id = ?) AND (? IS NULL OR b.project_id = ?)`
    )
    .all(from, to, boardId, boardId, projectId, projectId) as Record<string, unknown>[];

  // Chi khung nhin toan cuc moi co du lieu khong thuoc bang nao:
  // lich ca nhan (v11) va cac moc CRM.
  const global = boardId === null && projectId === null;
  const crm = global;

  /**
   * Lich ca nhan — tra NGUYEN ban ghi chu khong lam phang nhu 5 loai kia,
   * de ngan keo chi tiet mo duoc ngay ma khong phai goi them mot request.
   *
   * `to` cua endpoint nay la ngay BAO GOM (5 nhanh cu deu dung BETWEEN), con
   * `end_at` la moc LOAI TRU — nen phai doi `to` thanh dau ngay hom sau.
   */
  const events = (
    global
      ? db
          .prepare(
            `SELECT e.*,
                  CASE WHEN e.status = 'pending'
                        AND e.end_at <= strftime('%Y-%m-%dT%H:%M', datetime('now','localtime'))
                       THEN 1 ELSE 0 END AS is_overdue,
                  CASE WHEN e.reminder_minutes IS NULL THEN NULL
                       ELSE strftime('%Y-%m-%dT%H:%M',
                                     datetime(e.start_at, '-' || e.reminder_minutes || ' minutes'))
                  END AS reminder_at
             FROM calendar_events e
            WHERE e.start_at < strftime('%Y-%m-%dT%H:%M', datetime(?, '+1 day'))
              AND e.end_at > ? || 'T00:00'`
          )
          .all(to, from)
      : []
  ) as Record<string, unknown>[];
  const deals = (
    crm
      ? db
          .prepare(
            `SELECT d.id, d.title, d.expected_close_date, d.value_vnd, c.name AS customer_name
             FROM deals d JOIN customers c ON c.id = d.customer_id AND c.org_kind = 'customer'
            WHERE d.expected_close_date IS NOT NULL AND d.expected_close_date BETWEEN ? AND ?
              AND d.stage NOT IN ('won','lost')`
          )
          .all(from, to)
      : []
  ) as Record<string, unknown>[];

  const nextActions = (
    crm
      ? db
          .prepare(
            `SELECT d.id, d.next_action, d.next_action_date, c.name AS customer_name
             FROM deals d JOIN customers c ON c.id = d.customer_id AND c.org_kind = 'customer'
            WHERE d.next_action_date IS NOT NULL AND d.next_action_date BETWEEN ? AND ?
              AND d.stage NOT IN ('won','lost')`
          )
          .all(from, to)
      : []
  ) as Record<string, unknown>[];

  const contracts = (
    crm
      ? db
          .prepare(
            `SELECT k.id, k.name, k.end_date, k.value_vnd, c.name AS customer_name
             FROM contracts k JOIN customers c ON c.id = k.customer_id AND c.org_kind = 'customer'
            WHERE k.end_date IS NOT NULL AND k.end_date BETWEEN ? AND ? AND k.status = 'active'`
          )
          .all(from, to)
      : []
  ) as Record<string, unknown>[];

  res.json([
    ...events.map((e) => ({ ...e, kind: 'event' as const })),
    ...cards.map((k) => ({
      kind: 'card' as const,
      id: k.id,
      title: k.title,
      date: k.due_date,
      priority: k.priority,
      is_done: k.is_done,
      board_name: k.board_name,
      customer_name: k.customer_name,
    })),
    ...reminders.map((r) => ({
      kind: 'reminder' as const,
      id: r.id,
      title: r.title,
      date: String(r.due_at).slice(0, 10),
      time: String(r.due_at).slice(11, 16),
      is_done: r.is_done,
      card_id: r.card_id,
    })),
    ...nextActions.map((d) => ({
      kind: 'next_action' as const,
      id: d.id,
      title: d.next_action,
      date: d.next_action_date,
      customer_name: d.customer_name,
    })),
    ...deals.map((d) => ({
      kind: 'deal_close' as const,
      id: d.id,
      title: d.title,
      date: d.expected_close_date,
      value_vnd: d.value_vnd,
      customer_name: d.customer_name,
    })),
    ...contracts.map((k) => ({
      kind: 'contract_end' as const,
      id: k.id,
      title: k.name,
      date: k.end_date,
      value_vnd: k.value_vnd,
      customer_name: k.customer_name,
    })),
  ]);
});

/** Du lieu cho trang Dong thoi gian. */
router.get('/timeline', (req, res) => {
  const groupBy = req.query.groupBy === 'customer' ? 'customer' : 'board';
  const boardId = req.query.board_id ? Number(req.query.board_id) : null;
  const projectId = req.query.project_id ? Number(req.query.project_id) : null;
  // Xem trong mot bang thi nhom theo danh sach cho de theo doi
  const groupByList = boardId !== null && req.query.groupBy !== 'customer';

  const scope = `AND (? IS NULL OR b.id = ?) AND (? IS NULL OR b.project_id = ?)`;
  const scopeArgs = [boardId, boardId, projectId, projectId];

  const scheduled = db
    .prepare(
      `${TASK_SELECT}
        WHERE b.is_archived = 0 AND k.is_archived = 0 AND k.is_done = 0 AND k.parent_id IS NULL
          AND (k.start_date IS NOT NULL OR k.due_date IS NOT NULL)
          ${scope}
        ORDER BY COALESCE(k.start_date, k.due_date), k.due_date`
    )
    .all(...scopeArgs) as Record<string, unknown>[];

  const unscheduled = db
    .prepare(
      `${TASK_SELECT}
        WHERE b.is_archived = 0 AND k.is_archived = 0 AND k.is_done = 0
          AND k.start_date IS NULL AND k.due_date IS NULL
          ${scope}
        ORDER BY k.id DESC LIMIT 100`
    )
    .all(...scopeArgs) as Record<string, unknown>[];

  const visibleIds = new Set(scheduled.map((k) => k.id as number));

  res.json({
    items: scheduled.map((k) => ({
      id: k.id,
      title: k.title,
      start_date: (k.start_date ?? k.due_date) as string,
      due_date: (k.due_date ?? k.start_date) as string,
      priority: k.priority,
      is_done: k.is_done,
      status: k.status,
      is_milestone: k.is_milestone,
      assignee_name: k.assignee_name,
      assignee_org_kind: k.assignee_org_kind,
      slip_count: k.slip_count,
      progress:
        Number(k.checklist_total) > 0
          ? Math.round((Number(k.checklist_done) / Number(k.checklist_total)) * 100)
          : Number(k.subtask_total) > 0
            ? Math.round((Number(k.subtask_done) / Number(k.subtask_total)) * 100)
            : null,
      board_name: k.board_name,
      customer_name: k.customer_name,
      group_id: groupByList
        ? (k.list_id as number)
        : groupBy === 'customer'
          ? ((k.customer_id as number | null) ?? 0)
          : (k.board_id as number),
      group_name: groupByList
        ? (k.list_name as string)
        : groupBy === 'customer'
          ? ((k.customer_name as string | null) ?? 'Không gắn khách hàng')
          : (k.board_name as string),
    })),
    unscheduled: unscheduled.map((k) => ({
      id: k.id,
      title: k.title,
      board_name: k.board_name,
      list_name: k.list_name,
      customer_name: k.customer_name,
      priority: k.priority,
    })),
    /*
     * Phu thuoc CHI giua cac viec dang hien tren truc — canh tro toi mot the nam
     * ngoai khung nhin la mot duong noi di vao hu khong.
     *
     * `violated` tinh o day thay vi o client: quy tac "viec truoc chua xong ma
     * viec sau da bat dau" la quy tac nghiep vu, khong phai chi tiet trinh bay.
     */
    dependencies: (
      db
        .prepare(
          `SELECT d.predecessor_id, d.successor_id,
                  (p.is_done = 0 AND s.start_date IS NOT NULL
                   AND s.start_date <= date('now','localtime')) AS violated
             FROM card_dependencies d
             JOIN cards p ON p.id = d.predecessor_id
             JOIN cards s ON s.id = d.successor_id`
        )
        .all() as { predecessor_id: number; successor_id: number; violated: number }[]
    ).filter((edge) => visibleIds.has(edge.predecessor_id) && visibleIds.has(edge.successor_id)),
  });
});

/** Dashboard ca nhan theo FR-DSH-01..06. */
router.get('/dashboard', (_req, res) => {
  const taskCounts = db
    .prepare(
      `SELECT
         SUM(CASE WHEN k.is_done = 0 AND k.due_date IS NOT NULL AND k.due_date < date('now','localtime') THEN 1 ELSE 0 END) AS overdue_count,
         SUM(CASE WHEN k.is_done = 0 AND k.due_date = date('now','localtime') THEN 1 ELSE 0 END) AS due_today_count,
         SUM(CASE WHEN k.is_done = 0 AND k.due_date = date('now','localtime','+1 day') THEN 1 ELSE 0 END) AS due_tomorrow_count,
         SUM(CASE WHEN k.is_done = 0 AND k.due_date BETWEEN date('now','localtime') AND date('now','localtime','+7 days') THEN 1 ELSE 0 END) AS due_week_count,
         SUM(CASE WHEN k.is_done = 0 THEN 1 ELSE 0 END) AS open_count
       FROM cards k JOIN lists l ON l.id = k.list_id JOIN boards b ON b.id = l.board_id
      WHERE b.is_archived = 0 AND k.is_archived = 0`
    )
    .get() as Record<string, number | null>;

  // FR-DSH-01 + FR-DSH-02: pipeline va weighted pipeline
  const pipeline = db
    .prepare(
      `SELECT COUNT(*) AS open_count,
              COALESCE(SUM(value_vnd), 0) AS pipeline_vnd,
              COALESCE(SUM(value_vnd * probability / 100), 0) AS weighted_vnd
         FROM deals WHERE stage NOT IN ('won','lost')`
    )
    .get() as { open_count: number; pipeline_vnd: number; weighted_vnd: number };

  const closingThisMonth = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(value_vnd), 0) AS sum_vnd FROM deals
        WHERE stage NOT IN ('won','lost') AND expected_close_date IS NOT NULL
          AND strftime('%Y-%m', expected_close_date) = strftime('%Y-%m', date('now','localtime'))`
    )
    .get() as { count: number; sum_vnd: number };

  const stageRows = db
    .prepare(
      `SELECT stage, COUNT(*) AS count, COALESCE(SUM(value_vnd), 0) AS sum_vnd,
              COALESCE(SUM(value_vnd * probability / 100), 0) AS weighted_vnd
         FROM deals GROUP BY stage`
    )
    .all() as { stage: string; count: number; sum_vnd: number; weighted_vnd: number }[];
  const pipeline_totals: Record<string, { count: number; sum_vnd: number; weighted_vnd: number }> =
    {};
  for (const stage of STAGES) pipeline_totals[stage] = { count: 0, sum_vnd: 0, weighted_vnd: 0 };
  for (const row of stageRows)
    pipeline_totals[row.stage] = {
      count: row.count,
      sum_vnd: row.sum_vnd,
      weighted_vnd: row.weighted_vnd,
    };

  const scoringSettings = getScoringSettings(db);

  // FR-DSH-05: deal can chu y — 4 nhom canh bao cu + 5 nhom cua module cham diem
  const attention = {
    close_overdue: db
      .prepare(
        `${DEAL_ATTENTION_SELECT} AND d.expected_close_date IS NOT NULL
           AND d.expected_close_date < date('now','localtime')
          ORDER BY d.expected_close_date LIMIT 10`
      )
      .all(),
    no_next_action: db
      .prepare(
        `${DEAL_ATTENTION_SELECT} AND (d.next_action IS NULL OR d.next_action = '')
          ORDER BY d.value_vnd DESC LIMIT 10`
      )
      .all(),
    stale: db
      .prepare(
        `SELECT * FROM (${DEAL_ATTENTION_SELECT}) WHERE days_idle >= ? ORDER BY days_idle DESC LIMIT 10`
      )
      .all(STALE_DAYS),
    next_action_overdue: db
      .prepare(
        `${DEAL_ATTENTION_SELECT} AND d.next_action_date IS NOT NULL
           AND d.next_action_date < date('now','localtime')
          ORDER BY d.next_action_date LIMIT 10`
      )
      .all(),
    top_value: db.prepare(`${DEAL_ATTENTION_SELECT} ORDER BY d.value_vnd DESC LIMIT 5`).all(),

    /* F-07 — bon nhom canh bao cua module cham diem.
       Tinh dong ngay tai day, KHONG dung hang doi thong bao rieng: neu luu tinh,
       diem duoc cap nhat xong thong bao cu se noi nguoc voi Tong quan. */
    score_stale: db
      .prepare(
        `${DEAL_ATTENTION_SELECT} AND d.score_updated_at IS NOT NULL
           AND julianday(date('now','localtime')) - julianday(date(d.score_updated_at)) > ?
          ORDER BY d.score_updated_at LIMIT 10`
      )
      .all(scoringSettings.staleDays),
    score_veto: db
      .prepare(
        `SELECT * FROM (${DEAL_ATTENTION_SELECT}) x
           JOIN deal_scorecard s ON s.deal_id = x.id
          WHERE s.v1_no_event = 1 OR s.v2_no_economic = 1
          ORDER BY x.value_vnd DESC LIMIT 10`
      )
      .all(),
    score_reshape: db
      .prepare(
        `SELECT * FROM (${DEAL_ATTENTION_SELECT}) x
           JOIN deal_scorecard s ON s.deal_id = x.id
          WHERE s.quadrant = 'reshape'
          ORDER BY x.value_vnd DESC LIMIT 10`
      )
      .all(),
    // Su kien bat buoc den gan ma deal chua toi giai doan cuoi
    event_near: db
      .prepare(
        `SELECT x.*, e.event_date, e.description AS event_description
           FROM (${DEAL_ATTENTION_SELECT}) x
           JOIN deal_events e ON e.deal_id = x.id
          WHERE e.confirmed = 1 AND e.event_date IS NOT NULL
            AND e.event_date <= date('now','localtime','+14 days')
            AND x.stage NOT IN ('negotiating')
          ORDER BY e.event_date LIMIT 10`
      )
      .all(),
    // F-19: giai doan noi mot dang, diem noi mot neo
    stage_score_gap: db
      .prepare(
        `SELECT * FROM (${DEAL_ATTENTION_SELECT}) x
           JOIN deal_scorecard s ON s.deal_id = x.id
          WHERE x.probability >= 60 AND s.bant_total <= 6
          ORDER BY x.value_vnd DESC LIMIT 10`
      )
      .all(),
  };

  // FR-DSH-06: hop dong sap het han theo 3 moc
  const expiringContracts = db
    .prepare(
      `SELECT k.id, k.name, k.number, k.value_vnd, k.end_date, k.renewal_followed,
              c.id AS customer_id, c.name AS customer_name,
              CAST(julianday(k.end_date) - julianday(date('now','localtime')) AS INTEGER) AS days_left
         FROM contracts k JOIN customers c ON c.id = k.customer_id AND c.org_kind = 'customer'
        WHERE k.status = 'active' AND k.end_date IS NOT NULL
          AND julianday(k.end_date) - julianday(date('now','localtime')) <= 90
        ORDER BY k.end_date`
    )
    .all() as { days_left: number }[];

  const tasksByBucket = {
    overdue: db
      .prepare(
        `${TASK_SELECT} WHERE b.is_archived = 0 AND k.is_archived = 0 AND k.is_done = 0
            AND k.due_date IS NOT NULL AND k.due_date < date('now','localtime')
          ORDER BY k.due_date LIMIT 10`
      )
      .all(),
    today: db
      .prepare(
        `${TASK_SELECT} WHERE b.is_archived = 0 AND k.is_archived = 0 AND k.is_done = 0
            AND k.due_date = date('now','localtime') ORDER BY k.priority LIMIT 10`
      )
      .all(),
    tomorrow: db
      .prepare(
        `${TASK_SELECT} WHERE b.is_archived = 0 AND k.is_archived = 0 AND k.is_done = 0
            AND k.due_date = date('now','localtime','+1 day') LIMIT 10`
      )
      .all(),
    next7: db
      .prepare(
        `${TASK_SELECT} WHERE b.is_archived = 0 AND k.is_archived = 0 AND k.is_done = 0
            AND k.due_date BETWEEN date('now','localtime','+2 days') AND date('now','localtime','+7 days')
          ORDER BY k.due_date LIMIT 10`
      )
      .all(),
  };

  /**
   * Viec dang mo gom theo NGUOI PHU TRACH — de biet nen nhac ai truoc.
   *
   * Dong `assignee_contact_id IS NULL` duoc giu lai co y: viec chua giao la thu can
   * xu ly som nhat, an di thi khong ai thay chung ton tai.
   */
  const workload = db
    .prepare(
      `SELECT k.assignee_contact_id, ac.full_name AS assignee_name, ac.is_me,
              ac.phone AS assignee_phone, ac.zalo AS assignee_zalo, ac.email AS assignee_email,
              k.assignee_org_id, ao.name AS assignee_org_name, ao.org_kind AS assignee_org_kind,
              COUNT(*) AS open_count,
              SUM(CASE WHEN k.due_date IS NOT NULL AND k.due_date < date('now','localtime')
                       THEN 1 ELSE 0 END) AS overdue_count,
              SUM(CASE WHEN k.due_date BETWEEN date('now','localtime')
                                           AND date('now','localtime','+7 days')
                       THEN 1 ELSE 0 END) AS due_week_count
         FROM cards k
         JOIN lists l ON l.id = k.list_id
         JOIN boards b ON b.id = l.board_id
         LEFT JOIN contacts ac ON ac.id = k.assignee_contact_id
         LEFT JOIN customers ao ON ao.id = k.assignee_org_id
        WHERE b.is_archived = 0 AND k.is_archived = 0 AND k.is_done = 0
        GROUP BY k.assignee_contact_id
        ORDER BY overdue_count DESC, open_count DESC`
    )
    .all();

  res.json({
    kpi: {
      open_opportunity_count: pipeline.open_count,
      pipeline_vnd: pipeline.pipeline_vnd,
      weighted_pipeline_vnd: Math.round(pipeline.weighted_vnd),
      closing_this_month_count: closingThisMonth.count,
      closing_this_month_vnd: closingThisMonth.sum_vnd,
      overdue_task_count: taskCounts.overdue_count ?? 0,
      expiring_contract_count: expiringContracts.length,
    },
    task_counts: {
      overdue: taskCounts.overdue_count ?? 0,
      today: taskCounts.due_today_count ?? 0,
      tomorrow: taskCounts.due_tomorrow_count ?? 0,
      week: taskCounts.due_week_count ?? 0,
      open: taskCounts.open_count ?? 0,
    },
    tasks: tasksByBucket,
    workload,
    pipeline_totals,
    attention,
    expiring_contracts: {
      d30: expiringContracts.filter((c) => c.days_left <= 30),
      d60: expiringContracts.filter((c) => c.days_left > 30 && c.days_left <= 60),
      d90: expiringContracts.filter((c) => c.days_left > 60),
      all: expiringContracts,
    },
    upcoming_reminders: db
      .prepare(
        `SELECT r.*, k.title AS card_title, c.name AS customer_name
           FROM reminders r
           LEFT JOIN cards k ON k.id = r.card_id
           LEFT JOIN customers c ON c.id = r.customer_id
          WHERE r.is_done = 0 ORDER BY r.due_at LIMIT 5`
      )
      .all(),
    recent_interactions: db
      .prepare(
        `SELECT i.*, c.name AS customer_name FROM interactions i
           JOIN customers c ON c.id = i.customer_id
          ORDER BY i.occurred_at DESC LIMIT 5`
      )
      .all(),
    recent_boards: db
      .prepare(
        `SELECT b.id, b.name, b.color, b.background, c.name AS customer_name,
                (SELECT COUNT(*) FROM cards k JOIN lists l ON l.id = k.list_id
                  WHERE l.board_id = b.id AND k.is_done = 0 AND k.is_archived = 0) AS card_count
           FROM boards b LEFT JOIN customers c ON c.id = b.customer_id
          WHERE b.is_archived = 0 ORDER BY b.updated_at DESC LIMIT 4`
      )
      .all(),
  });
});

/**
 * F-02 — ma tran co hoi: moi deal dang mo la mot diem tren hai truc BANT x 4P.
 * Loc theo giai doan, nganh va quy mo deal.
 */
router.get('/matrix', (req, res) => {
  const stage = req.query.stage ? String(req.query.stage) : null;
  const industry = req.query.industry ? String(req.query.industry) : null;
  const minValue = req.query.min_value ? Number(req.query.min_value) : 0;

  const rows = db
    .prepare(
      `SELECT d.id, d.title, d.stage, d.value_vnd, d.probability, d.expected_close_date,
              c.name AS customer_name, c.industry,
              s.bant_total, s.p4_total, s.quadrant, s.score_age_days,
              s.v1_no_event, s.v2_no_economic, s.v3_shaped
         FROM deals d
         JOIN customers c ON c.id = d.customer_id AND c.org_kind = 'customer'
         JOIN deal_scorecard s ON s.deal_id = d.id
        WHERE d.stage NOT IN ('won','lost')
          AND (? IS NULL OR d.stage = ?)
          AND (? IS NULL OR c.industry = ?)
          AND d.value_vnd >= ?
        ORDER BY d.value_vnd DESC`
    )
    .all(stage, stage, industry, industry, minValue);

  const industries = db
    .prepare(
      `SELECT DISTINCT industry FROM customers
        WHERE org_kind = 'customer' AND industry IS NOT NULL AND industry <> ''
        ORDER BY industry`
    )
    .all() as { industry: string }[];

  res.json({ deals: rows, industries: industries.map((r) => r.industry) });
});

/**
 * F-08 — forecast dua tren chat luong.
 *
 * Tra ve HAI con so va chenh lech giua chung. Chenh lech chinh la san pham cua man
 * nay: phan pipeline dang duoc tinh vao forecast truyen thong nhung khong vuot noi
 * bo loc veto + staleness. Xac suat theo giai doan KHONG bi dong toi.
 */
router.get('/pipeline-health', (_req, res) => {
  const settings = getScoringSettings(db);

  const rows = db
    .prepare(
      `SELECT d.id, d.title, d.stage, d.value_vnd, d.probability, d.expected_close_date,
              c.name AS customer_name,
              s.bant_total, s.p4_total, s.quadrant, s.score_age_days,
              s.v1_no_event, s.v2_no_economic, s.v3_shaped
         FROM deals d
         JOIN customers c ON c.id = d.customer_id AND c.org_kind = 'customer'
         JOIN deal_scorecard s ON s.deal_id = d.id
        WHERE d.stage NOT IN ('won','lost')`
    )
    .all() as {
    id: number;
    value_vnd: number;
    probability: number;
    quadrant: string;
    score_age_days: number | null;
    v1_no_event: number;
    v2_no_economic: number;
    v3_shaped: number;
  }[];

  const blockedBy = (row: (typeof rows)[number]): string[] => {
    const flags: string[] = [];
    if (row.v1_no_event) flags.push('V1_NO_COMPELLING_EVENT');
    if (row.v2_no_economic) flags.push('V2_NO_ECONOMIC_BUYER');
    if (row.v3_shaped && settings.v3Mode === 'veto') flags.push('V3_COMPETITOR_SHAPED');
    if (row.score_age_days === null || row.score_age_days > settings.staleDays) flags.push('STALE');
    return flags;
  };

  let stageWeighted = 0;
  let filteredWeighted = 0;
  const quadrantTotals: Record<string, { count: number; sum_vnd: number }> = {};
  for (const q of QUADRANTS) quadrantTotals[q] = { count: 0, sum_vnd: 0 };
  const excluded: Record<string, unknown>[] = [];

  for (const row of rows) {
    const weighted = Math.round((row.value_vnd * row.probability) / 100);
    stageWeighted += weighted;
    quadrantTotals[row.quadrant].count += 1;
    quadrantTotals[row.quadrant].sum_vnd += row.value_vnd;

    const flags = blockedBy(row);
    if (flags.length === 0) filteredWeighted += weighted;
    else excluded.push({ ...row, weighted_vnd: weighted, blocked_by: flags });
  }

  excluded.sort((a, b) => (b.weighted_vnd as number) - (a.weighted_vnd as number));

  // F-18: deal dang tut diem trong 30 ngay gan nhat
  const declining = db
    .prepare(
      `SELECT d.id, d.title, c.name AS customer_name, d.value_vnd, d.stage,
              h.factor, h.old_score, h.new_score, h.changed_at
         FROM deal_score_history h
         JOIN deals d ON d.id = h.deal_id
         JOIN customers c ON c.id = d.customer_id AND c.org_kind = 'customer'
        WHERE d.stage NOT IN ('won','lost')
          AND h.old_score IS NOT NULL AND h.new_score < h.old_score
          AND date(h.changed_at) >= date('now','localtime','-30 days')
        ORDER BY h.changed_at DESC LIMIT 20`
    )
    .all();

  res.json({
    stage_weighted_vnd: stageWeighted,
    filtered_weighted_vnd: filteredWeighted,
    inflation_vnd: stageWeighted - filteredWeighted,
    inflation_ratio: stageWeighted === 0 ? 0 : (stageWeighted - filteredWeighted) / stageWeighted,
    open_count: rows.length,
    excluded_count: excluded.length,
    quadrant_totals: quadrantTotals,
    excluded: excluded.slice(0, 20),
    declining,
    settings: { stale_days: settings.staleDays, v3_mode: settings.v3Mode },
  });
});

/** So lieu tong hop cho trang Bao cao. */
router.get('/reports', (req, res) => {
  const defaultFrom = db.prepare(`SELECT date('now','localtime','-6 months') AS d`).get() as {
    d: string;
  };
  const from = String(req.query.from ?? defaultFrom.d);
  const to = String(req.query.to ?? '2999-12-31');

  const completed_by_week = db
    .prepare(
      `SELECT date(substr(k.completed_at, 1, 10), '-6 days', 'weekday 1') AS week_start, COUNT(*) AS count
         FROM cards k
        WHERE k.is_done = 1 AND k.completed_at IS NOT NULL
          AND substr(k.completed_at, 1, 10) BETWEEN ? AND ?
        GROUP BY week_start ORDER BY week_start`
    )
    .all(from, to);

  const open_by_priority = db
    .prepare(
      `SELECT k.priority, COUNT(*) AS count
         FROM cards k JOIN lists l ON l.id = k.list_id JOIN boards b ON b.id = l.board_id
        WHERE k.is_done = 0 AND k.is_archived = 0 AND b.is_archived = 0
        GROUP BY k.priority`
    )
    .all();

  const pipeline_by_stage = db
    .prepare(
      `SELECT stage, COUNT(*) AS count, COALESCE(SUM(value_vnd), 0) AS sum_vnd,
              COALESCE(SUM(value_vnd * probability / 100), 0) AS weighted_vnd
         FROM deals GROUP BY stage`
    )
    .all();

  const won_by_month = db
    .prepare(
      `SELECT strftime('%Y-%m', closed_at) AS month, COUNT(*) AS count,
              COALESCE(SUM(COALESCE(won_value_vnd, value_vnd)), 0) AS sum_vnd
         FROM deals
        WHERE stage = 'won' AND closed_at IS NOT NULL AND substr(closed_at, 1, 10) BETWEEN ? AND ?
        GROUP BY month ORDER BY month`
    )
    .all(from, to);

  const interactions_by_type = db
    .prepare(
      `SELECT type, COUNT(*) AS count FROM interactions
        WHERE substr(occurred_at, 1, 10) BETWEEN ? AND ? GROUP BY type`
    )
    .all(from, to);

  /** FR-OPP-07: thong ke ly do thua de rut kinh nghiem. */
  const lost_by_reason = db
    .prepare(
      `SELECT COALESCE(lost_reason, 'other') AS reason, COUNT(*) AS count,
              COALESCE(SUM(value_vnd), 0) AS sum_vnd
         FROM deals
        WHERE stage = 'lost' AND closed_at IS NOT NULL AND substr(closed_at, 1, 10) BETWEEN ? AND ?
        GROUP BY reason ORDER BY count DESC`
    )
    .all(from, to);

  const winRow = db
    .prepare(
      `SELECT SUM(CASE WHEN stage = 'won' THEN 1 ELSE 0 END) AS won,
              SUM(CASE WHEN stage = 'lost' THEN 1 ELSE 0 END) AS lost,
              COALESCE(SUM(CASE WHEN stage = 'won' THEN COALESCE(won_value_vnd, value_vnd) ELSE 0 END), 0) AS won_vnd
         FROM deals WHERE closed_at IS NOT NULL AND substr(closed_at, 1, 10) BETWEEN ? AND ?`
    )
    .get(from, to) as { won: number | null; lost: number | null; won_vnd: number };

  const won = winRow.won ?? 0;
  const lost = winRow.lost ?? 0;

  /**
   * F-10 + F-16: doi chieu diem TAI THOI DIEM CHOT voi ket qua thang/thua.
   * Doc tu score_snapshot (chup luc chot), khong dung lai tu lich su.
   */
  const closedWithScores = db
    .prepare(
      `SELECT id, stage, lost_reason, score_snapshot, COALESCE(won_value_vnd, value_vnd) AS value_vnd
         FROM deals
        WHERE closed_at IS NOT NULL AND score_snapshot IS NOT NULL
          AND substr(closed_at, 1, 10) BETWEEN ? AND ?`
    )
    .all(from, to) as {
    stage: string;
    lost_reason: string | null;
    score_snapshot: string;
  }[];

  const byQuadrant: Record<string, { won: number; lost: number }> = {};
  for (const q of QUADRANTS) byQuadrant[q] = { won: 0, lost: 0 };
  /** F-16: ly do thua x yeu to thap nhat luc chot — o lech la bang chung rubric bi cham sai. */
  const lostReasonByFactor: Record<string, Record<string, number>> = {};

  for (const row of closedWithScores) {
    let snapshot: {
      quadrant: string;
      scores: Record<string, { score: number }>;
    };
    try {
      snapshot = JSON.parse(row.score_snapshot);
    } catch {
      continue;
    }
    if (byQuadrant[snapshot.quadrant])
      byQuadrant[snapshot.quadrant][row.stage === 'won' ? 'won' : 'lost'] += 1;

    if (row.stage === 'lost' && snapshot.scores) {
      const entries = Object.entries(snapshot.scores);
      if (entries.length > 0) {
        const lowest = entries.reduce((a, b) => (b[1].score < a[1].score ? b : a));
        const reason = row.lost_reason ?? 'other';
        lostReasonByFactor[reason] ??= {};
        lostReasonByFactor[reason][lowest[0]] = (lostReasonByFactor[reason][lowest[0]] ?? 0) + 1;
      }
    }
  }

  const top_customers = db
    .prepare(
      `SELECT c.id, c.name, COALESCE(SUM(COALESCE(d.won_value_vnd, d.value_vnd)), 0) AS won_vnd,
              COUNT(d.id) AS won_count
         FROM customers c JOIN deals d ON d.customer_id = c.id AND d.stage = 'won'
        WHERE d.closed_at IS NOT NULL AND substr(d.closed_at, 1, 10) BETWEEN ? AND ?
        GROUP BY c.id ORDER BY won_vnd DESC LIMIT 5`
    )
    .all(from, to);

  const summary = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM cards k JOIN lists l ON l.id = k.list_id JOIN boards b ON b.id = l.board_id
           WHERE k.is_done = 0 AND k.is_archived = 0 AND b.is_archived = 0
             AND k.due_date IS NOT NULL AND k.due_date < date('now','localtime')) AS overdue_count,
         (SELECT COUNT(*) FROM cards k JOIN lists l ON l.id = k.list_id JOIN boards b ON b.id = l.board_id
           WHERE k.is_done = 0 AND k.is_archived = 0 AND b.is_archived = 0
             AND k.due_date BETWEEN date('now','localtime') AND date('now','localtime','+7 days')) AS due_week_count,
         (SELECT COALESCE(SUM(value_vnd), 0) FROM deals WHERE stage NOT IN ('won','lost')) AS open_pipeline_vnd,
         (SELECT COALESCE(SUM(value_vnd * probability / 100), 0) FROM deals WHERE stage NOT IN ('won','lost')) AS weighted_pipeline_vnd`
    )
    .get();

  /**
   * Thong luong va khoi luong theo NGUOI PHU TRACH (v18).
   *
   * `estimate_hours` co the trong tren nhieu the — cot `estimated_count` di kem
   * de biet con so gio la day du hay chi la mot phan, thay vi trinh bay mot tong
   * sai la mot tong that.
   */
  const by_assignee = db
    .prepare(
      `SELECT k.assignee_contact_id AS contact_id, ac.full_name AS assignee_name, ac.is_me,
              ao.name AS org_name, ao.org_kind,
              SUM(CASE WHEN k.is_done = 1 AND k.completed_at IS NOT NULL
                        AND date(k.completed_at) BETWEEN ? AND ? THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN k.is_done = 0 THEN 1 ELSE 0 END) AS open_count,
              SUM(CASE WHEN k.is_done = 0 AND k.due_date IS NOT NULL
                        AND k.due_date < date('now','localtime') THEN 1 ELSE 0 END) AS overdue_count,
              SUM(CASE WHEN k.is_done = 0 AND k.due_date BETWEEN date('now','localtime')
                                                            AND date('now','localtime','+7 days')
                       THEN 1 ELSE 0 END) AS due_week_count,
              COALESCE(SUM(CASE WHEN k.is_done = 0 AND k.due_date BETWEEN date('now','localtime')
                                                                     AND date('now','localtime','+7 days')
                                THEN k.estimate_hours ELSE 0 END), 0) AS week_hours,
              SUM(CASE WHEN k.is_done = 0 AND k.estimate_hours IS NOT NULL THEN 1 ELSE 0 END)
                AS estimated_count
         FROM cards k
         JOIN lists l ON l.id = k.list_id
         JOIN boards b ON b.id = l.board_id
         LEFT JOIN contacts ac ON ac.id = k.assignee_contact_id
         LEFT JOIN customers ao ON ao.id = k.assignee_org_id
        WHERE k.is_archived = 0 AND b.is_archived = 0
        GROUP BY k.assignee_contact_id
       HAVING completed > 0 OR open_count > 0
        ORDER BY overdue_count DESC, open_count DESC`
    )
    .all(from, to);

  /** Phan bo so lan doi han — duoi cang dai thi ke hoach cang khong dang tin. */
  const slip_distribution = db
    .prepare(
      `SELECT slips, COUNT(*) AS task_count FROM (
         SELECT (SELECT COUNT(*) FROM card_due_changes dc WHERE dc.card_id = k.id) AS slips
           FROM cards k
           JOIN lists l ON l.id = k.list_id
           JOIN boards b ON b.id = l.board_id
          WHERE k.is_archived = 0 AND b.is_archived = 0 AND k.due_date IS NOT NULL
       ) GROUP BY slips ORDER BY slips`
    )
    .all();

  res.json({
    from,
    to,
    by_assignee,
    slip_distribution,
    completed_by_week,
    open_by_priority,
    pipeline_by_stage,
    won_by_month,
    interactions_by_type,
    lost_by_reason,
    win_rate: { won, lost, rate: won + lost > 0 ? won / (won + lost) : 0, won_vnd: winRow.won_vnd },
    top_customers,
    summary,
    /* F-10 / F-16 — chi co y nghia khi da du so deal chot; duoi nguong thi
       giao dien chi hien so dem, khong dua khuyen nghi hieu chinh nguong (C11). */
    score_winloss: {
      by_quadrant: byQuadrant,
      lost_reason_by_factor: lostReasonByFactor,
      scored_closed_count: closedWithScores.length,
      min_deals: getScoringSettings(db).winlossMinDeals,
    },
  });
});

export default router;
