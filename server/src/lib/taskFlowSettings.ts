/**
 * Cau hinh Quy trinh theo trang thai (v66): cong tac bat/tat va mau tung trang thai.
 *
 * Tu v67 mau theo KHOA trang thai cau hinh duoc: moi trang thai dang dung va
 * khong mang y nghia "Hoan thanh" co mot muc.
 *
 * Nhan `db` qua tham so va KHONG import `db/connection.ts`, de ho so cau hinh
 * (configProfile.ts, chay ca tu script applyProfile) dung chung duoc — giong
 * handoverService.
 */
import type { Database } from 'better-sqlite3';
import {
  DEFAULT_FLOW_TEMPLATES,
  FLOW_ASK_MODES,
  type FlowStatus,
  type FlowTemplate,
  type TaskFlowSettings,
  type TaskStatusDef,
} from '@workflow/contracts';
import { firstStatusOfKind, listTaskStatuses } from './taskStatuses.ts';

const ENABLED_KEY = 'task_flow.enabled';
const TEMPLATES_KEY = 'task_flow.templates';

/** Trang thai co the mang quy trinh: dang dung va chua mang y nghia Hoan thanh. */
export function flowStatuses(db: Database): TaskStatusDef[] {
  return listTaskStatuses(db).filter((status) => status.kind !== 'done');
}

/**
 * Doc mau tung trang thai, chiu duoc JSON hong hoac thieu khoa.
 *
 * Cau hinh nay nguoi dung sua duoc va con di qua ho so cau hinh giua cac ban cai,
 * nen loc tung truong thay vi tin ca khoi — mot `next_status` la se lam buoc tu
 * chuyen ghi mot trang thai khong ton tai. Mau cua trang thai da an van duoc giu
 * nguyen trong CSDL (bat lai thi con), chi khong tra ve.
 */
export function normalizeFlowTemplates(
  db: Database,
  raw: unknown
): Record<FlowStatus, FlowTemplate> {
  const parsed = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const all = listTaskStatuses(db);
  const validKeys = new Set(all.map((status) => status.key));
  const doneKey = firstStatusOfKind(db, 'done');
  const out: Record<FlowStatus, FlowTemplate> = {};
  for (const status of all.filter((s) => s.kind !== 'done')) {
    const fallback: FlowTemplate = DEFAULT_FLOW_TEMPLATES[status.key] ?? {
      steps: [],
      next_status: doneKey,
      ask: 'never',
    };
    const item = parsed[status.key];
    const entry =
      item !== null && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const steps = Array.isArray(entry.steps)
      ? entry.steps.map((step) => String(step ?? '').trim()).filter((step) => step.length > 0)
      : [...fallback.steps];
    const next = String(entry.next_status ?? fallback.next_status);
    const ask = String(entry.ask ?? '');
    out[status.key] = {
      steps,
      next_status: validKeys.has(next) && next !== status.key ? next : doneKey,
      ask: (FLOW_ASK_MODES as readonly string[]).includes(ask)
        ? (ask as FlowTemplate['ask'])
        : fallback.ask,
    };
  }
  return out;
}

function readRawTemplates(db: Database): Record<string, unknown> {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(TEMPLATES_KEY) as
    { value: string } | undefined;
  try {
    const parsed = JSON.parse(row?.value ?? 'null') as unknown;
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function getTaskFlowSettings(db: Database): TaskFlowSettings {
  return {
    // Thieu khoa = tat: ban cai dang chay khong doi hanh vi cho toi khi quan tri bat.
    enabled: isTaskFlowEnabled(db),
    templates: normalizeFlowTemplates(db, readRawTemplates(db)),
  };
}

export function isTaskFlowEnabled(db: Database): boolean {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(ENABLED_KEY) as
    { value: string } | undefined;
  return row?.value === '1';
}

/**
 * Ghi tung phan; `templates` duoc tron vao mau hien co theo tung trang thai. Mau
 * cua trang thai dang an (khong co trong `normalize`) duoc giu lai tu ban luu cu.
 */
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
      const stored = readRawTemplates(db);
      const merged = {
        ...stored,
        ...normalizeFlowTemplates(db, { ...stored, ...patch.templates }),
      };
      upsert.run(TEMPLATES_KEY, JSON.stringify(merged));
    }
  })();
}
