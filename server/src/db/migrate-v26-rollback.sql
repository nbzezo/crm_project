/* ---------- Rollback v26 -> v25 ----------

   Chay bang: npm run db:rollback --workspace server -- 25

   MAT MAT DU LIEU:
   - `project_risks`: mat toan bo so rui ro / van de / Change Request / quyet dinh.
   - `boards.milestone_date`: mat han cua tung giai doan.
   - `projects.delivery_model` va `model_reason`: mat ket qua phan loai A/B.
   - `projects.acceptance_criteria`, `accepted_at`, `accepted_note`: mat ho so
     nghiem thu.
   - Hai khoa cau hinh `delivery.*`.

   KHONG mat: cac Bang va Danh sach da duoc tao tu bo mau (R-12). Chung la du lieu
   binh thuong cua v17/v19, khong phai cau truc rieng cua v26 — bo mau chi la thu
   da sinh ra chung mot lan roi thoi. */

DROP INDEX IF EXISTS idx_project_risks;
DROP TABLE IF EXISTS project_risks;

DROP INDEX IF EXISTS idx_boards_milestone;
ALTER TABLE boards DROP COLUMN milestone_date;

ALTER TABLE projects DROP COLUMN delivery_model;
ALTER TABLE projects DROP COLUMN model_reason;
ALTER TABLE projects DROP COLUMN acceptance_criteria;
ALTER TABLE projects DROP COLUMN accepted_at;
ALTER TABLE projects DROP COLUMN accepted_note;

DELETE FROM app_settings WHERE key IN ('delivery.classification', 'delivery.board_templates');
