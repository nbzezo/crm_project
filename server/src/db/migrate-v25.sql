/* ---------- v25: automation canh bao Won qua han cho ban giao ----------

   `ai_automations.automation_type` co rang buoc CHECK liet ke dung bon loai tu
   v13. SQLite khong sua duoc CHECK tai cho, nen phai dung lai bang: tao bang moi,
   chep sang, doi ten. Giu NGUYEN id vi `ai_automation_runs` va `ai_notifications`
   tro toi chung — do cung la ly do buoc nay phai chay voi foreign_keys = OFF
   (xem migrate.ts, giong cach v4 lam).

   SLA bao nhieu ngay thi KHONG nam trong `config_json` cua automation nay, khac
   voi 'contract_expiry'. No nam o `app_settings` duoi khoa `handover.sla_days`
   cung cho voi `handover.templates`, vi ca hai deu la chinh sach ban giao va
   nguoi dung sua chung o cung mot man hinh Cai dat. Dat them mot ban sao trong
   config_json se tao ra hai nguon su that cho cung mot con so. */

CREATE TABLE ai_automations_new (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  automation_type TEXT NOT NULL CHECK (
    automation_type IN (
      'pipeline_risk', 'overdue_followup', 'contract_expiry', 'daily_brief', 'handover_sla'
    )
  ),
  enabled INTEGER NOT NULL DEFAULT 0,
  interval_minutes INTEGER NOT NULL DEFAULT 1440 CHECK (interval_minutes BETWEEN 15 AND 10080),
  config_json TEXT NOT NULL DEFAULT '{}',
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

INSERT INTO ai_automations_new
  (id, name, automation_type, enabled, interval_minutes, config_json,
   last_run_at, next_run_at, created_at, updated_at)
SELECT id, name, automation_type, enabled, interval_minutes, config_json,
       last_run_at, next_run_at, created_at, updated_at
  FROM ai_automations;

DROP TABLE ai_automations;
ALTER TABLE ai_automations_new RENAME TO ai_automations;

/* Mac dinh TAT (`enabled` = 0) giong bon automation co san: bat mot canh bao ma
   nguoi dung chua he cau hinh SLA cho minh la tu quyet dinh ho thay. */
INSERT INTO ai_automations (name, automation_type, interval_minutes, config_json) VALUES
  ('Won quá hạn chờ bàn giao', 'handover_sla', 720, '{}');
