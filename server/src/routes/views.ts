import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { accessOf, actorContactId, requirePermission } from '../middleware/currentUser.ts';
import { scopeFragment, scopeFragmentOrUnowned, scopeWhereOrUnowned } from '../lib/scope.ts';
import { fold } from '../lib/viSearch.ts';
import { QUADRANTS, STALE_DAYS } from '../lib/crm.ts';
import { allStages, finalOpenStageKeys } from '../lib/pipeline.ts';
import { getScoringSettings } from '../lib/scoring.ts';
import { HttpError, intParam, parseBody } from '../lib/validate.ts';
import { afterCursor, decodeCursor, pageLimit, toPage } from '../lib/paging.ts';
import { cacheResponse } from '../lib/responseCache.ts';
import { FLOW_PROGRESS_COLUMNS } from '../services/taskFlowService.ts';

const router = Router();

const TASK_SELECT = `
  SELECT k.id, k.title, k.description, k.priority, k.start_date, k.due_date, k.is_done,
         k.status, k.blocked_reason, k.blocked_since, k.recur_rule,
         k.completed_at, k.position, k.list_id, k.parent_id, k.created_at, k.updated_at,
         k.creator_contact_id, creator.full_name AS creator_name,
         (SELECT COUNT(*) FROM task_watchers tw WHERE tw.card_id = k.id) AS watcher_count,
         (SELECT COUNT(*) FROM task_nudges n WHERE n.card_id = k.id) AS nudge_count,
         (SELECT MAX(n.sent_at) FROM task_nudges n WHERE n.card_id = k.id) AS last_nudged_at,
         (SELECT COUNT(*) FROM checklist_items ci WHERE ci.card_id = k.id) AS checklist_total,
         (SELECT COUNT(*) FROM checklist_items ci WHERE ci.card_id = k.id AND ci.is_done = 1) AS checklist_done,
         (SELECT COUNT(*) FROM cards sc WHERE sc.parent_id = k.id AND sc.is_archived = 0) AS subtask_total,
         (SELECT COUNT(*) FROM cards sc WHERE sc.parent_id = k.id AND sc.is_archived = 0 AND sc.is_done = 1) AS subtask_done,
         ${FLOW_PROGRESS_COLUMNS},
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
    LEFT JOIN contacts creator ON creator.id = k.creator_contact_id
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
   WHERE d.stage_category = 'open'`;

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

function attachPersonalTaskState(rows: Record<string, unknown>[], contactId: number | null) {
  if (rows.length === 0 || contactId == null) {
    for (const row of rows) {
      row.is_watching = 0;
      row.is_assigned_to_me = 0;
      row.is_created_by_me = 0;
    }
    return rows;
  }
  const watched = new Set(
    (
      db.prepare(`SELECT card_id FROM task_watchers WHERE contact_id = ?`).all(contactId) as {
        card_id: number;
      }[]
    ).map((row) => row.card_id)
  );
  for (const row of rows) {
    row.is_watching = watched.has(row.id as number) ? 1 : 0;
    row.is_assigned_to_me = row.assignee_contact_id === contactId ? 1 : 0;
    row.is_created_by_me = row.creator_contact_id === contactId ? 1 : 0;
  }
  return rows;
}

/** Danh sach cong viec phang — dung cho trang Cong viec va Bang tinh. */
/**
 * Pham vi CONG VIEC cho cac truy van tong hop.
 *
 * Giong luat o `/tasks`: viec tren bang minh thay, CONG viec giao cho minh o bat
 * ky dau, CONG viec chua giao cho ai. Hai ve sau khong phai su nuong tay — mot
 * nguoi phai luon mo duoc chinh viec minh dang lam, va viec chua giao la rui ro
 * lon nhat tren mot bang nen giau di thi khong ai biet no ton tai.
 */
function taskScope(req: Request, board = 'b', card = 'k'): string {
  const base = scopeFragment(req, 'tasks', 'read', `${board}.owner_contact_id`);
  if (base === '') return '';
  const me = actorContactId(req);
  const owned = base === ' AND 1 = 0' ? '1 = 0' : base.slice(' AND '.length);
  return (
    ` AND (${owned} OR ${board}.owner_contact_id IS NULL` +
    (me == null ? '' : ` OR ${card}.assignee_contact_id = ${me}`) +
    ` OR ${card}.assignee_contact_id IS NULL)`
  );
}

/** Pham vi CO HOI. `alias` rong khi truy van khong dat bi danh cho bang deals. */
function dealScope(req: Request, alias = 'd'): string {
  const column = alias ? `${alias}.owner_contact_id` : 'owner_contact_id';
  return scopeFragmentOrUnowned(req, 'deals', 'read', column);
}

/* Views gop nhieu resource nen khong the gan requireResource cho ca router. Rieng
   nhanh /tasks phai chan tinh nang tai day; scope ben duoi chi loc DU LIEU, khong
   thay cho quyen vao chuc nang. Luu/xoa view van chi can quyen doc cong viec. */
router.use('/tasks', requirePermission('tasks', 'read'));

/** Activity feed toan cuc cua nhung cong viec nguoi dung co quyen xem. */
router.get('/tasks/activity', (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 80));
  const rows = db
    .prepare(
      `SELECT a.*, k.title AS task_title, k.is_done, k.status,
              actor.full_name AS actor_name, l.name AS list_name,
              b.id AS board_id, b.name AS board_name
         FROM task_activity a
         JOIN cards k ON k.id = a.card_id
         JOIN lists l ON l.id = k.list_id
         JOIN boards b ON b.id = l.board_id
         LEFT JOIN contacts actor ON actor.id = a.actor_contact_id
        WHERE k.is_archived = 0 AND b.is_archived = 0${taskScope(req)}
        ORDER BY a.created_at DESC, a.id DESC LIMIT ?`
    )
    .all(limit);
  res.json(rows);
});

