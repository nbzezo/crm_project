/* v69: thong bao Bang tin (1.34.0).

   Chuong thong bao cu tinh khi doc va dung chung `notification_states` cho ca he
   thong — dung cho nhac hen/viec cua MOT nguoi, khong dung cho tin nhom gui toi
   nhieu nguoi. Moi thong bao Bang tin la MOT dong cho MOT nguoi nhan, tao luc
   ghi (dang bai, nhac ten, binh luan, cho duyet, duoc duyet). Khoa trong chuong
   la `feed-<id>` — id da rieng tung nguoi, nen trang thai doc/hoan van di qua
   `notification_states` ma khong lan giua nguoi voi nguoi. */

CREATE TABLE feed_notifications (
  id INTEGER PRIMARY KEY,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL
    CHECK (kind IN ('post','announcement','mention','comment','reply','pending','approved')),
  post_id INTEGER NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  comment_id INTEGER REFERENCES feed_comments(id) ON DELETE CASCADE,
  actor_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_feed_notifications_contact ON feed_notifications(contact_id, created_at DESC);
CREATE INDEX idx_feed_notifications_post ON feed_notifications(post_id, contact_id);

/* Bot Telegram phuc vu MOT nguoi nhan (xem telegramNotifier.ts): gui cho ho cac
   thong bao Bang tin quan trong (nhac ten, thong bao, binh luan bai cua ho, bai cho duyet). */
ALTER TABLE telegram_settings ADD COLUMN notify_feed INTEGER NOT NULL DEFAULT 1
  CHECK (notify_feed IN (0,1));
