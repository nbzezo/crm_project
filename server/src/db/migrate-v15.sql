/* ---------- v15: nguoi phu trach cong viec ----------
   Truoc v15 the chi tra loi duoc "viec nay VE cai gi" (customer/contact/deal/
   contract/quotation). Khong co truc "AI LAM" nen khong nhac duoc dung nguoi.

   `customers` duoc mo rong thanh so danh ba TO CHUC: cong ty cua chinh minh
   ('own'), khach hang ('customer'), doi tac ('partner'), nha cung cap ('vendor').
   `contacts` giu nguyen vai tro so danh ba NGUOI cua tung to chuc. Nho vay nhan su
   khach hang khong phai nhap hai lan — ho da co san o day kem phone/email/zalo.

   SQLite khong them CHECK qua ALTER TABLE duoc; tap gia tri hop le duoc chan o
   Zod (routes/customers.ts), giong cach CONTRACT_STATUSES dang lam. */
ALTER TABLE customers ADD COLUMN org_kind TEXT NOT NULL DEFAULT 'customer';

/* is_me: dung mot ban ghi duy nhat dai dien chinh nguoi dung, de loc "viec cua toi".
   is_active: nhan su nghi viec thi an khoi o chon ma khong xoa lich su cong viec cu. */
ALTER TABLE contacts ADD COLUMN is_me INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contacts ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

/* Nguoi phu trach la TRUC RIENG, khong nam trong bo khoa ma assertEntityLinks kiem
   tra: mot viec ve khach hang A hoan toan co the do nhan su cong ty minh lam. Xem
   resolveAssignee() trong lib/entityRelations.ts.

   assignee_org_id luon duoc SUY RA tu contact o may chu (khong bao gio nhan tu
   client) — luu san de loc/nhom theo to chuc khong phai join contacts moi lan. */
ALTER TABLE cards ADD COLUMN assignee_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE cards ADD COLUMN assignee_org_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX idx_cards_assignee ON cards(assignee_contact_id, is_done, due_date);
CREATE INDEX idx_cards_assignee_org ON cards(assignee_org_id, is_done);
CREATE INDEX idx_customers_org_kind ON customers(org_kind, name);
CREATE INDEX idx_contacts_assignable ON contacts(is_active, customer_id, full_name);
