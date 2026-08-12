import fs from 'node:fs';
import path from 'node:path';
import { db, FILES_DIR } from '../db/connection.ts';
import { assertEntityLinks, type EntityLinks } from '../lib/entityRelations.ts';
import { unverifyBySource } from '../lib/scoring.ts';
import { buildSearchText } from '../lib/viSearch.ts';
import { required } from '../lib/validate.ts';

export const DOCUMENT_TEMP_DIR = path.join(FILES_DIR, '.tmp');
fs.mkdirSync(DOCUMENT_TEMP_DIR, { recursive: true });

export interface DocumentInput extends EntityLinks {
  name?: string;
  doc_type?: string;
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
                                  customer_id, contact_id, deal_id, contract_id, quotation_id, card_id, search_text)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
          buildSearchText(name, file.originalname)
        );
      return Number(info.lastInsertRowid);
    })();
    committed = true;
    return id;
  } finally {
    if (!committed) {
      for (const candidate of [file.path, finalPath]) {
        if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
      }
    }
  }
}

/** Xoa theo kieu hai pha: dua file vao kho tam, commit DB, sau do huy file. */
export function deleteDocument(id: number): void {
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
