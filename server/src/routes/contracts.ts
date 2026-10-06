import fs from 'node:fs';
import path from 'node:path';
import { Router, type Request } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { accessOf } from '../middleware/currentUser.ts';
import { assertInScope, defaultOwner, pushScope, scopeWhereOrUnowned } from '../lib/scope.ts';
import { HttpError, intParam, parseBody, required } from '../lib/validate.ts';
import { nextPosition } from '../lib/position.ts';
import { buildSearchText, fold } from '../lib/viSearch.ts';
import { CONTRACT_STATUSES } from '../lib/crm.ts';
import { startStage } from '../lib/pipeline.ts';
import {
  assertCrmCustomer,
  assertEntityLinks,
  assertProjectCustomerLink,
} from '../lib/entityRelations.ts';
import { listTasksByLink } from '../services/cardService.ts';
import { createDocument, DOCUMENT_TEMP_DIR } from '../services/documentService.ts';
import { extractContract } from '../services/ai/contractExtract.ts';
import { describeAiError } from '../services/ai/describeError.ts';
import { insertCustomer } from './customers.ts';
import { systemLabel } from '../lib/picklists.ts';

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

/** Chu so huu suy ra cua mot hop dong — dung cho cac route ghi tren mot ban ghi. */
function assertContractInScope(req: Request, id: number, action: 'update' | 'delete'): void {
  const row = required(
    db
      .prepare(
        `SELECT COALESCE(d.owner_contact_id, c.owner_contact_id) AS owner_contact_id
           FROM contracts k
           JOIN customers c ON c.id = k.customer_id
           LEFT JOIN deals d ON d.id = k.deal_id
          WHERE k.id = ?`
      )
      .get(id),
    'Khong tim thay hop dong'
  ) as { owner_contact_id: number | null };
  assertInScope(req, 'contracts', action, row.owner_contact_id, 'Khong tim thay hop dong');
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
  /* Hop dong khong mang cot chu so huu rieng — no suy tu co hoi sinh ra no, hoac
     tu khach hang khi khong gan co hoi nao. COALESCE o menh de WHERE chu khong
     phai o JOIN: `LEFT JOIN deals` phai giu nguyen la LEFT, neu khong hop dong
     khong gan co hoi se bien mat. */
  pushScope(
    where,
    params,
    scopeWhereOrUnowned(
      req,
      'contracts',
      'read',
      'COALESCE(d.owner_contact_id, c.owner_contact_id)'
    )
  );
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

/* ---------- Tai tep hop dong len: AI tu dien form ---------- */

const CONTRACT_FILE_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.txt',
  '.png',
  '.jpg',
  '.jpeg',
]);

const contractUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, DOCUMENT_TEMP_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!CONTRACT_FILE_EXTENSIONS.has(ext))
      return cb(new Error(`Định dạng ${ext || 'không xác định'} không dùng được cho hợp đồng`));
    cb(null, true);
  },
});

