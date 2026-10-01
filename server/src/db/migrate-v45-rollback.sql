/* Quay ve v44: bo moc phan nhom va bang TB nam truoc. */
DROP INDEX IF EXISTS idx_revenue_baselines_year;
DROP TABLE IF EXISTS revenue_baselines;
ALTER TABLE customer_services DROP COLUMN revenue_anchor_updated_at;
ALTER TABLE customer_services DROP COLUMN revenue_anchor_updated_by;
ALTER TABLE customer_services DROP COLUMN revenue_anchor_period;
ALTER TABLE customer_services DROP COLUMN revenue_anchor_mode;
