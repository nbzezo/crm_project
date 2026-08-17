import { Router } from 'express';
import { z } from 'zod';
import { CARD_STATUSES, type CardStatus } from '@workflow/contracts';
import { db } from '../db/connection.ts';
import { HttpError, parseBody, required } from '../lib/validate.ts';
import { setCardStatus } from '../services/cardService.ts';

const router = Router();
const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Thoi diem phai dang YYYY-MM-DDTHH:mm');

type NotificationKind = 'reminder' | 'event' | 'task' | 'crm' | 'system';
type Severity = 'info' | 'warning' | 'critical';

interface SourceRow {
  id: number;
  title: string;
  body: string;
  due_at: string | null;
  created_at: string;
  link: string | null;
  card_id: number | null;
  customer_id: number | null;
  deal_id: number | null;
  severity: Severity;
  previous_is_read?: number;
  source_can_undo?: number;
}

interface StateRow {
  notification_key: string;
  is_read: number;
  snoozed_until: string | null;
}

interface NotificationItem extends SourceRow {
  key: string;
  kind: NotificationKind;
  source_id: number;
  is_read: boolean;
  snoozed_until: string | null;
  can_complete: boolean;
  can_undo: boolean;
}

const prefixTable = {
  reminder: 'reminders',
  event: 'calendar_events',
  task: 'cards',
  ai: 'ai_notifications',
} as const;

function parseKey(key: string): { prefix: keyof typeof prefixTable; id: number } {
  const match = /^(reminder|event|task|ai)-(\d+)$/.exec(key);
  if (!match) throw new HttpError(400, 'Khoa thong bao khong hop le');
  return { prefix: match[1] as keyof typeof prefixTable, id: Number(match[2]) };
}

function ensureSource(key: string) {
  const parsed = parseKey(key);
  required(
    db.prepare(`SELECT id FROM ${prefixTable[parsed.prefix]} WHERE id = ?`).get(parsed.id),
    'Thong bao khong con ton tai'
  );
  return parsed;
}

function upsertState(key: string, isRead: boolean, snoozedUntil: string | null | undefined) {
  db.prepare(
    `INSERT INTO notification_states
       (notification_key, is_read, read_at, snoozed_until, updated_at)
     VALUES (?, ?, CASE WHEN ? = 1 THEN datetime('now','localtime') END, ?, datetime('now','localtime'))
     ON CONFLICT(notification_key) DO UPDATE SET
       is_read = excluded.is_read,
       read_at = CASE WHEN excluded.is_read = 1 THEN COALESCE(notification_states.read_at, datetime('now','localtime'))
                      ELSE NULL END,
       snoozed_until = CASE WHEN ? = 1 THEN notification_states.snoozed_until
                            ELSE excluded.snoozed_until END,
       updated_at = datetime('now','localtime')`
  ).run(
    key,
    isRead ? 1 : 0,
    isRead ? 1 : 0,
    snoozedUntil ?? null,
    snoozedUntil === undefined ? 1 : 0
  );
}

function notificationLink(row: SourceRow, source: 'reminder' | 'event' | 'task' | 'ai') {
  if (row.card_id) return null;
  if (row.deal_id) return `/deals/${row.deal_id}`;
  if (row.customer_id) return `/customers/${row.customer_id}`;
  if (source === 'reminder') {
    return `/calendar?cv=list&cd=${row.due_at?.slice(0, 10) ?? ''}&focus=reminder-${row.id}`;
  }
  if (source === 'event') {
    return row.link;
  }
  return row.link;
}

