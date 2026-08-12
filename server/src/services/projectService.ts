import type { ProjectHealth } from '@workflow/contracts';

/**
 * Cac chi so cua mot du an — TINH KHI DOC, khong bao gio luu.
 *
 * Chung phu thuoc vao NGAY HOM NAY va vao trang thai cua tung cong viec con, nen
 * mot cot luu san se sai ngay hom sau ma khong co su kien nao de kich hoat cap
 * nhat. Doi lai la moi lan doc phai chay may subquery — voi quy mo mot nguoi
 * dung va SQLite local thi day la doi qua re.
 */
const PROJECT_METRICS = `
  (SELECT COUNT(*) FROM cards k
    JOIN lists l ON l.id = k.list_id JOIN boards b ON b.id = l.board_id
    WHERE b.project_id = p.id AND k.is_archived = 0) AS task_total,
  (SELECT COUNT(*) FROM cards k
    JOIN lists l ON l.id = k.list_id JOIN boards b ON b.id = l.board_id
    WHERE b.project_id = p.id AND k.is_archived = 0 AND k.is_done = 1) AS task_done,
  (SELECT COUNT(*) FROM cards k
    JOIN lists l ON l.id = k.list_id JOIN boards b ON b.id = l.board_id
    WHERE b.project_id = p.id AND k.is_archived = 0 AND k.is_done = 0
      AND k.due_date IS NOT NULL AND k.due_date < date('now','localtime')) AS task_overdue,
  (SELECT COUNT(*) FROM cards k
    JOIN lists l ON l.id = k.list_id JOIN boards b ON b.id = l.board_id
    WHERE b.project_id = p.id AND k.is_archived = 0 AND k.is_done = 0
      AND k.status IN ('blocked','waiting_customer')) AS task_waiting,
  (SELECT COUNT(*) FROM cards k
    JOIN lists l ON l.id = k.list_id JOIN boards b ON b.id = l.board_id
    WHERE b.project_id = p.id AND k.is_archived = 0 AND k.is_done = 0
      AND k.assignee_contact_id IS NULL) AS task_unassigned,
  (SELECT COUNT(DISTINCT k.assignee_contact_id) FROM cards k
    JOIN lists l ON l.id = k.list_id JOIN boards b ON b.id = l.board_id
    WHERE b.project_id = p.id AND k.is_archived = 0
      AND k.assignee_contact_id IS NOT NULL) AS people_count,
  (SELECT COUNT(*) FROM boards b WHERE b.project_id = p.id AND b.is_archived = 0) AS board_count,
  (SELECT COALESCE(SUM(ct.value_vnd), 0) FROM contracts ct WHERE ct.project_id = p.id)
    AS contract_value_vnd,
  (SELECT COUNT(*) FROM contracts ct WHERE ct.project_id = p.id) AS contract_count,
  CAST(julianday(p.plan_end) - julianday(date('now','localtime')) AS INTEGER) AS days_left
`;

export const PROJECT_SELECT = `
  SELECT p.*, c.name AS customer_name, ct.full_name AS owner_name,
         co.org_kind AS owner_org_kind, co.name AS owner_org_name,
         ${PROJECT_METRICS}
    FROM projects p
    LEFT JOIN customers c ON c.id = p.customer_id
    LEFT JOIN contacts ct ON ct.id = p.owner_contact_id
    LEFT JOIN customers co ON co.id = ct.customer_id`;

export interface ProjectRow {
  id: number;
  status: string;
  plan_start: string | null;
  plan_end: string | null;
  task_total: number;
  task_done: number;
  task_overdue: number;
  task_waiting: number;
  days_left: number | null;
}

/**
 * Suc khoe du an — mot con so duy nhat de quet mat qua danh sach.
 *
 * DO: da qua han ke hoach, hoac co viec dang bi chan / cho ben ngoai. Hai thu nay
 * deu co nghia "du an nay se khong tu chay tiep neu khong ai lam gi".
 *
 * VANG: co viec qua han (nhung chua chan), hoac da tieu qua 80% quy thoi gian ma
 * chua xong 60% cong viec. Nguong thu hai la thu bat duoc du an truot dan — kieu
 * that bai am tham nhat, vi tung tuan deu "van con thoi gian".
 *
 * Du an da dong ('done'/'cancelled') luon XANH: cham diem suc khoe mot thu da ket
 * thuc chi tao bao dong gia.
 */
export function projectHealth(project: ProjectRow, today = new Date()): ProjectHealth {
  if (project.status === 'done' || project.status === 'cancelled') return 'green';

  const overdueByPlan =
    project.plan_end !== null && project.days_left !== null && project.days_left < 0;
  if (overdueByPlan || project.task_waiting > 0) return 'red';
  if (project.task_overdue > 0) return 'amber';

  if (project.plan_start && project.plan_end && project.task_total > 0) {
    const start = Date.parse(`${project.plan_start}T00:00:00`);
    const end = Date.parse(`${project.plan_end}T00:00:00`);
    const span = end - start;
    if (span > 0) {
      const elapsed = (today.getTime() - start) / span;
      const completed = project.task_done / project.task_total;
      if (elapsed > 0.8 && completed < 0.6) return 'amber';
    }
  }
  return 'green';
}

/** Gan `health` va `progress_pct` vao mot dong doc tu PROJECT_SELECT. */
export function decorateProject(row: Record<string, unknown>): Record<string, unknown> {
  const project = row as unknown as ProjectRow;
  const total = project.task_total || 0;
  return {
    ...row,
    health: projectHealth(project),
    progress_pct: total === 0 ? 0 : Math.round((project.task_done / total) * 100),
  };
}

/*
 * `projectIdForList` da bi xoa o v19.
 *
 * No ton tai de dong bo `cards.project_id` voi bang chua the. Cot do khong con
 * nua — du an suy thang tu `boards.project_id` moi lan doc — nen khong con gi de
 * dong bo, va cung khong con cach nao de hai ben lech nhau.
 */
