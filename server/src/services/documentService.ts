import fs from 'node:fs';
import path from 'node:path';
import { db, FILES_DIR } from '../db/connection.ts';
import { assertEntityLinks, type EntityLinks } from '../lib/entityRelations.ts';
import { unverifyBySource } from '../lib/scoring.ts';
import { buildSearchText } from '../lib/viSearch.ts';
import { required } from '../lib/validate.ts';
import { indexDocument } from './ai/documentIndex.ts';

export const DOCUMENT_TEMP_DIR = path.join(FILES_DIR, '.tmp');
fs.mkdirSync(DOCUMENT_TEMP_DIR, { recursive: true });

export interface DocumentInput extends EntityLinks {
  name?: string;
  doc_type?: string;
  description?: string;
  tags?: string;
  owner?: string | null;
  effective_date?: string | null;
  expires_at?: string | null;
  confidentiality?: 'public' | 'internal' | 'confidential';
}

/** Dua file tu kho tam sang kho chinh va chi commit metadata khi ca hai buoc thanh cong. */
export function createDocument(file: Express.Multer.File, body: DocumentInput): number {
  const finalPath = path.join(FILES_DIR, file.filename);
  let committed = false;
  try {
    assertEntityLinks(db, body);
    const name = body.name?.trim() || file.originalname;
    fs.renameSync(file.path, finalPath);
    const id = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO documents (name, doc_type, file_name, stored_name, mime, size,
                                  customer_id, contact_id, deal_id, contract_id, quotation_id, card_id,
                                  description, tags, owner, effective_date, expires_at, confidentiality,
                                  search_text, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`
        )
        .run(
          name,
          body.doc_type ?? 'other',
          file.originalname,
          file.filename,
          file.mimetype,
          file.size,
          body.customer_id ?? null,
          body.contact_id ?? null,
          body.deal_id ?? null,
          body.contract_id ?? null,
          body.quotation_id ?? null,
          body.card_id ?? null,
          body.description ?? '',
          body.tags ?? '',
          body.owner ?? null,
          body.effective_date ?? null,
          body.expires_at ?? null,
          body.confidentiality ?? 'internal',
          buildSearchText(name, file.originalname, body.description, body.tags, body.owner)
        );
      return Number(info.lastInsertRowid);
    })();
    committed = true;
    // Upload van thanh cong du chi muc hong; co the lap lai tu trang Tro ly AI.
    // Chay nen vi doc PDF/DOCX ton thoi gian, khong duoc giu chan phan hoi upload.
    void indexDocument(db, id).catch((error: unknown) =>
      console.warn('[ai-index] Khong lap duoc chi muc tai lieu moi:', error)
    );
    return id;
  } finally {
    if (!committed) {
      for (const candidate of [file.path, finalPath]) {
        if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
      }
    }
  }
}

/** Id cac the trong danh sach, cong them the con truc tiep cua chung (toi da 1 cap). */
function withChildCardIds(cardIds: number[]): number[] {
  if (cardIds.length === 0) return [];
  const placeholders = cardIds.map(() => '?').join(',');
  const children = db
    .prepare(`SELECT id FROM cards WHERE parent_id IN (${placeholders})`)
    .all(...cardIds) as { id: number }[];
  return [...new Set([...cardIds, ...children.map((row) => row.id)])];
}

/**
 * Soft-delete tai lieu dinh kem cua cac the SAP bi xoa qua FK CASCADE (xoa the,
 * danh sach hoac bang chua the).
 *
 * `documents.card_id` khai bao `ON DELETE CASCADE` nen neu goi thang DELETE tren
 * cards/lists/boards, SQLite se hard-delete dong tai lieu tuong ung — bo qua Thung
 * rac va `unverifyBySource` ma duong xoa "chinh thong" (`DELETE /api/documents/:id`)
 * luon di qua. Goi ham nay TRUOC cau DELETE de tai lieu di dung duong do.
 */
export function softDeleteDocumentsForCards(cardIds: number[]): void {
  const ids = withChildCardIds(cardIds);
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT id FROM documents WHERE card_id IN (${placeholders}) AND deleted_at IS NULL`)
    .all(...ids) as { id: number }[];
  if (rows.length === 0) return;
  db.prepare(
    `UPDATE documents SET deleted_at = datetime('now','localtime'), updated_at = datetime('now','localtime')
      WHERE card_id IN (${placeholders}) AND deleted_at IS NULL`
  ).run(...ids);
  for (const row of rows) unverifyBySource(db, 'document', row.id);
}

/** Xoa theo kieu hai pha: dua file vao kho tam, commit DB, sau do huy file. */
export function permanentlyDeleteDocument(id: number): void {
  const document = required(
    db.prepare(`SELECT stored_name FROM documents WHERE id = ?`).get(id) as
      { stored_name: string } | undefined,
    'Khong tim thay tai lieu'
  );
  const filePath = path.join(FILES_DIR, document.stored_name);
  const trashPath = path.join(DOCUMENT_TEMP_DIR, `delete-${Date.now()}-${document.stored_name}`);
  const hadFile = fs.existsSync(filePath);
  if (hadFile) fs.renameSync(filePath, trashPath);
  try {
    db.transaction(() => {
      unverifyBySource(db, 'document', id);
      db.prepare(`DELETE FROM documents WHERE id = ?`).run(id);
    })();
  } catch (error) {
    if (hadFile && fs.existsSync(trashPath)) fs.renameSync(trashPath, filePath);
    throw error;
  }
  if (hadFile && fs.existsSync(trashPath)) fs.unlinkSync(trashPath);
}
