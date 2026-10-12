/* Quay ve v71: trang thai thong bao lai dung chung mot khoa cho ca he thong (gop moi
   nguoi ve mot dong — giu dong cap nhat sau cung), de xuat AI mat cot chu. */
DROP INDEX IF EXISTS idx_ai_actions_owner;
ALTER TABLE ai_action_proposals DROP COLUMN owner_contact_id;

DROP TRIGGER IF EXISTS cleanup_notification_state_reminder;
DROP TRIGGER IF EXISTS cleanup_notification_state_event;
DROP TRIGGER IF EXISTS cleanup_notification_state_task;
DROP TRIGGER IF EXISTS cleanup_notification_state_ai;

CREATE TABLE notification_states_v71 (
  notification_key TEXT PRIMARY KEY,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0,1)),
  read_at TEXT,
  snoozed_until TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
INSERT OR REPLACE INTO notification_states_v71
  (notification_key, is_read, read_at, snoozed_until, updated_at)
SELECT notification_key, is_read, read_at, snoozed_until, updated_at
  FROM notification_states
 ORDER BY updated_at;
DROP TABLE notification_states;
ALTER TABLE notification_states_v71 RENAME TO notification_states;

CREATE INDEX idx_notification_states_read
  ON notification_states(is_read, updated_at DESC);
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
