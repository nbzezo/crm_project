/* ---------- v30: Ghi chu hop (Meeting Notes) cho Co hoi & Du an ----------

   Khac voi `interactions` (loai 'meeting') chi ghi DUOC MOT dong tom tat tu do cho
   mot lan tuong tac, bang nay cho phep nhieu ghi chu dang van ban co cau truc
   (block, kieu Notion) lap lai trong vong doi mot Co hoi hoac Du an.

   `content_json` la khoi block cua trinh soan thao phia client (BlockNote) — server
   coi la du lieu khong doc duoc (opaque), khong parse. `content_text` la ban chu
   thuan do client tu suy ra tu content_json, dung de tim kiem va lam ngu canh cho AI
   — dung pattern voi `documents.description`/`search_text` da co (xem
   documentService.ts, buildSearchText o lib/viSearch.ts).

   Mot ghi chu phai thuoc it nhat mot trong hai: mot Co hoi hoac mot Du an (co the ca
   hai, khi Co hoi da gan Du an trien khai). `project_id` KHONG nam trong EntityLinks
   dung chung (xem entityRelations.ts) nen duoc kiem rieng bang
   assertProjectCustomerLink o tang route/service, song song voi assertEntityLinks
   cho deal_id/customer_id. */

CREATE TABLE meeting_notes (
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
  deleted_at TEXT,
  CHECK (deal_id IS NOT NULL OR project_id IS NOT NULL)
);
CREATE INDEX idx_meeting_notes_deal ON meeting_notes(deal_id, meeting_at DESC);
CREATE INDEX idx_meeting_notes_project ON meeting_notes(project_id, meeting_at DESC);

/* Nguoi tham du gan voi Danh ba (contacts) san co — chip rieng ngoai noi dung, loc
   duoc "ghi chu toi co tham du" sau nay ma khong can doc het content_text. */
CREATE TABLE meeting_note_attendees (
  id INTEGER PRIMARY KEY,
  meeting_note_id INTEGER NOT NULL REFERENCES meeting_notes(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  UNIQUE(meeting_note_id, contact_id)
);
CREATE INDEX idx_meeting_note_attendees_note ON meeting_note_attendees(meeting_note_id);
