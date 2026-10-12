/* v74 (1.38.0): Lop A — so lieu tong hop cua khach hang tinh truoc (docs/PLAN-TINH-TRUOC-LUU-DEM.md).

   Danh sach Khach hang chay ~16 truy van con cho MOI khach (dem co hoi, viec, hop dong,
   lan tuong tac gan nhat, viec / nhac ke tiep...). `customer_stats` luu san cac cot do;
   hai cot phu thuoc ngay hom nay (viec qua han, next action qua han) van tinh luc doc.

   Giu cho dung bang hang doi "ban": trigger tren cac bang con chi ghi
   `INSERT OR IGNORE INTO stats_dirty ('customer', <id>)` cho khach bi anh huong — ca khach
   CU lan khach MOI khi mot ban ghi doi khach. Endpoint goi `flushCustomerStats` truoc khi
   doc: tinh lai dung cac id ban bang chinh cac truy van con cu, ghi vao bang, xoa hang doi.
   Trigger nam trong CSDL nen bat duoc moi duong ghi (nhap Excel, khoi phuc, job nen).

   Luc nang cap, moi khach deu "ban" — lan doc dau tinh lai toan bo mot lan. */

CREATE TABLE customer_stats (
  customer_id INTEGER PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  open_deal_count INTEGER NOT NULL DEFAULT 0,
  deal_count INTEGER NOT NULL DEFAULT 0,
  open_task_count INTEGER NOT NULL DEFAULT 0,
  total_won_vnd INTEGER NOT NULL DEFAULT 0,
  open_pipeline_vnd INTEGER NOT NULL DEFAULT 0,
  active_contract_count INTEGER NOT NULL DEFAULT 0,
  last_activity_at TEXT,
  deals_without_next_action_count INTEGER NOT NULL DEFAULT 0,
  next_deal_action TEXT,
  next_deal_action_date TEXT,
  next_task_title TEXT,
  next_task_due_date TEXT,
  next_reminder_title TEXT,
  next_reminder_due_at TEXT,
  refreshed_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE stats_dirty (
  kind TEXT NOT NULL,
  id INTEGER NOT NULL,
  PRIMARY KEY (kind, id)
) WITHOUT ROWID;

INSERT INTO stats_dirty (kind, id) SELECT 'customer', id FROM customers;

CREATE TRIGGER customers_stats_insert AFTER INSERT ON customers
BEGIN
  INSERT OR IGNORE INTO stats_dirty (kind, id) VALUES ('customer', NEW.id);
END;

-- Co hoi: dem, tong tien, next action.
CREATE TRIGGER deals_stats_insert AFTER INSERT ON deals
BEGIN
  INSERT OR IGNORE INTO stats_dirty (kind, id) VALUES ('customer', NEW.customer_id);
END;
CREATE TRIGGER deals_stats_update AFTER UPDATE ON deals
BEGIN
  INSERT OR IGNORE INTO stats_dirty (kind, id) VALUES ('customer', NEW.customer_id);
  INSERT OR IGNORE INTO stats_dirty (kind, id) VALUES ('customer', OLD.customer_id);
END;
CREATE TRIGGER deals_stats_delete AFTER DELETE ON deals
BEGIN
  INSERT OR IGNORE INTO stats_dirty (kind, id) VALUES ('customer', OLD.customer_id);
END;

-- Cong viec: dem viec mo, viec ke tiep.
CREATE TRIGGER cards_stats_insert AFTER INSERT ON cards
WHEN NEW.customer_id IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO stats_dirty (kind, id) VALUES ('customer', NEW.customer_id);
END;
CREATE TRIGGER cards_stats_update AFTER UPDATE OF customer_id, is_done, is_archived, due_date, title ON cards
WHEN NEW.customer_id IS NOT NULL OR OLD.customer_id IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO stats_dirty (kind, id)
    SELECT 'customer', NEW.customer_id WHERE NEW.customer_id IS NOT NULL;
  INSERT OR IGNORE INTO stats_dirty (kind, id)
    SELECT 'customer', OLD.customer_id WHERE OLD.customer_id IS NOT NULL;
END;
CREATE TRIGGER cards_stats_delete AFTER DELETE ON cards
WHEN OLD.customer_id IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO stats_dirty (kind, id) VALUES ('customer', OLD.customer_id);
END;

-- Hop dong dang hieu luc.
CREATE TRIGGER contracts_stats_insert AFTER INSERT ON contracts
BEGIN
  INSERT OR IGNORE INTO stats_dirty (kind, id) VALUES ('customer', NEW.customer_id);
END;
CREATE TRIGGER contracts_stats_update AFTER UPDATE OF customer_id, status ON contracts
BEGIN
  INSERT OR IGNORE INTO stats_dirty (kind, id) VALUES ('customer', NEW.customer_id);
  INSERT OR IGNORE INTO stats_dirty (kind, id) VALUES ('customer', OLD.customer_id);
END;
CREATE TRIGGER contracts_stats_delete AFTER DELETE ON contracts
BEGIN
  INSERT OR IGNORE INTO stats_dirty (kind, id) VALUES ('customer', OLD.customer_id);
END;

-- Lan tuong tac gan nhat.
CREATE TRIGGER interactions_stats_insert AFTER INSERT ON interactions
BEGIN
  INSERT OR IGNORE INTO stats_dirty (kind, id) VALUES ('customer', NEW.customer_id);
END;
CREATE TRIGGER interactions_stats_update AFTER UPDATE OF customer_id, occurred_at ON interactions
BEGIN
  INSERT OR IGNORE INTO stats_dirty (kind, id) VALUES ('customer', NEW.customer_id);
  INSERT OR IGNORE INTO stats_dirty (kind, id) VALUES ('customer', OLD.customer_id);
END;
CREATE TRIGGER interactions_stats_delete AFTER DELETE ON interactions
BEGIN
  INSERT OR IGNORE INTO stats_dirty (kind, id) VALUES ('customer', OLD.customer_id);
END;

-- Nhac hen ke tiep.
CREATE TRIGGER reminders_stats_insert AFTER INSERT ON reminders
WHEN NEW.customer_id IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO stats_dirty (kind, id) VALUES ('customer', NEW.customer_id);
END;
CREATE TRIGGER reminders_stats_update AFTER UPDATE OF customer_id, is_done, due_at, title ON reminders
WHEN NEW.customer_id IS NOT NULL OR OLD.customer_id IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO stats_dirty (kind, id)
    SELECT 'customer', NEW.customer_id WHERE NEW.customer_id IS NOT NULL;
  INSERT OR IGNORE INTO stats_dirty (kind, id)
    SELECT 'customer', OLD.customer_id WHERE OLD.customer_id IS NOT NULL;
END;
CREATE TRIGGER reminders_stats_delete AFTER DELETE ON reminders
WHEN OLD.customer_id IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO stats_dirty (kind, id) VALUES ('customer', OLD.customer_id);
END;
