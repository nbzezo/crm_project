import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { HttpError, intParam, parseBody, required } from '../lib/validate.ts';
import { defaultOwner, scopeFragmentOrUnowned } from '../lib/scope.ts';
import { isRealLocalMinute } from '../lib/dates.ts';
import { assertCardAccess, assertLinkTargetsInScope, ownerInScope } from '../lib/recordAccess.ts';
import { assertEntityLinks } from '../lib/entityRelations.ts';

const router = Router();

const REMINDER_SELECT = `
  SELECT r.*, k.title AS card_title, c.name AS customer_name, d.title AS deal_title
    FROM reminders r
    LEFT JOIN cards k ON k.id = r.card_id
    LEFT JOIN customers c ON c.id = r.customer_id
    LEFT JOIN deals d ON d.id = r.deal_id`;

const LOCAL_MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const schema = z.object({
  title: z.string().trim().min(1, 'Tiêu đề không được để trống'),
  note: z.string().optional(),
  due_at: z
    .string()
    .refine(isRealLocalMinute, 'Thời điểm phải có dạng YYYY-MM-DDTHH:mm và là ngày giờ có thật'),
  card_id: z.number().int().nullable().optional(),
  customer_id: z.number().int().nullable().optional(),
  deal_id: z.number().int().nullable().optional(),
});

/**
 * Nhanh 2 cua `upcoming`: su kien lich co dat nhac.
 *
 * Moc nhac TINH KHI DOC (`start_at - reminder_minutes`), khong luu thanh dong
 * `reminders` rieng — neu luu thi su kien se hien HAI LAN tren lich (endpoint
 * /views/calendar da gop ca bang reminders vao) va se co bon duong ghi phai
 * dong bo moi khi sua gio / hoan thanh / xoa.
 *
 * Cot phai liet ke TUONG MINH: dung `r.*` trong UNION se lam so cot phu thuoc
 * vao bang reminders, mot ALTER TABLE sau nay se lam vo truy van luc chay.
 */
const upcomingSql = (req: Request): string => `
  SELECT r.id, 'reminder' AS source, r.title, r.note, r.due_at, r.is_done,
         r.card_id, k.title AS card_title, c.name AS customer_name, d.title AS deal_title,
         NULL AS event_start_at
    FROM reminders r
    LEFT JOIN cards k ON k.id = r.card_id
    LEFT JOIN customers c ON c.id = r.customer_id
    LEFT JOIN deals d ON d.id = r.deal_id
   WHERE r.is_done = 0
     AND r.due_at <= strftime('%Y-%m-%dT%H:%M', datetime('now','localtime','+7 days'))
     ${scopeFragmentOrUnowned(req, 'tasks', 'read', 'r.owner_contact_id')}
  UNION ALL
  SELECT e.id, 'event' AS source, e.title, e.description AS note,
         strftime('%Y-%m-%dT%H:%M',
                  datetime(e.start_at, '-' || e.reminder_minutes || ' minutes')) AS due_at,
         0 AS is_done,
         NULL AS card_id, NULL AS card_title, NULL AS customer_name, NULL AS deal_title,
         e.start_at AS event_start_at
    FROM calendar_events e
   WHERE e.status = 'pending' AND e.reminder_minutes IS NOT NULL
     AND strftime('%Y-%m-%dT%H:%M',
                  datetime(e.start_at, '-' || e.reminder_minutes || ' minutes'))
         <= strftime('%Y-%m-%dT%H:%M', datetime('now','localtime','+7 days'))
     -- San chan: khong de su kien cu vo han don lai trong chuong bao.
     AND e.start_at >= strftime('%Y-%m-%dT%H:%M', datetime('now','localtime','-30 days'))
     ${scopeFragmentOrUnowned(req, 'tasks', 'read', 'e.owner_contact_id')}
   ORDER BY due_at`;

/** Nhac hen la cua nguoi tao — cung luat voi lich (calendarEvents.ts). */
function assertReminderAccess(req: Request, id: number, action: 'update' | 'delete'): void {
  const row = db.prepare(`SELECT owner_contact_id FROM reminders WHERE id = ?`).get(id) as
    { owner_contact_id: number | null } | undefined;
  if (!row || !ownerInScope(req, 'tasks', action, row.owner_contact_id)) {
    throw new HttpError(404, 'Không tìm thấy nhắc hẹn');
  }
}

