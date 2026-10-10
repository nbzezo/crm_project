/* Quay lui v70: bo bai nhap / hen gio, mau bai, Telegram tung nguoi.

   Bai NHAP va bai HEN GIO chua dang bi xoa (v69 khong co trang thai cho chung).
   rollbackTo() chay voi foreign_keys = OFF nen phai tu xoa dong con.
   rollbackTo() da sao luu CSDL truoc khi chay. */

CREATE TEMP TABLE v70_unpublished AS SELECT id FROM feed_posts WHERE status IN ('draft','scheduled');
DELETE FROM feed_post_attachments WHERE post_id IN (SELECT id FROM v70_unpublished);
DELETE FROM feed_post_links WHERE post_id IN (SELECT id FROM v70_unpublished);
DELETE FROM feed_post_reactions WHERE post_id IN (SELECT id FROM v70_unpublished);
DELETE FROM feed_mentions WHERE post_id IN (SELECT id FROM v70_unpublished);
DELETE FROM feed_post_acks WHERE post_id IN (SELECT id FROM v70_unpublished);
DELETE FROM feed_post_saves WHERE post_id IN (SELECT id FROM v70_unpublished);
DELETE FROM feed_event_rsvps WHERE post_id IN (SELECT id FROM v70_unpublished);
DELETE FROM feed_notifications WHERE post_id IN (SELECT id FROM v70_unpublished);
DELETE FROM feed_poll_votes WHERE option_id IN (SELECT id FROM feed_poll_options WHERE post_id IN (SELECT id FROM v70_unpublished));
DELETE FROM feed_comment_likes WHERE comment_id IN (SELECT id FROM feed_comments WHERE post_id IN (SELECT id FROM v70_unpublished));
DELETE FROM feed_comments WHERE post_id IN (SELECT id FROM v70_unpublished);
DELETE FROM feed_poll_options WHERE post_id IN (SELECT id FROM v70_unpublished);
DELETE FROM feed_posts WHERE id IN (SELECT id FROM v70_unpublished);
DROP TABLE v70_unpublished;

CREATE TABLE feed_posts_v69 (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES feed_groups(id) ON DELETE CASCADE,
  author_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'post'
    CHECK (kind IN ('post','announcement','poll','question','event')),
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','pending','rejected')),
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0,1)),
  requires_ack INTEGER NOT NULL DEFAULT 0 CHECK (requires_ack IN (0,1)),
  poll_multi INTEGER NOT NULL DEFAULT 0 CHECK (poll_multi IN (0,1)),
  poll_closes_at TEXT,
  event_start_at TEXT,
  event_end_at TEXT,
  event_location TEXT NOT NULL DEFAULT '',
  /* Cong viec tao tu bai viet gan nhat — de bai hien "Đã tạo công việc". */
  task_card_id INTEGER REFERENCES cards(id) ON DELETE SET NULL,
  search_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  edited_at TEXT,
  deleted_at TEXT,
  deleted_by_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL
);
INSERT INTO feed_posts_v69 (id, group_id, author_contact_id, kind, body, status, is_pinned, requires_ack, poll_multi, poll_closes_at, event_start_at, event_end_at, event_location, task_card_id, search_text, created_at, edited_at, deleted_at, deleted_by_contact_id)
  SELECT id, group_id, author_contact_id, kind, body, status, is_pinned, requires_ack, poll_multi, poll_closes_at, event_start_at, event_end_at, event_location, task_card_id, search_text, created_at, edited_at, deleted_at, deleted_by_contact_id FROM feed_posts;
DROP TABLE feed_posts;
ALTER TABLE feed_posts_v69 RENAME TO feed_posts;
CREATE INDEX idx_feed_posts_group ON feed_posts(group_id, status, created_at DESC);
CREATE INDEX idx_feed_posts_author ON feed_posts(author_contact_id, created_at DESC);
CREATE INDEX idx_feed_posts_event ON feed_posts(event_start_at) WHERE kind = 'event';

DROP TABLE user_telegram;
DROP TABLE feed_post_templates;
ALTER TABLE telegram_settings DROP COLUMN updates_offset;
