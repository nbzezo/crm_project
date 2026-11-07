import type { Database } from 'better-sqlite3';

/**
 * Giu "Viec ke tiep" cua co hoi khop voi cong viec that (1.42.0).
 *
 * `deals.next_action` la mot dong chu, con cong viec la ban ghi rieng: ghi tuong tac
 * co "tao viec" (routes/interactions.ts) hay de xuat AI deu ghi CA HAI voi cung mot
 * tieu de. Truoc ban nay, lam xong cong viec do thi co hoi van giu next action cu va
 * Tong quan / Suc khoe pipeline / Khach hang tiep tuc bao "Viec ke tiep qua han".
 *
 * Luat: khi mot cong viec gan co hoi DANG MO vua chuyen sang Hoan thanh, va next action
 * cua co hoi chinh la cong viec do (so tieu de, bo hoa thuong va khoang trang thua):
 *   - neu co hoi con cong viec mo khac thi lay viec co han som nhat lam next action moi
 *     (viec khong han xep sau; viec con khong tinh vi no di theo viec cha);
 *   - neu khong con viec nao thi xoa next action — canh bao "Chua co hanh dong tiep
 *     theo" se nhac nguoi phu trach dat buoc moi, dung voi thuc te.
 * Next action do nguoi dung tu go khac tieu de cong viec thi KHONG dong toi: do la y
 * cua ho, khong phai ban sao cua cong viec.
 *
 * Tra ve true neu co hoi bi doi.
 */
export function syncDealNextActionAfterDone(db: Database, cardId: number): boolean {
  const row = db
    .prepare(
      `SELECT k.title, k.deal_id, d.next_action, d.stage_category
         FROM cards k JOIN deals d ON d.id = k.deal_id
        WHERE k.id = ?`
    )
    .get(cardId) as
    | { title: string; deal_id: number; next_action: string | null; stage_category: string }
    | undefined;
  if (!row || row.stage_category !== 'open') return false;
  if (normalize(row.next_action) === '' || normalize(row.next_action) !== normalize(row.title)) {
    return false;
  }

  const next = db
    .prepare(
      `SELECT title, due_date FROM cards
        WHERE deal_id = ? AND id <> ? AND is_done = 0 AND is_archived = 0 AND parent_id IS NULL
        ORDER BY due_date IS NULL, due_date, position, id
        LIMIT 1`
    )
    .get(row.deal_id, cardId) as { title: string; due_date: string | null } | undefined;

  db.prepare(
    `UPDATE deals SET next_action = ?, next_action_date = ?, updated_at = datetime('now','localtime')
      WHERE id = ?`
  ).run(next?.title ?? null, next?.due_date ?? null, row.deal_id);
  return true;
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}
