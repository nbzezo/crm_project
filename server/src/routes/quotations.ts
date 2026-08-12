import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { intParam, parseBody, required } from '../lib/validate.ts';
import { QUOTATION_STATUSES } from '../lib/crm.ts';
import { assertEntityLinks } from '../lib/entityRelations.ts';

const router = Router();

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

const quotationSchema = z.object({
  customer_id: z.number().int(),
  deal_id: z.number().int().nullable().optional(),
  code: z.string().nullable().optional(),
  version: z.number().int().min(1).optional(),
  quote_date: dateOnly.optional(),
  value_vnd: z.number().int().min(0).optional(),
  valid_until: dateOnly.optional(),
  status: z.enum(QUOTATION_STATUSES).optional(),
  notes: z.string().optional(),
});

const QUOTATION_SELECT = `
  SELECT q.*, c.name AS customer_name, d.title AS deal_title,
         CASE WHEN q.valid_until IS NULL THEN 0
              WHEN q.valid_until < date('now','localtime') THEN 1 ELSE 0 END AS is_expired,
         (SELECT COUNT(*) FROM documents dc WHERE dc.quotation_id = q.id AND dc.deleted_at IS NULL) AS document_count
    FROM quotations q
    JOIN customers c ON c.id = q.customer_id
    LEFT JOIN deals d ON d.id = q.deal_id`;

function reload(id: number) {
  return db.prepare(`${QUOTATION_SELECT} WHERE q.id = ?`).get(id);
}

router.get('/', (req, res) => {
  const where: string[] = [];
  const params: unknown[] = [];
  if (req.query.customer_id) {
    where.push('q.customer_id = ?');
    params.push(Number(req.query.customer_id));
  }
  if (req.query.deal_id) {
    where.push('q.deal_id = ?');
    params.push(Number(req.query.deal_id));
  }
  if (req.query.status) {
    where.push('q.status = ?');
    params.push(String(req.query.status));
  }
  res.json(
    db
      .prepare(
        `${QUOTATION_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
          ORDER BY q.quote_date IS NULL, q.quote_date DESC, q.version DESC`
      )
      .all(...params)
  );
});

router.post('/', (req, res) => {
  const body = parseBody(quotationSchema, req);
  assertEntityLinks(db, body);

  // FR-QUO-04: bao gia moi cua cung co hoi tu tang phien ban
  const version =
    body.version ??
    (body.deal_id
      ? ((
          db
            .prepare(`SELECT MAX(version) AS v FROM quotations WHERE deal_id = ?`)
            .get(body.deal_id) as {
            v: number | null;
          }
        ).v ?? 0) + 1
      : 1);

  const info = db
    .prepare(
      `INSERT INTO quotations (customer_id, deal_id, code, version, quote_date, value_vnd,
                               valid_until, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      body.customer_id,
      body.deal_id ?? null,
      body.code ?? null,
      version,
      body.quote_date ?? null,
      body.value_vnd ?? 0,
      body.valid_until ?? null,
      body.status ?? 'draft',
      body.notes ?? ''
    );
  res.status(201).json(reload(Number(info.lastInsertRowid)));
});

router.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(quotationSchema.partial(), req);
  const current = required(
    db.prepare(`SELECT * FROM quotations WHERE id = ?`).get(id),
    'Khong tim thay bao gia'
  ) as Record<string, unknown>;
  const merged = { ...current, ...body };
  assertEntityLinks(db, {
    customer_id: merged.customer_id as number,
    deal_id: merged.deal_id as number | null,
  });

  db.prepare(
    `UPDATE quotations SET deal_id = ?, code = ?, version = ?, quote_date = ?, value_vnd = ?,
            valid_until = ?, status = ?, notes = ?, updated_at = datetime('now','localtime')
      WHERE id = ?`
  ).run(
    merged.deal_id ?? null,
    merged.code ?? null,
    merged.version ?? 1,
    merged.quote_date ?? null,
    merged.value_vnd ?? 0,
    merged.valid_until ?? null,
    merged.status ?? 'draft',
    merged.notes ?? '',
    id
  );
  res.json(reload(id));
});

router.delete('/:id', (req, res) => {
  const id = intParam(req.params.id);
  db.prepare(`DELETE FROM quotations WHERE id = ?`).run(id);
  res.json({ ok: true });
});

export default router;
