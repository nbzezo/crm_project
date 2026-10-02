/* ---------- v52: chia se them "Trang tai lieu" (meeting_notes) + bo CHECK loai ban ghi ----------

   SQLite khong sua duoc CHECK tai cho, nen thay bang (tat khoa ngoai trong luc do — xem
   migrate.ts). Bang moi KHONG con CHECK tren `entity_type`: danh sach loai duoc chia se
   da duoc giu o hai noi trong code (zod `SHARE_ENTITY_TYPES` va `loadEntity()` tra undefined
   cho loai la), nen CHECK o day chi them mot noi phai nho va buoc moi loai moi phai co mot
   migration thay bang. Them loai moi tu gio KHONG can migration. */

CREATE TABLE share_links_v52 (
  id INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  token_hint TEXT NOT NULL DEFAULT '',
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  expires_at TEXT,
  password_salt TEXT,
  password_hash TEXT,
  allow_download INTEGER NOT NULL DEFAULT 1 CHECK (allow_download IN (0,1)),
  notify_on_view INTEGER NOT NULL DEFAULT 0 CHECK (notify_on_view IN (0,1)),
  snapshot_json TEXT,
  revoked_at TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TEXT
);

INSERT INTO share_links_v52
  (id, token_hash, token_hint, entity_type, entity_id, title, created_by_user_id, created_by_name,
   created_at, expires_at, password_salt, password_hash, allow_download, notify_on_view,
   snapshot_json, revoked_at, view_count, last_viewed_at)
SELECT id, token_hash, token_hint, entity_type, entity_id, title, created_by_user_id, created_by_name,
       created_at, expires_at, password_salt, password_hash, allow_download, notify_on_view,
       snapshot_json, revoked_at, view_count, last_viewed_at
  FROM share_links;
DROP TABLE share_links;
ALTER TABLE share_links_v52 RENAME TO share_links;

CREATE INDEX idx_share_links_entity ON share_links(entity_type, entity_id);
CREATE INDEX idx_share_links_creator ON share_links(created_by_user_id, created_at DESC);
