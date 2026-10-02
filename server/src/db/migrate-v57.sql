/* v57: lien ket chia se sao chep lai duoc.

   v51 chi giu ban bam cua ma lien ket — mat link la phai tao link moi. Nguoi dung
   can sao chep lai link da gui tu Cai dat > Lien ket chia se. Luu them ma lien ket
   da MA HOA (AES-256-GCM, khoa cai dat cua may chu — cung khoa voi bi mat AI /
   Telegram); ban bam van la khoa tra cuu khi khach mo link.

   Link tao truoc v57 khong co ban ma hoa: ba cot de NULL, giao dien bao "tao truoc
   khi co tinh nang sao chep lai". */
ALTER TABLE share_links ADD COLUMN token_ciphertext TEXT;
ALTER TABLE share_links ADD COLUMN token_iv TEXT;
ALTER TABLE share_links ADD COLUMN token_tag TEXT;
