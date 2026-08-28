/* ---------- v35: Dang nhap mot nguoi dung + phien server-side ----------

   Truoc v35 API khong co xac thuc: bat ky ai goi duoc toi cong 3001 deu doc va
   xuat toan bo CSDL CRM. v35 them lop dang nhap toi thieu de dua ung dung len
   internet cong khai.

   `users`: KHONG khoa cung mot dong (id = 1) — de mo duong them nguoi dung thu
   hai sau nay ma khong can migration moi. Hom nay bootstrapAdmin.ts chi seed
   dung mot dong tu WORKFLOW_ADMIN_USER / WORKFLOW_ADMIN_PASSWORD khi bang rong.
   Mat khau bam bang scrypt (server/src/services/auth/passwords.ts), luu salt +
   hash dang base64.

   `sessions`: store cua express-session (SqliteSessionStore.ts). `id` la
   sha256(session id) — export/ro ri CSDL cung khong dung lai duoc token. `data`
   la blob JSON cua express-session. `expires_at` epoch ms, don dinh ky bang mot
   cau DELETE goi luoi trong store.set().

   Ca hai bang KHONG nam trong GET /api/export (routes/system.ts): ban xuat chi
   chua du lieu nghiep vu, khong chua thong tin dang nhap / phien. */

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
