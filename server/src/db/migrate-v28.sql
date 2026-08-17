/* ---------- v28: sua du lieu lech va khoa cac gia tri nhan dang ---------- */

/* Cot Kanban co status_mapping la nguon cua vong doi. Sua cac ban ghi duoc tao
   thang vao cot truoc khi createCard duoc bo sung dong bo. */
UPDATE cards
   SET status = (SELECT l.status_mapping FROM lists l WHERE l.id = cards.list_id),
       is_done = CASE
         WHEN (SELECT l.status_mapping FROM lists l WHERE l.id = cards.list_id) = 'done' THEN 1
         ELSE 0
       END,
       completed_at = CASE
         WHEN (SELECT l.status_mapping FROM lists l WHERE l.id = cards.list_id) = 'done'
           THEN COALESCE(completed_at, updated_at, created_at)
         ELSE NULL
       END
 WHERE EXISTS (
   SELECT 1 FROM lists l
    WHERE l.id = cards.list_id AND l.status_mapping IS NOT NULL
      AND (cards.status <> l.status_mapping
        OR cards.is_done <> CASE WHEN l.status_mapping = 'done' THEN 1 ELSE 0 END)
 );

/* Chuan hoa nhan dang doanh nghiep. Chi muc bieu thuc la hang rao cuoi cung neu
   mot duong ghi moi quen goi bo kiem tra o API. */
UPDATE customers
   SET tax_code = NULLIF(upper(trim(tax_code)), ''),
       email = NULLIF(lower(trim(email)), ''),
       website = NULLIF(trim(website), ''),
       status = CASE WHEN org_kind = 'customer' THEN status ELSE 'inactive' END;

CREATE UNIQUE INDEX idx_customers_tax_code_normalized
  ON customers(upper(trim(tax_code)))
  WHERE tax_code IS NOT NULL AND trim(tax_code) <> '';

/* Checklist ton tai thi no la nguon su that duy nhat cua handover_ready. */
UPDATE deals
   SET handover_ready = CASE WHEN EXISTS (
         SELECT 1 FROM deal_handover_items h
          WHERE h.deal_id = deals.id AND h.is_required = 1 AND h.is_done = 0
       ) THEN 0 ELSE 1 END
 WHERE EXISTS (SELECT 1 FROM deal_handover_items h WHERE h.deal_id = deals.id);

/* Don state mo coi va xoa theo nguon ve sau, tranh id duoc tai su dung ke thua
   trang thai da doc/snooze cua mot thong bao cu. */
DELETE FROM notification_states
 WHERE notification_key LIKE 'reminder-%'
   AND NOT EXISTS (
     SELECT 1 FROM reminders r
      WHERE r.id = CAST(substr(notification_key, length('reminder-') + 1) AS INTEGER)
   );
DELETE FROM notification_states
 WHERE notification_key LIKE 'event-%'
   AND NOT EXISTS (
     SELECT 1 FROM calendar_events e
      WHERE e.id = CAST(substr(notification_key, length('event-') + 1) AS INTEGER)
   );
DELETE FROM notification_states
 WHERE notification_key LIKE 'task-%'
   AND NOT EXISTS (
     SELECT 1 FROM cards k
      WHERE k.id = CAST(substr(notification_key, length('task-') + 1) AS INTEGER)
   );
DELETE FROM notification_states
 WHERE notification_key LIKE 'ai-%'
   AND NOT EXISTS (
     SELECT 1 FROM ai_notifications a
      WHERE a.id = CAST(substr(notification_key, length('ai-') + 1) AS INTEGER)
   );

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
