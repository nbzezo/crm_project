/* v65: nguoi tai len cua tep (documents.owner_contact_id) — phan quyen du lieu cho
   kho tep (1.28.2).

   Cot `owner` co tu v12 la CHU TU DO (nguoi phu trach ho so, go tay), khong phai
   danh tinh — khong dung de phan quyen duoc. Tep cu khong biet ai tai len nen de
   NULL: chung theo ban ghi gan kem (khach hang, co hoi, hop dong…), va tep cu
   khong gan gi giu nguyen nhu truoc (ai co quyen Tai lieu cung thay). Xem
   server/src/lib/documentScope.ts. */

ALTER TABLE documents ADD COLUMN owner_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;
CREATE INDEX idx_documents_owner ON documents(owner_contact_id);
