import type { Database } from 'better-sqlite3';
import type { CardStatus } from '@workflow/contracts';

/**
 * Cot mac dinh kem NGHIA vong doi cua chung (v19).
 *
 * Truoc day bon cot nay trung ten voi bon trang thai nhung khong lien he gi voi
 * nhau — keo the sang 'Hoan thanh' khong lam no xong. Gan `status_mapping` ngay
 * luc tao bang de bang moi hoat dong dung tu dau; cot tu them ve sau mac dinh
 * khong anh xa, nguoi dung tu khai neu muon.
 */
export const DEFAULT_LISTS: [string, CardStatus][] = [
  ['Cần làm', 'todo'],
  ['Đang làm', 'doing'],
  ['Chờ duyệt', 'review'],
  ['Hoàn thành', 'done'],
];

export interface NewBoard {
  name: string;
  background?: string;
  customerId: number | null;
  projectId: number | null;
  ownerContactId: number | null;
}

/**
 * Tao mot Bang – Luong viec kem bon cot mac dinh. Nguoi goi tu bao trong
 * transaction: tao du an thi bang ngam phai sinh cung luc, khong de lai du an
 * khong co cho dat viec.
 */
export function insertBoard(db: Database, board: NewBoard): number {
  const background = board.background ?? '#0079bf';
  const info = db
    .prepare(
      `INSERT INTO boards (name, color, background, customer_id, project_id, owner_contact_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      board.name,
      background,
      background,
      board.customerId,
      board.projectId,
      board.ownerContactId
    );
  const boardId = Number(info.lastInsertRowid);
  const insertList = db.prepare(
    `INSERT INTO lists (board_id, name, position, status_mapping) VALUES (?, ?, ?, ?)`
  );
  DEFAULT_LISTS.forEach(([name, status], i) =>
    insertList.run(boardId, name, (i + 1) * 1024, status)
  );
  return boardId;
}
