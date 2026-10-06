/* v67: trang thai cong viec cau hinh duoc (1.30.0).

   Danh sach trang thai PHANG do quan tri tu dat. Moi trang thai co `kind` = y
   nghia voi he thong, la mot trong sau gia tri cu cua `cards.status`. Xem
   docs/PLAN-TRANG-THAI-DONG.md.

   `cards.status` GIU NGUYEN va tu day mang `kind` cua trang thai — gan 80 truy
   van bao cao/nhac viec/is_done khong phai doi. Trang thai cu the nam o cot moi
   `cards.status_key`; the cu de trong, va trang thai hieu luc la
   COALESCE(status_key, status) — dung trang thai dung san cung khoa ben duoi.

   card_flows duoc dung lai trong migrate.ts (bo CHECK 5 gia tri) vi quy trinh
   gio gan voi khoa trang thai bat ky. */

CREATE TABLE task_statuses (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  color TEXT,
  kind TEXT NOT NULL
    CHECK (kind IN ('todo','doing','waiting_customer','blocked','review','done')),
  position REAL NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  is_builtin INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

INSERT INTO task_statuses (key, label, color, kind, position, is_builtin) VALUES
  ('todo',             'Chưa bắt đầu',       NULL, 'todo',             1024, 1),
  ('doing',            'Đang làm',           NULL, 'doing',            2048, 1),
  ('waiting_customer', 'Chờ khách phản hồi', NULL, 'waiting_customer', 3072, 1),
  ('blocked',          'Bị chặn',            NULL, 'blocked',          4096, 1),
  ('review',           'Chờ duyệt',          NULL, 'review',           5120, 1),
  ('done',             'Hoàn thành',         NULL, 'done',             6144, 1);

ALTER TABLE cards ADD COLUMN status_key TEXT;
CREATE INDEX idx_cards_status_key ON cards(status_key);
