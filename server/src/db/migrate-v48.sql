/* ---------- v48: gui email bang tai khoan Google (OAuth2) ----------

   `auth_type = 'google'`: khong dung SMTP ma gui qua Gmail API bang refresh token
   cua mot tai khoan Google da dang nhap qua trinh duyet. Quyen xin la
   `gmail.send` — CHI gui duoc thu, khong doc duoc hop thu. Day la ly do khong
   dung SMTP + XOAUTH2: duong do bat buoc xin `https://mail.google.com/`, tuc la
   toan quyen doc / xoa thu cua tai khoan do.

   Client ID / Client Secret do quan tri vien tu tao o Google Cloud Console cho
   chinh ban cai dat nay — moi ban cai dat tu host co mot redirect URI rieng nen
   khong the dung chung mot OAuth client. Secret va refresh token ma hoa bang
   encryptSecret nhu mat khau SMTP. Ca bang van nam ngoai ban xuat / sao luu
   (routes/system.ts). */

ALTER TABLE email_settings ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'password'
  CHECK (auth_type IN ('password', 'google'));
ALTER TABLE email_settings ADD COLUMN google_client_id TEXT NOT NULL DEFAULT '';
ALTER TABLE email_settings ADD COLUMN google_client_secret_ciphertext TEXT NOT NULL DEFAULT '';
ALTER TABLE email_settings ADD COLUMN google_client_secret_iv TEXT NOT NULL DEFAULT '';
ALTER TABLE email_settings ADD COLUMN google_client_secret_tag TEXT NOT NULL DEFAULT '';
ALTER TABLE email_settings ADD COLUMN google_refresh_token_ciphertext TEXT NOT NULL DEFAULT '';
ALTER TABLE email_settings ADD COLUMN google_refresh_token_iv TEXT NOT NULL DEFAULT '';
ALTER TABLE email_settings ADD COLUMN google_refresh_token_tag TEXT NOT NULL DEFAULT '';
/* Dia chi Gmail da dang nhap — Gmail API luon gui duoi ten dia chi nay. */
ALTER TABLE email_settings ADD COLUMN google_account TEXT NOT NULL DEFAULT '';
