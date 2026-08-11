import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { HttpError, intParam, parseBody, required } from '../lib/validate.ts';
import { buildSearchText, fold } from '../lib/viSearch.ts';

const router = Router();

/**
 * Dang thoi diem dia phuong 'YYYY-MM-DDTHH:mm'.
 *
 * Bieu thuc nay la TUYEN PHONG THU CHINH chong ca lop loi mui gio: no loai
 * '…T14:00:00' (FullCalendar tra ve co giay — client phai cat con 16 ky tu),
 * loai '…Z' (lo goi toISOString), va loai moi do lech '+07:00'. Sai la 400 on ao
 * ngay tai bien, khong phai du lieu troi am tham vao CSDL.
 */
const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Thoi diem phai dang YYYY-MM-DDTHH:mm');

const eventTypeEnum = z.enum([
  'task',
  'meeting',
  'call',
  'reminder',
  'appointment',
  'deadline',
  'other',
]);
const statusEnum = z.enum(['pending', 'done', 'cancelled']);

const schema = z.object({
  title: z.string().trim().min(1, 'Tieu de khong duoc de trong'),
  description: z.string().optional(),
  location: z.string().optional(),
  event_type: eventTypeEnum.optional(),
  start_at: localDateTime,
  end_at: localDateTime.optional(),
  all_day: z.boolean().optional(),
  status: statusEnum.optional(),
  reminder_minutes: z.number().int().min(0).max(43200).nullable().optional(),
});

/** Cot dan xuat tinh khi doc — khong bao gio luu (BRD muc 34, 35). */
const EVENT_SELECT = `
  SELECT e.*,
         CASE WHEN e.status = 'pending'
               AND e.end_at <= strftime('%Y-%m-%dT%H:%M', datetime('now','localtime'))
              THEN 1 ELSE 0 END AS is_overdue,
         CASE WHEN e.reminder_minutes IS NULL THEN NULL
              ELSE strftime('%Y-%m-%dT%H:%M',
                            datetime(e.start_at, '-' || e.reminder_minutes || ' minutes'))
         END AS reminder_at
    FROM calendar_events e`;

function reload(id: number) {
  return db.prepare(`${EVENT_SELECT} WHERE e.id = ?`).get(id);
}

/** Cong them phut vao mot moc 'YYYY-MM-DDTHH:mm', tra ve cung dang. */
function shift(at: string, minutes: number): string {
  const row = db
    .prepare(`SELECT strftime('%Y-%m-%dT%H:%M', datetime(?, ? || ' minutes')) AS v`)
    .get(at, String(minutes)) as { v: string };
  return row.v;
}

type EventInput = z.infer<typeof schema> & { end_at?: string };

/**
 * Dien mac dinh va kiem rang buoc lien truong o MOT cho duy nhat, de POST va
 * PATCH khong the lech nhau. Nem loi tieng Viet thay vi de lo SQLITE_CONSTRAINT.
 */
function normalize(input: EventInput): Required<
  Pick<EventInput, 'title' | 'start_at' | 'end_at'>
> & {
  description: string;
  location: string;
  event_type: string;
  all_day: number;
  status: string;
  reminder_minutes: number | null;
} {
  const allDay = input.all_day ? 1 : 0;
  let start = input.start_at;
  let end = input.end_at;

  if (allDay === 1) {
    start = `${start.slice(0, 10)}T00:00`;
    end = end ? `${end.slice(0, 10)}T00:00` : '';
    // Nua khoang: su kien ca ngay mot ngay ket thuc vao 00:00 hom sau.
    if (!end || end <= start) end = shift(start, 24 * 60);
  } else if (!end) {
    end = shift(start, 60);
  }

  if (end <= start) {
    throw new HttpError(400, 'Thoi gian ket thuc phai sau thoi gian bat dau');
  }

  return {
    title: input.title,
    start_at: start,
    end_at: end,
    description: input.description ?? '',
    location: input.location ?? '',
    event_type: input.event_type ?? 'task',
    all_day: allDay,
    status: input.status ?? 'pending',
    reminder_minutes: input.reminder_minutes ?? null,
  };
}

/**
 * Su kien co gio bi chong lan (BRD muc 45).
 *
 * Chi CANH BAO, khong chan — nen tra kem trong body chu khong nem 4xx.
 * Bo qua su kien ca ngay: moi su kien ca ngay deu chong moi thu trong ngay,
 * bao ra chi la nhieu.
 */
function findConflicts(id: number | null, start: string, end: string, allDay: number) {
  if (allDay === 1) return [];
  return db
    .prepare(
      `SELECT id, title, start_at, end_at FROM calendar_events
        WHERE (? IS NULL OR id <> ?) AND all_day = 0 AND status <> 'cancelled'
          AND start_at < ? AND end_at > ?
        ORDER BY start_at LIMIT 5`
    )
    .all(id, id, end, start);
}

