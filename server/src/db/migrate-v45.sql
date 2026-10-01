/* v45: Tach doanh thu thanh Moi + Mo rong / Nen.

   Nhom cua mot o doanh thu KHONG luu san: no suy ra luc truy van tu "moc" cua dong
   (thang dau tien co doanh thu > 0, ke ca so du kien). 12 thang dau tu moc la Moi
   hoac Mo rong (theo contract_kind), tu thang thu 13 la Nen. Luu suy ra thay vi luu
   cung de doi moc thi moi bao cao tu dung theo.

   - revenue_anchor_mode: 'auto' (tu tinh) | 'manual' (nguoi dung chon thang moc)
     | 'base' (ca dong luon la Nen — hop dong cu chua nhap lich su);
   - revenue_anchor_period: thang moc khi mode = 'manual';
   - revenue_baselines: TB thang nam truoc nhap tay, theo tung dong va tung nam
     duoc so sanh (year = 2026 nghia la "TB 2025 de so voi 2026"). */

ALTER TABLE customer_services ADD COLUMN revenue_anchor_mode TEXT NOT NULL DEFAULT 'auto'
  CHECK (revenue_anchor_mode IN ('auto','manual','base'));
ALTER TABLE customer_services ADD COLUMN revenue_anchor_period TEXT;
ALTER TABLE customer_services ADD COLUMN revenue_anchor_updated_by INTEGER
  REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE customer_services ADD COLUMN revenue_anchor_updated_at TEXT;

CREATE TABLE revenue_baselines (
  line_id INTEGER NOT NULL REFERENCES customer_services(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  avg_monthly_vnd INTEGER NOT NULL DEFAULT 0 CHECK (avg_monthly_vnd >= 0),
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (line_id, year)
);
CREATE INDEX idx_revenue_baselines_year ON revenue_baselines(year);
