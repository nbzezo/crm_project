/* ---------- v23: noi lai cau Sales -> Delivery ----------

   VAN DE — `deals.project_id` la mot cot CHET.
   v17 tao cot nay (cung voi contracts.project_id, boards.project_id) nhung chi
   `boards.project_id` co duong ghi that. Khong route nao va khong bieu mau nao
   tung ghi `deals.project_id`, nen tu Project khong the truy nguoc ve co hoi
   kinh doanh da sinh ra no — dung thu ma ca dac ta lan bao cao doi chieu goi la
   yeu cau nen tang.

   v23 KHONG them cot lien ket moi. No bat lai cot da co, va bo sung dung hai
   thu con thieu de viec bat lai do an toan: mot rang buoc chong trung, va mot
   noi ghi lai ai doi gi.

   Khong dung `projects.source_deal_id` doi xung: hai cot cung mo ta mot quan he
   la hai nguon su that, va v19 da phai go dung mot lop lech kieu do
   (`cards.project_id` vs bang chua the). Mot chieu, mot cho ghi. */

/* 1. Mot co hoi chi sinh ra TOI DA mot du an (dac ta 3.2 + 8.1).

   Chi muc mot phan: SQLite coi moi NULL la khac nhau nen rang buoc duy nhat
   khong cham vao co hoi chua gan du an — dung dieu ta can, vi phan lon co hoi
   se mai mai khong co du an nao. Chi cac gia tri non-null bi ep duy nhat.

   Dat o tang CSDL chu khong chi o tang service: automation chay lai, hai tab
   mo cung luc, hay mot script import deu di vong qua service duoc. */
CREATE UNIQUE INDEX idx_deals_project_unique ON deals(project_id) WHERE project_id IS NOT NULL;

/* 2. Cong kiem soat ban giao (dac ta 6.1 + 10: "Won nhung chua du ho so").

   La mot CO, khong phai mot gia tri stage moi. Chen them vao STAGES se pha
   STAGE_ORDER, keo-tha o Pipeline, STAGE_PROBABILITY va moi bao cao dang dem
   theo dung 7 giai doan — doi lay dung mot bit thong tin.

   Backfill: co hoi da dong TRUOC khi cot nay ton tai khong phai la viec "dang
   cho ban giao" — chung da duoc xu ly xong ngoai he thong tu lau. De mac dinh 0
   se lam ca lich su boc len canh bao gia ngay sang hom sau. */
ALTER TABLE deals ADD COLUMN handover_ready INTEGER NOT NULL DEFAULT 0;
UPDATE deals SET handover_ready = 1 WHERE stage IN ('won', 'lost');

/* 3. Nhat ky thay doi dung chung cho ca ba thuc thu thuong mai.

   Mot bang cho ca deal/project/contract thay vi ba bang rieng: cau hoi nghiep vu
   luon la "ai doi gi, tu bao nhieu sang bao nhieu" — giong het nhau o ca ba, va
   `deal_score_history` da chung minh dang nay du dung.

   KHONG co cot `actor`. He thong hien khong co khai niem nguoi dung (khong bang
   user, khong session — xem bao cao doi chieu R-18), nen mot cot actor se vinh
   vien rong va tao cam giac co truy vet trong khi khong he co. Them vao sau khi
   va chi khi lop nguoi dung ton tai that. */
CREATE TABLE entity_change_log (
  id INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('deal', 'project', 'contract')),
  entity_id INTEGER NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  /* Ly do do nguoi dung nhap — vi du ly do ghi de cong giai doan, hoac ghi chu
     Change Request khi doi baseline sau Won (dac ta 7.4). */
  note TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_entity_change_log ON entity_change_log(entity_type, entity_id, changed_at DESC);
