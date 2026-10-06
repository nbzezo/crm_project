/* ---------- Rollback v65 -> v64 ----------

   Chay bang: npm run db:rollback --workspace server -- 64

   MAT MAT DU LIEU: `documents.owner_contact_id` — ai da tai len tung tep. Tep va
   moi lien ket cua no van con nguyen; ung dung v64 khong loc kho tep theo pham vi. */

DROP INDEX IF EXISTS idx_documents_owner;
ALTER TABLE documents DROP COLUMN owner_contact_id;
