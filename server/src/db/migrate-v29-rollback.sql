/* ---------- Rollback v29 -> v28 ----------

   Chay bang: npm run db:rollback --workspace server -- 28

   Chi xoa 3 trigger don entity_change_log khi xoa deal/project/contract
   (xem migrate-v29.sql) — khong dung lieu nao bi mat. */

DROP TRIGGER IF EXISTS trg_entity_change_log_deal;
DROP TRIGGER IF EXISTS trg_entity_change_log_project;
DROP TRIGGER IF EXISTS trg_entity_change_log_contract;
