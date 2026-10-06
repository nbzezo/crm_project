/* ---------- Rollback v63 -> v62 ----------

   Chay bang: npm run db:rollback --workspace server -- 62

   Bo bon danh muc nganh nghe, quy mo, nguon khach hang, nguon co hoi. Cac cot
   `customers.industry/size/source` va `deals.source` van giu nguyen gia tri: v62
   coi chung la chu tu do, nen moi gia tri deu doc va sua duoc nhu cu.

   KHONG hoan tac buoc chuan hoa cua v63 (gop "cntt", "CNTT " thanh mot cach viet):
   gia tri da gop la mot cach viet hop le, va cach viet cu khong con duoc luu lai.

   MAT MAT DU LIEU: thu tu, trang thai an/hien va cac muc tu them cua bon danh muc. */

DELETE FROM picklist_items
 WHERE list_key IN ('customer_industry', 'customer_size', 'customer_source', 'deal_source');
