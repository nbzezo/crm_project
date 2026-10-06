/* v64: giai doan co hoi thanh du lieu cau hinh (1.25.1).

   Tam giai doan dang la hang so trong ma (`STAGES`) va bi khoa bang CHECK tren
   `deals.stage`. Tu ban nay chung la cac dong cua `pipeline_stages`, voi DUNG khoa
   cu nen `deals.stage` khong phai doi dong nao. Ma nguon thoi hoi ten giai doan,
   chi hoi thuoc tinh cua no:

   - `category` ('open' | 'won' | 'lost') thay cho moi `stage NOT IN ('won','lost')`.
     Chep sang cot phi chuan hoa `deals.stage_category` (dung lai bang trong
     migrate.ts) de ~60 truy van chi doi mot menh de WHERE va van dung chi muc.
   - `gate_bant_min` thay cho khoa `scoring.stage_gate` trong app_settings.
   - `require_economic_buyer` thay cho `target === 'negotiating'` (phu quyet V2).
   - `track_poc` thay cho `stage === 'poc'`.

   Ban nay KHONG doi hanh vi: gia tri chep sang dung nhu dang dung. Them, an, sap
   xep giai doan tren giao dien la viec cua ban sau. */

CREATE TABLE pipelines (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  position REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE pipeline_stages (
  id INTEGER PRIMARY KEY,
  pipeline_id INTEGER NOT NULL REFERENCES pipelines(id),
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('open', 'won', 'lost')),
  position REAL NOT NULL,
  color TEXT,
  probability INTEGER NOT NULL CHECK (probability BETWEEN 0 AND 100),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  gate_bant_min INTEGER CHECK (gate_bant_min IS NULL OR gate_bant_min BETWEEN 0 AND 12),
  require_economic_buyer INTEGER NOT NULL DEFAULT 0 CHECK (require_economic_buyer IN (0, 1)),
  track_poc INTEGER NOT NULL DEFAULT 0 CHECK (track_poc IN (0, 1)),
  max_days_in_stage INTEGER CHECK (max_days_in_stage IS NULL OR max_days_in_stage > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_pipeline_stages_order ON pipeline_stages(pipeline_id, position);

INSERT INTO pipelines (id, name, is_default, position) VALUES (1, 'Bán hàng', 1, 1);

INSERT INTO pipeline_stages
  (pipeline_id, key, label, category, position, color, probability, require_economic_buyer, track_poc)
VALUES
  (1, 'lead', 'Tiềm năng', 'open', 1, '#cde2fb', 10, 0, 0),
  (1, 'approaching', 'Đang tiếp cận', 'open', 2, '#9ec5f4', 20, 0, 0),
  (1, 'discussing', 'Đang trao đổi', 'open', 3, '#6da7ec', 40, 0, 0),
  (1, 'poc', 'PoC / Thử nghiệm', 'open', 4, '#4f95e8', 50, 0, 1),
  (1, 'quoted', 'Gửi báo giá', 'open', 5, '#3987e5', 60, 0, 0),
  (1, 'negotiating', 'Đàm phán', 'open', 6, '#1c5cab', 80, 1, 0),
  (1, 'won', 'Thành công', 'won', 7, '#0ca30c', 100, 0, 0),
  (1, 'lost', 'Thất bại', 'lost', 8, '#d03b3b', 0, 0, 0);
