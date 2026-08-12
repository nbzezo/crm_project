import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { intParam, parseBody, required } from '../lib/validate.ts';
import { nextPosition } from '../lib/position.ts';
import { assertEntityLinks } from '../lib/entityRelations.ts';

const router = Router();

const boardCreate = z.object({
  name: z.string().trim().min(1, 'Ten bang khong duoc de trong'),
  background: z.string().optional(),
  customer_id: z.number().int().nullable().optional(),
});

const boardUpdate = z.object({
  name: z.string().trim().min(1).optional(),
  background: z.string().optional(),
  customer_id: z.number().int().nullable().optional(),
  is_archived: z.boolean().optional(),
  is_starred: z.boolean().optional(),
});

const DEFAULT_LISTS = ['Cần làm', 'Đang làm', 'Chờ duyệt', 'Hoàn thành'];

router.get('/', (req, res) => {
  const includeArchived = req.query.archived === '1';
  const rows = db
    .prepare(
      `SELECT b.*, c.name AS customer_name,
              (SELECT COUNT(*) FROM cards k JOIN lists l ON l.id = k.list_id
                WHERE l.board_id = b.id AND k.is_done = 0 AND k.is_archived = 0 AND k.parent_id IS NULL) AS card_count
         FROM boards b
         LEFT JOIN customers c ON c.id = b.customer_id
        WHERE (? = 1 OR b.is_archived = 0)
        ORDER BY b.is_archived, b.is_starred DESC, b.updated_at DESC`
    )
    .all(includeArchived ? 1 : 0);
  res.json(rows);
});

router.post('/', (req, res) => {
  const body = parseBody(boardCreate, req);
  assertEntityLinks(db, { customer_id: body.customer_id });
  const background = body.background ?? '#0079bf';
  const result = db.transaction(() => {
    const info = db
      .prepare(`INSERT INTO boards (name, color, background, customer_id) VALUES (?, ?, ?, ?)`)
      .run(body.name, background, background, body.customer_id ?? null);
    const boardId = Number(info.lastInsertRowid);
    const insertList = db.prepare(`INSERT INTO lists (board_id, name, position) VALUES (?, ?, ?)`);
    DEFAULT_LISTS.forEach((name, i) => insertList.run(boardId, name, (i + 1) * 1024));
    return db.prepare(`SELECT * FROM boards WHERE id = ?`).get(boardId);
  })();
  res.status(201).json(result);
});

