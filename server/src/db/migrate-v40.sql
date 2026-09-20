/* ---------- v40: chu so huu ban ghi — nen cua phan quyen DU LIEU ----------

   v39 chan theo TINH NANG (vao duoc man hinh nao). v40 chan theo TUNG BAN GHI
   (trong man hinh do thay nhung dong nao). Hai lop doc lap va deu can thiet.

   CHI BANG GOC MANG COT CHU SO HUU. Moi bang con suy pham vi bang chinh cai JOIN
   no da co san:

     contracts / quotations / interactions  -> deals, roi den customers
     lists / cards / checklist / comments   -> boards
     deal_scores / committee / events ...   -> deals
     service_revenues                       -> customer_services
     project_risks / handover_items         -> projects / deals
     documents                              -> thuc the dang gan

   Ly do khong rai `owner_contact_id` xuong moi bang: do la nhan ban, va
   ARCHITECTURE.md da ke lai chuyen `cards.project_id` tung la mot ban sao roi bi
   xoa han o v19 — "khong co ban sao thi khong the lech". Mot cot chu so huu lech
   voi cha cua no nghia la mot ban ghi hien ra cho dung nguoi khong duoc phep, va
   khong man hinh nao lam lo ra dieu do.

   BANG CA NHAN (`quick_notes`, `meeting_notes`, `calendar_events`, `reminders`)
   VAN mang cot rieng: chung khong co cha bat buoc — mot ghi chu nhanh hoac mot
   su kien lich co the khong gan voi gi ca. Voi chung, chu so huu la chinh nguoi
   tao.

   BACKFILL: toan bo ve contact cua tai khoan dau tien. Khong ai mat du lieu o
   lan chay dau — mot cuoc di doi phan quyen KHONG duoc phep bat dau bang viec
   lam bien mat du lieu cua nguoi dang dung. Viec chia lai chu so huu that su la
   thao tac cua con nguoi tren giao dien, khong phai cua migration doan mo. */

/* ---------- 1. Bang goc nghiep vu ---------- */

ALTER TABLE customers ADD COLUMN owner_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE deals ADD COLUMN owner_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE boards ADD COLUMN owner_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE customer_services ADD COLUMN owner_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;

CREATE INDEX idx_customers_owner ON customers(owner_contact_id);
CREATE INDEX idx_deals_owner ON deals(owner_contact_id);
CREATE INDEX idx_boards_owner ON boards(owner_contact_id);
CREATE INDEX idx_customer_services_owner ON customer_services(owner_contact_id);

/* ---------- 2. Bang ca nhan ---------- */

ALTER TABLE quick_notes ADD COLUMN owner_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE meeting_notes ADD COLUMN owner_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE calendar_events ADD COLUMN owner_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE reminders ADD COLUMN owner_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;

CREATE INDEX idx_quick_notes_owner ON quick_notes(owner_contact_id);
CREATE INDEX idx_meeting_notes_owner ON meeting_notes(owner_contact_id);
CREATE INDEX idx_calendar_events_owner ON calendar_events(owner_contact_id);
CREATE INDEX idx_reminders_owner ON reminders(owner_contact_id);

/* ---------- 3. Backfill ----------

   Uu tien du lieu da co san truoc khi roi ve tai khoan dau tien:
   - `projects.owner_contact_id` co tu v17, dung lai duoc cho bang cua du an;
   - cong viec da co nguoi phu trach thi bang chua no thuoc ve nguoi do khong
     phai la suy dien an toan (mot bang chua viec cua nhieu nguoi), nen KHONG suy.

   Mot dong con NULL sau buoc nay se chi hien ra voi nguoi co pham vi `all` —
   xem `scopeWhere` trong server/src/lib/scope.ts. Do la lua chon co y: bo sot
   mot ban ghi con hon giao no nham cho ai do. */

UPDATE boards
   SET owner_contact_id = (SELECT p.owner_contact_id FROM projects p WHERE p.id = boards.project_id)
 WHERE owner_contact_id IS NULL
   AND project_id IS NOT NULL
   AND (SELECT p.owner_contact_id FROM projects p WHERE p.id = boards.project_id) IS NOT NULL;

UPDATE customers SET owner_contact_id = (
  SELECT u.contact_id FROM users u WHERE u.contact_id IS NOT NULL ORDER BY u.id LIMIT 1
) WHERE owner_contact_id IS NULL;

UPDATE deals SET owner_contact_id = (
  SELECT c.owner_contact_id FROM customers c WHERE c.id = deals.customer_id
) WHERE owner_contact_id IS NULL;

UPDATE boards SET owner_contact_id = (
  SELECT u.contact_id FROM users u WHERE u.contact_id IS NOT NULL ORDER BY u.id LIMIT 1
) WHERE owner_contact_id IS NULL;

UPDATE customer_services SET owner_contact_id = (
  SELECT c.owner_contact_id FROM customers c WHERE c.id = customer_services.customer_id
) WHERE owner_contact_id IS NULL;

/* Du lieu ca nhan: giao cho tai khoan dau tien, la nguoi duy nhat ton tai truoc
   khi he thong co nhieu nguoi dung. */
UPDATE quick_notes SET owner_contact_id = (
  SELECT u.contact_id FROM users u WHERE u.contact_id IS NOT NULL ORDER BY u.id LIMIT 1
) WHERE owner_contact_id IS NULL;

UPDATE meeting_notes SET owner_contact_id = (
  SELECT u.contact_id FROM users u WHERE u.contact_id IS NOT NULL ORDER BY u.id LIMIT 1
) WHERE owner_contact_id IS NULL;

UPDATE calendar_events SET owner_contact_id = (
  SELECT u.contact_id FROM users u WHERE u.contact_id IS NOT NULL ORDER BY u.id LIMIT 1
) WHERE owner_contact_id IS NULL;

UPDATE reminders SET owner_contact_id = (
  SELECT u.contact_id FROM users u WHERE u.contact_id IS NOT NULL ORDER BY u.id LIMIT 1
) WHERE owner_contact_id IS NULL;

/* ---------- 4. Ghi chu la du lieu CA NHAN ----------

   v39 seed `notes` cho cac vi tri quan ly o muc `subtree` cung voi moi resource
   khac. Dung ve ky thuat, sai ve nghia: Ghi chu nhanh la mau giay dan tren man
   hinh cua rieng mot nguoi, va Ghi chu hop thuong chua nhan xet chua chin. Mot
   Truong phong doc duoc so nhap cua nhan vien khong phai la phan cap quan ly —
   do la giam sat, va no se lam nguoi ta ngung ghi that.

   Ha ve `own` cho MOI vi tri tru quan tri he thong. Van doi lai duoc tren giao
   dien cho to chuc nao that su muon vay — day chi la mac dinh, khong phai luat. */

UPDATE position_permissions
   SET scope = 'own'
 WHERE resource = 'notes'
   AND scope <> 'own'
   AND position_id <> (SELECT id FROM positions WHERE code = 'system_admin');
