import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { intParam, parseBody, required } from '../lib/validate.ts';
import { STEP } from '../lib/position.ts';

const router = Router();

export const FIELD_TYPES = ['text', 'number', 'date', 'select', 'checkbox'] as const;

const fieldSchema = z.object({
  board_id: z.number().int().nullable().optional(),
  name: z.string().trim().min(1, 'Ten truong khong duoc de trong'),
  field_type: z.enum(FIELD_TYPES).optional(),
  options: z.array(z.string().trim().min(1)).optional(),
  show_on_card: z.boolean().optional(),
});

/** Doi hang trong DB thanh dang tra ve client: options luon la mang. */
function toField(row: Record<string, unknown>): Record<string, unknown> {
  let options: string[] = [];
  try {
    const parsed = JSON.parse(String(row.options ?? '[]')) as unknown;
    if (Array.isArray(parsed)) options = parsed.map(String);
  } catch {
    /* du lieu hong thi coi nhu khong co lua chon */
  }
  return { ...row, options };
}

function getField(id: number): Record<string, unknown> {
  return required(
    db.prepare(`SELECT * FROM card_fields WHERE id = ?`).get(id),
    'Khong tim thay truong thong tin'
  ) as Record<string, unknown>;
}

/** Truong cua mot bang = truong rieng cua bang + truong dung chung (board_id NULL). */
router.get('/', (req, res) => {
  const boardId = req.query.board_id ? Number(req.query.board_id) : null;
  const rows = db
    .prepare(
      `SELECT * FROM card_fields
        WHERE board_id IS NULL OR (? IS NOT NULL AND board_id = ?)
        ORDER BY board_id IS NULL DESC, position, id`
    )
    .all(boardId, boardId) as Record<string, unknown>[];
  res.json(rows.map(toField));
});

router.post('/', (req, res) => {
  const body = parseBody(fieldSchema, req);
  const boardId = body.board_id ?? null;
  if (boardId != null)
    required(db.prepare(`SELECT id FROM boards WHERE id = ?`).get(boardId), 'Khong tim thay bang');
  const row = db
    .prepare(
      `SELECT MAX(position) AS maxPos FROM card_fields
        WHERE board_id IS ?`
    )
    .get(boardId) as { maxPos: number | null };

  const info = db
    .prepare(
      `INSERT INTO card_fields (board_id, name, field_type, options, show_on_card, position)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      boardId,
      body.name,
      body.field_type ?? 'text',
      JSON.stringify(body.options ?? []),
      body.show_on_card ? 1 : 0,
      (row.maxPos ?? 0) + STEP
    );

  res.status(201).json(toField(getField(Number(info.lastInsertRowid))));
});

router.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(fieldSchema.partial(), req);
  const current = getField(id);

  db.prepare(
    `UPDATE card_fields SET name = ?, field_type = ?, options = ?, show_on_card = ? WHERE id = ?`
  ).run(
    body.name ?? current.name,
    body.field_type ?? current.field_type,
    body.options ? JSON.stringify(body.options) : current.options,
    body.show_on_card === undefined ? current.show_on_card : body.show_on_card ? 1 : 0,
    id
  );

  res.json(toField(getField(id)));
});

router.delete('/:id', (req, res) => {
  const id = intParam(req.params.id);
  db.prepare(`DELETE FROM card_fields WHERE id = ?`).run(id);
  res.json({ ok: true });
});

export default router;
