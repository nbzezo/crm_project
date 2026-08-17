/* ---------- v22: sao luu dinh ky gui qua Telegram ----------
   Bo sung cau hinh gui ban sao luu CSDL theo lich sang nhom Telegram, dung chung
   bang telegram_settings (single-tenant, id = 1) nhu v21. next_backup_at duoc
   tinh lai moi khi bat/doi chu ky va sau moi lan gui (thanh cong hay that bai
   deu doi lich, tranh vong lap thu lai lien tuc khi loi dai han). */
ALTER TABLE telegram_settings ADD COLUMN backup_enabled INTEGER NOT NULL DEFAULT 0
  CHECK (backup_enabled IN (0,1));
ALTER TABLE telegram_settings ADD COLUMN backup_interval_hours INTEGER NOT NULL DEFAULT 24;
ALTER TABLE telegram_settings ADD COLUMN last_backup_sent_at TEXT;
ALTER TABLE telegram_settings ADD COLUMN next_backup_at TEXT;
