import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db, FILES_DIR } from '../db/connection.ts';
import { HttpError, intParam, parseBody, required } from '../lib/validate.ts';
import { buildSearchText, fold } from '../lib/viSearch.ts';
import { DOC_TYPES } from '../lib/crm.ts';
import { assertEntityLinks } from '../lib/entityRelations.ts';
import { unverifyBySource } from '../lib/scoring.ts';
import {
  createDocument,
  permanentlyDeleteDocument,
  DOCUMENT_TEMP_DIR,
} from '../services/documentService.ts';
import { sendDocumentsZip, type ZipDocument } from '../services/zipService.ts';
import { indexDocument } from '../services/ai/documentIndex.ts';

const router = Router();

/** Danh sach nay la nguon su that dung chung voi thuoc tinh accept o giao dien. */
export const DOCUMENT_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.png',
  '.jpg',
  '.jpeg',
  '.txt',
  '.csv',
  '.zip',
] as const;
const ALLOWED = new Set<string>(DOCUMENT_EXTENSIONS);

const upload = multer({
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
    if (!ALLOWED.has(ext))
      return cb(new Error(`Định dạng ${ext || 'không xác định'} không được hỗ trợ`));
    cb(null, true);
  },
});

const DOC_SELECT = `
  SELECT dc.*, c.name AS customer_name, d.title AS deal_title, k.name AS contract_name,
         q.code AS quotation_code, ct.full_name AS contact_name
    FROM documents dc
    LEFT JOIN customers c ON c.id = dc.customer_id
    LEFT JOIN deals d ON d.id = dc.deal_id
    LEFT JOIN contracts k ON k.id = dc.contract_id
    LEFT JOIN quotations q ON q.id = dc.quotation_id
    LEFT JOIN contacts ct ON ct.id = dc.contact_id`;

const LINK_COLUMNS = [
  'customer_id',
  'contact_id',
  'deal_id',
  'contract_id',
  'quotation_id',
  'card_id',
] as const;

const emptyDateToNull = z.preprocess(
  (value) => (value === '' || value === undefined ? undefined : value),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
);

const metadataSchema = z.object({
  name: z.string().trim().min(1).optional(),
  doc_type: z.enum(DOC_TYPES).optional(),
  description: z.string().max(5000).optional(),
  tags: z.string().max(1000).optional(),
  owner: z.string().trim().max(200).nullable().optional(),
  effective_date: emptyDateToNull,
  expires_at: emptyDateToNull,
  confidentiality: z.enum(['public', 'internal', 'confidential']).optional(),
  customer_id: z.coerce.number().int().nullable().optional(),
  contact_id: z.coerce.number().int().nullable().optional(),
  deal_id: z.coerce.number().int().nullable().optional(),
  contract_id: z.coerce.number().int().nullable().optional(),
  quotation_id: z.coerce.number().int().nullable().optional(),
  card_id: z.coerce.number().int().nullable().optional(),
});

const idsSchema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(200) });

function reload(id: number) {
  return db.prepare(`${DOC_SELECT} WHERE dc.id = ?`).get(id);
}

function placeholders(ids: number[]): string {
  return ids.map(() => '?').join(',');
}

router.get('/', (req, res) => {
  const where: string[] = [
    req.query.trash === '1' ? 'dc.deleted_at IS NOT NULL' : 'dc.deleted_at IS NULL',
  ];
  const params: unknown[] = [];
  const q = fold(String(req.query.q ?? '').trim());
  if (q) {
    where.push(`dc.search_text LIKE '%' || ? || '%'`);
    params.push(q);
  }
  for (const key of [...LINK_COLUMNS, 'doc_type', 'confidentiality'] as string[]) {
    if (req.query[key]) {
      where.push(`dc.${key} = ?`);
      params.push(
        key === 'doc_type' || key === 'confidentiality'
          ? String(req.query[key])
          : Number(req.query[key])
      );
    }
  }
  res.json(
    db
      .prepare(
        `${DOC_SELECT} WHERE ${where.join(' AND ')} ORDER BY COALESCE(dc.deleted_at, dc.created_at) DESC`
      )
      .all(...params)
  );
});

