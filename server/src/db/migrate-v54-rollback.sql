/* Quay ve v53: bo goi y co hoi, hang cham soc, nhip lien he va sinh nhat nguoi lien he. */
DROP INDEX IF EXISTS idx_customer_suggestions_status;
DROP INDEX IF EXISTS idx_customer_suggestions_key;
DROP TABLE IF EXISTS customer_suggestions;
ALTER TABLE contacts DROP COLUMN birthday;
ALTER TABLE customers DROP COLUMN care_cadence_days;
ALTER TABLE customers DROP COLUMN care_tier;