router.get('/', (_req, res) => {
  const reminders = db
    .prepare(
      `SELECT r.id, r.title,
              COALESCE(NULLIF(r.note, ''), k.title, d.title, c.name, 'Nhắc hẹn cá nhân') AS body,
              r.due_at, r.created_at, NULL AS link, r.card_id, r.customer_id, r.deal_id,
              CASE WHEN r.due_at < strftime('%Y-%m-%dT%H:%M','now','localtime')
                   THEN 'warning' ELSE 'info' END AS severity,
              1 AS source_can_undo
         FROM reminders r
         LEFT JOIN cards k ON k.id = r.card_id
        LEFT JOIN customers c ON c.id = r.customer_id
        LEFT JOIN deals d ON d.id = r.deal_id
        WHERE r.is_done = 0
          AND r.due_at <= strftime('%Y-%m-%dT%H:%M', datetime('now','localtime','+7 days'))
        ORDER BY r.due_at LIMIT 100`
    )
    .all() as SourceRow[];

  const events = db
    .prepare(
      `SELECT e.id, e.title,
              COALESCE(NULLIF(e.description, ''), NULLIF(e.location, ''), 'Sự kiện trong lịch') AS body,
              strftime('%Y-%m-%dT%H:%M', datetime(e.start_at, '-' || e.reminder_minutes || ' minutes')) AS due_at,
              e.created_at,
              '/calendar?cv=list&cd=' || substr(e.start_at, 1, 10) || '&focus=event-' || e.id AS link,
              NULL AS card_id, NULL AS customer_id, NULL AS deal_id,
              CASE WHEN strftime('%Y-%m-%dT%H:%M', datetime(e.start_at, '-' || e.reminder_minutes || ' minutes'))
                              < strftime('%Y-%m-%dT%H:%M','now','localtime')
                   THEN 'warning' ELSE 'info' END AS severity,
              1 AS source_can_undo
         FROM calendar_events e
        WHERE e.status = 'pending' AND e.reminder_minutes IS NOT NULL
          AND strftime('%Y-%m-%dT%H:%M', datetime(e.start_at, '-' || e.reminder_minutes || ' minutes'))
              <= strftime('%Y-%m-%dT%H:%M', datetime('now','localtime','+7 days'))
          AND e.start_at >= strftime('%Y-%m-%dT%H:%M', datetime('now','localtime','-30 days'))
        ORDER BY due_at LIMIT 100`
    )
    .all() as SourceRow[];

  const tasks = db
    .prepare(
      `SELECT k.id, k.title,
              b.name || ' · ' || l.name || COALESCE(' · ' || a.full_name, '') AS body,
              k.due_date || 'T23:59' AS due_at, k.created_at, NULL AS link,
              k.id AS card_id, k.customer_id, k.deal_id,
              CASE WHEN k.due_date < date('now','localtime') OR k.priority = 'urgent' THEN 'critical'
                   WHEN k.priority = 'high' THEN 'warning' ELSE 'info' END AS severity,
              CASE WHEN k.recur_rule IS NULL THEN 1 ELSE 0 END AS source_can_undo
         FROM cards k
         JOIN lists l ON l.id = k.list_id
         JOIN boards b ON b.id = l.board_id
         LEFT JOIN contacts a ON a.id = k.assignee_contact_id
        WHERE k.is_done = 0 AND k.is_archived = 0 AND b.is_archived = 0
          AND k.due_date IS NOT NULL
          AND k.due_date <= date('now','localtime','+7 days')
          AND (k.assignee_contact_id IS NULL OR a.is_me = 1)
        ORDER BY k.due_date, k.priority DESC LIMIT 100`
    )
    .all() as SourceRow[];

  const ai = db
    .prepare(
      `SELECT id, title, body, NULL AS due_at, created_at, link,
              NULL AS card_id, NULL AS customer_id, NULL AS deal_id,
              severity, is_read AS previous_is_read, 0 AS source_can_undo
         FROM ai_notifications
        ORDER BY created_at DESC LIMIT 100`
    )
    .all() as SourceRow[];

  const states = new Map(
    (
      db
        .prepare(`SELECT notification_key, is_read, snoozed_until FROM notification_states`)
        .all() as StateRow[]
    ).map((state) => [state.notification_key, state])
  );
  const now = db.prepare(`SELECT strftime('%Y-%m-%dT%H:%M','now','localtime') AS now`).get() as {
    now: string;
  };
  const items: NotificationItem[] = [];

  const append = (rows: SourceRow[], source: 'reminder' | 'event' | 'task' | 'ai') => {
    for (const row of rows) {
      const key = `${source}-${row.id}`;
      const state = states.get(key);
      if (state?.snoozed_until && state.snoozed_until > now.now) continue;
      const crmLink =
        row.link?.startsWith('/deals/') ||
        row.link?.startsWith('/customers/') ||
        row.link?.startsWith('/contracts');
      const kind: NotificationKind = source === 'ai' ? (crmLink ? 'crm' : 'system') : source;
      const { previous_is_read: previousIsRead, source_can_undo: sourceCanUndo, ...itemRow } = row;
      items.push({
        ...itemRow,
        key,
        kind,
        source_id: row.id,
        link: notificationLink(row, source),
        is_read: state ? state.is_read === 1 : previousIsRead === 1,
        snoozed_until: state?.snoozed_until ?? null,
        can_complete: source !== 'ai',
        can_undo: source !== 'ai' && sourceCanUndo === 1,
      });
    }
  };

  append(reminders, 'reminder');
  append(events, 'event');
  append(tasks, 'task');
  append(ai, 'ai');
  items.sort((a, b) => {
    if (a.due_at && b.due_at) return a.due_at.localeCompare(b.due_at);
    if (a.due_at) return -1;
    if (b.due_at) return 1;
    return b.created_at.localeCompare(a.created_at);
  });

  const counts: Record<NotificationKind, number> = {
    reminder: 0,
    event: 0,
    task: 0,
    crm: 0,
    system: 0,
  };
  for (const item of items) counts[item.kind] += 1;
  res.json({ items, unread_count: items.filter((item) => !item.is_read).length, counts });
});

