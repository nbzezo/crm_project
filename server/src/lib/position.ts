import { db } from '../db/connection.ts';

export const STEP = 1024;
const MIN_GAP = 1e-6;

/** Cac bang co cot position + cot pham vi (scope) tuong ung. */
export type PositionScope =
  | { table: 'lists'; scopeCol: 'board_id'; scopeVal: number }
  | { table: 'cards'; scopeCol: 'list_id'; scopeVal: number }
  | { table: 'deals'; scopeCol: 'stage'; scopeVal: string }
  | { table: 'checklist_items'; scopeCol: 'card_id'; scopeVal: number };

/** Vi tri cho item them vao cuoi danh sach. */
export function nextPosition(scope: PositionScope): number {
  const row = db
    .prepare(`SELECT MAX(position) AS maxPos FROM ${scope.table} WHERE ${scope.scopeCol} = ?`)
    .get(scope.scopeVal) as { maxPos: number | null };
  return (row.maxPos ?? 0) + STEP;
}

function positionOf(table: string, id: number): number | null {
  const row = db.prepare(`SELECT position FROM ${table} WHERE id = ?`).get(id) as
    | { position: number }
    | undefined;
  return row ? row.position : null;
}

/** Danh so lai toan bo pham vi thanh 1024, 2048, ... (goi trong transaction cua caller). */
function renormalize(scope: PositionScope): void {
  const rows = db
    .prepare(
      `SELECT id FROM ${scope.table} WHERE ${scope.scopeCol} = ? ORDER BY position, id`
    )
    .all(scope.scopeVal) as { id: number }[];
  const update = db.prepare(`UPDATE ${scope.table} SET position = ? WHERE id = ?`);
  rows.forEach((r, i) => update.run((i + 1) * STEP, r.id));
}

/**
 * Tinh vi tri moi tu 2 hang xom sau khi tha.
 * beforeId = item nam NGAY TREN vi tri moi, afterId = item nam NGAY DUOI.
 * Tu dong renormalize pham vi neu khoang cach qua nho.
 */
export function computeMovePosition(
  scope: PositionScope,
  beforeId?: number | null,
  afterId?: number | null
): number {
  let before = beforeId ? positionOf(scope.table, beforeId) : null;
  let after = afterId ? positionOf(scope.table, afterId) : null;

  if (before !== null && after !== null && Math.abs(after - before) < MIN_GAP) {
    renormalize(scope);
    before = beforeId ? positionOf(scope.table, beforeId) : null;
    after = afterId ? positionOf(scope.table, afterId) : null;
  }

  if (before === null && after === null) return nextPosition(scope);
  if (before === null) return after! / 2;
  if (after === null) return before + STEP;
  return (before + after) / 2;
}
