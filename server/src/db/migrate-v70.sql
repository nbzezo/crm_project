/* v70 (1.35.0): bai nhap / hen gio dang, mau bai, Telegram cua tung nguoi.

   1. feed_posts.status them 'draft' (chi tac gia thay) va 'scheduled' (tu dang luc
      publish_at). CHECK cua cot duoc dung lai trong migrate.ts (rebuildTable).
      Moi truy van hien bai cho nguoi khac deu loc status = 'published' nen hai
      trang thai moi tu dong khong lot ra ngoai.
   2. feed_post_templates: mau bai rieng (group_id NULL) hoac dung chung cho nhom.
   3. user_telegram: moi tai khoan tu noi Telegram cua minh voi bot cua cong ty
      (bam lien ket t.me/<bot>?start=<ma>), chon loai thong bao muon nhan. Bot va
      Bot Token van do quan tri cau hinh mot lan o telegram_settings. */

ALTER TABLE feed_posts ADD COLUMN publish_at TEXT;
CREATE INDEX idx_feed_posts_scheduled ON feed_posts(publish_at) WHERE status = 'scheduled';

CREATE TABLE feed_post_templates (
  id INTEGER PRIMARY KEY,
  owner_contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
  /* NULL = mau rieng cua nguoi tao; co gia tri = mau dung chung cho ca nhom. */
  group_id INTEGER REFERENCES feed_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'post'
    CHECK (kind IN ('post','announcement','poll','question','event')),
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_feed_post_templates_owner ON feed_post_templates(owner_contact_id);
CREATE INDEX idx_feed_post_templates_group ON feed_post_templates(group_id);

CREATE TABLE user_telegram (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  chat_id TEXT,
  tg_name TEXT,
  linked_at TEXT,
  /* Ma dung mot lan cho lien ket t.me/<bot>?start=<ma>; het han sau 15 phut. */
  link_code TEXT UNIQUE,
  link_code_expires_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  notify_tasks INTEGER NOT NULL DEFAULT 1 CHECK (notify_tasks IN (0,1)),
  notify_reminders INTEGER NOT NULL DEFAULT 1 CHECK (notify_reminders IN (0,1)),
  notify_assignee INTEGER NOT NULL DEFAULT 1 CHECK (notify_assignee IN (0,1)),
  notify_feed INTEGER NOT NULL DEFAULT 1 CHECK (notify_feed IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

/* Vi tri da doc trong getUpdates — de khong xu ly lai mot lenh /start hai lan. */
ALTER TABLE telegram_settings ADD COLUMN updates_offset INTEGER NOT NULL DEFAULT 0;
