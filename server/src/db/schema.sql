-- WorkFlow schema v1
-- Quy uoc: ngay date-only la TEXT 'YYYY-MM-DD'; gio nhac la 'YYYY-MM-DDTHH:mm' (local, khong UTC);
-- tien VND la INTEGER; timestamp dung datetime('now','localtime').

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  tax_code TEXT,
  industry TEXT,
  address TEXT,
  website TEXT,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE contacts (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  title TEXT,
  phone TEXT,
  email TEXT,
  zalo TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE deals (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'lead' CHECK (stage IN ('lead','nurturing','quoted','won','lost')),
  value_vnd INTEGER NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  expected_close_date TEXT,
  closed_at TEXT,
  lost_reason TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE boards (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#0079bf',
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE lists (
  id INTEGER PRIMARY KEY,
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position REAL NOT NULL
);

CREATE TABLE cards (
  id INTEGER PRIMARY KEY,
  list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  position REAL NOT NULL,
  start_date TEXT,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  is_done INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  search_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE checklist_items (
  id INTEGER PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_done INTEGER NOT NULL DEFAULT 0,
  position REAL NOT NULL
);

CREATE TABLE labels (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL
);

CREATE TABLE card_labels (
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, label_id)
);

CREATE TABLE interactions (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('call','email','meeting','zalo','other')),
  occurred_at TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE reminders (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  due_at TEXT NOT NULL,
  is_done INTEGER NOT NULL DEFAULT 0,
  card_id INTEGER REFERENCES cards(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX idx_lists_board ON lists(board_id, position);
CREATE INDEX idx_cards_list ON cards(list_id, position);
CREATE INDEX idx_cards_due ON cards(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_cards_customer ON cards(customer_id);
CREATE INDEX idx_deals_customer ON deals(customer_id);
CREATE INDEX idx_deals_stage ON deals(stage, position);
CREATE INDEX idx_interactions_customer ON interactions(customer_id, occurred_at DESC);
CREATE INDEX idx_reminders_due ON reminders(is_done, due_at);
