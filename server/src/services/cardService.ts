import { db } from '../db/connection.ts';
import { assertParentListCompatible } from '../lib/entityRelations.ts';
import { computeMovePosition } from '../lib/position.ts';
import { required } from '../lib/validate.ts';

export interface MoveCardInput {
  list_id: number;
  beforeId?: number | null;
  afterId?: number | null;
}

/** Di chuyen the va cap nhat thu tu trong mot transaction duy nhat. */
export function moveCard(id: number, input: MoveCardInput) {
  required(db.prepare(`SELECT id FROM cards WHERE id = ?`).get(id), 'Khong tim thay the');
  required(
    db.prepare(`SELECT id FROM lists WHERE id = ?`).get(input.list_id),
    'Khong tim thay danh sach'
  );
  assertParentListCompatible(db, id, input.list_id);

  const position = db.transaction(() => {
    db.prepare(`UPDATE cards SET list_id = ? WHERE id = ?`).run(input.list_id, id);
    const next = computeMovePosition(
      { table: 'cards', scopeCol: 'list_id', scopeVal: input.list_id },
      input.beforeId,
      input.afterId,
      id
    );
    db.prepare(
      `UPDATE cards SET position = ?, updated_at = datetime('now','localtime') WHERE id = ?`
    ).run(next, id);
    return next;
  })();

  return { id, list_id: input.list_id, position };
}