router.get('/download.zip', (req, res) => {
  const ids = String(req.query.ids ?? '')
    .split(',')
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, 200);
  if (ids.length === 0) throw new HttpError(400, 'Chưa chọn tài liệu để tải');
  const documents = db
    .prepare(
      `SELECT file_name, stored_name FROM documents WHERE deleted_at IS NULL AND id IN (${placeholders(ids)}) ORDER BY id`
    )
    .all(...ids) as ZipDocument[];
  if (documents.length === 0) throw new HttpError(404, 'Không tìm thấy tài liệu có thể tải');
  sendDocumentsZip(res, documents);
});

router.post('/', upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, 'Chưa chọn tệp để tải lên');
  const body = parseBody(metadataSchema, req);
  const id = createDocument(file, body);
  res.status(201).json(reload(id));
});

router.patch('/bulk', (req, res) => {
  const body = parseBody(idsSchema.and(metadataSchema.partial()), req);
  const { ids, ...patch } = body;
  const rows = db
    .prepare(`SELECT * FROM documents WHERE deleted_at IS NULL AND id IN (${placeholders(ids)})`)
    .all(...ids) as Record<string, unknown>[];
  if (rows.length !== ids.length)
    throw new HttpError(404, 'Một hoặc nhiều tài liệu không còn tồn tại');

  db.transaction(() => {
    for (const current of rows) {
      const merged = { ...current, ...patch } as Record<string, unknown>;
      assertEntityLinks(db, {
        customer_id: merged.customer_id as number | null,
        contact_id: merged.contact_id as number | null,
        deal_id: merged.deal_id as number | null,
        contract_id: merged.contract_id as number | null,
        quotation_id: merged.quotation_id as number | null,
        card_id: merged.card_id as number | null,
      });
      db.prepare(
        `UPDATE documents SET name = ?, doc_type = ?, customer_id = ?, contact_id = ?, deal_id = ?,
                contract_id = ?, quotation_id = ?, card_id = ?, description = ?, tags = ?, owner = ?,
                effective_date = ?, expires_at = ?, confidentiality = ?, search_text = ?,
                updated_at = datetime('now','localtime') WHERE id = ?`
      ).run(
        merged.name,
        merged.doc_type,
        merged.customer_id ?? null,
        merged.contact_id ?? null,
        merged.deal_id ?? null,
        merged.contract_id ?? null,
        merged.quotation_id ?? null,
        merged.card_id ?? null,
        merged.description ?? '',
        merged.tags ?? '',
        merged.owner ?? null,
        merged.effective_date ?? null,
        merged.expires_at ?? null,
        merged.confidentiality ?? 'internal',
        buildSearchText(
          merged.name as string,
          merged.file_name as string,
          merged.description as string,
          merged.tags as string,
          merged.owner as string | null
        ),
        merged.id
      );
    }
  })();
  res.json({ updated: rows.length });
});

router.post('/bulk/trash', (req, res) => {
  const { ids } = parseBody(idsSchema, req);
  const result = db.transaction(() => {
    const updated = db
      .prepare(
        `UPDATE documents SET deleted_at = datetime('now','localtime'), updated_at = datetime('now','localtime') WHERE deleted_at IS NULL AND id IN (${placeholders(ids)})`
      )
      .run(...ids);
    for (const id of ids) unverifyBySource(db, 'document', id);
    return updated;
  })();
  res.json({ trashed: result.changes });
});

router.post('/bulk/restore', (req, res) => {
  const { ids } = parseBody(idsSchema, req);
  const result = db
    .prepare(
      `UPDATE documents SET deleted_at = NULL, updated_at = datetime('now','localtime') WHERE deleted_at IS NOT NULL AND id IN (${placeholders(ids)})`
    )
    .run(...ids);
  res.json({ restored: result.changes });
});