router.get('/:id/full', (req, res) => {
  const id = intParam(req.params.id);
  const board = required(
    db
      .prepare(
        `SELECT b.*, c.name AS customer_name
           FROM boards b LEFT JOIN customers c ON c.id = b.customer_id
          WHERE b.id = ?`
      )
      .get(id),
    'Khong tim thay bang'
  ) as Record<string, unknown>;

  const lists = db
    .prepare(
      `SELECT id, name, position, is_collapsed FROM lists WHERE board_id = ? ORDER BY position, id`
    )
    .all(id) as { id: number; name: string; position: number }[];

  const cards = db
    .prepare(
      `SELECT k.id, k.list_id, k.title, k.description, k.position, k.start_date, k.due_date,
              k.priority, k.customer_id, k.deal_id, k.is_done, k.cover_color, k.created_at,
              c.name AS customer_name,
              (SELECT COUNT(*) FROM checklist_items ci WHERE ci.card_id = k.id) AS checklist_total,
              (SELECT COUNT(*) FROM checklist_items ci WHERE ci.card_id = k.id AND ci.is_done = 1) AS checklist_done,
              (SELECT COUNT(*) FROM cards sc WHERE sc.parent_id = k.id AND sc.is_archived = 0) AS subtask_total,
              (SELECT COUNT(*) FROM cards sc WHERE sc.parent_id = k.id AND sc.is_archived = 0 AND sc.is_done = 1) AS subtask_done,
              (SELECT COUNT(*) FROM documents dc WHERE dc.card_id = k.id AND dc.deleted_at IS NULL) AS attachment_total
         FROM cards k
         JOIN lists l ON l.id = k.list_id
         LEFT JOIN customers c ON c.id = k.customer_id
        WHERE l.board_id = ? AND k.is_archived = 0 AND k.parent_id IS NULL
        ORDER BY k.position, k.id`
    )
    .all(id) as Record<string, unknown>[];

  const labelLinks = db
    .prepare(
      `SELECT cl.card_id, cl.label_id FROM card_labels cl
         JOIN cards k ON k.id = cl.card_id
         JOIN lists l ON l.id = k.list_id
        WHERE l.board_id = ?`
    )
    .all(id) as { card_id: number; label_id: number }[];

  const labelsByCard = new Map<number, number[]>();
  for (const link of labelLinks) {
    const arr = labelsByCard.get(link.card_id) ?? [];
    arr.push(link.label_id);
    labelsByCard.set(link.card_id, arr);
  }

  const cardsByList = new Map<number, Record<string, unknown>[]>();
  for (const card of cards) {
    card.label_ids = labelsByCard.get(card.id as number) ?? [];
    const listId = card.list_id as number;
    const arr = cardsByList.get(listId) ?? [];
    arr.push(card);
    cardsByList.set(listId, arr);
  }

  // v9: chi nhan gan duoc (cap 2, dang Active) — nhom nhan khong xuat hien trong bo loc
  const labels = db
    .prepare(
      `SELECT l.* FROM labels l JOIN labels p ON p.id = l.parent_id
        WHERE l.status = 'active' AND p.status = 'active'
        ORDER BY p.position, l.position, l.id`
    )
    .all();

  res.json({
    ...board,
    lists: lists.map((l) => ({ ...l, cards: cardsByList.get(l.id) ?? [] })),
    labels,
  });
});

router.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(boardUpdate, req);
  required(db.prepare(`SELECT id FROM boards WHERE id = ?`).get(id), 'Khong tim thay bang');
  if (body.customer_id !== undefined) assertEntityLinks(db, { customer_id: body.customer_id });

  const fields: string[] = [];
  const values: unknown[] = [];
  if (body.name !== undefined) {
    fields.push('name = ?');
    values.push(body.name);
  }
  if (body.background !== undefined) {
    fields.push('background = ?', 'color = ?');
    values.push(body.background, body.background);
  }
  if (body.customer_id !== undefined) {
    fields.push('customer_id = ?');
    values.push(body.customer_id);
  }
  if (body.is_archived !== undefined) {
    fields.push('is_archived = ?');
    values.push(body.is_archived ? 1 : 0);
  }
  if (body.is_starred !== undefined) {
    fields.push('is_starred = ?');
    values.push(body.is_starred ? 1 : 0);
  }

  if (fields.length > 0) {
    fields.push(`updated_at = datetime('now','localtime')`);
    db.prepare(`UPDATE boards SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
  }
  res.json(db.prepare(`SELECT * FROM boards WHERE id = ?`).get(id));
});

router.delete('/:id', (req, res) => {
  const id = intParam(req.params.id);
  db.prepare(`DELETE FROM boards WHERE id = ?`).run(id);
  res.json({ ok: true });
});

/** Them list moi vao bang (tien cho UI "Them danh sach"). */
router.post('/:id/lists', (req, res) => {
  const boardId = intParam(req.params.id);
  const body = parseBody(z.object({ name: z.string().trim().min(1) }), req);
  required(db.prepare(`SELECT id FROM boards WHERE id = ?`).get(boardId), 'Khong tim thay bang');
  const position = nextPosition({ table: 'lists', scopeCol: 'board_id', scopeVal: boardId });
  const info = db
    .prepare(`INSERT INTO lists (board_id, name, position) VALUES (?, ?, ?)`)
    .run(boardId, body.name, position);
  res.status(201).json(db.prepare(`SELECT * FROM lists WHERE id = ?`).get(info.lastInsertRowid));
});

export default router;
