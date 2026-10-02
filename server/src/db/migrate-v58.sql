/* v58: ma khoa man hinh cho (PIN) theo tung tai khoan.

   Ma luu MA HOA (AES-256-GCM, khoa cai dat cua may chu — cung khoa voi bi mat AI /
   Telegram / ma lien ket chia se) chu khong bam: nguoi dung quen ma thi bam "Gui ma
   qua email" va nhan lai DUNG ma dang dung, khong phai dat lai. Bam mot chieu thi
   khong lam duoc dieu do.

   Day la khoa rieng tu (che man hinh khi roi ban), khong phai lop xac thuc: phien
   dang nhap van song khi man hinh khoa. Mot dong cho moi nguoi, xoa theo tai khoan. */
CREATE TABLE IF NOT EXISTS user_lock_pins (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  pin_ciphertext TEXT NOT NULL,
  pin_iv         TEXT NOT NULL,
  pin_tag        TEXT NOT NULL,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
