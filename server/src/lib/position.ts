import { db } from '../db/connection.ts';
import { HttpError } from './validate.ts';

export const STEP = 1024;
const MIN_GAP = 1e-6;

/** Cac bang co cot position + cot pham vi (scope) tuong ung. */
export type PositionScope =
  | { table: 'lists'; scopeCol: 'board_id'; scopeVal: number }
  | { table: 'cards'; scopeCol: 'list_id'; scopeVal: number }
  | { table: 'deals'; scopeCol: 'stage'; scopeVal: string }
  | { table: 'checklist_items'; scopeCol: 'card_id'; scopeVal: number }
  | { table: 'deal_handover_items'; scopeCol: 'deal_id'; scopeVal: number }
  /* Da ghim va chua ghim la hai chuoi thu tu doc lap — ghim luon noi len dau
     bat ke da keo toi dau (xem quickNoteService.ts). */
  | { table: 'quick_notes'; scopeCol: 'is_pinned'; scopeVal: 0 | 1 };

/** Vi tri cho item them vao cuoi danh sach. */
export function nextPosition(scope: PositionScope): number {
  const row = db
    .prepare(`SELECT MAX(position) AS maxPos FROM ${scope.table} WHERE ${scope.scopeCol} = ?`)
    .get(scope.scopeVal) as { maxPos: number | null };
  return (row.maxPos ?? 0) + STEP;
}

function positionOf(scope: PositionScope, id: number): number | null {
  const row = db
    .prepare(`SELECT position FROM ${scope.table} WHERE id = ? AND ${scope.scopeCol} = ?`)
    .get(id, scope.scopeVal) as { position: number } | undefined;
  return row ? row.position : null;
}

/** Danh so lai toan bo pham vi thanh 1024, 2048, ... (goi trong transaction cua caller). */
function renormalize(scope: PositionScope): void {
  const rows = db
    .prepare(`SELECT id FROM ${scope.table} WHERE ${scope.scopeCol} = ? ORDER BY position, id`)
    .all(scope.scopeVal) as { id: number }[];
  const update = db.prepare(
    `UPDATE ${scope.table} SET position = ? WHERE id = ? AND ${scope.scopeCol} = ?`
  );
  rows.forEach((r, i) => update.run((i + 1) * STEP, r.id, scope.scopeVal));
}

/**
 * Tinh vi tri moi tu 2 hang xom sau khi tha.
 * beforeId = item nam NGAY TREN vi tri moi, afterId = item nam NGAY DUOI.
 * Tu dong renormalize pham vi neu khoang cach qua nho.
 */
export function computeMovePosition(
  scope: PositionScope,
  beforeId?: number | null,
  afterId?: number | null,
  movingId?: number
): number {
  if (beforeId != null && afterId != null && beforeId === afterId) {
    throw new HttpError(422, 'Hai hang xom cua vi tri moi khong hop le');
  }
  if (movingId != null && (beforeId === movingId || afterId === movingId)) {
    throw new HttpError(422, 'Phan tu dang di chuyen khong the la hang xom cua chinh no');
  }

  let before = beforeId != null ? positionOf(scope, beforeId) : null;
  let after = afterId != null ? positionOf(scope, afterId) : null;

  if (beforeId != null && before === null) {
    throw new HttpError(422, 'Phan tu phia tren khong thuoc dung danh sach');
  }
  if (afterId != null && after === null) {
    throw new HttpError(422, 'Phan tu phia duoi khong thuoc dung danh sach');
  }

  if (before !== null && after !== null && Math.abs(after - before) < MIN_GAP) {
    renormalize(scope);
    before = beforeId != null ? positionOf(scope, beforeId) : null;
    after = afterId != null ? positionOf(scope, afterId) : null;
  }

  if (before !== null && after !== null && before >= after) {
    throw new HttpError(422, 'Thu tu hai hang xom cua vi tri moi khong hop le');
  }

  if (before === null && after === null) return nextPosition(scope);
  if (before === null) return after! / 2;
  if (after === null) return before + STEP;
  return (before + after) / 2;
}
