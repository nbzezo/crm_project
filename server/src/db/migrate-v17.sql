/* ---------- v17: lop Du an ----------
   Truoc v17, "bang" (board) bi dung thay du an nhung khong co ngay ke hoach,
   ngan sach, chu so huu hay chi so suc khoe — nen khong tra loi duoc cau hoi
   "du an nay dang som hay muon so voi ke hoach".

   Du an KHONG thay the bang: mot du an co the trai tren nhieu bang (trien khai +
   bao tri), va nhieu bang thuan tuy ca nhan khong thuoc du an nao. Quan he la
   board -> project (nhieu-mot, nullable). */
CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  /* Du an noi bo khong co khach hang — nullable, va SET NULL de xoa khach hang
     khong keo theo mat ca du an. */
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  owner_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'planning',
  /* 'planning' | 'active' | 'on_hold' | 'done' | 'cancelled' */
  plan_start TEXT,
  plan_end TEXT,
  actual_start TEXT,
  actual_end TEXT,
  budget_vnd INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  is_archived INTEGER NOT NULL DEFAULT 0,
  search_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_projects_status ON projects(is_archived, status, plan_end);
CREATE INDEX idx_projects_customer ON projects(customer_id);

ALTER TABLE boards ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
/* cards.project_id duoc suy ra tu bang khi tao neu client khong chi ro; luu san
   de dem/loc khong phai join qua lists va boards moi lan. */
ALTER TABLE cards ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE contracts ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE deals ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX idx_cards_project ON cards(project_id, is_done);
CREATE INDEX idx_boards_project ON boards(project_id);
CREATE INDEX idx_contracts_project ON contracts(project_id);
CREATE INDEX idx_deals_project ON deals(project_id);