/** Co it nhat mot nha cung cap AI da bat va ket noi duoc? Giao dien dung de chon luong AI / nhap tay. */
router.get('/ai-status', (_req, res) => {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM ai_provider_configs WHERE enabled = 1 AND status = 'ready'`)
    .get() as { n: number };
  res.json({ available: row.n > 0 });
});

/**
 * AI doc tep hop dong va TRA DE XUAT — khong ghi gi. Tep chi nam tam trong kho
 * tam de doc roi xoa; nguoi dung duyet form xong moi gui lai tep qua /from-file.
 */
router.post('/extract', contractUpload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, 'Chưa chọn tệp hợp đồng');
  try {
    const where = [`c.org_kind = 'customer'`];
    const params: unknown[] = [];
    pushScope(where, params, scopeWhereOrUnowned(req, 'customers', 'read', 'c.owner_contact_id'));
    const customers = db
      .prepare(`SELECT c.id, c.name, c.tax_code FROM customers c WHERE ${where.join(' AND ')}`)
      .all(...params) as { id: number; name: string; tax_code: string | null }[];
    const ownNames = (
      db.prepare(`SELECT name FROM customers WHERE org_kind = 'own'`).all() as { name: string }[]
    ).map((r) => r.name);
    const today = (db.prepare(`SELECT date('now','localtime') AS d`).get() as { d: string }).d;

    const result = await extractContract(db, {
      filePath: file.path,
      fileName: file.originalname,
      mime: file.mimetype,
      size: file.size,
      customers,
      ownNames,
      today,
    });

    /* Goi y co hoi: dung gia tri hop dong, hoac co hoi mo duy nhat cua khach hang. */
    const customerId = result.customer_match?.id;
    if (customerId) {
      const deals = db
        .prepare(
          `SELECT id, value_vnd FROM deals WHERE customer_id = ? AND stage_category = 'open'
            ORDER BY updated_at DESC`
        )
        .all(customerId) as { id: number; value_vnd: number }[];
      const byValue = result.contract.value_vnd
        ? deals.find((d) => d.value_vnd === result.contract.value_vnd)
        : undefined;
      result.suggested_deal_id = byValue?.id ?? (deals.length === 1 ? deals[0].id : null);
      if (result.contract.number) {
        const dup = db
          .prepare(`SELECT name FROM contracts WHERE customer_id = ? AND number = ? LIMIT 1`)
          .get(customerId, result.contract.number) as { name: string } | undefined;
        if (dup)
          result.warnings.push(
            `Số hợp đồng ${result.contract.number} đã có trong hệ thống (“${dup.name}”) — kiểm tra trùng.`
          );
      }
    }
    res.json(result);
  } catch (error) {
    throw describeAiError(error) ?? error;
  } finally {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  }
});

const fromFileSchema = z.object({
  contract: contractSchema.omit({ customer_id: true }).extend({
    customer_id: z.number().int().nullable().optional(),
  }),
  /** Khach hang chua co trong so — tao cung luc voi hop dong. */
  new_customer: z
    .object({
      name: z.string().trim().min(1, 'Tên khách hàng không được để trống'),
      tax_code: z.string().nullable().optional(),
      address: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  /** Nguoi dai dien ky hop dong — tao thanh nguoi lien he chinh cua khach hang moi. */
  new_contact: z
    .object({
      full_name: z.string().trim().min(1),
      title: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

/**
 * Tao hop dong + (tuy chon) khach hang moi + dinh kem chinh tep do vao Tai lieu.
 * Khach hang va hop dong cung mot transaction: hop dong loi thi khong de lai khach
 * hang "mo coi". Tep dinh kem la buoc sau — loi o do khong huy hop dong, chi bao lai.
 */
router.post('/from-file', contractUpload.single('file'), (req, res) => {
  /* Tep la tuy chon: nguoi dung co the bo tep sau khi AI da doc, hoac chi muon tao khach hang moi. */
  const file = req.file;
  let created: { contractId: number; customerId: number; customerCreated: boolean };
  try {
    let raw: unknown;
    try {
      raw = JSON.parse(String((req.body as { payload?: string }).payload ?? ''));
    } catch {
      throw new HttpError(400, 'Dữ liệu hợp đồng không hợp lệ');
    }
    const parsed = fromFileSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new HttpError(400, `Du lieu khong hop le: ${first.path.join('.')} — ${first.message}`);
    }
    const body = parsed.data;
    if (body.new_customer && !accessOf(req).can('customers', 'create')) {
      throw new HttpError(403, 'Bạn không có quyền tạo khách hàng mới');
    }
    if (!body.new_customer && !body.contract.customer_id) {
      throw new HttpError(400, 'Chọn khách hàng hoặc tạo khách hàng mới cho hợp đồng');
    }

    created = db.transaction(() => {
      let customerId = body.contract.customer_id ?? 0;
      let customerCreated = false;
      if (body.new_customer) {
        const customer = insertCustomer(
          {
            ...body.new_customer,
            status: 'customer',
            source: systemLabel(db, 'customer_source', 'contract', 'Hợp đồng'),
          },
          defaultOwner(req)
        );
        customerId = customer.id;
        customerCreated = true;
        if (body.new_contact) {
          db.prepare(
            `INSERT INTO contacts (customer_id, full_name, title, is_primary, is_active, notes)
             VALUES (?, ?, ?, 1, 1, 'Người đại diện ký hợp đồng')`
          ).run(customerId, body.new_contact.full_name, body.new_contact.title ?? null);
        }
      }
      const contract = { ...body.contract, customer_id: customerId };
      assertEntityLinks(db, contract);
      assertCrmCustomer(db, customerId);
      assertProjectCustomerLink(db, contract, 'Hợp đồng');
      assertContractDates(contract);
      const info = db
        .prepare(
          `INSERT INTO contracts (customer_id, deal_id, name, number, value_vnd, sign_date, start_date,
                                  end_date, status, payment_terms, notes, project_id, search_text)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          customerId,
          contract.deal_id ?? null,
          contract.name,
          contract.number ?? null,
          contract.value_vnd ?? 0,
          contract.sign_date ?? null,
          contract.start_date ?? null,
          contract.end_date ?? null,
          contract.status ?? 'draft',
          contract.payment_terms ?? null,
          contract.notes ?? '',
          contract.project_id ?? null,
          buildSearchText(contract.name, contract.number, contract.notes)
        );
      return { contractId: Number(info.lastInsertRowid), customerId, customerCreated };
    })();
  } catch (error) {
    // Giao dich loi thi tep van nam o kho tam — don di, tranh rac tich luy.
    if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    throw error;
  }

  let documentError: string | null = null;
  if (file) {
    try {
      const row = db
        .prepare(`SELECT name, deal_id FROM contracts WHERE id = ?`)
        .get(created.contractId) as { name: string; deal_id: number | null };
      createDocument(file, {
        name: row.name,
        doc_type: 'contract',
        customer_id: created.customerId,
        contract_id: created.contractId,
        deal_id: row.deal_id,
      });
    } catch (error) {
      documentError = error instanceof Error ? error.message : 'Không đính kèm được tệp';
    }
  }
  res.status(201).json({
    ...(reload(created.contractId) as Record<string, unknown>),
    customer_created: created.customerCreated,
    document_error: documentError,
  });
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
  assertContractInScope(req, id, 'update');
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

  const start = startStage(db);
  const dealId = db.transaction(() => {
    const position = nextPosition({ table: 'deals', scopeCol: 'stage', scopeVal: start.key });
    const title = `Gia hạn: ${contract.name}`;
    const info = db
      .prepare(
        `INSERT INTO deals (customer_id, contact_id, title, product, stage, probability, value_vnd,
                            position, expected_close_date, source, is_renewal, notes, search_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(
        contract.customer_id,
        source?.contact_id ?? null,
        title,
        source?.product ?? null,
        start.key,
        start.probability,
        contract.value_vnd,
        position,
        contract.end_date,
        systemLabel(db, 'deal_source', 'renewal', 'Gia hạn hợp đồng'),
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
  assertContractInScope(req, id, 'delete');
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