/** Gan nhac vao viec / khach hang / co hoi thi phai thay duoc ban ghi do. */
function assertReminderLinks(req: Request, links: Record<string, unknown>): void {
  if (typeof links.card_id === 'number') assertCardAccess(req, links.card_id, 'read');
  assertLinkTargetsInScope(req, { customer_id: links.customer_id, deal_id: links.deal_id });
}

router.get('/', (req, res) => {
  const upcoming = req.query.upcoming === '1';
  // Danh sach day du van chi doc bang reminders — do la man quan ly nhac hen,
  // su kien lich khong thuoc ve no.
  const sql = upcoming
    ? upcomingSql(req)
    : `${REMINDER_SELECT} WHERE 1 = 1${scopeFragmentOrUnowned(req, 'tasks', 'read', 'r.owner_contact_id')}
        ORDER BY r.is_done, r.due_at`;
  res.json(db.prepare(sql).all());
});

/** Moc nhac cua su kien lich — cung bieu thuc voi nhanh 2 cua `upcomingSql`. */
const EVENT_DUE_SQL = `strftime('%Y-%m-%dT%H:%M', datetime(e.start_at, '-' || e.reminder_minutes || ' minutes'))`;

type DueSource = 'reminder' | 'event' | 'quick_note';

interface DueRow {
  source: DueSource;
  id: number;
  title: string;
  note: string;
  due_at: string;
  card_id: number | null;
  card_title: string | null;
  card_is_done: number | null;
  customer_name: string | null;
  deal_title: string | null;
  event_start_at: string | null;
}

/**
 * Nhac da den gio cua NGUOI DANG DANG NHAP — nguon cho popup giua man hinh
 * (DueReminderPopup.tsx). Khac `upcoming`:
 *  - chi lay nhac cua chinh minh: popup chan ngang man hinh, nhac cua nguoi
 *    khac bat len o may minh la lam phien. Nhac chua co chu (truoc v40) van hien.
 *  - chi lay nhac da toi gio, lui toi da mot ngay: mo may sau ky nghi khong bi
 *    mot tran popup cu, nhung nhac vua lo trong luc tat may van con.
 *  - bo nhac cua viec da hoan thanh.
 * Popup tu het khi nhac duoc danh dau xong hoac doi gio (Hoan), qua POST /due/:key.
 * Nhieu tab cung tu dong bo qua lan tai lai ke tiep.
 *
 * Ba nguon (1.42.0), truoc day chi co nguon dau: nhac hen (`reminders`), nhac cua su
 * kien lich (`reminder_minutes`) va nhac cua Ghi chu nhanh (`reminder_at`). Moi dong
 * mang `source`; khoa popup la `<source>-<id>@<due_at>`.
 *
 * `?now=YYYY-MM-DDTHH:mm` la GIO TREN MAY NGUOI DUNG. `due_at` duoc nhap theo gio
 * trinh duyet, nen so voi gio trinh duyet moi dung — container production tung
 * chay UTC, lam popup bat tre 7 tieng. Thieu `now` thi dung gio may chu.
 */
