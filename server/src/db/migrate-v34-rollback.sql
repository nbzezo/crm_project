/* ---------- Rollback v34 -> v33 ----------

   Chay bang: npm run db:rollback --workspace server -- 33

   SQLite (>= 3.35, du an dang dung 3.53) ho tro DROP COLUMN truc tiep — khong
   can dung lai bang (tao-chep-xoa-doi ten) nhu cac rollback dung lai bang
   khac trong du an. Phai xoa INDEX truoc: SQLite tu choi DROP COLUMN mot cot
   dang duoc danh chi muc.

   MAT MAT DU LIEU: nhung `documents` chi gan voi mot Ghi chu hop (khong gan
   khach hang/co hoi/... nao khac) se mat lien ket do — ban than tep va cac
   truong khac van con nguyen, chi rieng cot `meeting_note_id` bi bo. */

DROP INDEX IF EXISTS idx_documents_meeting_note;
ALTER TABLE documents DROP COLUMN meeting_note_id;
