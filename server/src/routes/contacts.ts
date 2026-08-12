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
  /** Dai dien chinh nguoi dung — dung cho bo loc "Viec cua toi". Chi mot ban ghi duoc bat. */
  is_me: z.boolean().optional(),
  /** Nghi viec thi tat co nay: an khoi o chon nguoi phu trach ma khong mat lich su. */
  is_active: z.boolean().optional(),
  notes: z.string().optional(),
});

/**
 * Danh sach nguoi co the giao viec — moi nhan su cua MOI to chuc, khong gioi han
 * theo khach hang cua the.
 *
 * Khac han `/api/cards/context`, noi chi liet ke nguoi lien he cua dung khach hang
 * vi do la lien ket "viec nay VE ai". O day la "AI LAM", nen nhan su cong ty minh
 * va doi tac deu phai co mat.
 */
router.get('/assignable', (_req, res) => {
  res.json(
    db
      .prepare(
        `SELECT ct.id, ct.full_name, ct.title, ct.phone, ct.email, ct.zalo, ct.is_me,
                ct.customer_id AS org_id, c.name AS org_name, c.org_kind
           FROM contacts ct JOIN customers c ON c.id = ct.customer_id
          WHERE ct.is_active = 1
          ORDER BY ct.is_me DESC,
                   CASE c.org_kind WHEN 'own' THEN 0 WHEN 'partner' THEN 1
                                   WHEN 'vendor' THEN 2 ELSE 3 END,
                   c.name, ct.is_primary DESC, ct.full_name`
      )
      .all()
  );
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
    // "Toi" la duy nhat trong toan bo so danh ba, khong phai duy nhat trong mot to chuc.
    if (body.is_me) db.prepare(`UPDATE contacts SET is_me = 0`).run();
    db.prepare(
      `UPDATE contacts SET full_name = ?, title = ?, department = ?, phone = ?, email = ?, zalo = ?,
              linkedin = ?, buying_role = ?, relationship = ?, is_primary = ?, is_me = ?,
              is_active = ?, notes = ?
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
      merged.is_me ? 1 : 0,
      merged.is_active ? 1 : 0,
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
