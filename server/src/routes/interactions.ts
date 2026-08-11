import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { intParam, parseBody, required } from '../lib/validate.ts';
import { nextPosition } from '../lib/position.ts';
import { buildSearchText } from '../lib/viSearch.ts';
import { unverifyBySource } from '../lib/scoring.ts';

const router = Router();

const typeEnum = z.enum([
  'call',
  'email',
  'meeting',
  'demo',
  'proposal',
  'followup',
  'note',
  'zalo',
  'other',
]);

const schema = z.object({
  customer_id: z.number().int(),
  contact_id: z.number().int().nullable().optional(),
  deal_id: z.number().int().nullable().optional(),
  type: typeEnum,
  occurred_at: z.string().min(10, 'Thoi diem khong hop le'),
  summary: z.string().trim().min(1, 'Noi dung khong duoc de trong'),
  result: z.string().nullable().optional(),
  /** FR-ACT-04 + FR-OPP-05: luu ngay hanh dong tiep theo len co hoi va tao Task neu duoc yeu cau. */
  next_action: z.string().nullable().optional(),
  next_action_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  create_task: z.boolean().optional(),
  task_list_id: z.number().int().nullable().optional(),
});

function reload(id: number) {
  return db
    .prepare(
      `SELECT i.*, ct.full_name AS contact_name, d.title AS deal_title, c.name AS customer_name
         FROM interactions i
         LEFT JOIN contacts ct ON ct.id = i.contact_id
         LEFT JOIN deals d ON d.id = i.deal_id
         JOIN customers c ON c.id = i.customer_id
        WHERE i.id = ?`
    )
    .get(id);
}

/** Chon danh sach mac dinh de tha Task sinh ra tu Activity. */
function defaultListId(): number | null {
  const row = db
    .prepare(
      `SELECT l.id FROM lists l JOIN boards b ON b.id = l.board_id
        WHERE b.is_archived = 0 ORDER BY b.is_starred DESC, b.id, l.position LIMIT 1`
    )
    .get() as { id: number } | undefined;
  return row?.id ?? null;
}

router.post('/', (req, res) => {
  const body = parseBody(schema, req);
  required(
    db.prepare(`SELECT id FROM customers WHERE id = ?`).get(body.customer_id),
    'Khong tim thay khach hang'
  );

  const result = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO interactions (customer_id, contact_id, deal_id, type, occurred_at, summary, result)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        body.customer_id,
        body.contact_id ?? null,
        body.deal_id ?? null,
        body.type,
        body.occurred_at,
        body.summary,
        body.result ?? null
      );

    // Cap nhat Next Action cua co hoi lien quan
    if (body.deal_id && (body.next_action || body.next_action_date)) {
      db.prepare(
        `UPDATE deals SET next_action = COALESCE(?, next_action),
                          next_action_date = COALESCE(?, next_action_date),
                          updated_at = datetime('now','localtime')
          WHERE id = ?`
      ).run(body.next_action ?? null, body.next_action_date ?? null, body.deal_id);
    }

    let taskId: number | null = null;
    if (body.create_task && body.next_action) {
      const listId = body.task_list_id ?? defaultListId();
      if (listId) {
        const position = nextPosition({ table: 'cards', scopeCol: 'list_id', scopeVal: listId });
        const task = db
          .prepare(
            `INSERT INTO cards (list_id, title, position, due_date, priority, customer_id, contact_id,
                                deal_id, search_text)
             VALUES (?, ?, ?, ?, 'high', ?, ?, ?, ?)`
          )
          .run(
            listId,
            body.next_action,
            position,
            body.next_action_date ?? null,
            body.customer_id,
            body.contact_id ?? null,
            body.deal_id ?? null,
            buildSearchText(body.next_action)
          );
        taskId = Number(task.lastInsertRowid);
      }
    }

    return { id: Number(info.lastInsertRowid), taskId };
  })();

  res.status(201).json({ ...(reload(result.id) as object), created_task_id: result.taskId });
});

router.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(schema.partial(), req);
  const current = required(
    db.prepare(`SELECT * FROM interactions WHERE id = ?`).get(id),
    'Khong tim thay tuong tac'
  ) as Record<string, unknown>;
  const merged = { ...current, ...body };
  db.prepare(
    `UPDATE interactions SET contact_id = ?, deal_id = ?, type = ?, occurred_at = ?, summary = ?, result = ?
      WHERE id = ?`
  ).run(
    merged.contact_id ?? null,
    merged.deal_id ?? null,
    merged.type,
    merged.occurred_at,
    merged.summary,
    merged.result ?? null,
    id
  );
  res.json(reload(id));
});

router.delete('/:id', (req, res) => {
  const id = intParam(req.params.id);
  // C5: diem dang lay hoat dong nay lam bang chung mat dau da xac thuc, diem giu nguyen
  unverifyBySource(db, 'interaction', id);
  db.prepare(`DELETE FROM interactions WHERE id = ?`).run(id);
  res.json({ ok: true });
});

export default router;
