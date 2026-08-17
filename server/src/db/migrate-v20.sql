/* ---------- v20: trung tam thong bao ----------
   Nguon thong bao (nhac hen, lich, task, AI) van thuoc cac bang nghiep vu rieng.
   Bang nay chi luu trang thai trinh bay cua tung muc, tranh chen `is_read` va
   `snoozed_until` vao bon mo hinh khong cung vong doi. */
CREATE TABLE notification_states (
  notification_key TEXT PRIMARY KEY,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0,1)),
  read_at TEXT,
  snoozed_until TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX idx_notification_states_read
  ON notification_states(is_read, updated_at DESC);
CREATE INDEX idx_notification_states_snooze
  ON notification_states(snoozed_until)
  WHERE snoozed_until IS NOT NULL;
