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
import { createDocument, deleteDocument, DOCUMENT_TEMP_DIR } from '../services/documentService.ts';

const router = Router();

const ALLOWED = new Set([
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
]);

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
    if (!ALLOWED.has(ext)) return cb(new Error(`Định dạng ${ext} không được hỗ trợ`));
    cb(null, true);
  },
});

const DOC_SELECT = `
  SELECT dc.*, c.name AS customer_name, d.title AS deal_title, k.name AS contract_name,
         ct.full_name AS contact_name
    FROM documents dc
    LEFT JOIN customers c ON c.id = dc.customer_id
    LEFT JOIN deals d ON d.id = dc.deal_id
    LEFT JOIN contracts k ON k.id = dc.contract_id
    LEFT JOIN contacts ct ON ct.id = dc.contact_id`;

/** Cot lien ket cua tai lieu — dung chung cho loc, them moi va cap nhat. */
const LINK_COLUMNS = [
  'customer_id',
  'contact_id',
  'deal_id',
  'contract_id',
  'quotation_id',
  'card_id',
] as const;

router.get('/', (req, res) => {
  const where: string[] = [];
  const params: unknown[] = [];
  const q = fold(String(req.query.q ?? '').trim());
  if (q) {
    where.push(`dc.search_text LIKE '%' || ? || '%'`);
    params.push(q);
  }
  for (const key of [...LINK_COLUMNS, 'doc_type'] as string[]) {
    if (req.query[key]) {
      where.push(`dc.${key} = ?`);
      params.push(key === 'doc_type' ? String(req.query[key]) : Number(req.query[key]));
    }
  }
  res.json(
    db
      .prepare(
        `${DOC_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY dc.created_at DESC`
      )
      .all(...params)
  );
});

const linkSchema = z.object({
  name: z.string().trim().optional(),
  doc_type: z.enum(DOC_TYPES).optional(),
  customer_id: z.coerce.number().int().nullable().optional(),
  contact_id: z.coerce.number().int().nullable().optional(),
  deal_id: z.coerce.number().int().nullable().optional(),
  contract_id: z.coerce.number().int().nullable().optional(),
  quotation_id: z.coerce.number().int().nullable().optional(),
  card_id: z.coerce.number().int().nullable().optional(),
});

router.post('/', upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, 'Chưa chọn tệp để tải lên');
  const body = parseBody(linkSchema, req);
  const id = createDocument(file, body);
  res.status(201).json(db.prepare(`${DOC_SELECT} WHERE dc.id = ?`).get(id));
});

router.get('/:id/download', (req, res) => {
  const id = intParam(req.params.id);
  const doc = required(
    db.prepare(`SELECT * FROM documents WHERE id = ?`).get(id),
    'Khong tim thay tai lieu'
  ) as { stored_name: string; file_name: string };
  const filePath = path.join(FILES_DIR, doc.stored_name);
  if (!fs.existsSync(filePath)) throw new HttpError(404, 'Tệp không còn trên ổ đĩa');
  res.download(filePath, doc.file_name);
});

router.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(linkSchema, req);
  const current = required(
    db.prepare(`SELECT * FROM documents WHERE id = ?`).get(id),
    'Khong tim thay tai lieu'
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
            contract_id = ?, quotation_id = ?, card_id = ?, search_text = ? WHERE id = ?`
  ).run(
    merged.name,
    merged.doc_type,
    merged.customer_id ?? null,
    merged.contact_id ?? null,
    merged.deal_id ?? null,
    merged.contract_id ?? null,
    merged.quotation_id ?? null,
    merged.card_id ?? null,
    buildSearchText(merged.name as string, merged.file_name as string),
    id
  );
  res.json(db.prepare(`${DOC_SELECT} WHERE dc.id = ?`).get(id));
});

router.delete('/:id', (req, res) => {
  const id = intParam(req.params.id);
  deleteDocument(id);
  res.json({ ok: true });
});

export default router;
