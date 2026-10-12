/* v72 (1.37.0): du lieu cua MOT nguoi khong con dung chung toan he thong.

   1. notification_states — truoc day khoa chi la `notification_key`, nen A danh dau
      "da doc" / hoan mot thong bao thi B cung thay da doc / bi an. Nay khoa la
      (contact_id, notification_key). Trang thai cu duoc chep cho moi nguoi dang co
      tai khoan (giu nguyen nhung gi ho dang thay), rieng khoa `feed-<id>` chi chep
      cho dung nguoi nhan cua thong bao Bang tin do.
   2. ai_action_proposals.owner_contact_id — de xuat hanh dong cua Tro ly AI thuoc
      nguoi da hoi. De xuat cu de NULL: chi nguoi co pham vi `ai` toan cong ty thay.

   Bon trigger don dep cua v28 tro vao notification_states: xoa truoc khi thay bang
   roi tao lai (ALTER TABLE RENAME kiem tra lai trigger va se loi khi bang cu da mat). */

DROP TRIGGER IF EXISTS cleanup_notification_state_reminder;
DROP TRIGGER IF EXISTS cleanup_notification_state_event;
DROP TRIGGER IF EXISTS cleanup_notification_state_task;
DROP TRIGGER IF EXISTS cleanup_notification_state_ai;

CREATE TABLE notification_states_v72 (
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  notification_key TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0,1)),
  read_at TEXT,
  snoozed_until TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (contact_id, notification_key)
);

INSERT OR IGNORE INTO notification_states_v72
  (contact_id, notification_key, is_read, read_at, snoozed_until, updated_at)
SELECT u.contact_id, s.notification_key, s.is_read, s.read_at, s.snoozed_until, s.updated_at
  FROM notification_states s
  JOIN (SELECT DISTINCT contact_id FROM users WHERE contact_id IS NOT NULL) u
 WHERE s.notification_key NOT LIKE 'feed-%';

INSERT OR IGNORE INTO notification_states_v72
  (contact_id, notification_key, is_read, read_at, snoozed_until, updated_at)
SELECT f.contact_id, s.notification_key, s.is_read, s.read_at, s.snoozed_until, s.updated_at
  FROM notification_states s
  JOIN feed_notifications f
    ON f.id = CAST(substr(s.notification_key, length('feed-') + 1) AS INTEGER)
 WHERE s.notification_key LIKE 'feed-%';

DROP TABLE notification_states;
ALTER TABLE notification_states_v72 RENAME TO notification_states;

CREATE INDEX idx_notification_states_read
  ON notification_states(contact_id, is_read, updated_at DESC);
CREATE INDEX idx_notification_states_key ON notification_states(notification_key);
CREATE INDEX idx_notification_states_snooze
  ON notification_states(snoozed_until)
  WHERE snoozed_until IS NOT NULL;

CREATE TRIGGER cleanup_notification_state_reminder AFTER DELETE ON reminders
BEGIN
  DELETE FROM notification_states WHERE notification_key = 'reminder-' || OLD.id;
END;
CREATE TRIGGER cleanup_notification_state_event AFTER DELETE ON calendar_events
BEGIN
  DELETE FROM notification_states WHERE notification_key = 'event-' || OLD.id;
END;
CREATE TRIGGER cleanup_notification_state_task AFTER DELETE ON cards
BEGIN
  DELETE FROM notification_states WHERE notification_key = 'task-' || OLD.id;
END;
CREATE TRIGGER cleanup_notification_state_ai AFTER DELETE ON ai_notifications
BEGIN
  DELETE FROM notification_states WHERE notification_key = 'ai-' || OLD.id;
END;

ALTER TABLE ai_action_proposals ADD COLUMN owner_contact_id INTEGER
  REFERENCES contacts(id) ON DELETE SET NULL;
CREATE INDEX idx_ai_actions_owner ON ai_action_proposals(owner_contact_id, created_at DESC);
