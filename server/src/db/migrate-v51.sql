/* ---------- v51: chia se tai lieu / bao gia / hop dong bang duong lien ket (chi xem) ----------

   `share_links` luu MOT lien ket cong khai. Token ngau nhien (32 byte) chi hien ra
   MOT LAN luc tao; CSDL chi giu SHA-256 cua no (`token_hash`) — ban sao luu CSDL
   len Google Drive bi lo cung khong lo ra duong link dung duoc. Ke ca nguoi tao
   cung khong xem lai duoc link: muon gui lai thi tao link moi.

   `entity_type` + `entity_id` khong co khoa ngoai (da hinh). Khi ban ghi goc bi
   xoa, link khong con tra duoc noi dung (route cong khai tra 404) nhung dong log
   van con de truy vet.

   `snapshot_json`: NULL = link luon tro toi ban hien tai; co gia tri = dong bang
   cac truong cong khai + danh sach tep luc chia se. Bao gia mac dinh dong bang
   de khach khong thay con so doi am tham sau khi da gui.

   `password_*`: scrypt, tuy chon. `allow_download = 0` = chi xem tren trinh duyet. */

CREATE TABLE share_links (
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
CREATE INDEX idx_share_links_entity ON share_links(entity_type, entity_id);
CREATE INDEX idx_share_links_creator ON share_links(created_by_user_id, created_at DESC);

CREATE TABLE share_link_views (
  id INTEGER PRIMARY KEY,
  link_id INTEGER NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
  viewed_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT 'view' CHECK (action IN ('view','download'))
);
CREATE INDEX idx_share_link_views_link ON share_link_views(link_id, viewed_at DESC);

/* Cong tat/bat chia se cong khai cho toan he thong (quan tri). Mac dinh BAT. */
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('sharing.public_enabled', '1');