router.get('/:id/download', (req, res) => {
  const id = intParam(req.params.id);
  const doc = required(
    db.prepare(`SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL`).get(id),
    'Không tìm thấy tài liệu'
  ) as { stored_name: string; file_name: string };
  const filePath = path.join(FILES_DIR, doc.stored_name);
  if (!fs.existsSync(filePath)) throw new HttpError(404, 'Tệp không còn trên ổ đĩa');
  res.download(filePath, doc.file_name);
});

router.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(metadataSchema.partial(), req);
  const current = required(
    db.prepare(`SELECT * FROM documents WHERE id = ?`).get(id),
    'Không tìm thấy tài liệu'
  ) as Record<string, unknown>;
  const merged = { ...current, ...body } as Record<string, unknown>;
  assertEntityLinks(db, {
    customer_id: merged.customer_id as number | null,
    contact_id: merged.contact_id as number | null,
    deal_id: merged.deal_id as number | null,
    contract_id: merged.contract_id as number | null,
    quotation_id: merged.quotation_id as number | null,
    card_id: merged.card_id as number | null,
  });
  db.prepare(
    `UPDATE documents SET name = ?, doc_type = ?, customer_id = ?, contact_id = ?, deal_id = ?,
            contract_id = ?, quotation_id = ?, card_id = ?, description = ?, tags = ?, owner = ?,
            effective_date = ?, expires_at = ?, confidentiality = ?, search_text = ?,
            updated_at = datetime('now','localtime') WHERE id = ?`
  ).run(
    merged.name,
    merged.doc_type,
    merged.customer_id ?? null,
    merged.contact_id ?? null,
    merged.deal_id ?? null,
    merged.contract_id ?? null,
    merged.quotation_id ?? null,
    merged.card_id ?? null,
    merged.description ?? '',
    merged.tags ?? '',
    merged.owner ?? null,
    merged.effective_date ?? null,
    merged.expires_at ?? null,
    merged.confidentiality ?? 'internal',
    buildSearchText(
      merged.name as string,
      merged.file_name as string,
      merged.description as string,
      merged.tags as string,
      merged.owner as string | null
    ),
    id
  );
  // Lap chi muc chay nen: doc PDF/DOCX ton thoi gian va khong duoc lam cham phan hoi.
  void indexDocument(db, id).catch((error: unknown) =>
    console.warn('[ai-index] Khong cap nhat duoc chi muc tai lieu:', error)
  );
  res.json(reload(id));
});

router.post('/:id/restore', (req, res) => {
  const id = intParam(req.params.id);
  const result = db
    .prepare(
      `UPDATE documents SET deleted_at = NULL, updated_at = datetime('now','localtime') WHERE id = ? AND deleted_at IS NOT NULL`
    )
    .run(id);
  if (result.changes === 0) throw new HttpError(404, 'Không tìm thấy tài liệu trong thùng rác');
  void indexDocument(db, id).catch((error: unknown) =>
    console.warn('[ai-index] Khong khoi phuc duoc chi muc tai lieu:', error)
  );
  res.json(reload(id));
});

router.delete('/:id/permanent', (req, res) => {
  const id = intParam(req.params.id);
  required(
    db.prepare(`SELECT id FROM documents WHERE id = ? AND deleted_at IS NOT NULL`).get(id),
    'Chỉ tài liệu trong thùng rác mới được xóa vĩnh viễn'
  );
  permanentlyDeleteDocument(id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const result = db.transaction(() => {
    const updated = db
      .prepare(
        `UPDATE documents SET deleted_at = datetime('now','localtime'), updated_at = datetime('now','localtime') WHERE id = ? AND deleted_at IS NULL`
      )
      .run(id);
    if (updated.changes > 0) unverifyBySource(db, 'document', id);
    return updated;
  })();
  if (result.changes === 0) throw new HttpError(404, 'Không tìm thấy tài liệu');
  res.json({ ok: true });
});

export default router;
