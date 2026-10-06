/* v66: quy trinh theo trang thai cua cong viec (1.29.0).

   Mot quy trinh la danh sach buoc cua MOT cong viec trong MOT trang thai loi
   (vd "Dang lam": Khao sat -> Cau hinh -> Kiem thu), lam lan luot. No nam BEN
   TRONG cong viec, khong thay cho cot: `list_id` van la vi tri tren kanban va
   `status` van la nguon cua moi bao cao. Xem docs/PLAN-QUY-TRINH-TRANG-THAI.md.

   Mau theo trang thai va cong tac bat/tat nam o `app_settings` (khoa
   `task_flow.*`), cung khuon `handover.templates`. Khong chen gia tri nao o day:
   thieu khoa nghia la tinh nang dang tat va dung mau mac dinh trong code. */

CREATE TABLE card_flows (
  id INTEGER PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  status TEXT NOT NULL
    CHECK (status IN ('todo','doing','waiting_customer','blocked','review')),
  from_template INTEGER NOT NULL DEFAULT 0 CHECK (from_template IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  created_by_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  completed_at TEXT,
  skipped_at TEXT,
  skipped_by_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  UNIQUE (card_id, status)
);

CREATE TABLE card_flow_steps (
  id INTEGER PRIMARY KEY,
  flow_id INTEGER NOT NULL REFERENCES card_flows(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  position REAL NOT NULL,
  done_at TEXT,
  done_by_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL
);
CREATE INDEX idx_card_flow_steps_flow ON card_flow_steps(flow_id, position);
