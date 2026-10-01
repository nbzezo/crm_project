/* v46: Chi tieu KPI doanh thu theo AM va theo thang.

   AM tren dong doanh thu la chuoi tu do (customer_services.am), nen chi tieu
   cung khoa theo chuoi do; '' la nhom "Chua gan AM". */

CREATE TABLE revenue_kpi_targets (
  am TEXT NOT NULL,
  period TEXT NOT NULL,
  target_vnd INTEGER NOT NULL DEFAULT 0 CHECK (target_vnd >= 0),
  updated_by INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (am, period)
);
CREATE INDEX idx_revenue_kpi_targets_period ON revenue_kpi_targets(period);
