import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { intParam, parseBody, required } from '../lib/validate.ts';

const router = Router();

router.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(z.object({ body: z.string().trim().min(1) }), req);
  required(
    db.prepare(`SELECT id FROM card_comments WHERE id = ?`).get(id),
    'Khong tim thay nhan xet'
  );
  db.prepare(
    `UPDATE card_comments SET body = ?, updated_at = datetime('now','localtime') WHERE id = ?`
  ).run(body.body, id);
  res.json(db.prepare(`SELECT * FROM card_comments WHERE id = ?`).get(id));
});

router.delete('/:id', (req, res) => {
  const id = intParam(req.params.id);
  db.prepare(`DELETE FROM card_comments WHERE id = ?`).run(id);
  res.json({ ok: true });
});

export default router;
