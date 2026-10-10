/* Quay lui v69: bo thong bao Bang tin. Bai viet, binh luan khong mat; chi mat danh
   sach thong bao da gui. Trang thai doc trong notification_states (khoa feed-*) bi bo. */
DELETE FROM notification_states WHERE notification_key LIKE 'feed-%';
ALTER TABLE telegram_settings DROP COLUMN notify_feed;
DROP TABLE feed_notifications;