router.patch('/:key/state', (req, res) => {
  const key = req.params.key ?? '';
  const parsed = ensureSource(key);
  const body = parseBody(
    z
      .object({
        is_read: z.boolean().optional(),
        snoozed_until: localDateTime.nullable().optional(),
      })
      .refine((value) => value.is_read !== undefined || value.snoozed_until !== undefined, {
        message: 'Can it nhat mot trang thai de cap nhat',
      }),
    req
  );
  const current = db
    .prepare(`SELECT is_read FROM notification_states WHERE notification_key = ?`)
    .get(key) as { is_read: number } | undefined;
  const isRead = body.is_read ?? current?.is_read === 1;
  upsertState(key, isRead, body.snoozed_until);
  if (parsed.prefix === 'ai' && body.is_read !== undefined) {
    db.prepare(`UPDATE ai_notifications SET is_read = ? WHERE id = ?`).run(
      isRead ? 1 : 0,
      parsed.id
    );
  }
  res.json({ key, is_read: isRead, snoozed_until: body.snoozed_until });
});

router.post('/read-all', (req, res) => {
  const { keys } = parseBody(z.object({ keys: z.array(z.string()).min(1).max(250) }), req);
  db.transaction(() => {
    for (const key of [...new Set(keys)]) {
      const parsed = ensureSource(key);
      upsertState(key, true, undefined);
      if (parsed.prefix === 'ai') {
        db.prepare(`UPDATE ai_notifications SET is_read = 1 WHERE id = ?`).run(parsed.id);
      }
    }
  })();
  res.json({ ok: true });
});

router.post('/:key/complete', (req, res) => {
  const key = req.params.key ?? '';
  const parsed = ensureSource(key);
  const body = parseBody(
    z.object({
      done: z.boolean(),
      restore_status: z.enum(CARD_STATUSES).optional(),
    }),
    req
  );
  let previousStatus: CardStatus | undefined;

  if (parsed.prefix === 'reminder') {
    db.prepare(`UPDATE reminders SET is_done = ? WHERE id = ?`).run(body.done ? 1 : 0, parsed.id);
  } else if (parsed.prefix === 'event') {
    db.prepare(
      `UPDATE calendar_events
          SET status = ?, completed_at = CASE WHEN ? = 1 THEN datetime('now','localtime') ELSE NULL END,
              updated_at = datetime('now','localtime')
        WHERE id = ?`
    ).run(body.done ? 'done' : 'pending', body.done ? 1 : 0, parsed.id);
  } else if (parsed.prefix === 'task') {
    const card = required(
      db.prepare(`SELECT status FROM cards WHERE id = ?`).get(parsed.id),
      'Khong tim thay cong viec'
    ) as { status: CardStatus };
    previousStatus = card.status;
    setCardStatus(parsed.id, body.done ? 'done' : (body.restore_status ?? 'todo'));
  } else {
    throw new HttpError(400, 'Canh bao CRM/he thong khong co hanh dong hoan thanh');
  }

  upsertState(key, body.done, undefined);
  res.json({ ok: true, previous_status: previousStatus });
});

export default router;
