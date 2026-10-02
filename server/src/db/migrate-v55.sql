/* v55 — Luu ket qua AI phan tich ky cua man Trong tam.
   Moi nguoi mot ban moi nhat cho moi (che do, ky). Chi thay khi nguoi dung bam
   "Phân tích lại" — mo lai trang hay doi may khong ton them luot goi AI.
   `snapshot_json`: anh chup du lieu ky luc phan tich (khoa muc -> ngay, da xong)
   de biet tu do da co gi thay doi va nhac nguoi dung ket qua da cu. */
CREATE TABLE focus_ai_plans (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('me','team')),
  period_from TEXT NOT NULL,
  period_to TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  generated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now','localtime')),
  UNIQUE (user_id, mode, period_from, period_to)
);