/** Danh sach doc lap — dung cho che do Danh sach va tim kiem khong gioi han khoang. */
router.get('/events', (req, res) => {
  const where: string[] = [];
  const params: unknown[] = [];

  if (req.query.start) {
    where.push(`e.end_at > ?`);
    params.push(`${String(req.query.start)}T00:00`);
  }
  if (req.query.end) {
    // `end` la ngay BAO GOM -> chuyen thanh moc loai tru dau ngay hom sau.
    where.push(`e.start_at < strftime('%Y-%m-%dT%H:%M', datetime(?, '+1 day'))`);
    params.push(String(req.query.end));
  }
  const q = fold(String(req.query.q ?? '').trim());
  if (q) {
    where.push(`e.search_text LIKE '%' || ? || '%'`);
    params.push(q);
  }
  const types = String(req.query.type ?? '')
    .split(',')
    .filter(Boolean);
  if (types.length > 0) {
    where.push(`e.event_type IN (${types.map(() => '?').join(',')})`);
    params.push(...types);
  }
  const statuses = String(req.query.status ?? '')
    .split(',')
    .filter(Boolean);
  if (statuses.length > 0) {
    where.push(`e.status IN (${statuses.map(() => '?').join(',')})`);
    params.push(...statuses);
  }

  const limit = Math.min(Math.max(Number(req.query.limit ?? 200) || 200, 1), 1000);
  const sql = `${EVENT_SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
     ORDER BY e.start_at LIMIT ?`;
  res.json(db.prepare(sql).all(...params, limit));
});

router.get('/events/:id', (req, res) => {
  const id = intParam(req.params.id);
  res.json(required(reload(id), 'Khong tim thay lich'));
});

router.post('/events', (req, res) => {
  const body = normalize(parseBody(schema, req));
  const info = db
    .prepare(
      `INSERT INTO calendar_events
         (title, description, location, event_type, start_at, end_at, all_day,
          status, reminder_minutes, search_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      body.title,
      body.description,
      body.location,
      body.event_type,
      body.start_at,
      body.end_at,
      body.all_day,
      body.status,
      body.reminder_minutes,
      buildSearchText(body.title, body.description, body.location)
    );

  const id = Number(info.lastInsertRowid);
  res.status(201).json({
    ...(reload(id) as object),
    conflicts: findConflicts(id, body.start_at, body.end_at, body.all_day),
  });
});

router.patch('/events/:id', (req, res) => {
  const id = intParam(req.params.id);
  const current = required(
    db.prepare(`SELECT * FROM calendar_events WHERE id = ?`).get(id),
    'Khong tim thay lich'
  ) as Record<string, unknown>;
  const patch = parseBody(schema.partial(), req);

  // Gop TRUOC khi kiem: all_day / end>start / canh nua dem la rang buoc lien
  // truong, nen chi gui {all_day:true} van phai duoc danh gia cung gio da luu.
  const merged = normalize({
    title: (patch.title ?? current.title) as string,
    description: (patch.description ?? current.description) as string,
    location: (patch.location ?? current.location) as string,
    event_type: (patch.event_type ?? current.event_type) as never,
    start_at: (patch.start_at ?? current.start_at) as string,
    end_at: (patch.end_at ?? (patch.start_at ? undefined : current.end_at)) as string | undefined,
    all_day: patch.all_day ?? current.all_day === 1,
    status: (patch.status ?? current.status) as never,
    reminder_minutes:
      patch.reminder_minutes === undefined
        ? (current.reminder_minutes as number | null)
        : patch.reminder_minutes,
  });

  const becameDone = merged.status === 'done' && current.status !== 'done';
  const leftDone = merged.status !== 'done' && current.status === 'done';

  db.prepare(
    `UPDATE calendar_events
        SET title = ?, description = ?, location = ?, event_type = ?,
            start_at = ?, end_at = ?, all_day = ?, status = ?,
            reminder_minutes = ?, search_text = ?,
            completed_at = ${becameDone ? `datetime('now','localtime')` : leftDone ? 'NULL' : 'completed_at'},
            updated_at = datetime('now','localtime')
      WHERE id = ?`
  ).run(
    merged.title,
    merged.description,
    merged.location,
    merged.event_type,
    merged.start_at,
    merged.end_at,
    merged.all_day,
    merged.status,
    merged.reminder_minutes,
    buildSearchText(merged.title, merged.description, merged.location),
    id
  );

  res.json({
    ...(reload(id) as object),
    conflicts: findConflicts(id, merged.start_at, merged.end_at, merged.all_day),
  });
});

router.delete('/events/:id', (req, res) => {
  const id = intParam(req.params.id);
  db.prepare(`DELETE FROM calendar_events WHERE id = ?`).run(id);
  res.json({ ok: true });
});

export default router;
