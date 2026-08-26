/* ---------- Rollback v32 -> v31 ----------

   Chay bang: npm run db:rollback --workspace server -- 31

   MAT MAT DU LIEU: toan bo Ghi chu nhanh, quan he cua chung voi Customer/Contact/
   Deal/Project, va lien ket tep dinh kem toi Ghi chu nhanh bi xoa vinh vien — v31
   khong co cho nao de luu tam du lieu nay. */

DROP INDEX IF EXISTS idx_documents_quick_note;
ALTER TABLE documents DROP COLUMN quick_note_id;

DROP TABLE IF EXISTS quick_note_relations;
DROP TABLE IF EXISTS quick_notes;
