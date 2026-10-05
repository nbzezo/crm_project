/* v60: chi muc cho cac cot lien ket con thieu (1.20.1).

   Danh sach Co hoi, Khach hang, Hop dong, Bao gia va Tong quan tinh nhieu so lieu
   phu cho TUNG dong bang truy van con (dem tuong tac, hop dong, nhac hen, tai lieu...).
   Thieu chi muc thi moi truy van con quet ca bang con, nen thoi gian tang theo TICH
   so dong hai bang. Do tren du lieu thu 5.000 khach / 15.000 co hoi / 80.000 tuong tac:
   /deals 379 s -> 0,8 s, /views/dashboard 217 s -> 0,7 s, /customers 41 s -> 1 s,
   /quotations 36 s -> 0,15 s, /contracts 21 s -> 0,12 s.

   Chi them chi muc, khong doi du lieu. Them chi muc cung giup xoa ban ghi cha nhanh
   hon (SQLite phai tim dong con khi kiem khoa ngoai). */
CREATE INDEX IF NOT EXISTS idx_interactions_deal ON interactions(deal_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_interactions_contact ON interactions(contact_id);
CREATE INDEX IF NOT EXISTS idx_contracts_deal ON contracts(deal_id);
CREATE INDEX IF NOT EXISTS idx_reminders_customer ON reminders(customer_id, is_done, due_at);
CREATE INDEX IF NOT EXISTS idx_reminders_deal ON reminders(deal_id);
CREATE INDEX IF NOT EXISTS idx_documents_quotation ON documents(quotation_id);
CREATE INDEX IF NOT EXISTS idx_documents_contract ON documents(contract_id);
CREATE INDEX IF NOT EXISTS idx_documents_deal ON documents(deal_id);
CREATE INDEX IF NOT EXISTS idx_checklist_items_card ON checklist_items(card_id);
CREATE INDEX IF NOT EXISTS idx_contacts_customer ON contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_services_contract ON customer_services(contract_id);
