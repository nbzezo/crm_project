/* v61: chi muc bao phu cho cau dem viec dang mo theo cot (1.22.0).

   Danh sach Bang dem viec chua xong cua tung bang: di tu cac cot (lists) cua bang roi
   dem cards theo list_id voi is_done = 0, is_archived = 0, parent_id IS NULL. Chi muc
   cu idx_cards_list(list_id, position) buoc SQLite doc tung dong cards de xet ba cot
   con lai — 1,2 s voi 200 bang / 240.000 viec. Chi muc nay tra loi ngay tren chi muc. */
CREATE INDEX IF NOT EXISTS idx_cards_list_open ON cards(list_id, is_done, is_archived, parent_id);
