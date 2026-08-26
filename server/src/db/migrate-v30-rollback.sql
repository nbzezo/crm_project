/* ---------- Rollback v30 -> v29 ----------

   Chay bang: npm run db:rollback --workspace server -- 29

   MAT MAT DU LIEU: toan bo Ghi chu hop va danh sach nguoi tham du bi xoa vinh vien
   — khong co cot nao o v29 tro nguoc de luu tam noi dung nay. */

DROP TABLE IF EXISTS meeting_note_attendees;
DROP TABLE IF EXISTS meeting_notes;
