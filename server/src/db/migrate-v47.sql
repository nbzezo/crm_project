/* v47: AM cua dong doanh thu la mot NGUOI DUNG cua he thong.

   - customer_services.am_user_id tro toi users; cot `am` (chu) duoc giu va dong
     bo bang ten nguoi dung de tim kiem / xuat CSV khong doi. Gia tri cu khong
     ghep duoc voi ai van nam o `am` de nguoi dung tu chon lai.
   - revenue_kpi_targets doi khoa tu ten AM sang am_user_id (0 = "Chua gan AM").
     Ghep ten cu sang nguoi dung lam o TypeScript (can bo dau tieng Viet). */

ALTER TABLE customer_services ADD COLUMN am_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_customer_services_am_user ON customer_services(am_user_id);

ALTER TABLE revenue_kpi_targets RENAME TO revenue_kpi_targets_v46;
DROP INDEX IF EXISTS idx_revenue_kpi_targets_period;
CREATE TABLE revenue_kpi_targets (
  am_user_id INTEGER NOT NULL,
  period TEXT NOT NULL,
  target_vnd INTEGER NOT NULL DEFAULT 0 CHECK (target_vnd >= 0),
  updated_by INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (am_user_id, period)
);
CREATE INDEX idx_revenue_kpi_targets_period ON revenue_kpi_targets(period);
