import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { intParam, parseBody, required } from '../lib/validate.ts';

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
  due_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Thoi diem phai dang YYYY-MM-DDTHH:mm'),
  card_id: z.number().int().nullable().optional(),
  customer_id: z.number().int().nullable().optional(),
  deal_id: z.number().int().nullable().optional(),
});

router.get('/', (req, res) => {
  const upcoming = req.query.upcoming === '1';
  const sql = upcoming
    ? `${REMINDER_SELECT} WHERE r.is_done = 0 AND r.due_at <= strftime('%Y-%m-%dT%H:%M', datetime('now','localtime','+7 days'))
       ORDER BY r.due_at`
    : `${REMINDER_SELECT} ORDER BY r.is_done, r.due_at`;
  res.json(db.prepare(sql).all());
});

router.post('/', (req, res) => {
  const body = parseBody(schema, req);
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
  db.prepare(
    `UPDATE reminders SET title = ?, note = ?, due_at = ?, is_done = ? WHERE id = ?`
  ).run(merged.title, merged.note ?? '', merged.due_at, merged.is_done ? 1 : 0, id);
  res.json(db.prepare(`${REMINDER_SELECT} WHERE r.id = ?`).get(id));
});

router.delete('/:id', (req, res) => {
  const id = intParam(req.params.id);
  db.prepare(`DELETE FROM reminders WHERE id = ?`).run(id);
  res.json({ ok: true });
});

export default router;
