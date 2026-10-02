/* ---------- v54: Ho so khach hang 360° — cham soc va goi y ban them ----------

   1) `customers.care_tier` + `care_cadence_days`: hang cham soc va nhip lien he.
      Nhip mac dinh theo hang nam trong code (services/customerCare.ts): vip 14 ngay,
      key 21, standard 30, low 90. `care_cadence_days` (NULL = theo hang) de ghi de
      cho tung khach. Mac dinh 'standard' = 30 ngay — dung nguong "khach lau khong
      lien he" ma tab Trong tam dang dung, nen ban ghi cu khong doi hanh vi.
      Khong dat CHECK tren cot them vao: rollback can DROP COLUMN; gia tri hop le
      do zod kiem o duong ghi.

   2) `contacts.birthday`: 'MM-DD' hoac 'YYYY-MM-DD' — nhac sinh nhat.

   3) `customer_suggestions`: goi y co hoi (gia han, ban cheo, mo lai bao gia/co hoi
      thua, cham soc sau ban). Engine tinh lai moi lan mo ho so; `key` duy nhat theo
      khach hang de goi y da bo qua/da nhan khong hien lai. Luu quyet dinh de do ti
      le chap nhan. */

ALTER TABLE customers ADD COLUMN care_tier TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE customers ADD COLUMN care_cadence_days INTEGER;
ALTER TABLE contacts ADD COLUMN birthday TEXT;

CREATE TABLE customer_suggestions (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL
    CHECK (kind IN ('renewal','cross_sell','reopen_quote','reopen_lost','aftercare')),
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  value_vnd INTEGER NOT NULL DEFAULT 0,
  service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
  contract_id INTEGER REFERENCES contracts(id) ON DELETE CASCADE,
  quotation_id INTEGER REFERENCES quotations(id) ON DELETE CASCADE,
  source_deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE,
  customer_service_id INTEGER REFERENCES customer_services(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','dismissed')),
  dismiss_reason TEXT,
  result_deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  decided_by INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX idx_customer_suggestions_key ON customer_suggestions(customer_id, key);
CREATE INDEX idx_customer_suggestions_status ON customer_suggestions(status, kind);
