/* Quay ve v43: bo workspace Cong viec kieu Lark — nguoi theo doi, dong thoi gian
   hoat dong, bo loc da luu va cot nguoi tao. Viec van con nguyen. */
DROP TABLE IF EXISTS task_saved_views;
DROP TABLE IF EXISTS task_activity;
DROP TABLE IF EXISTS task_watchers;
DROP INDEX IF EXISTS idx_cards_creator;
ALTER TABLE cards DROP COLUMN creator_contact_id;
