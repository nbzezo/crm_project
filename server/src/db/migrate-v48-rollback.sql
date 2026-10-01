/* Quay ve v47: bo dang nhap Google cho email. Cau hinh SMTP giu nguyen. */
ALTER TABLE email_settings DROP COLUMN google_account;
ALTER TABLE email_settings DROP COLUMN google_refresh_token_tag;
ALTER TABLE email_settings DROP COLUMN google_refresh_token_iv;
ALTER TABLE email_settings DROP COLUMN google_refresh_token_ciphertext;
ALTER TABLE email_settings DROP COLUMN google_client_secret_tag;
ALTER TABLE email_settings DROP COLUMN google_client_secret_iv;
ALTER TABLE email_settings DROP COLUMN google_client_secret_ciphertext;
ALTER TABLE email_settings DROP COLUMN google_client_id;
ALTER TABLE email_settings DROP COLUMN auth_type;
