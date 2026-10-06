/**
 * Cau hinh Quy trinh theo trang thai (v66): cong tac bat/tat va mau tung trang thai.
 *
 * Nhan `db` qua tham so va KHONG import `db/connection.ts`, de ho so cau hinh
 * (configProfile.ts, chay ca tu script applyProfile) dung chung duoc — giong
 * handoverService.
 */
import type { Database } from 'better-sqlite3';
import {
  CARD_STATUSES,
  DEFAULT_FLOW_TEMPLATES,
  FLOW_ASK_MODES,
  FLOW_STATUSES,
  type CardStatus,
  type FlowStatus,
  type FlowTemplate,
  type TaskFlowSettings,
} from '@workflow/contracts';

const ENABLED_KEY = 'task_flow.enabled';
const TEMPLATES_KEY = 'task_flow.templates';

/**
 * Doc mau tung trang thai, chiu duoc JSON hong hoac thieu khoa.
 *
 * Cau hinh nay nguoi dung sua duoc va con di qua ho so cau hinh giua cac ban cai,
 * nen loc tung truong thay vi tin ca khoi — mot `next_status` la se lam buoc tu
 * chuyen ghi mot trang thai khong ton tai.
 */
export function normalizeFlowTemplates(raw: unknown): Record<FlowStatus, FlowTemplate> {
  const parsed = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = {} as Record<FlowStatus, FlowTemplate>;
  for (const status of FLOW_STATUSES) {
    const fallback = DEFAULT_FLOW_TEMPLATES[status];
    const item = parsed[status];
    if (item === null || typeof item !== 'object') {
      out[status] = { ...fallback, steps: [...fallback.steps] };
      continue;
    }
    const entry = item as Record<string, unknown>;
    const steps = Array.isArray(entry.steps)
      ? entry.steps.map((step) => String(step ?? '').trim()).filter((step) => step.length > 0)
      : [...fallback.steps];
    const next = String(entry.next_status ?? '');
    const ask = String(entry.ask ?? '');
    out[status] = {
      steps,
      next_status:
        (CARD_STATUSES as readonly string[]).includes(next) && next !== status
          ? (next as CardStatus)
          : fallback.next_status,
      ask: (FLOW_ASK_MODES as readonly string[]).includes(ask)
        ? (ask as FlowTemplate['ask'])
        : fallback.ask,
    };
  }
  return out;
}

export function getTaskFlowSettings(db: Database): TaskFlowSettings {
  const rows = db
    .prepare(`SELECT key, value FROM app_settings WHERE key IN (?, ?)`)
    .all(ENABLED_KEY, TEMPLATES_KEY) as { key: string; value: string }[];
  const map = new Map(rows.map((row) => [row.key, row.value]));
  let templates: unknown = null;
  try {
    templates = JSON.parse(map.get(TEMPLATES_KEY) ?? 'null');
  } catch {
    /* hong thi dung mac dinh */
  }
  return {
    // Thieu khoa = tat: ban cai dang chay khong doi hanh vi cho toi khi quan tri bat.
    enabled: map.get(ENABLED_KEY) === '1',
    templates: normalizeFlowTemplates(templates),
  };
}

export function isTaskFlowEnabled(db: Database): boolean {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(ENABLED_KEY) as
    { value: string } | undefined;
  return row?.value === '1';
}

/** Ghi tung phan; `templates` duoc tron vao mau hien co theo tung trang thai. */
export function saveTaskFlowSettings(
  db: Database,
  patch: { enabled?: boolean; templates?: Partial<Record<FlowStatus, FlowTemplate>> }
): void {
  const upsert = db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now','localtime'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );
  db.transaction(() => {
    if (patch.enabled !== undefined) upsert.run(ENABLED_KEY, patch.enabled ? '1' : '0');
    if (patch.templates !== undefined) {
      const merged = { ...getTaskFlowSettings(db).templates, ...patch.templates };
      upsert.run(TEMPLATES_KEY, JSON.stringify(normalizeFlowTemplates(merged)));
    }
  })();
}
