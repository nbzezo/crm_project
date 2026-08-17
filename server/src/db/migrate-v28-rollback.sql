/* v28 khong them cot/bang. Du lieu da trim/backfill duoc giu nguyen co y. */
DROP TRIGGER IF EXISTS cleanup_notification_state_reminder;
DROP TRIGGER IF EXISTS cleanup_notification_state_event;
DROP TRIGGER IF EXISTS cleanup_notification_state_task;
DROP TRIGGER IF EXISTS cleanup_notification_state_ai;
DROP INDEX IF EXISTS idx_customers_tax_code_normalized;