router.get('/tasks/saved-views', (req, res) => {
  const userId = req.session?.userId ?? null;
  const rows = db
    .prepare(
      `SELECT v.*, u.full_name AS owner_name
         FROM task_saved_views v JOIN users u ON u.id = v.owner_user_id
        WHERE v.is_shared = 1 OR v.owner_user_id IS ?
        ORDER BY (v.owner_user_id IS ?) DESC, v.updated_at DESC, v.id DESC`
    )
    .all(userId, userId) as (Record<string, unknown> & { config_json: string })[];
  res.json(
    rows.map(({ config_json, ...row }) => {
      try {
        return { ...row, config: JSON.parse(config_json) as unknown };
      } catch {
        return { ...row, config: {} };
      }
    })
  );
});

router.post('/tasks/saved-views', (req, res) => {
  const userId = req.session?.userId;
  if (!userId) throw new HttpError(401, 'Can dang nhap de luu che do xem');
  const body = parseBody(
    z.object({
      name: z.string().trim().min(1).max(80),
      config: z.unknown(),
      is_shared: z.boolean().optional(),
    }),
    req
  );
  const info = db
    .prepare(
      `INSERT INTO task_saved_views (owner_user_id, name, config_json, is_shared)
       VALUES (?, ?, ?, ?)`
    )
    .run(userId, body.name, JSON.stringify(body.config ?? {}), body.is_shared ? 1 : 0);
  res
    .status(201)
    .json(db.prepare(`SELECT * FROM task_saved_views WHERE id = ?`).get(info.lastInsertRowid));
});

router.delete('/tasks/saved-views/:id', (req, res) => {
  const id = intParam(req.params.id);
  const userId = req.session?.userId;
  if (!userId) throw new HttpError(401, 'Can dang nhap de xoa che do xem');
  const result = db
    .prepare(`DELETE FROM task_saved_views WHERE id = ? AND owner_user_id = ?`)
    .run(id, userId);
  if (result.changes === 0) throw new HttpError(404, 'Khong tim thay che do xem');
  res.json({ ok: true });
});

/** Cung moc voi NUDGE_HORIZON_DAYS o client (lib/followUp.ts). */
const NUDGE_HORIZON_DAYS = 3;

/** Viec "Can theo doi" — cung luat voi `selectNeedsNudge` o client. */
const NUDGE_SQL = `(k.parent_id IS NULL AND (k.status IN ('blocked','waiting_customer')
  OR (k.due_date IS NOT NULL
      AND substr(k.due_date, 1, 10) <= date('now','localtime','+${NUDGE_HORIZON_DAYS} days'))))`;

/** Pham vi co ban cua danh sach viec: bang/viec chua luu tru + luat pham vi CONG VIEC. */
function baseTaskWhere(req: Request): { where: string[]; params: unknown[] } {
  const where: string[] = ['b.is_archived = 0', 'k.is_archived = 0'];
  const params: unknown[] = [];
  /* Pham vi cong viec: viec tren bang minh thay, CONG viec giao cho minh o bat
     ky dau. Trung tam cua luat nay la nguoi dung phai luon mo duoc chinh viec
     minh dang phai lam, ke ca khi no nam tren bang cua nguoi khac.

     Viec CHUA GIAO cung hien: do la rui ro lon nhat tren mot bang, giau di thi
     khong ai biet no ton tai. */
  const taskScope = scopeWhereOrUnowned(req, 'tasks', 'read', 'b.owner_contact_id');
  if (taskScope.sql) {
    where.push(`(${taskScope.sql} OR k.assignee_contact_id = ? OR k.assignee_contact_id IS NULL)`);
    params.push(...taskScope.params, actorContactId(req));
  }
  return { where, params };
}

/**
 * Dieu kien loc cua danh sach viec tu query string — dung chung cho `/tasks` va
 * `/tasks/older` de hai nua cua mot danh sach luon loc giong het nhau.
 */
function taskFilterWhere(req: Request): { where: string[]; params: unknown[] } {
  const { where, params } = baseTaskWhere(req);
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
  /* "Viec cua toi" = nguoi dang dang nhap, lay tu phien chu khong bat client nho id.
     Tai khoan chua gan vao so danh ba thi khong co viec nao la "cua toi" — tra ve
     rong con hon tra ve viec cua nguoi khac. */
  if (req.query.mine === '1') {
    const me = actorContactId(req);
    if (me == null) where.push('1 = 0');
    else {
      where.push(`k.assignee_contact_id = ?`);
      params.push(me);
    }
  }
  if (req.query.unassigned === '1') where.push(`k.assignee_contact_id IS NULL`);
  if (req.query.created === '1') {
    const me = actorContactId(req);
    if (me == null) where.push('1 = 0');
    else {
      where.push(`k.creator_contact_id = ?`);
      params.push(me);
    }
  }
  if (req.query.watching === '1') {
    const me = actorContactId(req);
    if (me == null) where.push('1 = 0');
    else {
      where.push(
        `EXISTS (SELECT 1 FROM task_watchers tw WHERE tw.card_id = k.id AND tw.contact_id = ?)`
      );
      params.push(me);
    }
  }
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

  /* "Can theo doi" (FollowUp, huy hieu thanh ben): qua han / sap den han trong
     NUDGE_HORIZON_DAYS ngay, hoac dang cho. Viec con di theo viec cha. Truoc day
     client tai TOAN BO viec dang mo roi tu loc — voi vai chuc nghin viec la vai
     chuc MB cho mot con so tren huy hieu. */
  if (req.query.nudge === '1') where.push(NUDGE_SQL);
  return { where, params };
}

/** Viec da xong tinh moc theo ngay hoan thanh; du lieu cu chua co thi lui ve ngay sua. */
const DONE_AT = `COALESCE(k.completed_at, k.updated_at)`;

/** So ngay "gan day" hop le cho `recent_days` / `days` (1..365), hoac null neu khong gui. */
function recentDays(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > 365)
    throw new HttpError(400, 'So ngay phai tu 1 den 365');
  return days;
}

