/* ---------- Rollback v62 -> v61 ----------

   Chay bang: npm run db:rollback --workspace server -- 61

   KHONG dung lai `interactions` de them lai CHECK cua `type` — cung ly do voi
   rollback v27: rang buoc rong hon khong lam hong gi, con dung lai bang o duong
   quay lui la dat rui ro vao dung cho khong nen dat.

   XU LY DU LIEU: gia tri do quan tri vien tu them (khong co trong danh sach cua
   v61) duoc keo ve 'other', vi giao dien v61 chi biet cac khoa goc.

   MAT MAT DU LIEU:
   - Ten hien thi da doi, mau, thu tu va trang thai an/hien cua moi muc.
   - Ly do that bai / loai tuong tac / loai tai lieu tu them: thanh 'other'. */

UPDATE deals SET lost_reason = 'other'
 WHERE lost_reason IS NOT NULL
   AND lost_reason NOT IN ('price','competitor','no_budget','project_stopped','solution_mismatch',
                           'requirement_unmet','no_contact','bad_timing','self_build','other');

UPDATE interactions SET type = 'other'
 WHERE type NOT IN ('call','email','meeting','demo','proposal','followup','note','zalo','other');

UPDATE documents SET doc_type = 'other'
 WHERE doc_type NOT IN ('proposal','quotation','contract','nda','meeting_minute','requirement',
                        'profile','other');

DROP INDEX IF EXISTS idx_picklist_items_list;
DROP TABLE IF EXISTS picklist_items;
