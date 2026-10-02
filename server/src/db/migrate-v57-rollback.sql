/* Quay ve v56: bo ma lien ket da ma hoa. Link van mo duoc (tra cuu bang ban bam),
   chi mat kha nang sao chep lai. */
ALTER TABLE share_links DROP COLUMN token_ciphertext;
ALTER TABLE share_links DROP COLUMN token_iv;
ALTER TABLE share_links DROP COLUMN token_tag;
