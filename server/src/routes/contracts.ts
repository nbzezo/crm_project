import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { HttpError, intParam, parseBody, required } from '../lib/validate.ts';
import { nextPosition } from '../lib/position.ts';
import { buildSearchText, fold } from '../lib/viSearch.ts';
import { CONTRACT_STATUSES, STAGE_PROBABILITY } from '../lib/crm.ts';
import {
  assertCrmCustomer,
  assertEntityLinks,
  assertProjectCustomerLink,
} from '../lib/entityRelations.ts';
import { listTasksByLink } from '../services/cardService.ts';

const router = Router();

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

const contractSchema = z.object({
  customer_id: z.number().int(),
  deal_id: z.number().int().nullable().optional(),
  name: z.string().trim().min(1, 'Ten hop dong khong duoc de trong'),
  number: z.string().nullable().optional(),
  value_vnd: z.number().int().min(0).optional(),
  sign_date: dateOnly.optional(),
  start_date: dateOnly.optional(),
  end_date: dateOnly.optional(),
  status: z.enum(CONTRACT_STATUSES).optional(),
  payment_terms: z.string().nullable().optional(),
  renewal_followed: z.boolean().optional(),
  notes: z.string().optional(),
  /**
   * Du an trien khai ma hop dong nay tai tro (v27).
   *
   * Cot co tu v17 nhung chua bao gio co duong ghi — dung loai cot chet ma v23 vua
   * go cho `deals.project_id`. Hau qua truoc do: o "Gia tri hop dong da ky" cua
   * moi du an luon bang 0, va nguong phan loai A/B theo gia tri hop dong khong
   * bao gio dung toi duoc.
   */
  project_id: z.number().int().positive().nullable().optional(),
});

function assertContractDates(value: Record<string, unknown>): void {
  const start = value.start_date as string | null | undefined;
  const end = value.end_date as string | null | undefined;
  if (start && end && end < start) {
    throw new HttpError(422, 'Ngày kết thúc hợp đồng không được trước ngày bắt đầu', {
      code: 'INVALID_DATE_RANGE',
      start_field: 'start_date',
      end_field: 'end_date',
    });
  }
}

/** days_left < 0 la da qua han; <= 90 va con Active la thuoc danh sach gia han (BR-08). */
const CONTRACT_SELECT = `
  SELECT k.*, c.name AS customer_name, d.title AS deal_title, pj.name AS project_name,
         CASE WHEN k.end_date IS NULL THEN NULL
              ELSE CAST(julianday(k.end_date) - julianday(date('now','localtime')) AS INTEGER)
         END AS days_left,
         (SELECT COUNT(*) FROM documents dc WHERE dc.contract_id = k.id AND dc.deleted_at IS NULL) AS document_count
    FROM contracts k
    JOIN customers c ON c.id = k.customer_id AND c.org_kind = 'customer'
    LEFT JOIN deals d ON d.id = k.deal_id
    LEFT JOIN projects pj ON pj.id = k.project_id`;

function reload(id: number) {
  return db.prepare(`${CONTRACT_SELECT} WHERE k.id = ?`).get(id);
}

router.get('/', (req, res) => {
  const where: string[] = [];
  const params: unknown[] = [];
  const q = fold(String(req.query.q ?? '').trim());
  if (q) {
    where.push(`(k.search_text LIKE '%' || ? || '%' OR c.search_text LIKE '%' || ? || '%')`);
    params.push(q, q);
  }
  if (req.query.status) {
    where.push('k.status = ?');
    params.push(String(req.query.status));
  }
  if (req.query.customer_id) {
    where.push('k.customer_id = ?');
    params.push(Number(req.query.customer_id));
  }
  res.json(
    db
      .prepare(
        `${CONTRACT_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
          ORDER BY k.end_date IS NULL, k.end_date`
      )
      .all(...params)
  );
});

/** FR-REN-01: hop dong Active sap het han trong so ngay chi dinh (mac dinh 90). */
router.get('/expiring', (req, res) => {
  const within = Number(req.query.within ?? 90);
  res.json(
    db
      .prepare(
        `${CONTRACT_SELECT}
          WHERE k.status = 'active' AND k.end_date IS NOT NULL
            AND julianday(k.end_date) - julianday(date('now','localtime')) <= ?
          ORDER BY k.end_date`
      )
      .all(within)
  );
});

