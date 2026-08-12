import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { intParam, parseBody, required } from '../lib/validate.ts';
import { assertEntityLinks } from '../lib/entityRelations.ts';

const router = Router();

const REMINDER_SELECT = `
  SELECT r.*, k.title AS card_title, c.name AS customer_name, d.title AS deal_title
    FROM reminders r
    LEFT JOIN cards k ON k.id = r.card_id
    LEFT JOIN customers c ON c.id = r.customer_id
    LEFT JOIN deals d ON d.id = r.deal_id`;

const schema = z.object({
  title: z.string().trim().min(1, 'Tieu de khong duoc de trong'),
  note: z.string().optional(),
  due_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Thoi diem phai dang YYYY-MM-DDTHH:mm'),
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
const UPCOMING_SQL = `
  SELECT r.id, 'reminder' AS source, r.title, r.note, r.due_at, r.is_done,
         r.card_id, k.title AS card_title, c.name AS customer_name, d.title AS deal_title,
         NULL AS event_start_at
    FROM reminders r
    LEFT JOIN cards k ON k.id = r.card_id
    LEFT JOIN customers c ON c.id = r.customer_id
    LEFT JOIN deals d ON d.id = r.deal_id
   WHERE r.is_done = 0
     AND r.due_at <= strftime('%Y-%m-%dT%H:%M', datetime('now','localtime','+7 days'))
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
   ORDER BY due_at`;

router.get('/', (req, res) => {
  const upcoming = req.query.upcoming === '1';
  // Danh sach day du van chi doc bang reminders — do la man quan ly nhac hen,
  // su kien lich khong thuoc ve no.
  const sql = upcoming ? UPCOMING_SQL : `${REMINDER_SELECT} ORDER BY r.is_done, r.due_at`;
  res.json(db.prepare(sql).all());
});

router.post('/', (req, res) => {
  const body = parseBody(schema, req);
  assertEntityLinks(db, body);
  const info = db
    .prepare(
      `INSERT INTO reminders (title, note, due_at, card_id, customer_id, deal_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      body.title,
      body.note ?? '',
      body.due_at,
      body.card_id ?? null,
      body.customer_id ?? null,
      body.deal_id ?? null
    );
  res
    .status(201)
    .json(db.prepare(`${REMINDER_SELECT} WHERE r.id = ?`).get(Number(info.lastInsertRowid)));
});

router.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(schema.partial().extend({ is_done: z.boolean().optional() }), req);
  const current = required(
    db.prepare(`SELECT * FROM reminders WHERE id = ?`).get(id),
    'Khong tim thay nhac hen'
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
  db.prepare(`DELETE FROM reminders WHERE id = ?`).run(id);
  res.json({ ok: true });
});

export default router;
