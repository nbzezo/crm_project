/* Quay ve v46: chi tieu KPI khoa lai theo ten AM; bo am_user_id. */
ALTER TABLE revenue_kpi_targets RENAME TO revenue_kpi_targets_v47;
DROP INDEX IF EXISTS idx_revenue_kpi_targets_period;
CREATE TABLE revenue_kpi_targets (
  am TEXT NOT NULL,
  period TEXT NOT NULL,
  target_vnd INTEGER NOT NULL DEFAULT 0 CHECK (target_vnd >= 0),
  updated_by INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (am, period)
);
CREATE INDEX idx_revenue_kpi_targets_period ON revenue_kpi_targets(period);
INSERT OR IGNORE INTO revenue_kpi_targets (am, period, target_vnd, updated_by, updated_at)
SELECT CASE WHEN t.am_user_id = 0 THEN '' ELSE COALESCE(u.full_name, u.username) END,
       t.period, t.target_vnd, t.updated_by, t.updated_at
  FROM revenue_kpi_targets_v47 t LEFT JOIN users u ON u.id = t.am_user_id
 WHERE t.am_user_id = 0 OR u.id IS NOT NULL;
DROP TABLE revenue_kpi_targets_v47;
DROP INDEX IF EXISTS idx_customer_services_am_user;
ALTER TABLE customer_services DROP COLUMN am_user_id;
