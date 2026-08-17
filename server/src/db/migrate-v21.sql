/* ---------- v21: thong bao qua Telegram ----------
   App single-tenant nen chi can mot cau hinh Telegram dung chung (bot token + chat id),
   luu dang mot hang duy nhat (id = 1). Token ma hoa theo dung pattern secretStore.ts
   dang dung cho AI provider key. */
CREATE TABLE telegram_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  chat_id TEXT NOT NULL DEFAULT '',
  bot_token_ciphertext TEXT NOT NULL DEFAULT '',
  bot_token_iv TEXT NOT NULL DEFAULT '',
  bot_token_tag TEXT NOT NULL DEFAULT '',
  notify_due_dates INTEGER NOT NULL DEFAULT 1 CHECK (notify_due_dates IN (0,1)),
  notify_reminders INTEGER NOT NULL DEFAULT 1 CHECK (notify_reminders IN (0,1)),
  notify_assignee INTEGER NOT NULL DEFAULT 1 CHECK (notify_assignee IN (0,1)),
  last_test_at TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
INSERT INTO telegram_settings (id) VALUES (1);

/* Chong gui trung: moi lan gui thanh cong ghi mot dong khoa duy nhat truoc khi
   quet lai. Khoa gom ca gia tri thay doi (vd due_date) de doi han thi bao lai. */
CREATE TABLE telegram_sent_log (
  dedupe_key TEXT PRIMARY KEY,
  sent_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
