import type { Database } from 'better-sqlite3';
import type { MeetingNoteInput } from '@workflow/contracts/schemas';
import { assertEntityLinks, assertProjectCustomerLink } from '../lib/entityRelations.ts';
import { buildSearchText, fold } from '../lib/viSearch.ts';
import { afterCursor, toPage, type PageCursor } from '../lib/paging.ts';
import { HttpError, required } from '../lib/validate.ts';

interface MeetingNoteRow {
  id: number;
  customer_id: number | null;
  deal_id: number | null;
  project_id: number | null;
  title: string;
  purpose_key: 'blank' | 'meeting' | 'plan' | 'proposal' | 'report' | 'process' | 'decision';
  meeting_at: string | null;
  content_json: string;
  content_text: string;
  ai_summary_json: string | null;
  ai_summary_at: string | null;
  created_at: string;
  updated_at: string;
  customer_name: string | null;
  deal_title: string | null;
  project_name: string | null;
}

interface Attendee {
  contact_id: number;
  full_name: string;
}

function attendeesOf(db: Database, meetingNoteId: number): Attendee[] {
  return db
    .prepare(
      `SELECT a.contact_id, c.full_name
         FROM meeting_note_attendees a JOIN contacts c ON c.id = a.contact_id
        WHERE a.meeting_note_id = ?
        ORDER BY c.full_name`
    )
    .all(meetingNoteId) as Attendee[];
}

/**
 * Ten Khach hang/Co hoi/Du an chi de HIEN THI (vd. trang "Ghi chu" liet ke tat
 * ca ghi chu can biet no thuoc ve dau) — khong dung de loc/ghi, cac cot id van
 * la nguon su that duy nhat.
 */
function reload(db: Database, id: number) {
  const row = db
    .prepare(
      `SELECT m.*, c.name AS customer_name, d.title AS deal_title, p.name AS project_name
         FROM meeting_notes m
         LEFT JOIN customers c ON c.id = m.customer_id
         LEFT JOIN deals d ON d.id = m.deal_id
         LEFT JOIN projects p ON p.id = m.project_id
        WHERE m.id = ? AND m.deleted_at IS NULL`
    )
    .get(id) as MeetingNoteRow | undefined;
  if (!row) return undefined;
  return {
    ...row,
    ai_summary: row.ai_summary_json ? (JSON.parse(row.ai_summary_json) as unknown) : null,
    ai_summary_json: undefined,
    attendees: attendeesOf(db, id),
  };
}

