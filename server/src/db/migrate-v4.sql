-- v4: bo sung theo BRD CRM B2B ca nhan
-- Account/Contact/Opportunity/Activity mo rong, pipeline 7 giai doan,
-- them module Bao gia (quotations), Hop dong (contracts), Tai lieu (documents).

/* ---------- ACCOUNT: them ten viet tat, quy mo, nguon; status 3 trang thai ---------- */
CREATE TABLE customers_new (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT,
  tax_code TEXT,
  industry TEXT,
  address TEXT,
  website TEXT,
  phone TEXT,
  email TEXT,
  size TEXT,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'prospect' CHECK (status IN ('prospect','customer','inactive')),
  notes TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
INSERT INTO customers_new
  (id, name, tax_code, industry, address, website, phone, email, status, notes, search_text, created_at, updated_at)
SELECT id, name, tax_code, industry, address, website, phone, email,
       CASE status WHEN 'active' THEN 'customer' ELSE 'inactive' END,
       notes, search_text, created_at, updated_at
  FROM customers;
DROP TABLE customers;
ALTER TABLE customers_new RENAME TO customers;

/* ---------- CONTACT: phong ban, LinkedIn, vai tro mua, muc do quan he ---------- */
ALTER TABLE contacts ADD COLUMN department TEXT;
ALTER TABLE contacts ADD COLUMN linkedin TEXT;
ALTER TABLE contacts ADD COLUMN buying_role TEXT;
ALTER TABLE contacts ADD COLUMN relationship TEXT;

/* ---------- OPPORTUNITY: 7 giai doan, xac suat, Next Action, nhu cau, doi thu ---------- */
CREATE TABLE deals_new (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  product TEXT,
  stage TEXT NOT NULL DEFAULT 'lead'
    CHECK (stage IN ('lead','approaching','discussing','quoted','negotiating','won','lost')),
  probability INTEGER NOT NULL DEFAULT 10,
  value_vnd INTEGER NOT NULL DEFAULT 0,
  won_value_vnd INTEGER,
  position REAL NOT NULL DEFAULT 0,
  expected_close_date TEXT,
  closed_at TEXT,
  lost_reason TEXT,
  lost_note TEXT,
  source TEXT,
  need TEXT,
  competitor TEXT,
  next_action TEXT,
  next_action_date TEXT,
  is_renewal INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
INSERT INTO deals_new
  (id, customer_id, title, stage, probability, value_vnd, position, expected_close_date,
   closed_at, lost_reason, notes, created_at, updated_at)
SELECT id, customer_id, title,
       CASE stage WHEN 'nurturing' THEN 'discussing' ELSE stage END,
       CASE stage
         WHEN 'lead' THEN 10 WHEN 'nurturing' THEN 40 WHEN 'quoted' THEN 60
         WHEN 'won' THEN 100 WHEN 'lost' THEN 0 ELSE 10 END,
       value_vnd, position, expected_close_date, closed_at, lost_reason, notes, created_at, updated_at
  FROM deals;
DROP TABLE deals;
ALTER TABLE deals_new RENAME TO deals;
CREATE INDEX idx_deals_customer ON deals(customer_id);
CREATE INDEX idx_deals_stage ON deals(stage, position);
CREATE INDEX idx_deals_next_action ON deals(next_action_date) WHERE next_action_date IS NOT NULL;

/* ---------- ACTIVITY: them Demo/Proposal/Follow-up/Note, ket qua, next action ---------- */
CREATE TABLE interactions_new (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  type TEXT NOT NULL
    CHECK (type IN ('call','email','meeting','demo','proposal','followup','note','zalo','other')),
  occurred_at TEXT NOT NULL,
  summary TEXT NOT NULL,
  result TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
INSERT INTO interactions_new (id, customer_id, contact_id, deal_id, type, occurred_at, summary, created_at)
SELECT id, customer_id, contact_id, deal_id, type, occurred_at, summary, created_at FROM interactions;
DROP TABLE interactions;
ALTER TABLE interactions_new RENAME TO interactions;
CREATE INDEX idx_interactions_customer ON interactions(customer_id, occurred_at DESC);

/* ---------- TASK: gan them nguoi lien he ---------- */
ALTER TABLE cards ADD COLUMN contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;

/* ---------- HOP DONG ---------- */
CREATE TABLE contracts (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  number TEXT,
  value_vnd INTEGER NOT NULL DEFAULT 0,
  sign_date TEXT,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','signing','active','expired','terminated')),
  payment_terms TEXT,
  renewal_followed INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_contracts_customer ON contracts(customer_id);
CREATE INDEX idx_contracts_end ON contracts(status, end_date);

/* ---------- BAO GIA ---------- */
CREATE TABLE quotations (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  code TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  quote_date TEXT,
  value_vnd INTEGER NOT NULL DEFAULT 0,
  valid_until TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','reviewing','revision','accepted','rejected')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_quotations_customer ON quotations(customer_id);
CREATE INDEX idx_quotations_deal ON quotations(deal_id, version DESC);

/* ---------- TAI LIEU ---------- */
CREATE TABLE documents (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'other',
  file_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
  quotation_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,
  search_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_documents_customer ON documents(customer_id, created_at DESC);
