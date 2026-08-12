/* ---------- v19: cot Kanban anh xa sang trang thai + bo cards.project_id ----------

   VAN DE 1 — hai bieu dien cua cung mot thu.
   v16 them `cards.status` trong khi bang mac dinh van co bon cot 'Can lam / Dang
   lam / Cho duyet / Hoan thanh' — dung bon khai niem do. Hai ben hoan toan doc
   lap: keo the sang cot 'Hoan thanh' khong dat status='done', va doi status
   khong chuyen cot. Ben canh do con mot heuristic doan trang thai theo TEN cot.

   Cach go: cot khai bao duoc no NGHIA LA trang thai nao (`status_mapping`).
   - Co anh xa  -> keo the vao cot dat status; doi status keo the sang cot.
   - Khong anh xa -> cot chi la cho xep, khong dung den vong doi.
   Nho vay van giu duoc tu do bo cuc kieu Trello (cot 'Kho y tuong', 'Theo khach'
   ... van dung duoc) ma khong con hai nguon su that. */
ALTER TABLE lists ADD COLUMN status_mapping TEXT;
CREATE INDEX idx_lists_status ON lists(board_id, status_mapping);

/* VAN DE 2 — `cards.project_id` vua la ban sao cua bang, vua ghi de duoc.
   Bon duong ghi voi hai luat mau thuan: form cho ghi de, moveCard ghi de lai
   theo bang. Ket qua la the co the mang project_id cua du an A trong khi nam o
   bang cua du an B, va khong man hinh nao lam lo ra su lech do.

   Khong co cot thi khong the lech: mot viec thuoc du an cua BANG CHUA NO. Doi du
   an cua mot viec = chuyen no sang bang khac, dung voi cach lam viec that.

   DROP INDEX phai di TRUOC DROP COLUMN — SQLite tu choi bo cot con duoc index
   tham chieu (kiem chung tren SQLite 3.53.2 di kem better-sqlite3 hien tai). */
DROP INDEX IF EXISTS idx_cards_project;
ALTER TABLE cards DROP COLUMN project_id;
