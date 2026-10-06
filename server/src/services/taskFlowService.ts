/**
 * Quy trinh theo trang thai cua cong viec (v66).
 *
 * Mot quy trinh la danh sach buoc cua MOT cong viec trong MOT trang thai loi, lam
 * lan luot. No khong thay cot: `list_id` van la vi tri tren kanban, `status` van la
 * nguon cua moi bao cao. Vi vay viec chan doi trang thai o day chi la CANH BAO co
 * xac nhan (`skip_flow`), khong bao gio la rang buoc cung — bat bien
 * is_done = 1 <=> status = 'done' cua setCardStatus khong bi dong toi.
 *
 * Module nay KHONG import cardService: cardService goi vao day (vao trang thai,
 * chep quy trinh), con buoc "tu chuyen trang thai" do route goi setCardStatus.
 * Hai chieu import se tao vong lap luc nap module.
 */
import {
  type CardFlow,
  type CardFlowStep,
  type FlowStatus,
  type TaskFlowSettings,
  type TaskStatusKey,
} from '@workflow/contracts';
import { db } from '../db/connection.ts';
import { STEP } from '../lib/position.ts';
import { firstStatusOfKind, getTaskStatus } from '../lib/taskStatuses.ts';
import {
  getTaskFlowSettings as readSettings,
  isTaskFlowEnabled as readEnabled,
} from '../lib/taskFlowSettings.ts';
import { HttpError } from '../lib/validate.ts';
import { logTaskActivity } from './taskActivity.ts';

/**
 * Trang thai co the mang quy trinh (v67: khoa cau hinh duoc): ton tai va khong mang
 * y nghia Hoan thanh. Trang thai da an van tinh — quy trinh dang do cua no van phai
 * duoc chan va xem lai duoc.
 */
export function isFlowStatus(status: string): status is FlowStatus {
  const def = getTaskStatus(db, status);
  return def !== undefined && def.kind !== 'done';
}

export function getTaskFlowSettings(): TaskFlowSettings {
  return readSettings(db);
}

export function isTaskFlowEnabled(): boolean {
  return readEnabled(db);
}

/* ---------- Doc ---------- */

interface FlowRow {
  id: number;
  card_id: number;
  status: FlowStatus;
  completed_at: string | null;
  skipped_at: string | null;
}

function flowOf(cardId: number, status: string): FlowRow | undefined {
  return db
    .prepare(`SELECT * FROM card_flows WHERE card_id = ? AND status = ?`)
    .get(cardId, status) as FlowRow | undefined;
}

function stepsOf(flowId: number): CardFlowStep[] {
  return db
    .prepare(`SELECT * FROM card_flow_steps WHERE flow_id = ? ORDER BY position, id`)
    .all(flowId) as CardFlowStep[];
}

export function getFlow(flowId: number): CardFlow | null {
  const flow = db.prepare(`SELECT * FROM card_flows WHERE id = ?`).get(flowId) as
    Omit<CardFlow, 'steps'> | undefined;
  return flow ? { ...flow, steps: stepsOf(flow.id) } : null;
}

/** Moi quy trinh cua mot cong viec, theo thu tu vong doi. */
export function listCardFlows(cardId: number): CardFlow[] {
  const flows = db
    .prepare(
      `SELECT f.* FROM card_flows f LEFT JOIN task_statuses s ON s.key = f.status
        WHERE f.card_id = ? ORDER BY s.position, f.id`
    )
    .all(cardId) as Omit<CardFlow, 'steps'>[];
  return flows.map((flow) => ({ ...flow, steps: stepsOf(flow.id) }));
}

export { FLOW_PROGRESS_COLUMNS } from '../lib/taskFlowSql.ts';

/* ---------- Ghi ---------- */

/** Tao quy trinh cho mot trang thai. Da co thi bao loi — moi trang thai mot quy trinh. */
export function createFlow(
  cardId: number,
  status: FlowStatus,
  steps: string[],
  options: { fromTemplate?: boolean; actorContactId?: number | null } = {}
): CardFlow {
  const clean = steps.map((step) => step.trim()).filter((step) => step.length > 0);
  if (clean.length === 0) throw new HttpError(400, 'Quy trình cần ít nhất một bước');
  if (flowOf(cardId, status)) {
    throw new HttpError(409, 'Trạng thái này đã có quy trình', { code: 'FLOW_EXISTS' });
  }
  const flowId = db.transaction(() => {
    const id = Number(
      db
        .prepare(
          `INSERT INTO card_flows (card_id, status, from_template, created_by_contact_id)
           VALUES (?, ?, ?, ?)`
        )
        .run(cardId, status, options.fromTemplate ? 1 : 0, options.actorContactId ?? null)
        .lastInsertRowid
    );
    const insert = db.prepare(
      `INSERT INTO card_flow_steps (flow_id, content, position) VALUES (?, ?, ?)`
    );
    clean.forEach((content, index) => insert.run(id, content, (index + 1) * STEP));
    return id;
  })();
  return getFlow(flowId) as CardFlow;
}

/**
 * Cong viec vua vao `status`.
 *
 * Goi tu setCardStatus (moi duong doi trang thai) va createCard. Vao lai mot trang
 * thai da co quy trinh thi dung lai no, giu tien do va go dau "bo qua". Chua co thi
 * tao tu `explicitSteps` (nguoi dung vua nhap luc tao viec) hoac tu mau neu mau dat
 * `ask = 'auto'`. Truong hop `ask = 'always'` thi giao dien hoi — may chu khong
 * doan thay nguoi dung.
 */