router.get('/tasks', (req, res) => {
  const { where, params } = taskFilterWhere(req);
  /* Man Cong viec: viec dang mo luon hien; viec da xong chi lay trong N ngay gan
     day. Phan cu hon tai dan qua /tasks/older khi nguoi dung cuon xuong. */
  const days = recentDays(req.query.recent_days);
  if (days != null) {
    where.push(`(k.is_done = 0 OR ${DONE_AT} >= datetime('now','localtime','-${days} days'))`);
  }

  const rows = db
    .prepare(
      `${TASK_SELECT} WHERE ${where.join(' AND ')}
        ORDER BY k.is_done, k.due_date IS NULL, k.due_date, k.id DESC`
    )
    .all(...params) as Record<string, unknown>[];

  res.json(attachPersonalTaskState(attachLabels(rows), actorContactId(req)));
});

/**
 * Viec da xong CU HON `days` ngay, tung trang, moi nhat truoc — phan "tai dan khi
 * cuon" cua man Cong viec. Cung bo loc voi `/tasks`.
 *
 * Hai buoc: chon id cua mot trang bang truy van gon (chi cards/lists/boards), roi
 * moi lay du cot. Viet thang `TASK_SELECT ... ORDER BY ... LIMIT` thi SQLite tinh
 * het 8 truy van con cho MOI viec da xong truoc khi sap xep va cat trang.
 */
router.get('/tasks/older', (req, res) => {
  const days = recentDays(req.query.days) ?? 30;
  const limit = pageLimit(req.query.limit);
  const cursor = decodeCursor(req.query.cursor);
  const { where, params } = taskFilterWhere(req);
  where.push(`k.is_done = 1`, `${DONE_AT} < datetime('now','localtime','-${days} days')`);
  const after = afterCursor(cursor, DONE_AT, 'k.id');
  if (after.sql) {
    where.push(after.sql);
    params.push(...after.params);
  }
  const ids = (
    db
      .prepare(
        `SELECT k.id FROM cards k
           JOIN lists l ON l.id = k.list_id
           JOIN boards b ON b.id = l.board_id
          WHERE ${where.join(' AND ')}
          ORDER BY ${DONE_AT} DESC, k.id DESC
          LIMIT ?`
      )
      .all(...params, limit + 1) as { id: number }[]
  ).map((row) => row.id);
  const rows =
    ids.length === 0
      ? []
      : (db
          .prepare(
            `SELECT * FROM (${TASK_SELECT} WHERE k.id IN (${ids.map(() => '?').join(',')}))
              ORDER BY COALESCE(completed_at, updated_at) DESC, id DESC`
          )
          .all(...ids) as Record<string, unknown>[]);
  const page = toPage(
    rows,
    limit,
    (row) => String(row.completed_at ?? row.updated_at),
    (row) => Number(row.id)
  );
  res.json({
    ...page,
    items: attachPersonalTaskState(attachLabels(page.items), actorContactId(req)),
  });
});

/**
 * So dem cho thanh ben man Cong viec va huy hieu "Can theo doi". Truoc day client tai
 * TOAN BO viec (ca da xong) chi de dem — request nang nhat cua ca ung dung.
 */