router.get('/due', (req, res) => {
  const me = defaultOwner(req);
  const clientNow =
    typeof req.query.now === 'string' && LOCAL_MINUTE.test(req.query.now) ? req.query.now : null;
  const now =
    clientNow ??
    (db.prepare(`SELECT strftime('%Y-%m-%dT%H:%M','now','localtime') AS t`).get() as { t: string })
      .t;
  const since = (
    db.prepare(`SELECT strftime('%Y-%m-%dT%H:%M', datetime(?, '-1 day')) AS t`).get(now) as {
      t: string;
    }
  ).t;

  const reminders = db
    .prepare(
      `SELECT 'reminder' AS source, r.id, r.title, r.note, r.due_at, r.card_id,
              k.title AS card_title, k.is_done AS card_is_done,
              c.name AS customer_name, d.title AS deal_title, NULL AS event_start_at
         FROM reminders r
         LEFT JOIN cards k ON k.id = r.card_id
         LEFT JOIN customers c ON c.id = r.customer_id
         LEFT JOIN deals d ON d.id = r.deal_id
        WHERE r.is_done = 0
          -- Viec da hoan thanh thi nhac con lai cua no khong con y nghia.
          AND (r.card_id IS NULL OR k.is_done = 0)
          AND (r.owner_contact_id IS NULL OR r.owner_contact_id = ?)
          AND r.due_at <= ? AND r.due_at >= ?
        ORDER BY r.due_at, r.id
        LIMIT 20`
    )
    .all(me, now, since) as DueRow[];

  /* Su kien lich: moc nhac tinh khi doc. Da tat dung moc nay thi thoi; da hoan thi hien
     lai tu gio hoan, voi `due_at` la gio hoan (popup coi do la mot lan nhac moi). */
  const events = (
    me == null
      ? []
      : db
          .prepare(
            `SELECT * FROM (
               SELECT 'event' AS source, e.id, e.title, e.description AS note,
                      CASE WHEN s.due_at = ${EVENT_DUE_SQL} AND s.snoozed_until IS NOT NULL
                           THEN s.snoozed_until ELSE ${EVENT_DUE_SQL} END AS due_at,
                      NULL AS card_id, NULL AS card_title, NULL AS card_is_done,
                      NULL AS customer_name, NULL AS deal_title, e.start_at AS event_start_at,
                      CASE WHEN s.due_at = ${EVENT_DUE_SQL} THEN s.dismissed ELSE 0 END AS dismissed
                 FROM calendar_events e
                 LEFT JOIN reminder_popup_states s
                        ON s.contact_id = ? AND s.item_key = 'event-' || e.id
                WHERE e.status = 'pending' AND e.reminder_minutes IS NOT NULL
                  AND (e.owner_contact_id IS NULL OR e.owner_contact_id = ?)
                  -- Su kien da qua hon mot ngay thi thoi, nhu nhac hen.
                  AND e.start_at >= ?)
             WHERE dismissed = 0 AND due_at <= ? AND due_at >= ?
             ORDER BY due_at, id
             LIMIT 20`
          )
          .all(me, me, since, now, since)
  ) as (DueRow & { dismissed?: number })[];

  /* Ghi chu nhanh: du lieu ca nhan, chi cua chinh minh. 'triggered' = Telegram da bao,
     nguoi dung chua xu ly trong ung dung — van hien. */
  const quickNotes = (
    me == null
      ? []
      : db
          .prepare(
            `SELECT 'quick_note' AS source, q.id,
                    CASE WHEN trim(q.title) = '' THEN 'Ghi chú không tiêu đề' ELSE q.title END AS title,
                    substr(q.content_text, 1, 300) AS note, q.reminder_at AS due_at,
                    NULL AS card_id, NULL AS card_title, NULL AS card_is_done,
                    NULL AS customer_name, NULL AS deal_title, NULL AS event_start_at
               FROM quick_notes q
              WHERE q.deleted_at IS NULL AND q.owner_contact_id = ?
                AND q.reminder_status IN ('pending', 'triggered')
                AND q.reminder_at <= ? AND q.reminder_at >= ?
              ORDER BY q.reminder_at, q.id
              LIMIT 20`
          )
          .all(me, now, since)
  ) as DueRow[];

  const rows = [
    ...reminders,
    ...events.map(({ dismissed: _dismissed, ...row }) => row),
    ...quickNotes,
  ]
    .sort((a, b) => a.due_at.localeCompare(b.due_at) || a.id - b.id)
    .slice(0, 20);
  res.json(rows);
});

const dueActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('dismiss') }),
  z.object({
    action: z.literal('snooze'),
    until: z
      .string()
      .refine(isRealLocalMinute, 'Thời điểm phải có dạng YYYY-MM-DDTHH:mm và là ngày giờ có thật'),
  }),
]);

/**
 * Tat / Hoan mot nhac cua popup, bat ke nguon (1.42.0). Khoa la `<nguon>-<id>`:
 *  - `reminder-12`: nhu PATCH /:id (is_done = 1 hoac doi due_at);
 *  - `event-34`: ghi reminder_popup_states cho CHINH nguoi dang xem, gan voi moc nhac
 *    hien tai — doi gio su kien la nhac bat lai;
 *  - `quick_note-5`: tat = reminder_status 'completed'; hoan = doi reminder_at (trang
 *    thai ve 'pending', Telegram gui lai theo gio moi).
 */
