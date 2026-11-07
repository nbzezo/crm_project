/* Quay ve v75: bo view, trigger, chi muc va bang trang thai popup cua v76. Du lieu khong doi; cache so lieu
   khach hang duoc tinh lai theo dinh nghia cu (chi bang interactions). */
DROP TRIGGER IF EXISTS meeting_notes_stats_insert;
DROP TRIGGER IF EXISTS meeting_notes_stats_update;
DROP TRIGGER IF EXISTS meeting_notes_stats_delete;
DROP VIEW IF EXISTS customer_touchpoints;
DROP TABLE IF EXISTS reminder_popup_states;
DROP INDEX IF EXISTS idx_meeting_notes_customer;
INSERT OR IGNORE INTO stats_dirty (kind, id) SELECT 'customer', id FROM customers;
