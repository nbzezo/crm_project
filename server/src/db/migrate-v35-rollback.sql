/* ---------- Rollback v35 -> v34 ----------

   Chay bang: npm run db:rollback --workspace server -- 34

   MAT MAT DU LIEU: bo toan bo tai khoan dang nhap va phien dang hoat dong. Sau
   khi quay lui, API tro lai trang thai KHONG co xac thuc — chi lam dieu nay khi
   ung dung con chay sau tuong lua / khong lo ra internet. */

DROP INDEX IF EXISTS idx_sessions_expires;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
