/* ---------- Rollback v25 -> v24 ----------

   Chay bang: npm run db:rollback --workspace server -- 24

   Dung lai bang voi rang buoc CHECK cu (bon loai). Cac automation 'handover_sla'
   PHAI bi xoa TRUOC khi chep sang, neu khong ban ghi cua chung se vi pham CHECK
   moi va ca buoc quay lui that bai.

   MAT MAT DU LIEU: automation 'Won qua han cho ban giao' cung lich su chay va
   cac thong bao no da sinh ra (ai_automation_runs xoa theo CASCADE;
   ai_notifications giu lai nhung mat tham chieu vi khoa ngoai la SET NULL). */

DELETE FROM ai_automations WHERE automation_type = 'handover_sla';

CREATE TABLE ai_automations_old (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  automation_type TEXT NOT NULL CHECK (
    automation_type IN ('pipeline_risk', 'overdue_followup', 'contract_expiry', 'daily_brief')
  ),
  enabled INTEGER NOT NULL DEFAULT 0,
  interval_minutes INTEGER NOT NULL DEFAULT 1440 CHECK (interval_minutes BETWEEN 15 AND 10080),
  config_json TEXT NOT NULL DEFAULT '{}',
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

INSERT INTO ai_automations_old
  (id, name, automation_type, enabled, interval_minutes, config_json,
   last_run_at, next_run_at, created_at, updated_at)
SELECT id, name, automation_type, enabled, interval_minutes, config_json,
       last_run_at, next_run_at, created_at, updated_at
  FROM ai_automations;

DROP TABLE ai_automations;
ALTER TABLE ai_automations_old RENAME TO ai_automations;
