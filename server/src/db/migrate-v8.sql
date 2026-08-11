-- v8: doanh thu thang = MOT so tien + MOT trang thai giai doan (thay vi 4 cot tien roi rac).
-- Vong doi: du kien -> da doi soat -> da xuat hoa don -> da thanh toan.
-- amount_vnd   : doanh thu thuc te hien hanh (co the sua lai khi doi soat voi khach)
-- forecast_vnd : so du kien ban dau, giu lai de doi chieu do lech
-- stage        : giai doan hien tai cua so tien do

CREATE TABLE service_revenues_new (
  id INTEGER PRIMARY KEY,
  line_id INTEGER NOT NULL REFERENCES customer_services(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  amount_vnd INTEGER NOT NULL DEFAULT 0,
  forecast_vnd INTEGER NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'forecast'
    CHECK (stage IN ('forecast','reconciled','invoiced','paid')),
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- So tien lay theo giai doan xa nhat da nhap; giai doan suy ra tu cot nao co so lieu.
INSERT INTO service_revenues_new (id, line_id, period, amount_vnd, forecast_vnd, stage, note, updated_at)
SELECT id, line_id, period,
       COALESCE(NULLIF(paid_vnd, 0), NULLIF(invoiced_vnd, 0), NULLIF(reconciled_vnd, 0), forecast_vnd),
       forecast_vnd,
       CASE WHEN paid_vnd > 0 THEN 'paid'
            WHEN invoiced_vnd > 0 THEN 'invoiced'
            WHEN reconciled_vnd > 0 THEN 'reconciled'
            ELSE 'forecast' END,
       note, updated_at
  FROM service_revenues;

DROP TABLE service_revenues;
ALTER TABLE service_revenues_new RENAME TO service_revenues;

CREATE UNIQUE INDEX idx_service_revenues_line_period ON service_revenues(line_id, period);
CREATE INDEX idx_service_revenues_period ON service_revenues(period);
CREATE INDEX idx_service_revenues_stage ON service_revenues(stage);
