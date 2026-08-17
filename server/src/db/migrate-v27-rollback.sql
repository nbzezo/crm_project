/* ---------- Rollback v27 -> v26 ----------

   Chay bang: npm run db:rollback --workspace server -- 26

   KHONG dung lai bang `deals` de thu hep rang buoc CHECK.

   Ly do: CHECK rong hon khong lam hong gi ca — no chi cho phep mot gia tri ma
   phien ban cu khong bao gio sinh ra. Nguoc lai, dung lai mot bang gan ba muoi
   cot voi mot view va hon muoi khoa ngoai la thao tac rui ro nhat trong ca chuoi
   migration; chay no o duong QUAY LUI, dung luc nguoi dung dang muon ve trang
   thai an toan, la dat rui ro vao dung cho khong nen dat.

   Hau qua duy nhat: sau khi quay lui, CSDL van chap nhan stage = 'poc' o tang
   CHECK. Tang ung dung thi khong — zod `z.enum(STAGES)` cua v26 chi biet bay gia
   tri, nen khong co duong nao ghi vao duoc.

   XU LY DU LIEU: co hoi dang o 'poc' duoc keo ve 'discussing' — buoc lien truoc
   no trong pipeline — de khong con ban ghi nao mang gia tri ma ung dung v26
   khong hieu. Cac truong PoC bi mat cung cac cot ben duoi.

   MAT MAT DU LIEU:
   - Toan bo truong PoC (pham vi, thoi gian, tieu chi, ket qua).
   - Trang thai tam dung: co, ly do, ngay xem xet lai.
   - `stage_entered_at`: mat moc tinh tuoi giai doan. Tien lai v27 se backfill
     lai bang `created_at`, tuc la tuoi giai doan bi dat lai. */

UPDATE deals SET stage = 'discussing' WHERE stage = 'poc';

DROP INDEX IF EXISTS idx_deals_stage_age;
DROP INDEX IF EXISTS idx_deals_on_hold;
DROP INDEX IF EXISTS idx_contracts_project_lookup;

ALTER TABLE deals DROP COLUMN poc_scope;
ALTER TABLE deals DROP COLUMN poc_start_date;
ALTER TABLE deals DROP COLUMN poc_end_date;
ALTER TABLE deals DROP COLUMN poc_criteria;
ALTER TABLE deals DROP COLUMN poc_result;

ALTER TABLE deals DROP COLUMN on_hold;
ALTER TABLE deals DROP COLUMN on_hold_reason;
ALTER TABLE deals DROP COLUMN on_hold_review_date;

ALTER TABLE deals DROP COLUMN stage_entered_at;
