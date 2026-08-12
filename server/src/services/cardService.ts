import type { CardStatus } from '@workflow/contracts';
import type { CreateTaskInput } from '@workflow/contracts/schemas';
import { db } from '../db/connection.ts';
import {
  assertParentListCompatible,
  deriveTaskLinks,
  resolveAssignee,
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

/** Trang thai ma mot cot khai bao no dai dien; null = cot khong mang nghia vong doi. */
function listStatusMapping(listId: number): CardStatus | null {
  const row = db.prepare(`SELECT status_mapping FROM lists WHERE id = ?`).get(listId) as
    { status_mapping: CardStatus | null } | undefined;
  return row?.status_mapping ?? null;
}

/**
 * Cot cua CUNG BANG voi `listId` khai bao dung `status`; null neu bang khong co.
 *
 * Bang co hai cot cung anh xa thi lay cot ben trai nhat. Khong cam trung vi se
 * lam thao tac "sao chep danh sach" that bai; chon on dinh la du.
 */
function mappedListInBoard(listId: number, status: CardStatus): number | null {
  const row = db
    .prepare(
      `SELECT l.id FROM lists l
         JOIN lists cur ON cur.id = ?
        WHERE l.board_id = cur.board_id AND l.status_mapping = ?
        ORDER BY l.position, l.id LIMIT 1`
    )
    .get(listId, status) as { id: number } | undefined;
  return row?.id ?? null;
}

/**
 * Di chuyen the va cap nhat thu tu trong mot transaction duy nhat.
 *
 * Neu cot dich khai bao mot trang thai (v19) thi trang thai cua the doi theo.
 * Goi `setCardStatus` voi `moveToMappedList: false` — the DA o dung cot roi, de
 * mac dinh `true` se khien hai ham day nhau qua lai.
 */
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

    const mapped = listStatusMapping(input.list_id);
    if (mapped) setCardStatus(id, mapped, { moveToMappedList: false });
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
              ac.full_name AS assignee_name, ac.title AS assignee_title,
              ac.phone AS assignee_phone, ac.email AS assignee_email, ac.zalo AS assignee_zalo,
              ao.name AS assignee_org_name, ao.org_kind AS assignee_org_kind,
              /* Du an suy tu BANG chua the (v19) — cards khong con cot project_id,
                 nen mot viec khong the mang du an khac voi bang cua no. */
              b.project_id, pr.name AS project_name, pr.status AS project_status,
              l.status_mapping AS list_status_mapping,
              (SELECT COUNT(*) FROM checklist_items ci WHERE ci.card_id = k.id) AS checklist_total,
              (SELECT COUNT(*) FROM checklist_items ci WHERE ci.card_id = k.id AND ci.is_done = 1) AS checklist_done,
              (SELECT COUNT(*) FROM cards sc WHERE sc.parent_id = k.id AND sc.is_archived = 0) AS subtask_total,
              (SELECT COUNT(*) FROM cards sc WHERE sc.parent_id = k.id AND sc.is_archived = 0 AND sc.is_done = 1) AS subtask_done,
              (SELECT COUNT(*) FROM documents dc WHERE dc.card_id = k.id AND dc.deleted_at IS NULL) AS attachment_total,
              (SELECT COUNT(*) FROM task_nudges n WHERE n.card_id = k.id) AS nudge_count,
              (SELECT MAX(n.sent_at) FROM task_nudges n WHERE n.card_id = k.id) AS last_nudged_at,
              (SELECT COUNT(*) FROM card_due_changes dc WHERE dc.card_id = k.id) AS slip_count,
              CAST(julianday(k.due_date) - julianday(k.baseline_due_date) AS INTEGER) AS slip_days,
              ap.full_name AS approver_name
         FROM cards k
         LEFT JOIN customers c ON c.id = k.customer_id
         LEFT JOIN deals d ON d.id = k.deal_id
         LEFT JOIN contacts ct ON ct.id = k.contact_id
         LEFT JOIN contracts ctr ON ctr.id = k.contract_id
         LEFT JOIN quotations q ON q.id = k.quotation_id
         LEFT JOIN contacts ac ON ac.id = k.assignee_contact_id
         LEFT JOIN customers ao ON ao.id = k.assignee_org_id
         LEFT JOIN contacts ap ON ap.id = k.approver_contact_id
         JOIN lists l ON l.id = k.list_id
         JOIN boards b ON b.id = l.board_id
         LEFT JOIN projects pr ON pr.id = b.project_id
        WHERE k.id = ?`
    )
    .get(id);
}

/** Cong viec dang gan voi mot thuc the CRM, dung cho tab "Cong viec" cua tung ho so. */
const LINKED_TASK_SELECT = `
  SELECT k.id, k.title, k.due_date, k.start_date, k.priority, k.is_done, k.parent_id,
         k.list_id, k.customer_id, k.contact_id, k.deal_id, k.contract_id, k.quotation_id,
         k.status, k.blocked_reason,
         k.assignee_contact_id, k.assignee_org_id,
         ac.full_name AS assignee_name, ao.name AS assignee_org_name,
         ao.org_kind AS assignee_org_kind,
         l.name AS list_name, l.status_mapping, b.id AS board_id, b.name AS board_name,
         b.project_id
    FROM cards k
    JOIN lists l ON l.id = k.list_id
    JOIN boards b ON b.id = l.board_id
    LEFT JOIN contacts ac ON ac.id = k.assignee_contact_id
    LEFT JOIN customers ao ON ao.id = k.assignee_org_id`;

const LINKED_TASK_ORDER = `ORDER BY k.is_done, k.due_date IS NULL, k.due_date`;

export function listTasksByLink(
  column: 'customer_id' | 'contact_id' | 'deal_id' | 'contract_id' | 'quotation_id',
  id: number
) {
  return db
    .prepare(
      `${LINKED_TASK_SELECT} WHERE k.${column} = ? AND k.is_archived = 0 ${LINKED_TASK_ORDER}`
    )
    .all(id);
}

/**
 * Cong viec cua mot du an — loc qua BANG, khong qua cot tren the.
 *
 * Tach khoi `listTasksByLink` vi `project_id` khong con la cot cua `cards` (v19):
 * mot viec thuoc du an cua bang chua no, va do la dinh nghia duy nhat.
 */
export function listTasksByProject(projectId: number) {
  return db
    .prepare(
      `${LINKED_TASK_SELECT} WHERE b.project_id = ? AND k.is_archived = 0 ${LINKED_TASK_ORDER}`
    )
    .all(projectId);
}

/**
 * Chon danh sach mac dinh khi nguoi dung tao cong viec ma khong chi ro noi tha.
 *
 * Uu tien bang rieng cua khach hang lien quan — tao viec tu ho so mot khach hang ma
 * roi vao bang cua khach hang khac la sai ngu canh. Sau do moi den bang gan sao roi
 * bang dau tien. Thay cho hai ban `defaultListId()` truoc day nam rai o
 * routes/interactions.ts va services/ai/actions.ts.
 */
export function resolveDefaultList(
  links: EntityLinks = {},
  projectId: number | null = null
): number | null {
  const customerId = links.customer_id ?? null;
  const row = db
    .prepare(
      /*
       * Du an la uu tien CAO NHAT, tren ca khach hang.
       *
       * Bam "Them cong viec" o trang mot du an ma viec roi vao bang cua du an
       * khac la sai ngu canh nang hon — va tu v19, no con am tham doi luon du an
       * cua viec do, vi du an suy tu bang chua the.
       */
      `SELECT l.id FROM lists l JOIN boards b ON b.id = l.board_id
        WHERE b.is_archived = 0
        ORDER BY (? IS NOT NULL AND b.project_id = ?) DESC,
                 (? IS NOT NULL AND b.customer_id = ?) DESC,
                 b.is_starred DESC, b.id, l.position
        LIMIT 1`
    )
    .get(projectId, projectId, customerId, customerId) as { id: number } | undefined;
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

  /* Nguoi phu trach di duong RIENG, khong nam trong `links`: xem resolveAssignee. */
  let assigneeContactId = input.assignee_contact_id ?? null;

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
    // Viec con mac dinh cung nguoi phu trach voi viec cha — van doi lai duoc.
    if (assigneeContactId == null) {
      assigneeContactId = (parent.assignee_contact_id as number | null) ?? null;
    }
  }

  // Khong giao cho ai thi mac dinh giao cho minh (contacts.is_me) thay vi de trong.
  if (assigneeContactId == null) {
    const me = db.prepare(`SELECT id FROM contacts WHERE is_me = 1 AND is_active = 1`).get() as
      { id: number } | undefined;
    if (me) assigneeContactId = me.id;
  }

  const derived = deriveTaskLinks(db, links);
  const assignee = resolveAssignee(db, assigneeContactId);
  // `project_id` khong con nam tren the — no chi dan huong chon bang mac dinh.
  const targetList = listId ?? resolveDefaultList(derived, input.project_id ?? null);
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
                            contract_id, quotation_id, assignee_contact_id, assignee_org_id,
                            baseline_due_date, search_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        assignee.assignee_contact_id,
        assignee.assignee_org_id,
        // Han dat luc tao chinh la baseline; moi lan doi sau nay deu la mot lan truot.
        input.due_date ?? null,
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

/* ---------- Phu thuoc giua cac cong viec (v18) ---------- */

/**
 * Them mot phu thuoc finish-to-start, chan chu trinh.
 *
 * SQLite khong the dien ta rang buoc "do thi khong co chu trinh", va mot chu trinh
 * se lam moi thuat toan duyet sau nay (ve duong noi tren Timeline, tinh duong gang)
 * lap vo han. Nen phai chan ngay tai cho ghi — la noi duy nhat co the chan duoc.
 *
 * Phep kiem tra: neu tu `successor` da di toi duoc `predecessor` qua chuoi phu
 * thuoc hien co, thi canh moi se dong vong lai.
 */
export function addDependency(predecessorId: number, successorId: number): void {
  if (predecessorId === successorId) {
    throw new HttpError(400, 'Một công việc không thể phụ thuộc chính nó', {
      code: 'SELF_DEPENDENCY',
    });
  }
  required(
    db.prepare(`SELECT id FROM cards WHERE id = ?`).get(predecessorId),
    'Khong tim thay viec truoc'
  );
  required(
    db.prepare(`SELECT id FROM cards WHERE id = ?`).get(successorId),
    'Khong tim thay viec sau'
  );

  if (reaches(successorId, predecessorId)) {
    throw new HttpError(422, 'Phụ thuộc này tạo thành vòng lặp', {
      code: 'DEPENDENCY_CYCLE',
    });
  }

  db.prepare(
    `INSERT OR IGNORE INTO card_dependencies (predecessor_id, successor_id) VALUES (?, ?)`
  ).run(predecessorId, successorId);
}

/** Tu `from` co di toi `target` qua chuoi predecessor -> successor khong (DFS). */
function reaches(from: number, target: number): boolean {
  const next = db.prepare(`SELECT successor_id FROM card_dependencies WHERE predecessor_id = ?`);
  const seen = new Set<number>([from]);
  const stack = [from];
  while (stack.length > 0) {
    const current = stack.pop() as number;
    if (current === target) return true;
    for (const row of next.all(current) as { successor_id: number }[]) {
      if (seen.has(row.successor_id)) continue;
      seen.add(row.successor_id);
      stack.push(row.successor_id);
    }
  }
  return false;
}

/**
 * Phu thuoc cua mot the kem canh bao vi pham.
 *
 * `violated` = viec truoc chua xong nhung viec sau da bat dau (hoac da qua ngay
 * bat dau). Day moi la thu dang hien ra — mot danh sach phu thuoc khong co canh
 * bao thi chi la trang tri.
 */
export function listDependencies(cardId: number) {
  return {
    predecessors: db
      .prepare(
        `SELECT d.predecessor_id AS id, k.title, k.is_done, k.status, k.due_date,
                (k.is_done = 0 AND s.start_date IS NOT NULL
                 AND s.start_date <= date('now','localtime')) AS violated
           FROM card_dependencies d
           JOIN cards k ON k.id = d.predecessor_id
           JOIN cards s ON s.id = d.successor_id
          WHERE d.successor_id = ?
          ORDER BY k.due_date IS NULL, k.due_date`
      )
      .all(cardId),
    successors: db
      .prepare(
        `SELECT d.successor_id AS id, k.title, k.is_done, k.status, k.start_date
           FROM card_dependencies d JOIN cards k ON k.id = d.successor_id
          WHERE d.predecessor_id = ?
          ORDER BY k.start_date IS NULL, k.start_date`
      )
      .all(cardId),
  };
}

/* ---------- Vong doi trang thai (v16) ---------- */

interface RecurRule {
  unit: 'day' | 'week' | 'month';
  interval: number;
}

/** Doc `recur_rule` — du lieu do nguoi dung nhap nen phai chiu duoc JSON hong. */
function parseRecurRule(raw: unknown): RecurRule | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RecurRule>;
    const unit = parsed.unit;
    if (unit !== 'day' && unit !== 'week' && unit !== 'month') return null;
    const interval = Math.trunc(Number(parsed.interval));
    if (!Number.isFinite(interval) || interval < 1 || interval > 365) return null;
    return { unit, interval };
  } catch {
    return null;
  }
}

/**
 * Cong them mot chu ky vao ngay 'YYYY-MM-DD'.
 *
 * Dung UTC de phep cong khong bi lech mot ngay o cac moc doi gio — ngay o day la
 * ngay lich thuan tuy, khong mang thong tin mui gio.
 */
function shiftDate(date: string, rule: RecurRule): string {
  const [year, month, day] = date.split('-').map(Number);
  const base = new Date(Date.UTC(year, month - 1, day));
  if (rule.unit === 'day') base.setUTCDate(base.getUTCDate() + rule.interval);
  else if (rule.unit === 'week') base.setUTCDate(base.getUTCDate() + rule.interval * 7);
  else base.setUTCMonth(base.getUTCMonth() + rule.interval);
  return base.toISOString().slice(0, 10);
}

/**
 * DUONG GHI DUY NHAT cho `cards.status` va `cards.is_done`.
 *
 * Hai cot phai luon thoa is_done = 1 <=> status = 'done'. `is_done` duoc doc o
 * gan 80 truy van co san (dashboard, bao cao, dem viec tren ho so khach hang) nen
 * khong the bo; `status` la thu nguoi dung thuc su lam viec cung. Moi noi tung
 * chay `UPDATE cards SET is_done = ?` deu phai goi ham nay thay the — neu khong,
 * hai cot se troi khoi nhau va khong co gi bao loi.
 *
 * Ham cung phu trach hai he qua di kem:
 *  - vao/ra 'blocked' thi dat/xoa `blocked_since` va `blocked_reason`;
 *  - vao 'done' ma the co `recur_rule` thi sinh ban ke tiep, trong CUNG transaction.
 */
export function setCardStatus(
  id: number,
  status: CardStatus,
  options: { blockedReason?: string | null; moveToMappedList?: boolean } = {}
): void {
  const card = required(
    db.prepare(`SELECT * FROM cards WHERE id = ?`).get(id),
    'Khong tim thay the'
  ) as Record<string, unknown>;
  const previous = (card.status as CardStatus | null) ?? 'todo';
  if (status === previous && options.blockedReason === undefined) return;

  db.transaction(() => {
    /*
     * Chieu nguoc lai cua moveCard: doi trang thai keo the sang cot mang dung
     * nghia do (v19), neu bang co cot nhu vay va the chua o day.
     *
     * `moveToMappedList: false` la loi thoat khi chinh moveCard goi vao — luc do
     * the DA nam o cot dich, chuyen tiep nua la hai ham day nhau qua lai.
     *
     * Bang co hai cot cung anh xa thi chon cot ben trai nhat: khong cam trung vi
     * se lam thao tac "sao chep danh sach" that bai, va chon on dinh thi du.
     */
    if (options.moveToMappedList !== false) {
      const target = mappedListInBoard(card.list_id as number, status);
      if (target !== null && target !== card.list_id) {
        db.prepare(`UPDATE cards SET list_id = ?, position = ? WHERE id = ?`).run(
          target,
          nextPosition({ table: 'cards', scopeCol: 'list_id', scopeVal: target }),
          id
        );
      }
    }

    const done = status === 'done';
    const enteringBlocked = status === 'blocked';
    db.prepare(
      `UPDATE cards
          SET status = ?,
              is_done = ?,
              completed_at = CASE WHEN ? = 1 THEN COALESCE(completed_at, datetime('now','localtime'))
                                  ELSE NULL END,
              blocked_reason = ?,
              blocked_since = CASE WHEN ? = 1 THEN COALESCE(blocked_since, datetime('now','localtime'))
                                   ELSE NULL END,
              updated_at = datetime('now','localtime')
        WHERE id = ?`
    ).run(
      status,
      done ? 1 : 0,
      done ? 1 : 0,
      // Ly do chan chi co nghia khi dang bi chan — giu lai sau khi go la thong tin sai.
      enteringBlocked ? (options.blockedReason ?? (card.blocked_reason as string | null)) : null,
      enteringBlocked ? 1 : 0,
      id
    );

    if (!done || previous === 'done') return;
    const rule = parseRecurRule(card.recur_rule);
    if (!rule) return;

    /*
     * Viec lap lai: sinh ban ke tiep ngay luc dong ban hien tai.
     *
     * Moc tinh la han cu (khong phai hom nay) de chu ky khong bi truot dan moi lan
     * hoan thanh muon. Khong co han thi lay ngay bat dau; khong co ca hai thi
     * khong sinh — mot viec lap lai ma khong co moc thoi gian la vo nghia.
     */
    const anchor = (card.due_date as string | null) ?? (card.start_date as string | null);
    if (!anchor) return;
    const nextDue = shiftDate(anchor, rule);
    const until = card.recur_until as string | null;
    if (until && nextDue > until) return;

    const nextStart =
      card.start_date && card.due_date
        ? shiftDate(card.start_date as string, rule)
        : card.start_date
          ? nextDue
          : null;

    /*
     * Ban ke tiep bat dau lai tu DAU quy trinh, khong ke thua cho cua ban vua dong.
     *
     * `card.list_id` la cot TRUOC khi setCardStatus keo the sang cot 'Hoan thanh',
     * nen no van dung bang. Neu bang co cot mang nghia 'todo' thi tha vao do; bang
     * khong khai bao anh xa nao thi giu nguyen cho cu.
     */
    const originList = card.list_id as number;
    const nextList = mappedListInBoard(originList, 'todo') ?? originList;
    const position = nextPosition({ table: 'cards', scopeCol: 'list_id', scopeVal: nextList });
    db.prepare(
      `INSERT INTO cards (list_id, parent_id, title, description, position, priority,
                          start_date, due_date, customer_id, contact_id, deal_id,
                          contract_id, quotation_id, assignee_contact_id, assignee_org_id,
                          approver_contact_id, recur_rule, recur_until, search_text)
       SELECT ?, parent_id, title, description, ?, priority,
              ?, ?, customer_id, contact_id, deal_id,
              contract_id, quotation_id, assignee_contact_id, assignee_org_id,
              approver_contact_id, recur_rule, recur_until, search_text
         FROM cards WHERE id = ?`
    ).run(nextList, position, nextStart, card.due_date ? nextDue : null, id);

    // Ban vua dong khong con lap nua — neu khong, hoan thanh lai se sinh trung.
    db.prepare(`UPDATE cards SET recur_rule = NULL, recur_until = NULL WHERE id = ?`).run(id);
  })();
}
