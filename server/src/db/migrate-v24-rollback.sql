/* ---------- Rollback v24 -> v23 ----------

   Chay bang: npm run db:rollback --workspace server -- 23

   MAT MAT DU LIEU:
   - `deal_handover_items`: mat toan bo checklist ban giao da tick.
   - `entity_change_log.actor_contact_id`: mat thong tin ai da thuc hien thay doi;
     ban than cac dong nhat ky VAN CON, chi khuyet nguoi thuc hien.
   - Hai khoa cau hinh `handover.*`.

   KHONG mat: `deals.handover_ready`. Cot do thuoc v23. Gia tri cuoi cung ma
   checklist tinh ra van nam nguyen tren tung co hoi, nen sau khi quay lui he
   thong van phan biet duoc Won da ban giao voi Won dang cho — chi la khong con
   biet con thieu muc nao. */

DROP INDEX IF EXISTS idx_deal_handover_deal;
DROP TABLE IF EXISTS deal_handover_items;

ALTER TABLE entity_change_log DROP COLUMN actor_contact_id;

DELETE FROM app_settings WHERE key IN ('handover.templates', 'handover.sla_days');
