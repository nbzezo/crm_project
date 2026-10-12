import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { HttpError, intParam, parseBody, required } from '../lib/validate.ts';
import { assertCardAccess } from '../lib/recordAccess.ts';

const router = Router();

/** Nhan xet di theo the: sua / xoa nhan xet = sua the chua no. */
function assertCommentAccess(req: Request, id: number): void {
  const row = db.prepare(`SELECT card_id FROM card_comments WHERE id = ?`).get(id) as
    { card_id: number } | undefined;
  if (!row) throw new HttpError(404, 'Không tìm thấy nhận xét');
  assertCardAccess(req, row.card_id, 'update', 'Không tìm thấy nhận xét');
}

router.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(z.object({ body: z.string().trim().min(1) }), req);
  assertCommentAccess(req, id);
  required(
    db.prepare(`SELECT id FROM card_comments WHERE id = ?`).get(id),
    'Không tìm thấy nhận xét'
  );
  db.prepare(
    `UPDATE card_comments SET body = ?, updated_at = datetime('now','localtime') WHERE id = ?`
  ).run(body.body, id);
  res.json(db.prepare(`SELECT * FROM card_comments WHERE id = ?`).get(id));
});

router.delete('/:id', (req, res) => {
  const id = intParam(req.params.id);
  assertCommentAccess(req, id);
  db.prepare(`DELETE FROM card_comments WHERE id = ?`).run(id);
  res.json({ ok: true });
});

export default router;
