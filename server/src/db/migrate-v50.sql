/* ---------- v50: danh ba ca nhan + dong bo danh ba Google ----------

   `personal_contacts` la danh ba RIENG cua tung nhan vien (keo tu dien thoai /
   Gmail). Khong dung bang `contacts`: do la nguoi lien he cua MOT khach hang
   (customer_id NOT NULL) va nam trong pham vi du lieu theo don vi; danh ba dien
   thoai cua mot nguoi thi chua thuoc khach hang nao va khong duoc ai khac nhin.
   Nhan vien chon dong nao thi "dua vao CRM" thanh `contacts` that
   (linked_contact_id luu lai de khong dua hai lan).

   `personal_contact_keys`: khoa so khop da CHUAN HOA (so dien thoai ve dang quoc
   te, email ve chu thuong) — de tim trung trong danh ba ca nhan va doi chieu voi
   `contacts` ma khong phai quet LIKE.

   `google_contact_accounts`: mot dong / nhan vien. Refresh token ma hoa cung khuon
   email_settings. Client ID/Secret lay chung tu muc Email (hoac Sao luu Drive),
   khong luu lai o day. `sync_token` cho People API: lan sau chi keo phan thay doi. */

CREATE TABLE personal_contacts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  org_name TEXT,
  title TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'file' CHECK (source IN ('google','file')),
  google_resource_name TEXT,
  google_etag TEXT,
  linked_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  search_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_personal_contacts_user ON personal_contacts(user_id, full_name);
CREATE UNIQUE INDEX idx_personal_contacts_google
  ON personal_contacts(user_id, google_resource_name)
  WHERE google_resource_name IS NOT NULL;

CREATE TABLE personal_contact_keys (
  contact_id INTEGER NOT NULL REFERENCES personal_contacts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('phone','email')),
  value TEXT NOT NULL,
  PRIMARY KEY (contact_id, kind, value)
);
CREATE INDEX idx_personal_contact_keys_value ON personal_contact_keys(kind, value);

CREATE TABLE google_contact_accounts (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  google_account TEXT NOT NULL,
  refresh_token_ciphertext TEXT NOT NULL DEFAULT '',
  refresh_token_iv TEXT NOT NULL DEFAULT '',
  refresh_token_tag TEXT NOT NULL DEFAULT '',
  sync_token TEXT,
  auto_sync INTEGER NOT NULL DEFAULT 1 CHECK (auto_sync IN (0,1)),
  connected_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  last_sync_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  last_imported INTEGER,
  last_updated INTEGER,
  last_removed INTEGER
);