router.post('/', (req, res) => {
  const body = parseBody(contractSchema, req);
  assertEntityLinks(db, body);
  assertCrmCustomer(db, body.customer_id);
  assertProjectCustomerLink(db, body, 'Hợp đồng');
  assertContractDates(body);
  const info = db
    .prepare(
      `INSERT INTO contracts (customer_id, deal_id, name, number, value_vnd, sign_date, start_date,
                              end_date, status, payment_terms, notes, project_id, search_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      body.customer_id,
      body.deal_id ?? null,
      body.name,
      body.number ?? null,
      body.value_vnd ?? 0,
      body.sign_date ?? null,
      body.start_date ?? null,
      body.end_date ?? null,
      body.status ?? 'draft',
      body.payment_terms ?? null,
      body.notes ?? '',
      body.project_id ?? null,
      buildSearchText(body.name, body.number, body.notes)
    );
  res.status(201).json(reload(Number(info.lastInsertRowid)));
});

router.get('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const contract = required(reload(id), 'Khong tim thay hop dong') as Record<string, unknown>;
  const documents = db
    .prepare(
      `SELECT * FROM documents WHERE contract_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`
    )
    .all(id);
  res.json({ ...contract, documents, tasks: listTasksByLink('contract_id', id) });
});

router.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(contractSchema.partial(), req);
  const current = required(
    db.prepare(`SELECT * FROM contracts WHERE id = ?`).get(id),
    'Khong tim thay hop dong'
  ) as Record<string, unknown>;
  const merged = { ...current, ...body };
  assertEntityLinks(db, {
    customer_id: merged.customer_id as number,
    deal_id: merged.deal_id as number | null,
  });
  /*
   * assertEntityLinks chi doi chieu cac lien ket TREN hop dong (deal/du an). Chieu
   * nguoc lai — cac dong doanh thu (customer_services) dang tro contract_id ve day
   * — khong duoc PATCH /api/revenues/lines/:id doi chieu (no chi kiem luc SUA dong
   * doanh thu). Thieu ve nay thi doi khach hang hop dong se lam dong doanh thu va
   * hop dong no tro toi lech khach hang ma khong loi nao bao.
   */
  if (merged.customer_id !== current.customer_id) {
    const mismatch = db
      .prepare(`SELECT id FROM customer_services WHERE contract_id = ? AND customer_id <> ?`)
      .get(id, merged.customer_id) as { id: number } | undefined;
    if (mismatch) {
      throw new HttpError(
        422,
        'Không thể đổi khách hàng: đang có dòng doanh thu gắn hợp đồng này thuộc khách hàng khác',
        { code: 'CROSS_CUSTOMER_LINK' }
      );
    }
  }
  assertCrmCustomer(db, merged.customer_id as number);
  assertProjectCustomerLink(
    db,
    {
      project_id: merged.project_id as number | null,
      customer_id: merged.customer_id as number,
    },
    'Hợp đồng'
  );
  assertContractDates(merged);

  db.prepare(
    `UPDATE contracts SET customer_id = ?, deal_id = ?, name = ?, number = ?, value_vnd = ?,
            sign_date = ?, start_date = ?, end_date = ?, status = ?, payment_terms = ?,
            renewal_followed = ?, notes = ?, project_id = ?, search_text = ?,
            updated_at = datetime('now','localtime')
      WHERE id = ?`
  ).run(
    merged.customer_id,
    merged.deal_id ?? null,
    merged.name,
    merged.number ?? null,
    merged.value_vnd ?? 0,
    merged.sign_date ?? null,
    merged.start_date ?? null,
    merged.end_date ?? null,
    merged.status ?? 'draft',
    merged.payment_terms ?? null,
    body.renewal_followed !== undefined
      ? body.renewal_followed
        ? 1
        : 0
      : (current.renewal_followed as number),
    merged.notes ?? '',
    merged.project_id ?? null,
    buildSearchText(merged.name as string, merged.number as string, merged.notes as string),
    id
  );
  res.json(reload(id));
});

/** FR-REN-02: tao co hoi gia han tu hop dong, tu dong keo du lieu cu sang. */
router.post('/:id/renew', (req, res) => {
  const id = intParam(req.params.id);
  const contract = required(
    db.prepare(`SELECT * FROM contracts WHERE id = ?`).get(id),
    'Khong tim thay hop dong'
  ) as Record<string, unknown>;

  const source = contract.deal_id
    ? (db.prepare(`SELECT * FROM deals WHERE id = ?`).get(contract.deal_id) as Record<
        string,
        unknown
      > | null)
    : null;

  const dealId = db.transaction(() => {
    const position = nextPosition({ table: 'deals', scopeCol: 'stage', scopeVal: 'lead' });
    const title = `Gia hạn: ${contract.name}`;
    const info = db
      .prepare(
        `INSERT INTO deals (customer_id, contact_id, title, product, stage, probability, value_vnd,
                            position, expected_close_date, source, is_renewal, notes, search_text)
         VALUES (?, ?, ?, ?, 'lead', ?, ?, ?, ?, 'Gia hạn hợp đồng', 1, ?, ?)`
      )
      .run(
        contract.customer_id,
        source?.contact_id ?? null,
        title,
        source?.product ?? null,
        STAGE_PROBABILITY.lead,
        contract.value_vnd,
        position,
        contract.end_date,
        `Tạo từ hợp đồng ${contract.number ?? contract.name} (hết hạn ${contract.end_date ?? '—'}).`,
        buildSearchText(title)
      );
    db.prepare(`UPDATE contracts SET renewal_followed = 1 WHERE id = ?`).run(id);
    return Number(info.lastInsertRowid);
  })();

  res.status(201).json(db.prepare(`SELECT * FROM deals WHERE id = ?`).get(dealId));
});

/** Khong xoa hop dong con dong doanh thu gan vao, giong guard cua DELETE /api/services/:id. */
router.delete('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const used = db
    .prepare(`SELECT COUNT(*) AS n FROM customer_services WHERE contract_id = ?`)
    .get(id) as { n: number };
  if (used.n > 0) {
    throw new HttpError(
      400,
      `Hợp đồng đang được ${used.n} dòng doanh thu tham chiếu — hãy gỡ liên kết doanh thu trước khi xóa`,
      { code: 'CONTRACT_IN_USE' }
    );
  }
  db.prepare(`DELETE FROM contracts WHERE id = ?`).run(id);
  res.json({ ok: true });
});

export default router;