router.get('/tasks/counts', cacheResponse, (req, res) => {
  const { where, params } = baseTaskWhere(req);
  const me = actorContactId(req) ?? -1;
  const counts = db
    .prepare(
      `SELECT COALESCE(SUM(k.is_done = 0), 0) AS owned,
              COALESCE(SUM(k.is_done = 0 AND k.assignee_contact_id = ?), 0) AS assigned,
              COALESCE(SUM(k.is_done = 0 AND k.creator_contact_id = ?), 0) AS created,
              COALESCE(SUM(k.is_done = 1), 0) AS completed,
              COALESCE(SUM(k.is_done = 0 AND ${NUDGE_SQL}), 0) AS nudge,
              COALESCE(SUM(k.is_done = 0 AND ${NUDGE_SQL}
                           AND substr(k.due_date, 1, 10) = date('now','localtime')), 0) AS nudge_today
         FROM cards k
         JOIN lists l ON l.id = k.list_id
         JOIN boards b ON b.id = l.board_id
        WHERE ${where.join(' AND ')}`
    )
    .get(me, me, ...params) as Record<string, number>;
  const watching = db
    .prepare(
      `SELECT COUNT(*) AS n FROM task_watchers tw
         JOIN cards k ON k.id = tw.card_id
         JOIN lists l ON l.id = k.list_id
         JOIN boards b ON b.id = l.board_id
        WHERE tw.contact_id = ? AND ${where.join(' AND ')}`
    )
    .get(me, ...params) as { n: number };
  res.json({ ...counts, watching: watching.n });
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
        AND (? IS NULL OR b.id = ?) AND (? IS NULL OR b.project_id = ?)${taskScope(req)}`
    )
    .all(from, to, boardId, boardId, projectId, projectId) as Record<string, unknown>[];

  const reminders = db
    .prepare(
      `SELECT r.id, r.title, r.due_at, r.is_done, r.card_id FROM reminders r
         LEFT JOIN cards k ON k.id = r.card_id
         LEFT JOIN lists l ON l.id = k.list_id
         LEFT JOIN boards b ON b.id = l.board_id
        WHERE substr(r.due_at, 1, 10) BETWEEN ? AND ?
          AND (? IS NULL OR l.board_id = ?) AND (? IS NULL OR b.project_id = ?)
          ${scopeFragmentOrUnowned(req, 'tasks', 'read', 'r.owner_contact_id')}`
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
              AND e.end_at > ? || 'T00:00'
              ${scopeFragmentOrUnowned(req, 'tasks', 'read', 'e.owner_contact_id')}`
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
              AND d.stage_category = 'open'${dealScope(req)}`
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
              AND d.stage_category = 'open'${dealScope(req)}`
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
             LEFT JOIN deals dd ON dd.id = k.deal_id
            WHERE k.end_date IS NOT NULL AND k.end_date BETWEEN ? AND ? AND k.status = 'active'
              ${scopeFragmentOrUnowned(req, 'contracts', 'read', 'COALESCE(dd.owner_contact_id, c.owner_contact_id)')}`
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

  const scope = `AND (? IS NULL OR b.id = ?) AND (? IS NULL OR b.project_id = ?)${taskScope(req)}`;
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
      // Quy trinh dang chay (v66) noi dung tien do that hon checklist, nen uu tien.
      progress:
        Number(k.flow_total) > 0
          ? Math.round((Number(k.flow_done) / Number(k.flow_total)) * 100)
          : Number(k.checklist_total) > 0
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
router.get('/dashboard', cacheResponse, (req, res) => {
  const taskCounts = db
    .prepare(
      `SELECT
         SUM(CASE WHEN k.is_done = 0 AND k.due_date IS NOT NULL AND k.due_date < date('now','localtime') THEN 1 ELSE 0 END) AS overdue_count,
         SUM(CASE WHEN k.is_done = 0 AND k.due_date = date('now','localtime') THEN 1 ELSE 0 END) AS due_today_count,
         SUM(CASE WHEN k.is_done = 0 AND k.due_date = date('now','localtime','+1 day') THEN 1 ELSE 0 END) AS due_tomorrow_count,
         SUM(CASE WHEN k.is_done = 0 AND k.due_date BETWEEN date('now','localtime') AND date('now','localtime','+7 days') THEN 1 ELSE 0 END) AS due_week_count,
         SUM(CASE WHEN k.is_done = 0 THEN 1 ELSE 0 END) AS open_count,
         SUM(CASE WHEN k.is_done = 1 AND substr(k.completed_at, 1, 10) = date('now','localtime') THEN 1 ELSE 0 END) AS done_today_count
       FROM cards k JOIN lists l ON l.id = k.list_id JOIN boards b ON b.id = l.board_id
      WHERE b.is_archived = 0 AND k.is_archived = 0${taskScope(req)}`
    )
    .get() as Record<string, number | null>;

  // FR-DSH-01 + FR-DSH-02: pipeline va weighted pipeline
  const pipeline = db
    .prepare(
      `SELECT COUNT(*) AS open_count,
              COALESCE(SUM(value_vnd), 0) AS pipeline_vnd,
              COALESCE(SUM(value_vnd * probability / 100), 0) AS weighted_vnd
         FROM deals WHERE stage_category = 'open'${dealScope(req, '')}`
    )
    .get() as { open_count: number; pipeline_vnd: number; weighted_vnd: number };

  const closingThisMonth = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(value_vnd), 0) AS sum_vnd FROM deals
        WHERE stage_category = 'open' AND expected_close_date IS NOT NULL
          AND strftime('%Y-%m', expected_close_date) = strftime('%Y-%m', date('now','localtime'))
          ${dealScope(req, '')}`
    )
    .get() as { count: number; sum_vnd: number };

  const stageRows = db
    .prepare(
      `SELECT stage, COUNT(*) AS count, COALESCE(SUM(value_vnd), 0) AS sum_vnd,
              COALESCE(SUM(value_vnd * probability / 100), 0) AS weighted_vnd
         FROM deals WHERE 1 = 1${dealScope(req, '')} GROUP BY stage`
    )
    .all() as { stage: string; count: number; sum_vnd: number; weighted_vnd: number }[];
  const pipeline_totals: Record<string, { count: number; sum_vnd: number; weighted_vnd: number }> =
    {};
  for (const { key } of allStages(db))
    pipeline_totals[key] = { count: 0, sum_vnd: 0, weighted_vnd: 0 };
  for (const row of stageRows)
    pipeline_totals[row.stage] = {
      count: row.count,
      sum_vnd: row.sum_vnd,
      weighted_vnd: row.weighted_vnd,
    };

  /* DEAL_ATTENTION_SELECT duoc dung lai cho muoi mot nhom canh bao ben duoi.
     Ghep pham vi vao MOT bien roi dung bien do o khap noi, thay vi nho them
     `${dealScope(req)}` o tung cho — mot cho quen se cho ra mot nhom canh bao
     lo du lieu phong khac, va khong test nao doc duoc y dinh de bat loi do. */
  const ATTENTION = `${DEAL_ATTENTION_SELECT}${dealScope(req)}`;
  const scoringSettings = getScoringSettings(db);

  // FR-DSH-05: deal can chu y — 4 nhom canh bao cu + 5 nhom cua module cham diem
  const attention = {
    close_overdue: db
      .prepare(
        `${ATTENTION} AND d.expected_close_date IS NOT NULL
           AND d.expected_close_date < date('now','localtime')
          ORDER BY d.expected_close_date, d.id LIMIT 10`
      )
      .all(),
    no_next_action: db
      .prepare(
        `${ATTENTION} AND (d.next_action IS NULL OR d.next_action = '')
          ORDER BY d.value_vnd DESC, d.id LIMIT 10`
      )
      .all(),
    stale: db
      .prepare(
        `SELECT * FROM (${ATTENTION}) WHERE days_idle >= ? ORDER BY days_idle DESC, id LIMIT 10`
      )
      .all(STALE_DAYS),
    next_action_overdue: db
      .prepare(
        `${ATTENTION} AND d.next_action_date IS NOT NULL
           AND d.next_action_date < date('now','localtime')
          ORDER BY d.next_action_date, d.id LIMIT 10`
      )
      .all(),
    top_value: db.prepare(`${ATTENTION} ORDER BY d.value_vnd DESC, d.id LIMIT 5`).all(),

    /* F-07 — bon nhom canh bao cua module cham diem.
       Tinh dong ngay tai day, KHONG dung hang doi thong bao rieng: neu luu tinh,
       diem duoc cap nhat xong thong bao cu se noi nguoc voi Tong quan. */
    score_stale: db
      .prepare(
        `${ATTENTION} AND d.score_updated_at IS NOT NULL
           AND julianday(date('now','localtime')) - julianday(date(d.score_updated_at)) > ?
          ORDER BY d.score_updated_at, d.id LIMIT 10`
      )
      .all(scoringSettings.staleDays),
    score_veto: db
      .prepare(
        `SELECT * FROM (${ATTENTION}) x
           JOIN deal_scorecard s ON s.deal_id = x.id
          WHERE s.v1_no_event = 1 OR s.v2_no_economic = 1
          ORDER BY x.value_vnd DESC, x.id LIMIT 10`
      )
      .all(),
    score_reshape: db
      .prepare(
        `SELECT * FROM (${ATTENTION}) x
           JOIN deal_scorecard s ON s.deal_id = x.id
          WHERE s.quadrant = 'reshape'
          ORDER BY x.value_vnd DESC, x.id LIMIT 10`
      )
      .all(),
    // Su kien bat buoc den gan ma deal chua toi giai doan cuoi
    event_near: db
      .prepare(
        `SELECT x.*, e.event_date, e.description AS event_description
           FROM (${ATTENTION}) x
           JOIN deal_events e ON e.deal_id = x.id
          WHERE e.confirmed = 1 AND e.event_date IS NOT NULL
            AND e.event_date <= date('now','localtime','+14 days')
            AND x.stage NOT IN (SELECT value FROM json_each(?))
          ORDER BY e.event_date, x.id LIMIT 10`
      )
      /* "Giai doan cuoi" = giai doan mo cuoi cung cua tung pipeline (mac dinh: Dam phan). */
      .all(JSON.stringify(finalOpenStageKeys(db))),
    // F-19: giai doan noi mot dang, diem noi mot neo
    stage_score_gap: db
      .prepare(
        `SELECT * FROM (${ATTENTION}) x
           JOIN deal_scorecard s ON s.deal_id = x.id
          WHERE x.probability >= 60 AND s.bant_total <= 6
          ORDER BY x.value_vnd DESC, x.id LIMIT 10`
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
         LEFT JOIN deals dd ON dd.id = k.deal_id
        WHERE k.status = 'active' AND k.end_date IS NOT NULL
          AND julianday(k.end_date) - julianday(date('now','localtime')) <= 90
          ${scopeFragmentOrUnowned(req, 'contracts', 'read', 'COALESCE(dd.owner_contact_id, c.owner_contact_id)')}
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
      `SELECT k.assignee_contact_id, ac.full_name AS assignee_name, (ac.id = ?) AS is_me,
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
        WHERE b.is_archived = 0 AND k.is_archived = 0 AND k.is_done = 0${taskScope(req)}
        GROUP BY k.assignee_contact_id
        ORDER BY overdue_count DESC, open_count DESC`
    )
    .all(actorContactId(req));

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
      // O KPI "Việc hôm nay" tren Tong quan: tien do trong ngay, khong chi viec con mo.
      done_today: taskCounts.done_today_count ?? 0,
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
          WHERE r.is_done = 0
            ${scopeFragmentOrUnowned(req, 'tasks', 'read', 'r.owner_contact_id')}
          ORDER BY r.due_at LIMIT 5`
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
          WHERE b.is_archived = 0
            ${scopeFragmentOrUnowned(req, 'boards', 'read', 'b.owner_contact_id')}
          ORDER BY b.updated_at DESC LIMIT 4`
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
        WHERE d.stage_category = 'open'${dealScope(req)}
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
router.get('/pipeline-health', cacheResponse, (req, res) => {
  const settings = getScoringSettings(db);

  const rows = db
    .prepare(
      `SELECT d.id, d.title, d.stage, d.value_vnd, d.probability, d.expected_close_date,
              c.name AS customer_name,
              CAST(julianday(date('now','localtime')) - julianday(substr(d.created_at,1,10))
                   AS INTEGER) AS deal_age_days,
              s.bant_total, s.p4_total, s.quadrant, s.score_age_days,
              s.v1_no_event, s.v2_no_economic, s.v3_shaped
         FROM deals d
         JOIN customers c ON c.id = d.customer_id AND c.org_kind = 'customer'
         JOIN deal_scorecard s ON s.deal_id = d.id
        WHERE d.stage_category = 'open'${dealScope(req)}`
    )
    .all() as {
    id: number;
    value_vnd: number;
    probability: number;
    quadrant: string;
    deal_age_days: number;
    score_age_days: number | null;
    v1_no_event: number;
    v2_no_economic: number;
    v3_shaped: number;
  }[];

  /**
   * Cua so an han cho co hoi vua tao.
   *
   * `score_age_days === null` nghia la CHUA CHAM DIEM LAN NAO, nen moi deal vua
   * tao deu dinh co STALE ngay lap tuc va bi tinh vao "thoi phong pipeline". Voi
   * mot he thong con it deal, mot co hoi tao ba giay truoc du de day chi so len
   * 100% — con so do khong noi len dieu gi ve chat luong pipeline, chi noi rang
   * nguoi dung chua kip cham diem.
   */
  const GRACE_DAYS = 7;

  const blockedBy = (row: (typeof rows)[number]): string[] => {
    const flags: string[] = [];
    if (row.v1_no_event) flags.push('V1_NO_COMPELLING_EVENT');
    if (row.v2_no_economic) flags.push('V2_NO_ECONOMIC_BUYER');
    if (row.v3_shaped && settings.v3Mode === 'veto') flags.push('V3_COMPETITOR_SHAPED');
    const unscoredButNew = row.score_age_days === null && row.deal_age_days < GRACE_DAYS;
    if (!unscoredButNew && (row.score_age_days === null || row.score_age_days > settings.staleDays))
      flags.push('STALE');
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
        WHERE d.stage_category = 'open'
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
router.get('/reports', cacheResponse, (req, res) => {
  const defaultFrom = db.prepare(`SELECT date('now','localtime','-6 months') AS d`).get() as {
    d: string;
  };
  const from = String(req.query.from ?? defaultFrom.d);
  const to = String(req.query.to ?? '2999-12-31');

  const completed_by_week = db
    .prepare(
      `SELECT date(substr(k.completed_at, 1, 10), '-6 days', 'weekday 1') AS week_start, COUNT(*) AS count
         FROM cards k
         JOIN lists l ON l.id = k.list_id
         JOIN boards b ON b.id = l.board_id
        WHERE k.is_done = 1 AND k.completed_at IS NOT NULL
          AND substr(k.completed_at, 1, 10) BETWEEN ? AND ?${taskScope(req)}
        GROUP BY week_start ORDER BY week_start`
    )
    .all(from, to);

  const open_by_priority = db
    .prepare(
      `SELECT k.priority, COUNT(*) AS count
         FROM cards k JOIN lists l ON l.id = k.list_id JOIN boards b ON b.id = l.board_id
        WHERE k.is_done = 0 AND k.is_archived = 0 AND b.is_archived = 0${taskScope(req)}
        GROUP BY k.priority`
    )
    .all();

  const pipeline_by_stage = db
    .prepare(
      `SELECT stage, COUNT(*) AS count, COALESCE(SUM(value_vnd), 0) AS sum_vnd,
              COALESCE(SUM(value_vnd * probability / 100), 0) AS weighted_vnd
         FROM deals WHERE 1 = 1${dealScope(req, '')} GROUP BY stage`
    )
    .all();

  const won_by_month = db
    .prepare(
      `SELECT strftime('%Y-%m', closed_at) AS month, COUNT(*) AS count,
              COALESCE(SUM(COALESCE(won_value_vnd, value_vnd)), 0) AS sum_vnd
         FROM deals
        WHERE stage_category = 'won' AND closed_at IS NOT NULL AND substr(closed_at, 1, 10) BETWEEN ? AND ?
          ${dealScope(req, '')}
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
        WHERE stage_category = 'lost' AND closed_at IS NOT NULL AND substr(closed_at, 1, 10) BETWEEN ? AND ?
          ${dealScope(req, '')}
        GROUP BY reason ORDER BY count DESC`
    )
    .all(from, to);

  const winRow = db
    .prepare(
      `SELECT SUM(CASE WHEN stage_category = 'won' THEN 1 ELSE 0 END) AS won,
              SUM(CASE WHEN stage_category = 'lost' THEN 1 ELSE 0 END) AS lost,
              COALESCE(SUM(CASE WHEN stage_category = 'won' THEN COALESCE(won_value_vnd, value_vnd) ELSE 0 END), 0) AS won_vnd
         FROM deals WHERE closed_at IS NOT NULL AND substr(closed_at, 1, 10) BETWEEN ? AND ?
          ${dealScope(req, '')}`
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
      `SELECT id, stage_category, lost_reason, score_snapshot, COALESCE(won_value_vnd, value_vnd) AS value_vnd
         FROM deals
        WHERE closed_at IS NOT NULL AND score_snapshot IS NOT NULL
          AND substr(closed_at, 1, 10) BETWEEN ? AND ?${dealScope(req, '')}`
    )
    .all(from, to) as {
    stage_category: string;
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
      byQuadrant[snapshot.quadrant][row.stage_category === 'won' ? 'won' : 'lost'] += 1;

    if (row.stage_category === 'lost' && snapshot.scores) {
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
         FROM customers c JOIN deals d ON d.customer_id = c.id AND d.stage_category = 'won'
        WHERE d.closed_at IS NOT NULL AND substr(d.closed_at, 1, 10) BETWEEN ? AND ?
        GROUP BY c.id ORDER BY won_vnd DESC LIMIT 5`
    )
    .all(from, to);

  const summary = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM cards k JOIN lists l ON l.id = k.list_id JOIN boards b ON b.id = l.board_id
           WHERE k.is_done = 0 AND k.is_archived = 0 AND b.is_archived = 0${taskScope(req)}
             AND k.due_date IS NOT NULL AND k.due_date < date('now','localtime')) AS overdue_count,
         (SELECT COUNT(*) FROM cards k JOIN lists l ON l.id = k.list_id JOIN boards b ON b.id = l.board_id
           WHERE k.is_done = 0 AND k.is_archived = 0 AND b.is_archived = 0${taskScope(req)}
             AND k.due_date BETWEEN date('now','localtime') AND date('now','localtime','+7 days')) AS due_week_count,
         (SELECT COALESCE(SUM(value_vnd), 0) FROM deals
           WHERE stage_category = 'open'${dealScope(req, '')}) AS open_pipeline_vnd,
         (SELECT COALESCE(SUM(value_vnd * probability / 100), 0) FROM deals
           WHERE stage_category = 'open'${dealScope(req, '')}) AS weighted_pipeline_vnd`
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
      `SELECT k.assignee_contact_id AS contact_id, ac.full_name AS assignee_name, (ac.id = ?) AS is_me,
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
        WHERE k.is_archived = 0 AND b.is_archived = 0${taskScope(req)}
        GROUP BY k.assignee_contact_id
       HAVING completed > 0 OR open_count > 0
        ORDER BY overdue_count DESC, open_count DESC`
    )
    .all(actorContactId(req), from, to);

  /**
   * Tien do theo DU AN — cho ban bao cao rut gon cua nhom Du an. Chi gom viec tren
   * cac bang thuoc du an (`boards.project_id`), loc theo ca pham vi du an lan pham
   * vi cong viec: thay du an nhung khong thay bang nao cua no thi khong co dong.
   */
  const projectScope = scopeFragmentOrUnowned(req, 'projects', 'read', 'p.owner_contact_id');
  const by_project = db
    .prepare(
      `SELECT p.id, p.name, p.status, p.plan_end,
              SUM(CASE WHEN k.is_done = 1 AND date(k.completed_at) BETWEEN ? AND ?
                       THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN k.is_done = 1 THEN 1 ELSE 0 END) AS done_total,
              COUNT(*) AS task_total,
              SUM(CASE WHEN k.is_done = 0 THEN 1 ELSE 0 END) AS open_count,
              SUM(CASE WHEN k.is_done = 0 AND k.due_date IS NOT NULL
                        AND substr(k.due_date, 1, 10) < date('now','localtime')
                       THEN 1 ELSE 0 END) AS overdue_count,
              SUM(CASE WHEN k.is_milestone = 1 AND k.is_done = 0 AND k.due_date IS NOT NULL
                        AND substr(k.due_date, 1, 10) < date('now','localtime')
                       THEN 1 ELSE 0 END) AS late_milestones,
              MIN(CASE WHEN k.is_milestone = 1 AND k.is_done = 0
                        AND substr(k.due_date, 1, 10) >= date('now','localtime')
                       THEN substr(k.due_date, 1, 10) END) AS next_milestone
         FROM projects p
         JOIN boards b ON b.project_id = p.id AND b.is_archived = 0
         JOIN lists l ON l.board_id = b.id
         JOIN cards k ON k.list_id = l.id AND k.is_archived = 0
        WHERE p.is_archived = 0 AND p.status NOT IN ('done','cancelled')${projectScope}${taskScope(req)}
        GROUP BY p.id
        ORDER BY overdue_count DESC, open_count DESC, p.name`
    )
    .all(from, to);

  const projects_by_status = db
    .prepare(
      `SELECT p.status, COUNT(*) AS count FROM projects p
        WHERE p.is_archived = 0${projectScope}
        GROUP BY p.status`
    )
    .all();

  /** Phan bo so lan doi han — duoi cang dai thi ke hoach cang khong dang tin. */
  const slip_distribution = db
    .prepare(
      `SELECT slips, COUNT(*) AS task_count FROM (
         SELECT (SELECT COUNT(*) FROM card_due_changes dc WHERE dc.card_id = k.id) AS slips
           FROM cards k
           JOIN lists l ON l.id = k.list_id
           JOIN boards b ON b.id = l.board_id
          WHERE k.is_archived = 0 AND b.is_archived = 0 AND k.due_date IS NOT NULL${taskScope(req)}
       ) GROUP BY slips ORDER BY slips`
    )
    .all();

  res.json({
    from,
    to,
    by_assignee,
    slip_distribution,
    by_project,
    projects_by_status,
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Ngay `iso` lui `days` ngay, tinh theo UTC de khong lech mui gio may chu. */
function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Hieu suat ca nhan / don vi.
 *
 * Pham vi la NGUOI, khong phai bang: lay danh sach nhan su cong ty minh ma
 * `report.tasks` cho phep xem (nhan vien = chinh minh, truong phong = ca phong,
 * giam doc khoi = ca nhanh), roi dem viec GIAO CHO ho o bat ky bang nao. Loc theo
 * bang thi mot nguoi lam viec tren bang cua phong khac se bi dem thieu — dung
 * kieu sai lam lam bao cao hieu suat bat cong voi nguoi hay ho tro cheo.
 *
 * Viec hoan thanh duoc dem ca khi the da luu tru: luu tru the sau khi xong la thoi
 * quen pho bien, va bo chung di thi nguoi don dep gon gang nhat bi danh gia thap
 * nhat. Viec DANG MO thi bo the da luu tru, giong cac man khac.
 *
 * Tong theo don vi duoc cong o client tu cac con so tho (khong cong ty le) — vi
 * vay endpoint tra ve tu so va mau so, khong tra ve phan tram.
 */
router.get('/performance', requirePermission('report.tasks', 'read'), (req, res) => {
  const today = (db.prepare(`SELECT date('now','localtime') AS d`).get() as { d: string }).d;
  const to = ISO_DATE.test(String(req.query.to ?? '')) ? String(req.query.to) : today;
  const from = ISO_DATE.test(String(req.query.from ?? ''))
    ? String(req.query.from)
    : `${to.slice(0, 7)}-01`;
  if (from > to) throw new HttpError(400, 'Ngày bắt đầu phải trước ngày kết thúc');
  const spanDays = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  const prevTo = shiftDate(from, -1);
  const prevFrom = shiftDate(from, -spanDays);

  /* Nhan su = nguoi thuoc cong ty minh HOAC co tai khoan dang nhap HOAC chinh
     nguoi dang xem. Chi loc theo `org_kind = 'own'` thi tai khoan nao gan voi mot
     contact chua xep vao cong ty — thuong la chinh quan tri vien — bien mat khoi
     bao cao cua chinh ho. */
  const me = actorContactId(req);
  const peopleScope = scopeFragment(req, 'report.tasks', 'read', 'c.id');
  const people = db
    .prepare(
      `SELECT c.id AS contact_id, c.full_name AS name, c.org_unit_id
         FROM contacts c
         LEFT JOIN customers o ON o.id = c.customer_id
        WHERE c.is_active = 1
          AND (o.org_kind = 'own'
               OR EXISTS (SELECT 1 FROM users u WHERE u.contact_id = c.id)
               OR c.id = ?)${peopleScope}
        ORDER BY c.full_name COLLATE NOCASE`
    )
    .all(me ?? -1) as { contact_id: number; name: string; org_unit_id: number | null }[];

  const ids = people.map((p) => p.contact_id);
  const inIds = ids.length > 0 ? ids.join(',') : 'NULL';

  const stats = db
    .prepare(
      `SELECT k.assignee_contact_id AS contact_id,
              SUM(CASE WHEN k.is_done = 1 AND date(k.completed_at) BETWEEN @from AND @to
                       THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN k.is_done = 1 AND date(k.completed_at) BETWEEN @from AND @to
                        AND k.due_date IS NOT NULL THEN 1 ELSE 0 END) AS completed_with_due,
              SUM(CASE WHEN k.is_done = 1 AND date(k.completed_at) BETWEEN @from AND @to
                        AND k.due_date IS NOT NULL
                        AND date(k.completed_at) <= substr(k.due_date, 1, 10)
                       THEN 1 ELSE 0 END) AS on_time,
              COALESCE(SUM(CASE WHEN k.is_done = 1 AND date(k.completed_at) BETWEEN @from AND @to
                                THEN MAX(julianday(k.completed_at) - julianday(k.created_at), 0)
                           END), 0) AS cycle_days_sum,
              COALESCE(SUM(CASE WHEN k.is_done = 1 AND date(k.completed_at) BETWEEN @from AND @to
                                THEN k.spent_hours END), 0) AS spent_hours,
              SUM(CASE WHEN k.is_done = 1 AND date(k.completed_at) BETWEEN @prevFrom AND @prevTo
                       THEN 1 ELSE 0 END) AS prev_completed,
              /* v66: hoan thanh nhung da xac nhan bo qua mot quy trinh dang do. */
              SUM(CASE WHEN k.is_done = 1 AND date(k.completed_at) BETWEEN @from AND @to
                        AND EXISTS (SELECT 1 FROM card_flows f
                                     WHERE f.card_id = k.id AND f.skipped_at IS NOT NULL)
                       THEN 1 ELSE 0 END) AS flow_skipped,
              SUM(CASE WHEN date(k.created_at) BETWEEN @from AND @to THEN 1 ELSE 0 END) AS received,
              SUM(CASE WHEN k.is_done = 0 AND k.is_archived = 0 AND b.is_archived = 0
                       THEN 1 ELSE 0 END) AS open_count,
              SUM(CASE WHEN k.is_done = 0 AND k.is_archived = 0 AND b.is_archived = 0
                        AND k.due_date IS NOT NULL AND substr(k.due_date, 1, 10) < @today
                       THEN 1 ELSE 0 END) AS overdue_count,
              SUM(CASE WHEN k.is_done = 0 AND k.is_archived = 0 AND b.is_archived = 0
                        AND k.blocked_since IS NOT NULL THEN 1 ELSE 0 END) AS blocked_count,
              SUM((SELECT COUNT(*) FROM card_due_changes dc
                    WHERE dc.card_id = k.id
                      AND date(dc.changed_at) BETWEEN @from AND @to)) AS slips
         FROM cards k
         JOIN lists l ON l.id = k.list_id
         JOIN boards b ON b.id = l.board_id
        WHERE k.assignee_contact_id IN (${inIds})
        GROUP BY k.assignee_contact_id`
    )
    .all({ from, to, prevFrom, prevTo, today }) as ({ contact_id: number } & Record<
    string,
    number
  >)[];
  const statsOf = new Map(stats.map((row) => [row.contact_id, row]));

  const METRICS = [
    'completed',
    'completed_with_due',
    'on_time',
    'cycle_days_sum',
    'spent_hours',
    'prev_completed',
    'flow_skipped',
    'received',
    'open_count',
    'overdue_count',
    'blocked_count',
    'slips',
  ] as const;

  const rows = people.map((person) => {
    const s = statsOf.get(person.contact_id);
    const metrics = Object.fromEntries(METRICS.map((key) => [key, Number(s?.[key] ?? 0)]));
    return { ...person, ...metrics };
  });

  /* Chuoi theo tuan cho bieu do: viec hoan thanh chia dung han / tre han / khong
     co han, theo tung nguoi de client cong lai cho bat ky don vi nao dang chon. */
  const weekly = db
    .prepare(
      `SELECT k.assignee_contact_id AS contact_id,
              date(substr(k.completed_at, 1, 10), '-6 days', 'weekday 1') AS week_start,
              COUNT(*) AS completed,
              SUM(CASE WHEN k.due_date IS NOT NULL
                        AND date(k.completed_at) <= substr(k.due_date, 1, 10)
                       THEN 1 ELSE 0 END) AS on_time,
              SUM(CASE WHEN k.due_date IS NOT NULL
                        AND date(k.completed_at) > substr(k.due_date, 1, 10)
                       THEN 1 ELSE 0 END) AS late
         FROM cards k
        WHERE k.is_done = 1 AND date(k.completed_at) BETWEEN ? AND ?
          AND k.assignee_contact_id IN (${inIds})
        GROUP BY k.assignee_contact_id, week_start
        ORDER BY week_start`
    )
    .all(from, to);

  /* Cay don vi: chi cac don vi co nguoi trong pham vi, cong voi to tien cua chung
     de dung lai duoc nhanh. Ten don vi cap tren khong phai du lieu nghiep vu. */
  const unitIds = [...new Set(people.map((p) => p.org_unit_id).filter((id) => id != null))];
  const units =
    unitIds.length === 0
      ? []
      : db
          .prepare(
            `WITH RECURSIVE up(id) AS (
               SELECT id FROM org_units WHERE id IN (${unitIds.join(',')})
               UNION
               SELECT o.parent_id FROM org_units o JOIN up ON o.id = up.id
                WHERE o.parent_id IS NOT NULL
             )
             SELECT u.id, u.parent_id, u.name, k.name AS kind_name, h.full_name AS head_name
               FROM org_units u
               JOIN up ON up.id = u.id
               LEFT JOIN org_unit_kinds k ON k.id = u.kind_id
               LEFT JOIN contacts h ON h.id = u.head_contact_id
              ORDER BY u.position, u.name`
          )
          .all();

  res.json({
    from,
    to,
    prev_from: prevFrom,
    prev_to: prevTo,
    scope: accessOf(req).scopeOf('report.tasks', 'read'),
    me,
    people: rows,
    units,
    weekly,
  });
});

export default router;
