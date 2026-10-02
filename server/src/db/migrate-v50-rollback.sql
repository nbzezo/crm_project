/* Quay ve v49: tra ten to chuc ve cach viet truoc khi chuan hoa (v50 giu ten cu
   trong customer_names_before_v50). Ten sua SAU v50 cung bi tra ve ten cu — chi
   chay khi thuc su muon huy dot chuan hoa. */
UPDATE customers
   SET name = (SELECT b.name FROM customer_names_before_v50 b WHERE b.customer_id = customers.id)
 WHERE id IN (SELECT customer_id FROM customer_names_before_v50);
DROP TABLE customer_names_before_v50;
