/* ---------- v33: Keo tha sap xep + chon mau cho Ghi chu nhanh ----------

   `position` REAL dung chung khuon `nextPosition`/`computeMovePosition`
   (server/src/lib/position.ts) ma boards/lists/cards/deals da dung — pham vi
   (scope) la `is_pinned` de ghi chu da ghim va chua ghim co hai chuoi thu tu
   doc lap, ghim luon noi len dau bat ke da keo toi dau.

   `color` TEXT NULL — de trong thi tu suy theo id (xem palette.ts o client);
   dat gia tri thi nguoi dung da chon rieng, ghi de mau tu suy.

   Gia tri position thuc te duoc dien boi fillQuickNotePositions() (migrate.ts,
   cung khuon fillListStatusMapping) NGAY SAU cau ALTER nay, khong lam o day. */
ALTER TABLE quick_notes ADD COLUMN position REAL NOT NULL DEFAULT 0;
ALTER TABLE quick_notes ADD COLUMN color TEXT;
