/* Quay ve v55: dua canh bao "Khach vua mo lien ket" tro lai thanh nhac hen chua xong. */
INSERT INTO reminders (title, note, due_at, customer_id, deal_id, created_at)
SELECT n.title, n.body, strftime('%Y-%m-%dT%H:%M', n.created_at),
       (SELECT id FROM customers WHERE n.link LIKE '/customers/%' AND id = CAST(substr(n.link, 12) AS INTEGER)),
       (SELECT id FROM deals WHERE n.link LIKE '/deals/%' AND id = CAST(substr(n.link, 8) AS INTEGER)),
       n.created_at
  FROM ai_notifications n
 WHERE n.fingerprint LIKE 'share-view-%';

DELETE FROM ai_notifications WHERE fingerprint LIKE 'share-view-%';
