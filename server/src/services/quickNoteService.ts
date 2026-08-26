import type { Database } from 'better-sqlite3';
import type {
  QuickNoteInput,
  QuickNoteMoveInput,
  QuickNoteRelationInput,
} from '@workflow/contracts/schemas';
import type { QuickNoteConvertTarget, QuickNoteRelationType } from '@workflow/contracts';
import { computeMovePosition } from '../lib/position.ts';
import { buildSearchText, fold } from '../lib/viSearch.ts';
import { HttpError, required } from '../lib/validate.ts';
import { permanentlyDeleteDocumentsForQuickNote } from './documentService.ts';

interface QuickNoteRow {
  id: number;
  title: string;
  content_json: string;
  content_text: string;
  tags: string;
  is_pinned: number;
  position: number;
  color: string | null;
  reminder_at: string | null;
  reminder_status: string | null;
  converted_to_type: string | null;
  converted_to_id: number | null;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

function pinnedScope(pinned: 0 | 1) {
  return { table: 'quick_notes' as const, scopeCol: 'is_pinned' as const, scopeVal: pinned };
}

/**
 * Vi tri "dau danh sach" trong mot nhom da ghim/chua ghim — danh sach sap
 * `position ASC` nen gia tri CANG NHO cang len dau. Nguoc voi `nextPosition`
 * cua position.ts (them vao CUOI, cards/lists/deals dung) — Ghi chu nhanh
 * muon ghi chu vua tao/vua ghim noi len dau, giong cach "Gan day" cu sap theo
 * `updated_at DESC` truoc khi co cot `position`.
 *
 * Chia doi vi tri nho nhat hien co — CUNG mot cong thuc voi nhanh
 * `before === null` cua computeMovePosition ("chen truoc phan tu dau tien"),
 * nen luon la so DUONG, khong bao gio am (khac voi tru thang STEP, se am dan
 * sau nhieu lan tao va lam sai huong so sanh voi cac vi tri con lai).
 *
 * Loai ghi chu da xoa mem: chung khong con hien o danh sach nao nhung van
 * giu nguyen `position` cu — tinh ca chung se neo san MIN o mot gia tri "ma"
 * (vd. mot ghi chu tung dung dau danh sach roi bi xoa) khien moi lan tao/ghim
 * moi sau do cu chia doi mai tu cai san do thay vi tu vi tri THAT su nho nhat
 * dang hien, rut ngan khoang cach nhanh hon can thiet.
 */
function firstPosition(db: Database, pinned: 0 | 1): number {
  const row = db
    .prepare(
      `SELECT MIN(position) AS minPos FROM quick_notes WHERE is_pinned = ? AND deleted_at IS NULL`
    )
    .get(pinned) as { minPos: number | null };
  return row.minPos != null ? row.minPos / 2 : 1024;
}

export interface QuickNoteRelationRow {
  id: number;
  object_type: QuickNoteRelationType;
  object_id: number;
  object_label: string | null;
}

const RELATION_TABLES: Record<QuickNoteRelationType, { table: string; label: string }> = {
  customer: { table: 'customers', label: 'name' },
  contact: { table: 'contacts', label: 'full_name' },
  deal: { table: 'deals', label: 'title' },
  project: { table: 'projects', label: 'name' },
};

function relationsOf(db: Database, quickNoteId: number): QuickNoteRelationRow[] {
  const rows = db
    .prepare(
      `SELECT id, object_type, object_id FROM quick_note_relations WHERE quick_note_id = ? ORDER BY id`
    )
    .all(quickNoteId) as { id: number; object_type: QuickNoteRelationType; object_id: number }[];
  return rows.map((row) => {
    const { table, label } = RELATION_TABLES[row.object_type];
    const found = db
      .prepare(`SELECT ${label} AS label FROM ${table} WHERE id = ?`)
      .get(row.object_id) as { label: string } | undefined;
    return { ...row, object_label: found?.label ?? null };
  });
}

function attachmentCount(db: Database, quickNoteId: number): number {
  return (
    db
      .prepare(`SELECT COUNT(*) AS n FROM documents WHERE quick_note_id = ? AND deleted_at IS NULL`)
      .get(quickNoteId) as { n: number }
  ).n;
}

function reload(db: Database, id: number) {
  const row = db.prepare(`SELECT * FROM quick_notes WHERE id = ?`).get(id) as
    QuickNoteRow | undefined;
  if (!row) return undefined;
  return {
    ...row,
    tags: JSON.parse(row.tags) as string[],
    relations: relationsOf(db, id),
    attachment_count: attachmentCount(db, id),
  };
}

/**
 * `reload` (dung chung cho ca danh sach Thung rac) co y KHONG loc `deleted_at`,
 * nen ham cong khai nay phai tu kiem tra — neu khong `GET /:id` se van tra ve
 * duoc mot ghi chu da xoa mem.
 */
export function getQuickNote(db: Database, id: number) {
  const note = required(reload(db, id), 'Khong tim thay ghi chu nhanh');
  if (note.deleted_at) throw new HttpError(404, 'Khong tim thay ghi chu nhanh');
  return note;
}

/** Dong dau tien khong rong cua noi dung, cat 100 ky tu — dung khi nguoi dung khong tu dat Title. */
function deriveTitle(contentText: string): string {
  const firstLine =
    contentText
      .split('\n')
      .find((line) => line.trim().length > 0)
      ?.trim() ?? '';
  return firstLine.length > 100 ? `${firstLine.slice(0, 100)}…` : firstLine;
}

export interface QuickNoteFilters {
  q?: string;
  view?: 'active' | 'archived' | 'trash';
  pinned?: boolean;
  has_reminder?: boolean;
  has_attachment?: boolean;
  tag?: string;
  linked?: boolean;
  checklist?: boolean;
  updated_from?: string;
  updated_to?: string;
}

export function listQuickNotes(db: Database, filters: QuickNoteFilters) {
  const view = filters.view ?? 'active';
  const where: string[] = [view === 'trash' ? 'q.deleted_at IS NOT NULL' : 'q.deleted_at IS NULL'];
  const params: unknown[] = [];

  if (view === 'active') where.push('q.archived_at IS NULL');
  if (view === 'archived') where.push('q.archived_at IS NOT NULL');

  if (filters.pinned) where.push('q.is_pinned = 1');
  if (filters.has_reminder) where.push(`q.reminder_at IS NOT NULL`);
  if (filters.checklist) where.push(`q.content_json LIKE '%"type":"checkListItem"%'`);
  if (filters.tag) {
    const escaped = filters.tag.replace(/[\\%_]/g, (c) => `\\${c}`);
    where.push(`q.tags LIKE ? ESCAPE '\\'`);
    params.push(`%"${escaped}"%`);
  }
  if (filters.linked) {
    where.push(`EXISTS (SELECT 1 FROM quick_note_relations r WHERE r.quick_note_id = q.id)`);
  }
  if (filters.has_attachment) {
    where.push(
      `EXISTS (SELECT 1 FROM documents d WHERE d.quick_note_id = q.id AND d.deleted_at IS NULL)`
    );
  }
  if (filters.updated_from) {
    where.push(`q.updated_at >= ?`);
    params.push(filters.updated_from);
  }
  if (filters.updated_to) {
    where.push(`q.updated_at <= ?`);
    params.push(filters.updated_to);
  }
  if (filters.q) {
    where.push(`q.search_text LIKE ?`);
    params.push(`%${fold(filters.q)}%`);
  }

  const rows = db
    .prepare(
      `SELECT id FROM quick_notes q
        WHERE ${where.join(' AND ')}
        ORDER BY q.is_pinned DESC, q.position ASC`
    )
    .all(...params) as { id: number }[];
  return rows.map((row) => reload(db, row.id));
}

export function createQuickNote(db: Database, input: QuickNoteInput) {
  const contentText = input.content_text ?? '';
  const title = input.title?.trim() || deriveTitle(contentText);
  const tags = input.tags ?? [];
  // Ghi chu moi luon chua ghim — chuoi thu tu "da ghim" khong bi dong nay dung toi.
  const position = firstPosition(db, 0);
  const id = db
    .prepare(
      `INSERT INTO quick_notes
        (title, content_json, content_text, search_text, tags, position, color, reminder_at, reminder_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      title,
      input.content_json ?? '[]',
      contentText,
      buildSearchText(title, contentText, tags.join(' ')),
      JSON.stringify(tags),
      position,
      input.color ?? null,
      input.reminder_at ?? null,
      input.reminder_at ? 'pending' : null
    ).lastInsertRowid;
  return getQuickNote(db, Number(id));
}

export function updateQuickNote(db: Database, id: number, patch: Partial<QuickNoteInput>) {
  const current = required(
    db.prepare(`SELECT * FROM quick_notes WHERE id = ? AND deleted_at IS NULL`).get(id) as
      QuickNoteRow | undefined,
    'Khong tim thay ghi chu nhanh'
  );
  const contentText = patch.content_text ?? current.content_text;
  const title = (patch.title ?? current.title).trim() || deriveTitle(contentText);
  const tags = patch.tags ?? (JSON.parse(current.tags) as string[]);
  const color = patch.color !== undefined ? patch.color : current.color;
  const reminderAt = patch.reminder_at !== undefined ? patch.reminder_at : current.reminder_at;
  // Doi reminder_at ma chua tung dat (hoac vua bi xoa) thi suy lai trang thai; da co
  // trang thai (vd nguoi dung da Hoan thanh/Huy) thi giu nguyen, khong am tham reset.
  const reminderStatus =
    reminderAt === current.reminder_at ? current.reminder_status : reminderAt ? 'pending' : null;

  db.prepare(
    `UPDATE quick_notes
        SET title = ?, content_json = ?, content_text = ?, search_text = ?, tags = ?, color = ?,
            reminder_at = ?, reminder_status = ?, updated_at = datetime('now','localtime')
      WHERE id = ?`
  ).run(
    title,
    patch.content_json ?? current.content_json,
    contentText,
    buildSearchText(title, contentText, tags.join(' ')),
    JSON.stringify(tags),
    color,
    reminderAt,
    reminderStatus,
    id
  );
  return getQuickNote(db, id);
}

export function softDeleteQuickNote(db: Database, id: number): void {
  const result = db
    .prepare(
      `UPDATE quick_notes SET deleted_at = datetime('now','localtime'),
              updated_at = datetime('now','localtime')
        WHERE id = ? AND deleted_at IS NULL`
    )
    .run(id);
  if (result.changes === 0) throw new HttpError(404, 'Khong tim thay ghi chu nhanh');
}

export function restoreQuickNote(db: Database, id: number) {
  const result = db
    .prepare(
      `UPDATE quick_notes SET deleted_at = NULL, updated_at = datetime('now','localtime')
        WHERE id = ? AND deleted_at IS NOT NULL`
    )
    .run(id);
  if (result.changes === 0)
    throw new HttpError(404, 'Khong tim thay ghi chu nhanh trong thung rac');
  return getQuickNote(db, id);
}

/**
 * Ghim/bo ghim chuyen mot ghi chu SANG chuoi thu tu khac (xem pinnedScope) —
 * phai cap lai `position` moi trong chuoi do, khong thi no mang nguyen vi tri
 * cu tu chuoi truoc va co the chen giua cac ghi chu khac mot cach vo nghia.
 * Dat o DAU chuoi moi (firstPosition) — vua ghim/bo ghim la hanh dong vua lam,
 * noi bat len dau giong ghi chu vua tao.
 */
export function setPinned(db: Database, id: number, pinned: boolean) {
  const position = firstPosition(db, pinned ? 1 : 0);
  db.prepare(
    `UPDATE quick_notes SET is_pinned = ?, position = ?, updated_at = datetime('now','localtime')
      WHERE id = ? AND deleted_at IS NULL`
  ).run(pinned ? 1 : 0, position, id);
  return getQuickNote(db, id);
}

/** FR-BOARD: keo tha sap xep tay trong CUNG chuoi da ghim/chua ghim (v33). */
export function moveQuickNote(db: Database, id: number, input: QuickNoteMoveInput) {
  const current = required(
    db.prepare(`SELECT is_pinned FROM quick_notes WHERE id = ? AND deleted_at IS NULL`).get(id) as
      { is_pinned: number } | undefined,
    'Khong tim thay ghi chu nhanh'
  );
  const position = computeMovePosition(
    pinnedScope(current.is_pinned as 0 | 1),
    input.beforeId,
    input.afterId,
    id
  );
  db.prepare(
    `UPDATE quick_notes SET position = ?, updated_at = datetime('now','localtime') WHERE id = ?`
  ).run(position, id);
  return getQuickNote(db, id);
}

export function setArchived(db: Database, id: number, archived: boolean) {
  db.prepare(
    `UPDATE quick_notes
        SET archived_at = CASE WHEN ? THEN datetime('now','localtime') ELSE NULL END,
            updated_at = datetime('now','localtime')
      WHERE id = ? AND deleted_at IS NULL`
  ).run(archived ? 1 : 0, id);
  return getQuickNote(db, id);
}

/** Ghi de toan bo quan he — danh sach nho (mot vai CRM Object), khong dang tinh diff. */
export function syncRelations(db: Database, id: number, relations: QuickNoteRelationInput[]) {
  getQuickNote(db, id);
  db.transaction(() => {
    db.prepare(`DELETE FROM quick_note_relations WHERE quick_note_id = ?`).run(id);
    const insert = db.prepare(
      `INSERT OR IGNORE INTO quick_note_relations (quick_note_id, object_type, object_id) VALUES (?, ?, ?)`
    );
    for (const relation of relations) {
      const { table } = RELATION_TABLES[relation.object_type];
      required(
        db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(relation.object_id),
        `Khong tim thay ${relation.object_type}`
      );
      insert.run(id, relation.object_type, relation.object_id);
    }
  })();
  return getQuickNote(db, id);
}

/** Danh sach tag khong trung, dung de dung popup Loc theo tag (giong Label cua Google Keep). */
export function listQuickNoteTags(db: Database): string[] {
  const rows = db
    .prepare(`SELECT tags FROM quick_notes WHERE deleted_at IS NULL AND tags != '[]'`)
    .all() as { tags: string }[];
  const set = new Set<string>();
  for (const row of rows) {
    for (const tag of JSON.parse(row.tags) as string[]) set.add(tag);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'vi'));
}

/**
 * Hard-delete THAT su dong quick_notes — dung chung cho ca "Xoa vinh vien tu
 * Thung rac" va "Tu huy ghi chu rong khi dong" o duoi. Phai xoa tai lieu dinh
 * kem truoc (xem permanentlyDeleteDocumentsForQuickNote): de SQLite tu cascade
 * se hard-delete thang dong `documents` ma bo qua buoc xoa file that tren dia.
 */
function hardDeleteQuickNoteRow(db: Database, id: number): void {
  permanentlyDeleteDocumentsForQuickNote(id);
  db.prepare(`DELETE FROM quick_notes WHERE id = ?`).run(id);
}

/** Chi xoa vinh vien duoc khi ghi chu DANG nam trong Thung rac (giong permanentlyDeleteDocument). */
export function permanentlyDeleteQuickNote(db: Database, id: number): void {
  required(
    db.prepare(`SELECT id FROM quick_notes WHERE id = ? AND deleted_at IS NOT NULL`).get(id),
    'Chỉ ghi chú trong thùng rác mới được xoá vĩnh viễn'
  );
  hardDeleteQuickNoteRow(db, id);
}

/**
 * Tu huy mot ghi chu HOAN TOAN rong khi dong lai — giong Google Keep: tao ghi
 * chu moi (hoac mo mot ghi chu da co) roi dong ma khong go/gan gi thi khong
 * luu ban ghi rong lai, tranh rac danh sach voi hang loat "Ghi chú không tiêu
 * đề" (dung chinh loi nay khi tu kiem thu tinh nang mo rong giua man hinh).
 *
 * Kiem tra TAT CA truong the hien "nguoi dung da lam gi do" (khong chi
 * title/content) — mot ghi chu da duoc ghim/doi mau/gan nhac/gan CRM/dinh kem
 * du khong co chu nao van la mot hanh dong co chu dich, khong duoc tu xoa.
 */
export function discardIfEmptyQuickNote(db: Database, id: number): boolean {
  const row = db
    .prepare(`SELECT * FROM quick_notes WHERE id = ? AND deleted_at IS NULL`)
    .get(id) as QuickNoteRow | undefined;
  if (!row) return false;
  const isEmpty =
    row.title.trim() === '' &&
    row.content_text.trim() === '' &&
    row.tags === '[]' &&
    row.reminder_at == null &&
    row.is_pinned === 0 &&
    row.color == null &&
    row.archived_at == null &&
    row.converted_to_type == null &&
    relationsOf(db, id).length === 0 &&
    attachmentCount(db, id) === 0;
  if (!isEmpty) return false;
  hardDeleteQuickNoteRow(db, id);
  return true;
}

/** FR17: dung sau khi Task da duoc tao qua form chung (xem client openTaskComposer). */
export function markConverted(
  db: Database,
  id: number,
  target: QuickNoteConvertTarget,
  targetId: number
) {
  db.prepare(
    `UPDATE quick_notes SET converted_to_type = ?, converted_to_id = ?,
            updated_at = datetime('now','localtime')
      WHERE id = ? AND deleted_at IS NULL`
  ).run(target, targetId, id);
  return getQuickNote(db, id);
}