router.post('/due/:key', (req, res) => {
  const match = /^(reminder|event|quick_note)-(\d+)$/.exec(String(req.params.key));
  if (!match) throw new HttpError(400, 'Khóa nhắc không hợp lệ');
  const source = match[1] as DueSource;
  const id = Number(match[2]);
  const body = parseBody(dueActionSchema, req);
  const me = defaultOwner(req);

  if (source === 'reminder') {
    assertReminderAccess(req, id, 'update');
    if (body.action === 'dismiss') {
      db.prepare(`UPDATE reminders SET is_done = 1 WHERE id = ?`).run(id);
    } else {
      db.prepare(`UPDATE reminders SET due_at = ? WHERE id = ?`).run(body.until, id);
    }
  } else if (source === 'event') {
    if (me == null) throw new HttpError(400, 'Tài khoản chưa gắn với nhân sự');
    const event = db
      .prepare(
        `SELECT ${EVENT_DUE_SQL} AS due_at FROM calendar_events e
          WHERE e.id = ? AND e.reminder_minutes IS NOT NULL
            AND (e.owner_contact_id IS NULL OR e.owner_contact_id = ?)`
      )
      .get(id, me) as { due_at: string } | undefined;
    if (!event) throw new HttpError(404, 'Không tìm thấy sự kiện');
    db.prepare(
      `INSERT INTO reminder_popup_states (contact_id, item_key, due_at, dismissed, snoozed_until)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(contact_id, item_key) DO UPDATE SET
         due_at = excluded.due_at, dismissed = excluded.dismissed,
         snoozed_until = excluded.snoozed_until, updated_at = datetime('now','localtime')`
    ).run(
      me,
      `event-${id}`,
      event.due_at,
      body.action === 'dismiss' ? 1 : 0,
      body.action === 'snooze' ? body.until : null
    );
  } else {
    const note = db
      .prepare(`SELECT owner_contact_id FROM quick_notes WHERE id = ? AND deleted_at IS NULL`)
      .get(id) as { owner_contact_id: number | null } | undefined;
    if (!note || me == null || note.owner_contact_id !== me) {
      throw new HttpError(404, 'Không tìm thấy ghi chú nhanh');
    }
    /* Khong cham updated_at: hoan nhac khong phai sua noi dung, ghi chu khong nhay len dau bang. */
    if (body.action === 'dismiss') {
      db.prepare(`UPDATE quick_notes SET reminder_status = 'completed' WHERE id = ?`).run(id);
    } else {
      db.prepare(
        `UPDATE quick_notes SET reminder_at = ?, reminder_status = 'pending' WHERE id = ?`
      ).run(body.until, id);
    }
  }
  res.json({ ok: true });
});

router.post('/', (req, res) => {
  const body = parseBody(schema, req);
  assertEntityLinks(db, body);
  assertReminderLinks(req, body);
  const info = db
    .prepare(
      `INSERT INTO reminders (title, note, due_at, card_id, customer_id, deal_id, owner_contact_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      body.title,
      body.note ?? '',
      body.due_at,
      body.card_id ?? null,
      body.customer_id ?? null,
      body.deal_id ?? null,
      defaultOwner(req)
    );
  res
    .status(201)
    .json(db.prepare(`${REMINDER_SELECT} WHERE r.id = ?`).get(Number(info.lastInsertRowid)));
});

router.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(schema.partial().extend({ is_done: z.boolean().optional() }), req);
  assertReminderAccess(req, id, 'update');
  assertReminderLinks(req, body);
  const current = required(
    db.prepare(`SELECT * FROM reminders WHERE id = ?`).get(id),
    'Không tìm thấy nhắc hẹn'
  ) as Record<string, unknown>;
  const merged = { ...current, ...body };
  assertEntityLinks(db, {
    card_id: merged.card_id as number | null,
    customer_id: merged.customer_id as number | null,
    deal_id: merged.deal_id as number | null,
  });
  // Truoc day cac cot lien ket duoc zod chap nhan nhung KHONG duoc ghi —
  // sua card_id/customer_id/deal_id im lang khong co tac dung.
  db.prepare(
    `UPDATE reminders SET title = ?, note = ?, due_at = ?, is_done = ?,
            card_id = ?, customer_id = ?, deal_id = ?
      WHERE id = ?`
  ).run(
    merged.title,
    merged.note ?? '',
    merged.due_at,
    merged.is_done ? 1 : 0,
    merged.card_id ?? null,
    merged.customer_id ?? null,
    merged.deal_id ?? null,
    id
  );
  res.json(db.prepare(`${REMINDER_SELECT} WHERE r.id = ?`).get(id));
});

router.delete('/:id', (req, res) => {
  const id = intParam(req.params.id);
  assertReminderAccess(req, id, 'delete');
  db.prepare(`DELETE FROM reminders WHERE id = ?`).run(id);
  res.json({ ok: true });
});

export default router;
