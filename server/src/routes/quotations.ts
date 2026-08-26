import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { HttpError, intParam, parseBody, required } from '../lib/validate.ts';
import { QUOTATION_STATUSES } from '../lib/crm.ts';
import { assertCrmCustomer, assertEntityLinks } from '../lib/entityRelations.ts';

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

function assertQuotationDates(value: Record<string, unknown>): void {
  const issued = value.quote_date as string | null | undefined;
  const validUntil = value.valid_until as string | null | undefined;
  if (issued && validUntil && validUntil < issued) {
    throw new HttpError(422, 'Ngày hết hiệu lực báo giá không được trước ngày báo giá', {
      code: 'INVALID_DATE_RANGE',
    });
  }
}

const QUOTATION_SELECT = `
  SELECT q.*, c.name AS customer_name, d.title AS deal_title,
         CASE WHEN q.valid_until IS NULL THEN 0
              WHEN q.valid_until < date('now','localtime') THEN 1 ELSE 0 END AS is_expired,
         (SELECT COUNT(*) FROM documents dc WHERE dc.quotation_id = q.id AND dc.deleted_at IS NULL) AS document_count
    FROM quotations q
    JOIN customers c ON c.id = q.customer_id AND c.org_kind = 'customer'
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
  assertCrmCustomer(db, body.customer_id);
  assertQuotationDates(body);

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
  assertCrmCustomer(db, merged.customer_id as number);
  assertQuotationDates(merged);

  /*
   * FR-QUO-04 (xem POST /): version tu tang THEO CO HOI. Doi deal_id ma khong tinh
   * lai thi bao gia se mang nguyen version cua co hoi CU sang co hoi MOI, co the
   * trung voi mot bao gia da co san o do. Chi tinh lai khi deal_id thuc su doi va
   * client khong tu gui version tuong minh — dung logic voi POST.
   */
  if (
    body.deal_id !== undefined &&
    body.deal_id !== current.deal_id &&
    body.version === undefined
  ) {
    const max = db
      .prepare(`SELECT MAX(version) AS v FROM quotations WHERE deal_id = ?`)
      .get(body.deal_id) as { v: number | null };
    merged.version = (max.v ?? 0) + 1;
  }

  db.prepare(
    `UPDATE quotations SET customer_id = ?, deal_id = ?, code = ?, version = ?, quote_date = ?, value_vnd = ?,
            valid_until = ?, status = ?, notes = ?, updated_at = datetime('now','localtime')
      WHERE id = ?`
  ).run(
    merged.customer_id,
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
