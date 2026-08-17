/* ---------- v24: checklist ban giao + nguoi thuc hien ----------

   v23 dat mot CO `deals.handover_ready` de phan biet "Won da ban giao" voi "Won
   dang cho ban giao". Mot bit tra loi duoc cau hoi "da du chua" nhung khong tra
   loi duoc cau hoi ke tiep ma nguoi dung luon hoi ngay sau do: "con thieu gi".
   v24 tra lai chinh cai danh sach do.

   Cot `handover_ready` KHONG bi bo. No van la thu ma moi truy van loc theo, va
   voi co hoi khong dung checklist (du lieu cu, viec nho) thi no van la nguon duy
   nhat. Tu v24 no duoc DUY TRI TU DONG khi co hang trong checklist, va van sua
   tay duoc khi khong co hang nao. */

/* 1. Cac muc ban giao cua TUNG co hoi.

   Mot bang duy nhat cho cac muc THUC TE, con bo MAU thi nam trong `app_settings`
   duoi khoa `handover.templates` — khong dung them hai bang template/template_items.
   Ly do: he thong da co dung mot co che cau hinh (`scoring.*` dung chung bang
   app_settings tu v10); dung them co che thu hai nghia la sau nay moi thay doi
   quy trinh phai nho sua o hai noi.

   `content` duoc SAO CHEP vao day chu khong tham chieu toi mau: doi mau nam sau
   khong duoc phep viet lai lich su ban giao cua mot co hoi da chot. */
CREATE TABLE deal_handover_items (
  id INTEGER PRIMARY KEY,
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  /* Muc bat buoc moi tinh vao `handover_ready`; muc tham khao thi khong chan. */
  is_required INTEGER NOT NULL DEFAULT 1,
  is_done INTEGER NOT NULL DEFAULT 0,
  done_at TEXT,
  note TEXT,
  position REAL NOT NULL DEFAULT 0
);
CREATE INDEX idx_deal_handover_deal ON deal_handover_items(deal_id, position);

/* 2. Nguoi thuc hien mot thay doi.

   KHONG phai lop nguoi dung: khong bang user, khong session, khong dang nhap.
   Chi la mot tham chieu toi `contacts` — so danh ba da co san nguoi cua chinh
   cong ty minh, va `contacts.is_me` da la khai niem "toi" duoc dung o cho khac.
   Nho vay nhat ky tra loi duoc "ai doi" ma khong keo theo migrate quyen han cho
   toan bo du lieu cu.

   ON DELETE SET NULL: xoa mot nguoi lien he khong duoc phep xoa lich su ho da lam. */
ALTER TABLE entity_change_log ADD COLUMN actor_contact_id INTEGER
  REFERENCES contacts(id) ON DELETE SET NULL;

/* 3. Cau hinh — cung bang, cung dang key/value voi `scoring.*` cua v10.

   `handover.templates`: bo mau theo loai giai phap. Khoa 'default' luon ton tai
   va duoc dung khi khong khop loai nao — de mot co hoi khong bao gio roi vao
   canh "khong co checklist nao ap dung duoc".

   Mac dinh la dung 10 muc cua dac ta 7.2, tat ca deu bat buoc. Nguoi dung ha bot
   duoc trong Cai dat; he thong khong tu y quyet ho muc nao la khong quan trong. */
INSERT INTO app_settings (key, value) VALUES
  ('handover.templates', '{"default":[' ||
    '{"content":"Hợp đồng/PO hoặc phê duyệt triển khai hợp lệ","required":true},' ||
    '{"content":"Phạm vi bán và các nội dung loại trừ","required":true},' ||
    '{"content":"Kiến trúc/giải pháp đã chốt","required":true},' ||
    '{"content":"Sizing, CCU, hạ tầng, tích hợp và yêu cầu ATTT","required":true},' ||
    '{"content":"Giá bán, cấu phần chi phí và các cam kết ảnh hưởng triển khai","required":true},' ||
    '{"content":"Milestone và thời hạn cam kết","required":true},' ||
    '{"content":"Tiêu chí UAT/nghiệm thu","required":true},' ||
    '{"content":"Danh sách đầu mối khách hàng và nội bộ","required":true},' ||
    '{"content":"Các rủi ro, giả định và phụ thuộc đã biết","required":true},' ||
    '{"content":"Tài liệu được gắn phiên bản và quyền truy cập phù hợp","required":true}' ||
  ']}'),
  /* Won qua bao nhieu ngay ma chua du ho so thi canh bao (dac ta muc 10). */
  ('handover.sla_days', '7');
