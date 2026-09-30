/* v44: Workspace Cong viec kieu Lark.

   - creator_contact_id phan biet "toi tao" voi "giao cho toi";
   - task_watchers la danh sach nguoi theo doi mot viec;
   - task_activity giu dong thoi gian thay doi gon, doc nhanh o trang Cong viec;
   - task_saved_views luu bo loc/cot/sap xep theo tai khoan va co the chia se.
*/

ALTER TABLE cards ADD COLUMN creator_contact_id INTEGER
  REFERENCES contacts(id) ON DELETE SET NULL;

/* Du lieu cu khong co actor luc tao. Nguoi phu trach la xap xi trung thuc nhat,
   va tot hon nhieu so voi gan tat ca cho mot tai khoan quan tri. */
UPDATE cards
   SET creator_contact_id = assignee_contact_id
 WHERE creator_contact_id IS NULL;

CREATE INDEX idx_cards_creator ON cards(creator_contact_id, created_at DESC);

CREATE TABLE task_watchers (
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (card_id, contact_id)
);
CREATE INDEX idx_task_watchers_contact ON task_watchers(contact_id, created_at DESC);

CREATE TABLE task_activity (
  id INTEGER PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  actor_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('created','updated','moved','completed','reopened','watched','commented')),
  field TEXT,
  old_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_task_activity_card ON task_activity(card_id, created_at DESC, id DESC);
CREATE INDEX idx_task_activity_recent ON task_activity(created_at DESC, id DESC);

INSERT INTO task_activity (card_id, actor_contact_id, action, field, new_value, created_at)
SELECT id, creator_contact_id, 'created', 'title', title, created_at FROM cards;

CREATE TABLE task_saved_views (
  id INTEGER PRIMARY KEY,
  owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  is_shared INTEGER NOT NULL DEFAULT 0 CHECK (is_shared IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_task_saved_views_owner ON task_saved_views(owner_user_id, updated_at DESC);