export function enterStatus(
  cardId: number,
  status: TaskStatusKey,
  options: { actorContactId?: number | null; explicitSteps?: string[] } = {}
): void {
  if (!isFlowStatus(status) || !isTaskFlowEnabled()) return;
  const existing = flowOf(cardId, status);
  if (existing) {
    if (existing.skipped_at) {
      db.prepare(
        `UPDATE card_flows SET skipped_at = NULL, skipped_by_contact_id = NULL WHERE id = ?`
      ).run(existing.id);
    }
    return;
  }
  if (options.explicitSteps?.some((step) => step.trim().length > 0)) {
    createFlow(cardId, status, options.explicitSteps, { actorContactId: options.actorContactId });
    return;
  }
  const template = getTaskFlowSettings().templates[status];
  if (template?.ask === 'auto' && template.steps.length > 0) {
    createFlow(cardId, status, template.steps, {
      fromTemplate: true,
      actorContactId: options.actorContactId,
    });
  }
}

/**
 * Giao dien co nen hoi "Them quy trinh cho trang thai nay?" khong.
 *
 * Tra ve khi cong viec VUA vao mot trang thai (khac `previous`), mau cua trang
 * thai do dat `ask = 'always'` va chua co quy trinh nao. May chu tra loi thay vi
 * de giao dien tu suy: chi o day moi biet du trang thai cu, mau va du lieu that.
 */
export function flowPromptFor(
  cardId: number,
  previous: TaskStatusKey
): { card_id: number; status: FlowStatus } | null {
  if (!isTaskFlowEnabled()) return null;
  const row = db
    .prepare(`SELECT COALESCE(status_key, status) AS status FROM cards WHERE id = ?`)
    .get(cardId) as { status: TaskStatusKey } | undefined;
  if (!row || row.status === previous || !isFlowStatus(row.status)) return null;
  if (flowOf(cardId, row.status)) return null;
  return getTaskFlowSettings().templates[row.status]?.ask === 'always'
    ? { card_id: cardId, status: row.status }
    : null;
}

/**
 * Chan roi trang thai khi quy trinh cua no chua xong.
 *
 * Phai goi TRUOC moi lenh ghi cua yeu cau: 409 tra ve giua chung se de lai the
 * da doi mot nua. Co `skip` thi cho qua va ghi lai ai da bo qua, de bao cao hieu
 * suat dem duoc "hoan thanh bo qua quy trinh".
 */
export function guardLeaveStatus(
  cardId: number,
  from: TaskStatusKey,
  to: TaskStatusKey,
  options: { skip?: boolean; actorContactId?: number | null } = {}
): void {
  if (from === to || !isFlowStatus(from) || !isTaskFlowEnabled()) return;
  const flow = flowOf(cardId, from);
  if (!flow || flow.completed_at) return;
  const steps = stepsOf(flow.id);
  const remaining = steps.filter((step) => !step.done_at);
  if (remaining.length === 0) return;

  if (!options.skip) {
    throw new HttpError(409, 'Quy trình của trạng thái hiện tại chưa xong', {
      code: 'FLOW_INCOMPLETE',
      status: from,
      total: steps.length,
      done: steps.length - remaining.length,
      remaining: remaining.map((step) => step.content),
    });
  }
  db.prepare(
    `UPDATE card_flows
        SET skipped_at = datetime('now','localtime'), skipped_by_contact_id = ?
      WHERE id = ?`
  ).run(options.actorContactId ?? null, flow.id);
  logTaskActivity({
    cardId,
    actorContactId: options.actorContactId,
    action: 'updated',
    field: 'flow_skipped',
    oldValue: from,
    newValue: `${steps.length - remaining.length}/${steps.length}`,
  });
}

/**
 * Trang thai tu chuyen toi khi xong buoc cuoi.
 *
 * Lay theo mau cua trang thai vua xong.
 */
export function nextStatusAfter(status: FlowStatus): TaskStatusKey {
  const doneKey = firstStatusOfKind(db, 'done');
  const target = getTaskFlowSettings().templates[status]?.next_status ?? doneKey;
  /* v67: trang thai la cua rieng cong viec, khong phu thuoc cot. Truoc day luong
     viec khong co cot cho trang thai dich thi nhay thang sang Hoan thanh — voi
     trang thai tu tao (thuong khong co cot) dieu do se dong viec nham. Gio chi roi
     ve Hoan thanh khi trang thai dich khong con dung. */
  const def = getTaskStatus(db, target);
  return def?.is_active ? target : doneKey;
}

/**
 * Chep quy trinh sang mot the moi (viec lap lai, sao chep the, sao chep cot).
 * Ban moi bat dau lai tu dau: moi buoc chua xong, khong mang dau hoan thanh/bo qua.
 */
export function copyFlows(fromCardId: number, toCardId: number): void {
  const flows = db.prepare(`SELECT * FROM card_flows WHERE card_id = ?`).all(fromCardId) as {
    id: number;
    status: string;
    from_template: number;
  }[];
  if (flows.length === 0) return;
  const insertFlow = db.prepare(
    `INSERT OR IGNORE INTO card_flows (card_id, status, from_template) VALUES (?, ?, ?)`
  );
  const insertStep = db.prepare(
    `INSERT INTO card_flow_steps (flow_id, content, position)
     SELECT ?, content, position FROM card_flow_steps WHERE flow_id = ?`
  );
  for (const flow of flows) {
    const info = insertFlow.run(toCardId, flow.status, flow.from_template);
    if (info.changes > 0) insertStep.run(Number(info.lastInsertRowid), flow.id);
  }
}
