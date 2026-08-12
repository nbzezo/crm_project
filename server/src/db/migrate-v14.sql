/* ---------- v14: cong viec gan duoc voi hop dong / bao gia ----------
   Cot contact_id da co tu v4 nhung chua bao gio duoc route /api/cards ghi.
   Them contract_id + quotation_id de mot Task gan duoc voi moi thuc the CRM,
   dung dung bo khoa ma assertEntityLinks da kiem tra san. */
ALTER TABLE cards ADD COLUMN contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL;
ALTER TABLE cards ADD COLUMN quotation_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL;

/* Truoc v14 chi customer_id co chi muc; cac man CRM deu loc the theo cac khoa nay. */
CREATE INDEX IF NOT EXISTS idx_cards_deal ON cards(deal_id);
CREATE INDEX IF NOT EXISTS idx_cards_contact ON cards(contact_id);
CREATE INDEX IF NOT EXISTS idx_cards_contract ON cards(contract_id);
CREATE INDEX IF NOT EXISTS idx_cards_quotation ON cards(quotation_id);
