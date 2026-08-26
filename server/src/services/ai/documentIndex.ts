import path from 'node:path';
import type { Database } from 'better-sqlite3';
import { FILES_DIR } from '../../db/connection.ts';
import { buildSearchText, fold } from '../../lib/viSearch.ts';
import { HttpError, required } from '../../lib/validate.ts';
import { extractText, type ExtractMethod } from './textExtract.ts';

interface DocumentRow {
  id: number;
  name: string;
  doc_type: string;
  file_name: string;
  stored_name: string;
  mime: string | null;
  size: number;
  description: string;
  tags: string;
  confidentiality: string;
}

export function safeFilePath(storedName: string): string {
  const root = path.resolve(FILES_DIR);
  const file = path.resolve(root, storedName);
  if (file !== root && !file.startsWith(`${root}${path.sep}`))
    throw new Error('Đường dẫn tài liệu không an toàn');
  return file;
}

function chunks(text: string, size = 1_600, overlap = 200): string[] {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!normalized) return [];
  const result: string[] = [];
  let start = 0;
  while (start < normalized.length && result.length < 500) {
    let end = Math.min(normalized.length, start + size);
    if (end < normalized.length) {
      const boundary = Math.max(
        normalized.lastIndexOf('\n', end),
        normalized.lastIndexOf('. ', end)
      );
      if (boundary > start + size / 2) end = boundary + 1;
    }
    result.push(normalized.slice(start, end).trim());
    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return result.filter(Boolean);
}

/**
 * Doc noi dung mot tai lieu de lap chi muc hoac de AI phan tich.
 *
 * Tach rieng khoi indexDocument vi endpoint de xuat metadata can dung nguon van ban
 * nay ma khong phai lap lai chi muc.
 */
export async function readDocumentText(
  db: Database,
  documentId: number
): Promise<{ document: DocumentRow; text: string; method: ExtractMethod; reason?: string }> {
  const document = required(
    db
      .prepare(
        `SELECT id, name, doc_type, file_name, stored_name, mime, size, description, tags, confidentiality
           FROM documents WHERE id = ? AND deleted_at IS NULL`
      )
      .get(documentId) as DocumentRow | undefined,
    'Không tìm thấy tài liệu'
  );
  /*
   * Cung mot chinh sach ma searchDocumentChunks va buildCustomerContext/buildDealContext
   * da ap dung: khong dua noi dung tai lieu 'confidential' ra ngoai qua AI provider.
   * Ham nay la nguon doc noi dung DUY NHAT cho luong /assist/document — chan ngay tai
   * day de moi noi goi no (hien tai va sau nay) deu duoc bao ve, khong phai tung route.
   */
  if (document.confidentiality === 'confidential') {
    throw new HttpError(422, 'Tài liệu được đánh dấu bảo mật, không thể gửi cho AI bên ngoài', {
      code: 'DOCUMENT_CONFIDENTIAL',
    });
  }
  const extracted = await extractText(
    safeFilePath(document.stored_name),
    document.mime,
    document.file_name
  );
  return { document, ...extracted };
}

export async function indexDocument(db: Database, documentId: number) {
  const document = required(
    db
      .prepare(
        `SELECT id, name, doc_type, file_name, stored_name, mime, size, description, tags, confidentiality
           FROM documents WHERE id = ? AND deleted_at IS NULL`
      )
      .get(documentId) as DocumentRow | undefined,
    'Không tìm thấy tài liệu'
  );

  const metadata = [
    `Tên tài liệu: ${document.name}`,
    `Loại: ${document.doc_type}`,
    `Tệp: ${document.file_name}`,
    document.description ? `Mô tả: ${document.description}` : '',
    document.tags ? `Nhãn: ${document.tags}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  // Tu v14 ca PDF/DOCX/XLSX deu vao duoc chi muc; truoc day chi co tep text thuan.
  const extracted = await extractText(
    safeFilePath(document.stored_name),
    document.mime,
    document.file_name
  );
  const content = extracted.text ? `${metadata}\n\n${extracted.text}` : metadata;
  const extraction: ExtractMethod | 'metadata' = extracted.text ? extracted.method : 'metadata';

  const parts = chunks(content);
  db.transaction(() => {
    db.prepare(`DELETE FROM ai_document_chunks WHERE document_id = ?`).run(documentId);
    const insert = db.prepare(
      `INSERT INTO ai_document_chunks (document_id, chunk_index, content, search_text, source_label)
       VALUES (?, ?, ?, ?, ?)`
    );
    parts.forEach((part, index) =>
      insert.run(
        documentId,
        index,
        part,
        buildSearchText(
          document.name,
          document.file_name,
          document.description,
          document.tags,
          part
        ),
        `${document.name} · phần ${index + 1}`
      )
    );
  })();
  return { document_id: documentId, chunks: parts.length, extraction };
}

export async function indexAllDocuments(db: Database) {
  const ids = db.prepare(`SELECT id FROM documents WHERE deleted_at IS NULL ORDER BY id`).all() as {
    id: number;
  }[];
  let indexed = 0;
  let chunksCount = 0;
  const failures: { document_id: number; error: string }[] = [];
  for (const { id } of ids) {
    try {
      const result = await indexDocument(db, id);
      indexed += 1;
      chunksCount += result.chunks;
    } catch (error) {
      failures.push({
        document_id: id,
        error: error instanceof Error ? error.message : 'Lỗi không xác định',
      });
    }
  }
  return { indexed, chunks: chunksCount, failures };
}

function ftsQuery(query: string): string {
  return fold(query)
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 2)
    .slice(0, 12)
    .map((token) => `"${token.replace(/"/g, '')}"*`)
    .join(' OR ');
}

export function searchDocumentChunks(db: Database, query: string, limit = 8) {
  const expression = ftsQuery(query);
  if (!expression) return [];
  try {
    return db
      .prepare(
        `SELECT ch.document_id, ch.chunk_index, ch.content, ch.source_label,
                d.name AS document_name, d.file_name, d.confidentiality,
                bm25(ai_document_chunks_fts) AS rank
           FROM ai_document_chunks_fts f
           JOIN ai_document_chunks ch ON ch.id = f.rowid
           JOIN documents d ON d.id = ch.document_id
          WHERE ai_document_chunks_fts MATCH ? AND d.deleted_at IS NULL
            AND d.confidentiality <> 'confidential'
          ORDER BY rank LIMIT ?`
      )
      .all(expression, Math.max(1, Math.min(limit, 20)));
  } catch {
    const like = `%${fold(query)}%`;
    return db
      .prepare(
        `SELECT ch.document_id, ch.chunk_index, ch.content, ch.source_label,
                d.name AS document_name, d.file_name, d.confidentiality, 0 AS rank
           FROM ai_document_chunks ch JOIN documents d ON d.id = ch.document_id
          WHERE ch.search_text LIKE ? AND d.deleted_at IS NULL
            AND d.confidentiality <> 'confidential'
          ORDER BY ch.id DESC LIMIT ?`
      )
      .all(like, Math.max(1, Math.min(limit, 20)));
  }
}
