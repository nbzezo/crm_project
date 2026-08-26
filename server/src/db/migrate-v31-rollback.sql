/* ---------- Rollback v31 -> v30 ----------

   Chay bang: npm run db:rollback --workspace server -- 30

   MAT MAT DU LIEU: nhung ghi chu hop DOC LAP (khong gan Co hoi lan Du an, chi co
   the o v31) bi xoa vinh vien truoc khi khoi phuc lai CHECK constraint cua v30 —
   khong co cho nao o v30 de luu tam chung. */

DELETE FROM meeting_notes WHERE deal_id IS NULL AND project_id IS NULL;

CREATE TABLE meeting_notes_old (
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

INSERT INTO meeting_notes_old
  (id, customer_id, deal_id, project_id, title, meeting_at, content_json, content_text,
   search_text, ai_summary_json, ai_summary_at, created_at, updated_at, deleted_at)
SELECT id, customer_id, deal_id, project_id, title, meeting_at, content_json, content_text,
       search_text, ai_summary_json, ai_summary_at, created_at, updated_at, deleted_at
  FROM meeting_notes;

DROP TABLE meeting_notes;
ALTER TABLE meeting_notes_old RENAME TO meeting_notes;

CREATE INDEX idx_meeting_notes_deal ON meeting_notes(deal_id, meeting_at DESC);
CREATE INDEX idx_meeting_notes_project ON meeting_notes(project_id, meeting_at DESC);
