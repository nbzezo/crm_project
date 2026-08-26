/* ---------- v31: Cho phep ghi chu hop DOC LAP (khong gan Co hoi/Du an) ----------

   v30 bat buoc moi ghi chu phai thuoc it nhat mot Co hoi hoac mot Du an (CHECK
   constraint). Trang "Ghi chu" moi o muc Phan tich & cong cu can tao nhanh mot
   ghi chu roi gan Co hoi/Du an SAU (hoac khong gan gi ca) — nen bo CHECK nay.
   SQLite khong sua duoc CHECK tai cho, nen phai dung lai bang: tao bang moi,
   chep sang, doi ten. Giu NGUYEN id vi meeting_note_attendees tro toi, do cung
   la ly do buoc nay phai chay voi foreign_keys = OFF (xem migrate.ts, giong
   cach v25/v4 lam). */

CREATE TABLE meeting_notes_new (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  meeting_at TEXT,
  content_json TEXT NOT NULL DEFAULT '[]',
  content_text TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',
  ai_summary_json TEXT,
  ai_summary_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  deleted_at TEXT
);

INSERT INTO meeting_notes_new
  (id, customer_id, deal_id, project_id, title, meeting_at, content_json, content_text,
   search_text, ai_summary_json, ai_summary_at, created_at, updated_at, deleted_at)
SELECT id, customer_id, deal_id, project_id, title, meeting_at, content_json, content_text,
       search_text, ai_summary_json, ai_summary_at, created_at, updated_at, deleted_at
  FROM meeting_notes;

DROP TABLE meeting_notes;
ALTER TABLE meeting_notes_new RENAME TO meeting_notes;

CREATE INDEX idx_meeting_notes_deal ON meeting_notes(deal_id, meeting_at DESC);
CREATE INDEX idx_meeting_notes_project ON meeting_notes(project_id, meeting_at DESC);
