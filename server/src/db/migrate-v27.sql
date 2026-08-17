/* ---------- v27: PoC, tam dung, tuoi giai doan, va hop dong gan du an ----------

   Bon khoang cach cuoi cua ban doi chieu. Ba trong so do la cot them vao `deals`;
   rieng viec them giai doan 'poc' phai DUNG LAI BANG vi `deals.stage` mang rang
   buoc CHECK liet ke dung bay gia tri tu v4 — xem `rebuildDealsForPoc` trong
   migrate.ts. Tep nay chay TRUOC buoc dung lai do, nen cac cot moi da co mat
   trong sqlite_master khi bang duoc chep sang. */

/* ---------- S03: PoC (dac ta 5.2 + 5.4) ---------- */

/* Dieu kien chuyen sang PoC theo dac ta la "co pham vi, thoi gian, tieu chi".
   Bon cot nay chinh la bon thu do; `poc_result` la o ghi ket qua sau khi xong. */
ALTER TABLE deals ADD COLUMN poc_scope TEXT;
ALTER TABLE deals ADD COLUMN poc_start_date TEXT;
ALTER TABLE deals ADD COLUMN poc_end_date TEXT;
ALTER TABLE deals ADD COLUMN poc_criteria TEXT;
ALTER TABLE deals ADD COLUMN poc_result TEXT;

/* ---------- S08: tam dung ----------

   LA MOT CO, KHONG PHAI MOT GIAI DOAN — day la cho co y lech voi dac ta.

   Dac ta xep 'On hold' ngang hang voi cac giai doan khac, nhung mot co hoi tam
   dung van dang NAM O MOT CHO trong pipeline: no dung lai giua luc dam phan, hay
   dung ngay sau khi gui bao gia, la hai tinh huong khac han nhau. Bien no thanh
   mot giai doan se xoa mat chinh thong tin do, va khi mo lai thi khong ai biet
   phai tra ve dau.

   Lam co thi giu duoc ca hai: giai doan noi no dang o dau, co noi no dang dung. */
ALTER TABLE deals ADD COLUMN on_hold INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deals ADD COLUMN on_hold_reason TEXT;
ALTER TABLE deals ADD COLUMN on_hold_review_date TEXT;
CREATE INDEX idx_deals_on_hold ON deals(on_hold, on_hold_review_date);

/* ---------- R-08: tuoi giai doan ----------

   "Thoi gian luu tai tung giai doan" (dac ta 5.5) can mot moc: lan cuoi co hoi
   DOI GIAI DOAN. `updated_at` khong dung duoc vi no nhay theo moi lan sua ghi chu.

   Backfill bang `created_at` la XAP XI co y thuc: du lieu cu khong luu lai lich
   su chuyen giai doan nen khong the tinh chinh xac. Co hoi da dong thi lay
   `closed_at` — do la lan doi giai doan cuoi cung that su cua chung. */
ALTER TABLE deals ADD COLUMN stage_entered_at TEXT;
UPDATE deals SET stage_entered_at = COALESCE(closed_at, created_at);
CREATE INDEX idx_deals_stage_age ON deals(stage, stage_entered_at);

/* ---------- Hop dong gan du an ----------

   `contracts.project_id` co tu v17 nhung chua bao gio co duong ghi — dung loai
   cot chet ma v23 vua go cho `deals.project_id`. Khong can them cot; chi can chi
   muc de truy van "hop dong cua du an nay" khong quet ca bang. */
CREATE INDEX IF NOT EXISTS idx_contracts_project_lookup ON contracts(project_id);
