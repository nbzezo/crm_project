/* Quay ve v51: dua CHECK loai ban ghi tro lai. Link chia se "Trang tai lieu" (entity_type = 'page')
   bi xoa vi v51 khong biet loai nay; nhat ky luot mo cua chung xoa theo (ON DELETE CASCADE). */
DELETE FROM share_links WHERE entity_type NOT IN ('document','quotation','contract');

CREATE TABLE share_links_v51 (
  id INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  token_hint TEXT NOT NULL DEFAULT '',
  entity_type TEXT NOT NULL CHECK (entity_type IN ('document','quotation','contract')),
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
INSERT INTO share_links_v51 SELECT * FROM share_links;
DROP TABLE share_links;
ALTER TABLE share_links_v51 RENAME TO share_links;
CREATE INDEX idx_share_links_entity ON share_links(entity_type, entity_id);
CREATE INDEX idx_share_links_creator ON share_links(created_by_user_id, created_at DESC);
