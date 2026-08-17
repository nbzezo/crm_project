import crypto from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { required } from '../../lib/validate.ts';
import { getHandoverSettings, listOverdueHandovers } from '../handoverService.ts';

interface AutomationRow {
  id: number;
  name: string;
  automation_type:
    'pipeline_risk' | 'overdue_followup' | 'contract_expiry' | 'daily_brief' | 'handover_sla';
  enabled: number;
  interval_minutes: number;
  config_json: string;
  last_run_at: string | null;
  next_run_at: string | null;
}

interface NotificationInput {
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  link?: string;
  entityKey: string;
}

function asConfig(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function numberConfig(config: Record<string, unknown>, key: string, fallback: number) {
  const value = Number(config[key]);
  return Number.isFinite(value) ? value : fallback;
}

function scan(db: Database, automation: AutomationRow): NotificationInput[] {
  const config = asConfig(automation.config_json);
  if (automation.automation_type === 'pipeline_risk') {
    const inactiveDays = Math.max(1, Math.min(numberConfig(config, 'inactive_days', 14), 365));
    const minValue = Math.max(0, numberConfig(config, 'min_value_vnd', 0));
    const deals = db
      .prepare(
        `SELECT d.id, d.title, d.value_vnd, d.stage, c.name AS customer_name,
                MAX(i.occurred_at) AS last_interaction
           FROM deals d JOIN customers c ON c.id = d.customer_id AND c.org_kind = 'customer'
           LEFT JOIN interactions i ON i.deal_id = d.id
          WHERE d.stage NOT IN ('won','lost') AND d.value_vnd >= ?
          GROUP BY d.id
         HAVING COALESCE(MAX(i.occurred_at), d.created_at) < datetime('now','localtime', ?)
          ORDER BY d.value_vnd DESC LIMIT 50`
      )
      .all(minValue, `-${inactiveDays} days`) as {
      id: number;
      title: string;
      value_vnd: number;
      stage: string;
      customer_name: string;
      last_interaction: string | null;
    }[];
    return deals.map((deal) => ({
      severity: deal.value_vnd >= 500_000_000 ? 'critical' : 'warning',
      title: `Cơ hội thiếu tương tác: ${deal.title}`,
      body: `${deal.customer_name} · ${deal.value_vnd.toLocaleString('vi-VN')} ₫ · không có tương tác trong ${inactiveDays} ngày.`,
      link: `/deals/${deal.id}`,
      entityKey: `deal-${deal.id}`,
    }));
  }
  if (automation.automation_type === 'overdue_followup') {
    const deals = db
      .prepare(
        `SELECT d.id, d.title, d.next_action, d.next_action_date, d.value_vnd, c.name AS customer_name
           FROM deals d JOIN customers c ON c.id = d.customer_id AND c.org_kind = 'customer'
          WHERE d.stage NOT IN ('won','lost') AND d.next_action_date < date('now','localtime')
          ORDER BY d.next_action_date, d.value_vnd DESC LIMIT 50`
      )
      .all() as {
      id: number;
      title: string;
      next_action: string | null;
      next_action_date: string;
      customer_name: string;
    }[];
    return deals.map((deal) => ({
      severity: 'warning',
      title: `Next Action quá hạn: ${deal.title}`,
      body: `${deal.customer_name} · ${deal.next_action || 'Chưa có nội dung'} · hạn ${deal.next_action_date}.`,
      link: `/deals/${deal.id}`,
      entityKey: `deal-${deal.id}-${deal.next_action_date}`,
    }));
  }
  if (automation.automation_type === 'contract_expiry') {
    const days = Math.max(1, Math.min(numberConfig(config, 'days', 30), 365));
    const contracts = db
      .prepare(
        `SELECT k.id, k.name, k.end_date, k.value_vnd, c.id AS customer_id, c.name AS customer_name
           FROM contracts k JOIN customers c ON c.id = k.customer_id AND c.org_kind = 'customer'
          WHERE k.status = 'active' AND k.end_date BETWEEN date('now','localtime')
                AND date('now','localtime', ?)
          ORDER BY k.end_date LIMIT 50`
      )
      .all(`+${days} days`) as {
      id: number;
      name: string;
      end_date: string;
      value_vnd: number;
      customer_id: number;
      customer_name: string;
    }[];
    return contracts.map((contract) => ({
      severity: 'warning',
      title: `Hợp đồng sắp hết hạn: ${contract.name}`,
      body: `${contract.customer_name} · hết hạn ${contract.end_date} · ${contract.value_vnd.toLocaleString('vi-VN')} ₫.`,
      link: `/customers/${contract.customer_id}`,
      entityKey: `contract-${contract.id}-${contract.end_date}`,
    }));
  }

  if (automation.automation_type === 'handover_sla') {
    /*
     * So ngay SLA doc tu `app_settings` chu khong tu `config_json` cua automation
     * nay — no la chinh sach ban giao, dung cho voi `handover.templates`, va
     * nguoi dung sua ca hai o cung mot man hinh. Mot ban sao trong config_json se
     * tao ra hai nguon su that cho cung mot con so.
     */
    const { slaDays } = getHandoverSettings(db);
    return listOverdueHandovers(db, slaDays).map((deal) => ({
      /* Qua gap doi SLA thi khong con la nhac viec nua. */
      severity: deal.days_waiting >= slaDays * 2 ? 'critical' : 'warning',
      title: `Chờ bàn giao quá hạn: ${deal.title}`,
      body:
        `${deal.customer_name} · đã thắng ${deal.days_waiting} ngày (SLA ${slaDays} ngày)` +
        (deal.pending_required > 0
          ? ` · còn ${deal.pending_required} mục hồ sơ bắt buộc chưa xong.`
          : ' · chưa lập checklist bàn giao.'),
      link: `/deals/${deal.id}`,
      /* Kem so ngay de moi ngay qua han sinh mot canh bao moi thay vi im lang
         sau lan dau — cham bàn giao lau ngay phai on hon, khong phai quen di. */
      entityKey: `handover-${deal.id}-${deal.days_waiting}`,
    }));
  }

  const summary = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM cards WHERE is_done = 0 AND is_archived = 0
          AND due_date < date('now','localtime')) AS overdue_tasks,
        (SELECT COUNT(*) FROM cards WHERE is_done = 0 AND is_archived = 0
          AND date(due_date) = date('now','localtime')) AS today_tasks,
        (SELECT COUNT(*) FROM deals WHERE stage NOT IN ('won','lost')
          AND next_action_date < date('now','localtime')) AS overdue_actions`
    )
    .get() as { overdue_tasks: number; today_tasks: number; overdue_actions: number };
  if (summary.overdue_tasks + summary.today_tasks + summary.overdue_actions === 0) return [];
  return [
    {
      severity: summary.overdue_tasks > 0 ? 'warning' : 'info',
      title: 'Kế hoạch làm việc hôm nay',
      body: `${summary.today_tasks} việc đến hạn hôm nay, ${summary.overdue_tasks} việc quá hạn và ${summary.overdue_actions} Next Action quá hạn.`,
      link: '/',
      entityKey: 'daily-brief',
    },
  ];
}

function fingerprint(automation: AutomationRow, item: NotificationInput): string {
  const day = new Date().toISOString().slice(0, 10);
  return crypto
    .createHash('sha256')
    .update(`${automation.automation_type}|${item.entityKey}|${day}`)
    .digest('hex');
}

export function runAutomation(db: Database, id: number) {
  const automation = required(
    db.prepare(`SELECT * FROM ai_automations WHERE id = ?`).get(id) as AutomationRow | undefined,
    'Không tìm thấy automation AI'
  );
  const runInfo = db
    .prepare(`INSERT INTO ai_automation_runs (automation_id, status) VALUES (?, 'success')`)
    .run(id);
  const runId = Number(runInfo.lastInsertRowid);
  try {
    const items = scan(db, automation);
    const insert = db.prepare(
      `INSERT OR IGNORE INTO ai_notifications
        (automation_id, severity, title, body, link, fingerprint)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    let created = 0;
    db.transaction(() => {
      for (const item of items) {
        created += insert.run(
          automation.id,
          item.severity,
          item.title,
          item.body,
          item.link ?? null,
          fingerprint(automation, item)
        ).changes;
      }
      db.prepare(
        `UPDATE ai_automations SET last_run_at = datetime('now','localtime'),
                next_run_at = datetime('now','localtime', '+' || interval_minutes || ' minutes'),
                updated_at = datetime('now','localtime') WHERE id = ?`
      ).run(id);
      db.prepare(
        `UPDATE ai_automation_runs SET items_found = ?, finished_at = datetime('now','localtime')
          WHERE id = ?`
      ).run(items.length, runId);
    })();
    return { automation_id: id, found: items.length, created };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lỗi không xác định';
    db.transaction(() => {
      db.prepare(
        `UPDATE ai_automation_runs SET status = 'error', error = ?,
                finished_at = datetime('now','localtime') WHERE id = ?`
      ).run(message, runId);
      db.prepare(
        `INSERT OR IGNORE INTO ai_notifications
          (automation_id, severity, title, body, link, fingerprint)
         VALUES (?, 'critical', ?, ?, '/ai?tab=operations', ?)`
      ).run(
        automation.id,
        `Automation gặp lỗi: ${automation.name}`,
        `Lần quét gần nhất không hoàn tất. ${message}`,
        fingerprint(automation, {
          severity: 'critical',
          title: automation.name,
          body: message,
          entityKey: `error-${message}`,
        })
      );
    })();
    throw error;
  }
}

let scheduler: ReturnType<typeof setInterval> | null = null;

export function runDueAutomations(db: Database) {
  const due = db
    .prepare(
      `SELECT id FROM ai_automations WHERE enabled = 1
        AND (next_run_at IS NULL OR next_run_at <= datetime('now','localtime')) ORDER BY id`
    )
    .all() as { id: number }[];
  for (const item of due) {
    try {
      runAutomation(db, item.id);
    } catch (error) {
      console.error('[ai-automation]', error instanceof Error ? error.message : error);
    }
  }
}

export function startAiAutomationScheduler(db: Database) {
  if (scheduler) return scheduler;
  scheduler = setInterval(() => runDueAutomations(db), 60_000);
  scheduler.unref();
  setTimeout(() => runDueAutomations(db), 2_000).unref();
  return scheduler;
}
