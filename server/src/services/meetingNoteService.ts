import type { Database } from 'better-sqlite3';
import type { MeetingNoteInput } from '@workflow/contracts/schemas';
import { assertEntityLinks, assertProjectCustomerLink } from '../lib/entityRelations.ts';
import { buildSearchText } from '../lib/viSearch.ts';
import { HttpError, required } from '../lib/validate.ts';

interface MeetingNoteRow {
  id: number;
  customer_id: number | null;
  deal_id: number | null;
  project_id: number | null;
  title: string;
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
        ORDER BY meeting_at IS NULL, meeting_at DESC, updated_at DESC`
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
  return required(reload(db, id), 'Khong tim thay ghi chu hop');
}

export function createMeetingNote(db: Database, input: MeetingNoteInput) {
  assertLinks(db, input);
  const contentText = input.content_text ?? '';
  const id = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO meeting_notes
          (customer_id, deal_id, project_id, title, meeting_at, content_json, content_text, search_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.customer_id ?? null,
        input.deal_id ?? null,
        input.project_id ?? null,
        input.title,
        input.meeting_at ?? null,
        input.content_json ?? '[]',
        contentText,
        buildSearchText(input.title, contentText)
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
          SET customer_id = ?, deal_id = ?, project_id = ?, title = ?, meeting_at = ?,
              content_json = ?, content_text = ?, search_text = ?,
              updated_at = datetime('now','localtime')
        WHERE id = ?`
    ).run(
      merged.customer_id ?? null,
      merged.deal_id ?? null,
      merged.project_id ?? null,
      merged.title,
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
  if (result.changes === 0) throw new HttpError(404, 'Khong tim thay ghi chu hop');
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
