/* ---------- Rollback v40 -> v39 ----------

   Chay bang: npm run db:rollback --workspace server -- 39

   MAT MAT DU LIEU: bo thong tin chu so huu cua moi ban ghi. Sau khi quay lui,
   ai vao duoc mot man hinh se thay lai TOAN BO du lieu cua man hinh do — lop
   chan theo tinh nang (v39) van con, lop chan theo tung ban ghi thi khong.

   Cay don vi, vi tri va ma tran quyen KHONG bi dung toi. */

DROP INDEX IF EXISTS idx_reminders_owner;
DROP INDEX IF EXISTS idx_calendar_events_owner;
DROP INDEX IF EXISTS idx_meeting_notes_owner;
DROP INDEX IF EXISTS idx_quick_notes_owner;
ALTER TABLE reminders DROP COLUMN owner_contact_id;
ALTER TABLE calendar_events DROP COLUMN owner_contact_id;
ALTER TABLE meeting_notes DROP COLUMN owner_contact_id;
ALTER TABLE quick_notes DROP COLUMN owner_contact_id;

DROP INDEX IF EXISTS idx_customer_services_owner;
DROP INDEX IF EXISTS idx_boards_owner;
DROP INDEX IF EXISTS idx_deals_owner;
DROP INDEX IF EXISTS idx_customers_owner;
ALTER TABLE customer_services DROP COLUMN owner_contact_id;
ALTER TABLE boards DROP COLUMN owner_contact_id;
ALTER TABLE deals DROP COLUMN owner_contact_id;
ALTER TABLE customers DROP COLUMN owner_contact_id;
