import type { CreateTaskInput } from '@workflow/contracts/schemas';
import { db } from '../db/connection.ts';
import {
  assertParentListCompatible,
  deriveTaskLinks,
  type EntityLinks,
} from '../lib/entityRelations.ts';
import { computeMovePosition, nextPosition, STEP } from '../lib/position.ts';
import { buildSearchText } from '../lib/viSearch.ts';
import { HttpError, required } from '../lib/validate.ts';

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

/**
 * Doc lai the kem ten cua moi thuc the da gan.
 *
 * Dung chung cho POST/PATCH/GET nen client luon nhan cung mot hinh dang; cac chip
 * lien ket tren form va tren the deu doc tu day.
 */
export function reloadCard(id: number) {
  return db
    .prepare(
      `SELECT k.*, c.name AS customer_name, d.title AS deal_title,
              ct.full_name AS contact_name, ctr.name AS contract_name, q.code AS quotation_code,
              (SELECT COUNT(*) FROM checklist_items ci WHERE ci.card_id = k.id) AS checklist_total,
              (SELECT COUNT(*) FROM checklist_items ci WHERE ci.card_id = k.id AND ci.is_done = 1) AS checklist_done,
              (SELECT COUNT(*) FROM cards sc WHERE sc.parent_id = k.id AND sc.is_archived = 0) AS subtask_total,
              (SELECT COUNT(*) FROM cards sc WHERE sc.parent_id = k.id AND sc.is_archived = 0 AND sc.is_done = 1) AS subtask_done,
              (SELECT COUNT(*) FROM documents dc WHERE dc.card_id = k.id AND dc.deleted_at IS NULL) AS attachment_total
         FROM cards k
         LEFT JOIN customers c ON c.id = k.customer_id
         LEFT JOIN deals d ON d.id = k.deal_id
         LEFT JOIN contacts ct ON ct.id = k.contact_id
         LEFT JOIN contracts ctr ON ctr.id = k.contract_id
         LEFT JOIN quotations q ON q.id = k.quotation_id
        WHERE k.id = ?`
    )
    .get(id);
}

/** Cong viec dang gan voi mot thuc the CRM, dung cho tab "Cong viec" cua tung ho so. */
export function listTasksByLink(
  column: 'customer_id' | 'contact_id' | 'deal_id' | 'contract_id' | 'quotation_id',
  id: number
) {
  return db
    .prepare(
      `SELECT k.id, k.title, k.due_date, k.start_date, k.priority, k.is_done, k.parent_id,
              k.list_id, k.customer_id, k.contact_id, k.deal_id, k.contract_id, k.quotation_id,
              l.name AS list_name, b.id AS board_id, b.name AS board_name
         FROM cards k
         JOIN lists l ON l.id = k.list_id
         JOIN boards b ON b.id = l.board_id
        WHERE k.${column} = ? AND k.is_archived = 0
        ORDER BY k.is_done, k.due_date IS NULL, k.due_date`
    )
    .all(id);
}

/**
 * Chon danh sach mac dinh khi nguoi dung tao cong viec ma khong chi ro noi tha.
 *
 * Uu tien bang rieng cua khach hang lien quan — tao viec tu ho so mot khach hang ma
 * roi vao bang cua khach hang khac la sai ngu canh. Sau do moi den bang gan sao roi
 * bang dau tien. Thay cho hai ban `defaultListId()` truoc day nam rai o
 * routes/interactions.ts va services/ai/actions.ts.
 */
export function resolveDefaultList(links: EntityLinks = {}): number | null {
  const customerId = links.customer_id ?? null;
  const row = db
    .prepare(
      `SELECT l.id FROM lists l JOIN boards b ON b.id = l.board_id
        WHERE b.is_archived = 0
        ORDER BY (? IS NOT NULL AND b.customer_id = ?) DESC, b.is_starred DESC, b.id, l.position
        LIMIT 1`
    )
    .get(customerId, customerId) as { id: number } | undefined;
  return row?.id ?? null;
}

/**
 * Duong ghi `cards` duy nhat.
 *
 * Truoc day co bay cho INSERT INTO cards khac nhau, ba trong so do bo qua
 * assertEntityLinks nen du lieu cheo khach hang co the lot vao. Gom het vao day de
 * moi cong viec — du tao tu module nao — deu duoc suy dien lien ket, kiem tra rang
 * buoc va lap chi muc tim kiem giong nhau.
 */
export function createCard(input: CreateTaskInput) {
  let listId = input.list_id ?? null;
  const links: EntityLinks = {
    customer_id: input.customer_id ?? null,
    contact_id: input.contact_id ?? null,
    deal_id: input.deal_id ?? null,
    contract_id: input.contract_id ?? null,
    quotation_id: input.quotation_id ?? null,
  };

  // Viec con nam cung danh sach voi viec cha va chi cho 1 cap
  if (input.parent_id) {
    const parent = required(
      db.prepare(`SELECT * FROM cards WHERE id = ?`).get(input.parent_id),
      'Khong tim thay viec cha'
    ) as Record<string, unknown>;
    if (parent.parent_id) throw new HttpError(400, 'Chỉ hỗ trợ một cấp việc con');
    listId = parent.list_id as number;
    const inherit = (key: keyof typeof links) => {
      if (links[key] == null) links[key] = (parent[key] as number | null) ?? null;
    };
    inherit('customer_id');
    inherit('contact_id');
    inherit('deal_id');
    inherit('contract_id');
    inherit('quotation_id');
  }

  const derived = deriveTaskLinks(db, links);
  const targetList = listId ?? resolveDefaultList(derived);
  if (!targetList) throw new HttpError(400, 'Thiếu danh sách để thêm công việc');
  required(
    db.prepare(`SELECT id FROM lists WHERE id = ?`).get(targetList),
    'Khong tim thay danh sach'
  );

  const description = input.description ?? '';
  const id = db.transaction(() => {
    const position = nextPosition({ table: 'cards', scopeCol: 'list_id', scopeVal: targetList });
    const info = db
      .prepare(
        `INSERT INTO cards (list_id, parent_id, title, description, position, priority,
                            start_date, due_date, customer_id, contact_id, deal_id,
                            contract_id, quotation_id, search_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        targetList,
        input.parent_id ?? null,
        input.title,
        description,
        position,
        input.priority ?? 'medium',
        input.start_date ?? null,
        input.due_date ?? null,
        derived.customer_id ?? null,
        derived.contact_id ?? null,
        derived.deal_id ?? null,
        derived.contract_id ?? null,
        derived.quotation_id ?? null,
        // Truoc day chi index title luc tao con PATCH lai index ca description — chi muc bi lech.
        buildSearchText(input.title, description)
      );
    const cardId = Number(info.lastInsertRowid);

    if (input.label_ids?.length) {
      const insertLabel = db.prepare(
        `INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)`
      );
      for (const labelId of input.label_ids) {
        required(
          db.prepare(`SELECT id FROM labels WHERE id = ?`).get(labelId),
          'Khong tim thay nhan'
        );
        insertLabel.run(cardId, labelId);
      }
    }
    if (input.checklist?.length) {
      const insertItem = db.prepare(
        `INSERT INTO checklist_items (card_id, content, position) VALUES (?, ?, ?)`
      );
      input.checklist.forEach((content, index) => {
        insertItem.run(cardId, content, (index + 1) * STEP);
      });
    }
    return cardId;
  })();

  return reloadCard(id) as Record<string, unknown>;
}
