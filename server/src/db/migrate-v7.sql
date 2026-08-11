-- v7: Theo doi doanh thu khach hang hien huu
-- 1) services            : danh muc dich vu (CRM quan ly them dich vu su dung)
-- 2) customer_services   : mot dong "khach hang x dich vu" dang su dung (AM, loai HD, tinh trang)
-- 3) service_revenues    : doanh thu theo thang cua tung dong, 4 chi so
--    (du kien -> da doi soat -> da xuat hoa don -> da thanh toan)

CREATE TABLE services (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  category TEXT,
  unit TEXT,
  default_price_vnd INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  position REAL NOT NULL DEFAULT 0,
  search_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX idx_services_name ON services(name COLLATE NOCASE);

CREATE TABLE customer_services (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
  contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
  am TEXT,
  -- Loai hop dong (Moi / Mo rong)
  contract_kind TEXT NOT NULL DEFAULT 'new' CHECK (contract_kind IN ('new','expansion')),
  -- Loai hop dong theo thoi han (Lau dai / Ngan han / Dung thu / Khac)
  contract_term TEXT NOT NULL DEFAULT 'long' CHECK (contract_term IN ('long','short','trial','other')),
  -- Tinh trang hop dong / dich vu
  status TEXT NOT NULL DEFAULT 'using' CHECK (status IN ('using','pending','paused','stopped')),
  start_date TEXT,
  end_date TEXT,
  notes TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_customer_services_customer ON customer_services(customer_id);
CREATE INDEX idx_customer_services_status ON customer_services(status);
CREATE INDEX idx_customer_services_service ON customer_services(service_id);

CREATE TABLE service_revenues (
  id INTEGER PRIMARY KEY,
  line_id INTEGER NOT NULL REFERENCES customer_services(id) ON DELETE CASCADE,
  period TEXT NOT NULL,                              -- 'YYYY-MM'
  forecast_vnd INTEGER NOT NULL DEFAULT 0,           -- doanh thu du kien
  reconciled_vnd INTEGER NOT NULL DEFAULT 0,         -- da doi soat
  invoiced_vnd INTEGER NOT NULL DEFAULT 0,           -- da xuat hoa don
  paid_vnd INTEGER NOT NULL DEFAULT 0,               -- da thanh toan
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX idx_service_revenues_line_period ON service_revenues(line_id, period);
CREATE INDEX idx_service_revenues_period ON service_revenues(period);
