/* ---------- Rollback v33 -> v32 ----------

   Chay bang: npm run db:rollback --workspace server -- 32

   MAT MAT DU LIEU: thu tu keo tha va mau da chon rieng cua Ghi chu nhanh bi
   xoa vinh vien — v32 khong co cho nao de luu tam hai truong nay. */

ALTER TABLE quick_notes DROP COLUMN position;
ALTER TABLE quick_notes DROP COLUMN color;
