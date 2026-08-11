import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { HttpError, intParam, parseBody, required } from '../lib/validate.ts';
import { buildSearchText, fold } from '../lib/viSearch.ts';

const router = Router();

const serviceSchema = z.object({
  name: z.string().trim().min(1, 'Ten dich vu khong duoc de trong'),
  code: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  default_price_vnd: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
  notes: z.string().optional(),
});

/** Kem so dong dich vu dang gan va so khach hang dang dung. */
const SERVICE_SELECT = `
  SELECT s.*,
         (SELECT COUNT(*) FROM customer_services cs WHERE cs.service_id = s.id) AS line_count,
         (SELECT COUNT(DISTINCT cs.customer_id) FROM customer_services cs
           WHERE cs.service_id = s.id AND cs.status = 'using') AS customer_count
    FROM services s`;

function reload(id: number) {
  return db.prepare(`${SERVICE_SELECT} WHERE s.id = ?`).get(id);
}

router.get('/', (req, res) => {
  const where: string[] = [];
  const params: unknown[] = [];
  const q = fold(String(req.query.q ?? '').trim());
  if (q) {
    where.push(`s.search_text LIKE '%' || ? || '%'`);
    params.push(q);
  }
  if (req.query.active === '1') where.push('s.is_active = 1');
  res.json(
    db
      .prepare(
        `${SERVICE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
          ORDER BY s.is_active DESC, s.position, s.name COLLATE NOCASE`
      )
      .all(...params)
  );
});

router.post('/', (req, res) => {
  const body = parseBody(serviceSchema, req);
  const duplicate = db
    .prepare(`SELECT id FROM services WHERE name = ? COLLATE NOCASE`)
    .get(body.name);
  if (duplicate) throw new HttpError(400, 'Dich vu nay da co trong danh muc');

  const max = db.prepare(`SELECT MAX(position) AS maxPos FROM services`).get() as {
    maxPos: number | null;
  };
  const info = db
    .prepare(
      `INSERT INTO services (name, code, category, unit, default_price_vnd, is_active, notes,
                             position, search_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      body.name,
      body.code ?? null,
      body.category ?? null,
      body.unit ?? null,
      body.default_price_vnd ?? 0,
      body.is_active === false ? 0 : 1,
      body.notes ?? '',
      (max.maxPos ?? 0) + 1024,
      buildSearchText(body.name, body.code, body.category, body.notes)
    );
  res.status(201).json(reload(Number(info.lastInsertRowid)));
});

router.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(serviceSchema.partial(), req);
  const current = required(
    db.prepare(`SELECT * FROM services WHERE id = ?`).get(id),
    'Khong tim thay dich vu'
  ) as Record<string, unknown>;
  const merged = { ...current, ...body };

  if (body.name) {
    const duplicate = db
      .prepare(`SELECT id FROM services WHERE name = ? COLLATE NOCASE AND id <> ?`)
      .get(body.name, id);
    if (duplicate) throw new HttpError(400, 'Dich vu nay da co trong danh muc');
  }

  db.prepare(
    `UPDATE services SET name = ?, code = ?, category = ?, unit = ?, default_price_vnd = ?,
            is_active = ?, notes = ?, search_text = ?, updated_at = datetime('now','localtime')
      WHERE id = ?`
  ).run(
    merged.name,
    merged.code ?? null,
    merged.category ?? null,
    merged.unit ?? null,
    merged.default_price_vnd ?? 0,
    body.is_active === undefined ? (current.is_active as number) : body.is_active ? 1 : 0,
    merged.notes ?? '',
    buildSearchText(
      merged.name as string,
      merged.code as string,
      merged.category as string,
      merged.notes as string
    ),
    id
  );
  res.json(reload(id));
});

/** Khong xoa dich vu con duoc su dung — de tranh mat dau vet doanh thu da nhap. */
router.delete('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const used = db
    .prepare(`SELECT COUNT(*) AS n FROM customer_services WHERE service_id = ?`)
    .get(id) as { n: number };
  if (used.n > 0)
    throw new HttpError(
      400,
      `Dich vu dang duoc dung o ${used.n} dong doanh thu — hay ngung kich hoat thay vi xoa`
    );
  db.prepare(`DELETE FROM services WHERE id = ?`).run(id);
  res.json({ ok: true });
});

export default router;
