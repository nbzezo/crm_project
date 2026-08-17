/* ---------- Rollback v23 -> v22 ----------

   Chay bang: npm run db:rollback --workspace server -- 22
   (script tu sao luu tep CSDL truoc khi chay — xem db/rollback.ts)

   MAT MAT DU LIEU KHI QUAY LUI, biet truoc de khong bat ngo:
   - `deals.handover_ready`: mat toan bo. Co hoi Won dang cho ban giao se khong
     con phan biet duoc voi co hoi Won da ban giao xong.
   - `entity_change_log`: mat toan bo lich su thay doi da ghi tu khi len v23.

   KHONG mat: `deals.project_id`. Cot do co tu v17 va thuoc ve v17 — v23 chi bo
   chi muc duy nhat tren no. Cac lien ket co hoi <-> du an ma nguoi dung da tao
   VAN CON NGUYEN sau khi quay lui; chung chi thoi duoc CSDL bao ve khoi trung.
   Nho vay quay lui roi tien lai v23 lan nua khong mat lien ket nao.

   Luu y khi tien lai: neu trong luc o v22 co hai co hoi cung tro toi mot du an
   (chi xay ra neu ai do sua tay CSDL), lenh CREATE UNIQUE INDEX cua v23 se that
   bai. Go trung truoc roi migrate lai. */

DROP INDEX IF EXISTS idx_deals_project_unique;

DROP INDEX IF EXISTS idx_entity_change_log;
DROP TABLE IF EXISTS entity_change_log;

/* DROP COLUMN an toan o day: `handover_ready` khong co chi muc nao tham chieu
   (v19 da kiem chung SQLite tu choi bo cot con duoc index tro toi). */
ALTER TABLE deals DROP COLUMN handover_ready;
