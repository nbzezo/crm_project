/* ---------- v38: nhieu nguoi dung, dang nhap bang email, lay lai mat khau ----------

   v35 them lop dang nhap toi thieu cho MOT tai khoan. v38 mo no ra thanh nhieu
   nguoi dung that su — day la buoc dau tien cua dot phan cap quan ly.

   BON thay doi, moi thay doi tra loi mot cau hoi cu the:

   1. `users` biet nguoi dung LA AI (`contact_id`, `full_name`) va lien lac duoc
      (`email`). Truoc v38, mot tai khoan chi la mot chuoi `username` khong noi
      voi bat cu thu gi trong so danh ba, trong khi cai "toi" ma ung dung thuc su
      dung lai nam o `contacts.is_me` — mot co singleton hoan toan roi khoi bang
      users. Hai khai niem danh tinh song song nhu vay chi con dung duoc chung
      nao con dung MOT nguoi. `contact_id` noi chung lai, va tu day tro di
      `contacts.is_me` khong con duoc doc o duong chay nao nua (cot van giu de
      quay lui duoc; don han o v39).

   2. `email` la dinh danh dang nhap moi. KHONG bo `username`: doi cung luc voi
      viec doi co che dang nhap se khoa cua chinh minh neu backfill sai. Ca hai
      cung nhan trong mot phien ban, username go bo sau khi moi tai khoan da co
      email.

   3. `password_reset_tokens` cho ca thu MOI (`invite`) lan QUEN MAT KHAU
      (`reset`) — cung mot co che "mot lien ket dung mot lan", khac nhau o noi
      dung thu, nen mot bang. Luu `token_hash` = sha256(token) chu khong phai
      token: cung ly do `sessions.id` duoc bam tu v35 — ro ri CSDL khong duoc
      phep bien thanh chiem tai khoan. Nguoi tao tai khoan KHONG bao gio biet
      mat khau cua nguoi khac.

   4. `sessions.user_id` de vo hieu hoa duoc phien khi khoa tai khoan. `data` la
      blob JSON cua express-session nen khong truy nguoc duoc chu tai khoan —
      thieu cot nay thi "khoa tai khoan" chi co hieu luc o lan dang nhap sau, con
      phien dang mo van song tiep toi 30 ngay.

   `email_settings` sao dung cau truc `telegram_settings` (v21): mot dong id = 1,
   bi mat ma hoa bang encryptSecret/decryptSecret o services/ai/secretStore.ts.
   Khong dung app_settings vi mat khau SMTP can ba cot ciphertext/iv/tag rieng.

   Ca `users`, `sessions`, `password_reset_tokens` va `email_settings` KHONG nam
   trong EXPORT_TABLES (routes/system.ts) — ban xuat chi chua du lieu nghiep vu. */

/* ---------- 1. users: danh tinh that ---------- */

ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN full_name TEXT;
ALTER TABLE users ADD COLUMN contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1));
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0
  CHECK (must_change_password IN (0,1));
ALTER TABLE users ADD COLUMN last_login_at TEXT;

/* UNIQUE qua index chu khong qua constraint: SQLite khong them duoc UNIQUE bang
   ALTER TABLE. SQLite coi nhieu NULL la khac nhau, nen tai khoan cu chua co
   email / chua gan contact van ton tai duoc cho toi khi admin dien not. */
CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_users_contact ON users(contact_id) WHERE contact_id IS NOT NULL;

/* Backfill: noi tai khoan dau tien voi contact dang la "toi".

   Chi cham vao tai khoan CO ID NHO NHAT va chi khi no chua duoc gan — chay lai
   migration tren mot CSDL da co nhieu nguoi dung se khong ghi de ai. */
UPDATE users
   SET contact_id = (SELECT id FROM contacts WHERE is_me = 1 ORDER BY id LIMIT 1)
 WHERE contact_id IS NULL
   AND id = (SELECT MIN(id) FROM users)
   AND EXISTS (SELECT 1 FROM contacts WHERE is_me = 1);

UPDATE users
   SET full_name = COALESCE(full_name, (SELECT full_name FROM contacts WHERE id = users.contact_id)),
       email     = COALESCE(email, NULLIF((SELECT email FROM contacts WHERE id = users.contact_id), ''))
 WHERE contact_id IS NOT NULL;

/* ---------- 2. Lien ket dung mot lan: thu moi + quen mat khau ---------- */

CREATE TABLE password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  /* sha256(token) dang hex. Token goc chi ton tai trong noi dung thu. */
  token_hash TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('invite','reset')),
  expires_at INTEGER NOT NULL,          -- epoch ms
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_reset_tokens_user ON password_reset_tokens(user_id, used_at);
CREATE INDEX idx_reset_tokens_expires ON password_reset_tokens(expires_at);

/* ---------- 3. Phien gan voi tai khoan ---------- */

ALTER TABLE sessions ADD COLUMN user_id INTEGER;
CREATE INDEX idx_sessions_user ON sessions(user_id);

/* ---------- 4. Cau hinh SMTP ---------- */

CREATE TABLE email_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  host TEXT NOT NULL DEFAULT '',
  port INTEGER NOT NULL DEFAULT 587,
  /* 1 = TLS ngay tu dau (cong 465); 0 = STARTTLS (cong 587). */
  secure INTEGER NOT NULL DEFAULT 0 CHECK (secure IN (0,1)),
  username TEXT NOT NULL DEFAULT '',
  password_ciphertext TEXT NOT NULL DEFAULT '',
  password_iv TEXT NOT NULL DEFAULT '',
  password_tag TEXT NOT NULL DEFAULT '',
  from_name TEXT NOT NULL DEFAULT 'WorkFlow',
  from_email TEXT NOT NULL DEFAULT '',
  /* Goc URL dat trong noi dung thu moi / thu dat lai mat khau. De trong thi
     suy tu header cua request dang goi — sai khi chay sau proxy la link chet,
     nen cho khai bao tuong minh. */
  app_base_url TEXT NOT NULL DEFAULT '',
  last_test_at TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
INSERT INTO email_settings (id) VALUES (1);
