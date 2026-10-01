/* ---------- v49: sao luu len Google Drive ----------

   Mot dong cau hinh (`drive_backup_settings.id = 1`, cung khuon telegram_settings)
   va bang theo doi tep da len Drive.

   QUYEN `drive.file`: CRM chi thay va sua duoc cac tep CHINH NO tao ra, khong doc
   duoc phan con lai cua Drive. Day la ly do khong xin `drive` day du — mot refresh
   token bi lo ra khi do chi la "ghi them vao thu muc sao luu", khong phai "doc ca
   Drive cong ty".

   Client ID / Secret co cot rieng thay vi dung chung voi email_settings: doi OAuth
   client o muc Email se cat ket noi email; neu hai thu dung chung mot dong thi doi
   o day cung am tham cat sao luu. Nguoi dung van dan duoc cung mot cap gia tri
   (nut "Dung lai Client cua Email" o man Cai dat chep thang gia tri da ma hoa).

   `drive_backup_files`: tep trong `files/` dat ten `<timestamp>-<random>.<ext>` va
   khong bao gio ghi de, nen ten tep du de nhan biet "da len roi" — chi can tep moi
   thi tai len, khong so sanh noi dung. Tep bi xoa khoi CRM KHONG bi xoa tren Drive:
   day la ban sao luu, xoa nham o CRM khong duoc lan sang ban sao. */

CREATE TABLE drive_backup_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  google_client_id TEXT NOT NULL DEFAULT '',
  google_client_secret_ciphertext TEXT NOT NULL DEFAULT '',
  google_client_secret_iv TEXT NOT NULL DEFAULT '',
  google_client_secret_tag TEXT NOT NULL DEFAULT '',
  google_refresh_token_ciphertext TEXT NOT NULL DEFAULT '',
  google_refresh_token_iv TEXT NOT NULL DEFAULT '',
  google_refresh_token_tag TEXT NOT NULL DEFAULT '',
  google_account TEXT NOT NULL DEFAULT '',
  /* Thu muc tren Drive. Rong = chua tao; tao lai khi nguoi dung xoa thu muc. */
  root_folder_id TEXT NOT NULL DEFAULT '',
  db_folder_id TEXT NOT NULL DEFAULT '',
  files_folder_id TEXT NOT NULL DEFAULT '',
  interval_hours INTEGER NOT NULL DEFAULT 24 CHECK (interval_hours BETWEEN 1 AND 720),
  /* So ban sao CSDL giu lai tren Drive; ban cu hon bi xoa. Tep tai len thi giu mai. */
  keep_db_count INTEGER NOT NULL DEFAULT 14 CHECK (keep_db_count BETWEEN 1 AND 365),
  next_run_at TEXT,
  last_run_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  last_db_name TEXT,
  last_db_size INTEGER,
  last_files_uploaded INTEGER,
  last_files_failed INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
INSERT INTO drive_backup_settings (id) VALUES (1);

CREATE TABLE drive_backup_files (
  stored_name TEXT PRIMARY KEY,
  drive_file_id TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
