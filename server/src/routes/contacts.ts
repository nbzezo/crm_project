import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { intParam, parseBody, required } from '../lib/validate.ts';

const router = Router();

const contactSchema = z.object({
  full_name: z.string().trim().min(1).optional(),
  title: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  zalo: z.string().nullable().optional(),
  linkedin: z.string().nullable().optional(),
  buying_role: z.string().nullable().optional(),
  relationship: z.string().nullable().optional(),
  is_primary: z.boolean().optional(),
  notes: z.string().optional(),
});

/** FR-CON-04: mot nguoi lien he keo theo co hoi, tuong tac va cong viec lien quan. */
router.get('/:id/full', (req, res) => {
  const id = intParam(req.params.id);
  const contact = required(
    db
      .prepare(
        `SELECT ct.*, c.name AS customer_name FROM contacts ct
           JOIN customers c ON c.id = ct.customer_id WHERE ct.id = ?`
      )
      .get(id),
    'Khong tim thay nguoi lien he'
  ) as Record<string, unknown>;

  const deals = db.prepare(`SELECT * FROM deals WHERE contact_id = ?`).all(id);
  const interactions = db
    .prepare(
      `SELECT i.*, d.title AS deal_title FROM interactions i
         LEFT JOIN deals d ON d.id = i.deal_id
        WHERE i.contact_id = ? ORDER BY i.occurred_at DESC`
    )
    .all(id);
  const tasks = db
    .prepare(
      `SELECT k.id, k.title, k.due_date, k.priority, k.is_done FROM cards k
        WHERE k.contact_id = ? AND k.is_archived = 0`
    )
    .all(id);

  res.json({ ...contact, deals, interactions, tasks });
});

router.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(contactSchema, req);
  const current = required(
    db.prepare(`SELECT * FROM contacts WHERE id = ?`).get(id),
    'Khong tim thay nguoi lien he'
  ) as Record<string, unknown>;

  const merged = { ...current, ...body };
  db.transaction(() => {
    if (body.is_primary)
      db.prepare(`UPDATE contacts SET is_primary = 0 WHERE customer_id = ?`).run(
        current.customer_id as number
      );
    db.prepare(
      `UPDATE contacts SET full_name = ?, title = ?, department = ?, phone = ?, email = ?, zalo = ?,
              linkedin = ?, buying_role = ?, relationship = ?, is_primary = ?, notes = ?
        WHERE id = ?`
    ).run(
      merged.full_name,
      merged.title ?? null,
      merged.department ?? null,
      merged.phone ?? null,
      merged.email ?? null,
      merged.zalo ?? null,
      merged.linkedin ?? null,
      merged.buying_role ?? null,
      merged.relationship ?? null,
      merged.is_primary ? 1 : 0,
      merged.notes ?? '',
      id
    );
  })();

  res.json(db.prepare(`SELECT * FROM contacts WHERE id = ?`).get(id));
});

router.delete('/:id', (req, res) => {
  const id = intParam(req.params.id);
  db.prepare(`DELETE FROM contacts WHERE id = ?`).run(id);
  res.json({ ok: true });
});

export default router;
