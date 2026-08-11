import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { HttpError, intParam, parseBody, required } from '../lib/validate.ts';
import { computeMovePosition, nextPosition } from '../lib/position.ts';
import { buildSearchText } from '../lib/viSearch.ts';

const router = Router();

router.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(
    z.object({
      content: z.string().trim().min(1).optional(),
      is_done: z.boolean().optional(),
      beforeId: z.number().int().nullable().optional(),
      afterId: z.number().int().nullable().optional(),
    }),
    req
  );
  const item = required(
    db.prepare(`SELECT * FROM checklist_items WHERE id = ?`).get(id),
    'Khong tim thay muc viec'
  ) as { card_id: number };

  db.transaction(() => {
    if (body.content !== undefined)
      db.prepare(`UPDATE checklist_items SET content = ? WHERE id = ?`).run(body.content, id);
    if (body.is_done !== undefined)
      db.prepare(`UPDATE checklist_items SET is_done = ? WHERE id = ?`).run(body.is_done ? 1 : 0, id);
    if (body.beforeId !== undefined || body.afterId !== undefined) {
      const pos = computeMovePosition(
        { table: 'checklist_items', scopeCol: 'card_id', scopeVal: item.card_id },
        body.beforeId,
        body.afterId
      );
      db.prepare(`UPDATE checklist_items SET position = ? WHERE id = ?`).run(pos, id);
    }
  })();

  res.json(db.prepare(`SELECT * FROM checklist_items WHERE id = ?`).get(id));
});

/**
 * Nang mot muc viec can lam thanh viec con: tao the con roi xoa muc goc.
 * Dung khi mot buoc hoa ra can han rieng / muc uu tien rieng.
 */
router.post('/:id/promote', (req, res) => {
  const id = intParam(req.params.id);
  const item = required(
    db.prepare(`SELECT * FROM checklist_items WHERE id = ?`).get(id),
    'Khong tim thay muc viec'
  ) as { card_id: number; content: string; is_done: number };

  const parent = required(
    db.prepare(`SELECT * FROM cards WHERE id = ?`).get(item.card_id),
    'Khong tim thay the cha'
  ) as Record<string, unknown>;
  if (parent.parent_id) throw new HttpError(400, 'Chỉ hỗ trợ một cấp việc con');

  const listId = parent.list_id as number;
  const created = db.transaction(() => {
    const position = nextPosition({ table: 'cards', scopeCol: 'list_id', scopeVal: listId });
    const info = db
      .prepare(
        `INSERT INTO cards (list_id, parent_id, title, position, priority, customer_id, deal_id,
                            is_done, completed_at, search_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?,
                 CASE WHEN ? = 1 THEN datetime('now','localtime') END, ?)`
      )
      .run(
        listId,
        item.card_id,
        item.content,
        position,
        parent.priority as string,
        (parent.customer_id as number | null) ?? null,
        (parent.deal_id as number | null) ?? null,
        item.is_done,
        item.is_done,
        buildSearchText(item.content)
      );
    db.prepare(`DELETE FROM checklist_items WHERE id = ?`).run(id);
    return Number(info.lastInsertRowid);
  })();

  res.status(201).json(db.prepare(`SELECT * FROM cards WHERE id = ?`).get(created));
});

router.delete('/:id', (req, res) => {
  const id = intParam(req.params.id);
  db.prepare(`DELETE FROM checklist_items WHERE id = ?`).run(id);
  res.json({ ok: true });
});

export default router;
