/* ---------- v37: Phien chat voi Tro ly AI ----------

   Truoc day hoi dap voi tro ly chi song trong state React: tai lai trang la mat
   sach, va khong co cach nao mo lai mot cuoc trao doi cu. Hai bang duoi day cho
   phep nhieu phien song song, xoa tung phien, va doc lai day du lich su.

   Vi sao luu o may chu chu khong phai localStorage: moi thu khac cua ung dung
   deu nam trong SQLite nay, va lich su hoi dap co the chua thong tin CRM that
   (ten khach, gia tri deal) — de o trinh duyet thi khong sao luu duoc theo
   `backups/`, cung khong xoa duoc khi nguoi dung xoa du lieu.

   Gioi han 20 phien gan nhat duoc thuc thi o tang service (chatSessions.ts) chu
   khong phai o day: SQLite khong co trigger LIMIT goi gon, va viec cat bot nen
   xay ra dung mot cho de con doc duoc.
*/

CREATE TABLE ai_chat_sessions (
  id INTEGER PRIMARY KEY,
  /* Rong = chua dat ten; server tu lay cau hoi dau tien lam tieu de. */
  title TEXT NOT NULL DEFAULT '',
  /* Pham vi tra cuu mac dinh cua phien — nguoi dung van doi duoc giua chung. */
  scope TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('crm', 'documents', 'all')),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE ai_chat_messages (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  /* JSON: sources, follow_up_questions, proposal, meta (provider/model/requestId).
     Giu nguyen ban de mo lai phien cu hien dung nhu luc vua tra loi — khong
     dung lai duoc neu chi luu moi doan van tra loi. */
  meta_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

/* Doc tin nhan cua mot phien theo dung thu tu — truy van nong nhat cua module. */
CREATE INDEX idx_ai_chat_messages_session ON ai_chat_messages(session_id, id);

/* Danh sach phien luon sap theo lan dung gan nhat. */
CREATE INDEX idx_ai_chat_sessions_updated ON ai_chat_sessions(updated_at DESC);