/** Ghi lai danh sach nguoi tham du bang xoa het roi chen lai — so luong nho, khong dang tinh diff. */
function syncAttendees(db: Database, meetingNoteId: number, contactIds: number[]): void {
  db.prepare(`DELETE FROM meeting_note_attendees WHERE meeting_note_id = ?`).run(meetingNoteId);
  if (contactIds.length === 0) return;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO meeting_note_attendees (meeting_note_id, contact_id) VALUES (?, ?)`
  );
  for (const contactId of new Set(contactIds)) {
    required(
      db.prepare(`SELECT id FROM contacts WHERE id = ?`).get(contactId),
      'Khong tim thay nguoi tham du'
    );
    insert.run(meetingNoteId, contactId);
  }
}

/**
 * `project_id` khong nam trong EntityLinks dung chung (xem entityRelations.ts) nen
 * phai kiem rieng, song song voi assertEntityLinks cho phan con lai.
 */
function assertLinks(
  db: Database,
  links: { customer_id?: number | null; deal_id?: number | null; project_id?: number | null }
): void {
  assertEntityLinks(db, { customer_id: links.customer_id, deal_id: links.deal_id });
  assertProjectCustomerLink(
    db,
    { project_id: links.project_id, customer_id: links.customer_id },
    'Ghi chu hop'
  );
}

/**
 * Khong truyen `links` (hoac ca hai deu rong) thi liet ke TAT CA ghi chu hop —
 * dung boi trang "Ghi chu" o muc Phan tich & cong cu (xem NotesPage.tsx).
 */
export function listMeetingNotes(db: Database, links: { deal_id?: number; project_id?: number }) {
  const rows = db
    .prepare(
      `SELECT id FROM meeting_notes
        WHERE deleted_at IS NULL
          AND (? IS NULL OR deal_id = ?)
          AND (? IS NULL OR project_id = ?)
        ORDER BY updated_at DESC, id DESC`
    )
    .all(
      links.deal_id ?? null,
      links.deal_id ?? null,
      links.project_id ?? null,
      links.project_id ?? null
    ) as { id: number }[];
  return rows.map((row) => reload(db, row.id));
}

export function getMeetingNote(db: Database, id: number) {
  return required(reload(db, id), 'Khong tim thay trang tai lieu');
}

export function createMeetingNote(
  db: Database,
  input: MeetingNoteInput,
  ownerContactId: number | null = null
) {
  assertLinks(db, input);
  const contentText = input.content_text ?? '';
  const id = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO meeting_notes
          (customer_id, deal_id, project_id, title, purpose_key, meeting_at, content_json, content_text,
           search_text, owner_contact_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.customer_id ?? null,
        input.deal_id ?? null,
        input.project_id ?? null,
        input.title,
        input.purpose_key ?? 'blank',
        input.meeting_at ?? null,
        input.content_json ?? '[]',
        contentText,
        buildSearchText(input.title, contentText),
        ownerContactId
      );
    const newId = Number(info.lastInsertRowid);
    if (input.attendee_contact_ids) syncAttendees(db, newId, input.attendee_contact_ids);
    return newId;
  })();
  return getMeetingNote(db, id);
}

export function updateMeetingNote(db: Database, id: number, patch: Partial<MeetingNoteInput>) {
  const current = required(
    db.prepare(`SELECT * FROM meeting_notes WHERE id = ? AND deleted_at IS NULL`).get(id) as
      MeetingNoteRow | undefined,
    'Khong tim thay ghi chu hop'
  );
  const merged = { ...current, ...patch };
  assertLinks(db, merged);

  db.transaction(() => {
    db.prepare(
      `UPDATE meeting_notes
          SET customer_id = ?, deal_id = ?, project_id = ?, title = ?, purpose_key = ?, meeting_at = ?,
              content_json = ?, content_text = ?, search_text = ?,
              updated_at = datetime('now','localtime')
        WHERE id = ?`
    ).run(
      merged.customer_id ?? null,
      merged.deal_id ?? null,
      merged.project_id ?? null,
      merged.title,
      merged.purpose_key,
      merged.meeting_at ?? null,
      merged.content_json ?? '[]',
      merged.content_text ?? '',
      buildSearchText(merged.title, merged.content_text ?? ''),
      id
    );
    if (patch.attendee_contact_ids) syncAttendees(db, id, patch.attendee_contact_ids);
  })();
  return getMeetingNote(db, id);
}

export function softDeleteMeetingNote(db: Database, id: number): void {
  const result = db
    .prepare(
      `UPDATE meeting_notes SET deleted_at = datetime('now','localtime'),
              updated_at = datetime('now','localtime')
        WHERE id = ? AND deleted_at IS NULL`
    )
    .run(id);
  if (result.changes === 0) throw new HttpError(404, 'Khong tim thay trang tai lieu');
}

/** Dung boi route AI (tom tat) de cache ket qua va tranh goi lai model khong can thiet. */
export function saveAiSummary(
  db: Database,
  id: number,
  summary: { summary: string; action_items: { title: string; due_date: string | null }[] }
): void {
  db.prepare(
    `UPDATE meeting_notes SET ai_summary_json = ?, ai_summary_at = datetime('now','localtime')
      WHERE id = ?`
  ).run(JSON.stringify(summary), id);
}

/* ------------------------------------------------------------------ */
/* Thu vien "Trang tài liệu" (tab cua trang Tai lieu) — 1.28.0         */
/* ------------------------------------------------------------------ */

export type MeetingNoteLinkFilter = 'deal' | 'project' | 'none';
export type MeetingNoteSort = 'updated' | 'meeting';

export interface MeetingNoteLibraryFilters {
  q?: string;
  purpose_key?: string;
  linked?: MeetingNoteLinkFilter;
  customer_id?: number;
  trash?: boolean;
}

/**
 * Dieu kien loc cua thu vien trang. `skip` bo mot chieu loc — dung khi dem
 * facet: so dem theo mau phai tinh khi CHUA loc mau, neu khong moi mau khac
 * deu ra 0 ngay khi chon mot mau.
 */
function libraryWhere(
  filters: MeetingNoteLibraryFilters,
  skip: 'purpose' | 'linked' | null = null
): { where: string[]; params: unknown[] } {
  const where = [filters.trash ? 'm.deleted_at IS NOT NULL' : 'm.deleted_at IS NULL'];
  const params: unknown[] = [];
  const q = fold((filters.q ?? '').trim());
  if (q) {
    where.push(`m.search_text LIKE '%' || ? || '%'`);
    params.push(q);
  }
  if (filters.customer_id) {
    where.push('m.customer_id = ?');
    params.push(filters.customer_id);
  }
  if (filters.purpose_key && skip !== 'purpose') {
    where.push('m.purpose_key = ?');
    params.push(filters.purpose_key);
  }
  if (filters.linked && skip !== 'linked') where.push(LINK_SQL[filters.linked]);
  return { where, params };
}

/** "Gan voi": Co hoi uu tien hon Du an, giong NoteContextBadge o giao dien. */
const LINK_SQL: Record<MeetingNoteLinkFilter, string> = {
  deal: 'm.deal_id IS NOT NULL',
  project: 'm.deal_id IS NULL AND m.project_id IS NOT NULL',
  none: 'm.deal_id IS NULL AND m.project_id IS NULL',
};

/** Khoa sap xep — khong bao gio NULL (yeu cau cua afterCursor). */
function sortKey(filters: MeetingNoteLibraryFilters, sort: MeetingNoteSort): string {
  if (filters.trash) return 'm.deleted_at';
  return sort === 'meeting' ? 'COALESCE(m.meeting_at, m.created_at)' : 'm.updated_at';
}

/**
 * Mot trang danh sach, moi nhat truoc. Chi tra phan can de hien dong (trich
 * 200 ky tu, so nguoi tham du) — khong tra content_json: ban cu `GET /` gui
 * nguyen noi dung moi trang, vai tram trang la vai MB chi de ve mot danh sach.
 */
export function listMeetingNotePage(
  db: Database,
  filters: MeetingNoteLibraryFilters,
  sort: MeetingNoteSort,
  cursor: PageCursor | null,
  limit: number
) {
  const { where, params } = libraryWhere(filters);
  const key = sortKey(filters, sort);
  const after = afterCursor(cursor, key, 'm.id');
  if (after.sql) {
    where.push(after.sql);
    params.push(...after.params);
  }
  const rows = db
    .prepare(
      `SELECT m.id, m.title, m.purpose_key, m.meeting_at, m.customer_id, m.deal_id, m.project_id,
              m.created_at, m.updated_at, m.deleted_at,
              substr(m.content_text, 1, 200) AS excerpt,
              c.name AS customer_name, d.title AS deal_title, p.name AS project_name,
              o.full_name AS owner_name,
              (SELECT COUNT(*) FROM meeting_note_attendees a WHERE a.meeting_note_id = m.id)
                AS attendee_count,
              ${key} AS sort_key
         FROM meeting_notes m
         LEFT JOIN customers c ON c.id = m.customer_id
         LEFT JOIN deals d ON d.id = m.deal_id
         LEFT JOIN projects p ON p.id = m.project_id
         LEFT JOIN contacts o ON o.id = m.owner_contact_id
        WHERE ${where.join(' AND ')}
        ORDER BY ${key} DESC, m.id DESC
        LIMIT ?`
    )
    .all(...params, limit + 1) as Record<string, unknown>[];
  const page = toPage(
    rows,
    limit,
    (row) => String(row.sort_key),
    (row) => Number(row.id)
  );
  return {
    ...page,
    items: page.items.map(({ sort_key: _sortKey, ...row }) => row),
  };
}

/** So dem cho cot loc nhanh: tong, theo mau, theo noi gan. */
export function meetingNoteFacets(db: Database, filters: MeetingNoteLibraryFilters) {
  const byPurpose = libraryWhere(filters, 'purpose');
  const purposeRows = db
    .prepare(
      `SELECT m.purpose_key AS key, COUNT(*) AS n FROM meeting_notes m
        WHERE ${byPurpose.where.join(' AND ')} GROUP BY m.purpose_key`
    )
    .all(...byPurpose.params) as { key: string; n: number }[];

  const byLink = libraryWhere(filters, 'linked');
  const link = db
    .prepare(
      `SELECT SUM(CASE WHEN ${LINK_SQL.deal} THEN 1 ELSE 0 END) AS deal,
              SUM(CASE WHEN ${LINK_SQL.project} THEN 1 ELSE 0 END) AS project,
              SUM(CASE WHEN ${LINK_SQL.none} THEN 1 ELSE 0 END) AS none
         FROM meeting_notes m WHERE ${byLink.where.join(' AND ')}`
    )
    .get(...byLink.params) as Record<MeetingNoteLinkFilter, number | null>;

  const all = libraryWhere(filters);
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM meeting_notes m WHERE ${all.where.join(' AND ')}`)
      .get(...all.params) as { n: number }
  ).n;

  return {
    total,
    by_purpose: Object.fromEntries(purposeRows.map((row) => [row.key, row.n])),
    by_link: { deal: link.deal ?? 0, project: link.project ?? 0, none: link.none ?? 0 },
  };
}

export function restoreMeetingNote(db: Database, id: number) {
  const result = db
    .prepare(
      `UPDATE meeting_notes SET deleted_at = NULL, updated_at = datetime('now','localtime')
        WHERE id = ? AND deleted_at IS NOT NULL`
    )
    .run(id);
  if (result.changes === 0) throw new HttpError(404, 'Khong tim thay trang trong thung rac');
  return getMeetingNote(db, id);
}
