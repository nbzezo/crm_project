/* v56: "Khach vua mo lien ket" la canh bao, khong phai lich hen — chuyen cac nhac hen
   chua xong do tao sang chuong thong bao (ai_notifications) roi xoa khoi `reminders`
   de chung khong con chiem cho trong Lich trinh / Lich. */
INSERT OR IGNORE INTO ai_notifications (severity, title, body, link, fingerprint, created_at)
SELECT 'info', r.title, COALESCE(r.note, ''),
       CASE WHEN r.deal_id IS NOT NULL THEN '/deals/' || r.deal_id
            WHEN r.customer_id IS NOT NULL THEN '/customers/' || r.customer_id
       END,
       'share-view-reminder-' || r.id, r.created_at
  FROM reminders r
 WHERE r.is_done = 0 AND r.card_id IS NULL AND r.title LIKE 'Khách vừa mở liên kết:%';

DELETE FROM reminders
 WHERE is_done = 0 AND card_id IS NULL AND title LIKE 'Khách vừa mở liên kết:%';
