/* ---------- Rollback v38 -> v37 ----------

   Chay bang: npm run db:rollback --workspace server -- 37

   MAT MAT DU LIEU: bo email / ho ten / lien ket contact cua moi tai khoan, bo
   toan bo lien ket dat lai mat khau dang cho, va bo cau hinh SMTP (ke ca mat
   khau da ma hoa). Cac tai khoan VAN CON va van dang nhap duoc bang `username`.

   Truoc khi quay lui phai chac chan moi tai khoan deu con `username` dung —
   sau v38 nguoi dung dang nhap bang email va co the khong ai nho username nua.
   Kiem tra: SELECT id, username FROM users; */

DROP TABLE IF EXISTS email_settings;

DROP INDEX IF EXISTS idx_reset_tokens_expires;
DROP INDEX IF EXISTS idx_reset_tokens_user;
DROP TABLE IF EXISTS password_reset_tokens;

DROP INDEX IF EXISTS idx_sessions_user;
ALTER TABLE sessions DROP COLUMN user_id;

/* DROP COLUMN chi chay duoc sau khi bo index tro vao cot do. */
DROP INDEX IF EXISTS idx_users_contact;
DROP INDEX IF EXISTS idx_users_email;
ALTER TABLE users DROP COLUMN last_login_at;
ALTER TABLE users DROP COLUMN must_change_password;
ALTER TABLE users DROP COLUMN is_active;
ALTER TABLE users DROP COLUMN contact_id;
ALTER TABLE users DROP COLUMN full_name;
ALTER TABLE users DROP COLUMN email;
