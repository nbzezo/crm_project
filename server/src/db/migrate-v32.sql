/* ---------- v32: Ghi chu nhanh (Quick Notes) — module doc lap, tach biet CRM Note ----------

   Muc dich: ghi nhanh y tuong / thong tin tam thoi ma KHONG can chon Customer / Deal /
   Project / Task truoc (capture first, organize later). Day la mot khai niem KHAC voi
   Ghi chu hop (bang meeting_notes, v30/v31) — hai bang khong tham chieu lan nhau, chi
   "Convert thanh CRM Note" moi tao ra mot meeting_notes moi tu noi dung Quick Note.
*/

CREATE TABLE quick_notes (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL DEFAULT '[]',
  content_text TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',
  /* JSON string[] — tag tu do, khong qua he Label (labels/label_links) vi do la
     taxonomy CRM chinh thuc co man quan tri rieng, con tag o day phai tao duoc
     ngay khong qua buoc nao. */
  tags TEXT NOT NULL DEFAULT '[]',
  is_pinned INTEGER NOT NULL DEFAULT 0,
  reminder_at TEXT,
  reminder_status TEXT CHECK (reminder_status IN ('pending','triggered','completed','cancelled')),
  converted_to_type TEXT CHECK (converted_to_type IN ('task','crm_note')),
  converted_to_id INTEGER,
  archived_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX idx_quick_notes_active ON quick_notes(is_pinned DESC, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_quick_notes_reminder ON quick_notes(reminder_status, reminder_at)
  WHERE reminder_status = 'pending';

/* Quan he da hinh don gian toi mot tap dong CRM Object — cung tinh than
   label_links (entity_type, entity_id) nhung rieng bang vi khac muc dich. */
CREATE TABLE quick_note_relations (
  id INTEGER PRIMARY KEY,
  quick_note_id INTEGER NOT NULL REFERENCES quick_notes(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL CHECK (object_type IN ('customer','contact','deal','project')),
  object_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (quick_note_id, object_type, object_id)
);
CREATE INDEX idx_qnr_note ON quick_note_relations(quick_note_id);

/* Dinh kem tep — tai su dung nguyen documentService/DocumentUpload, chi them
   mot cot lien ket giong het cach card_id da duoc them vao documents o v6. */
ALTER TABLE documents ADD COLUMN quick_note_id INTEGER REFERENCES quick_notes(id) ON DELETE CASCADE;
CREATE INDEX idx_documents_quick_note ON documents(quick_note_id, created_at DESC);
