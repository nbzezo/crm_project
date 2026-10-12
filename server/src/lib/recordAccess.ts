import type { Request } from 'express';
import type { PermissionAction, PermissionResource } from '@workflow/contracts';
import { db } from '../db/connection.ts';
import { accessOf } from '../middleware/currentUser.ts';
import { HttpError } from './validate.ts';

/*
 * Kiem quyen MOT ban ghi cu the truoc khi doc/ghi theo id (1.37.0).
 *
 * v40 ghep pham vi vao cac truy van DANH SACH, nhung route chi tiet va route ghi
 * doc thang `SELECT ... WHERE id = ?` — chan danh sach xong van doan id la mo, sua,
 * xoa duoc du lieu phong khac. Moi ham o day nap dong goc kem cot chu so huu, so
 * voi `visibleContactIds()` va nem 404 khi nam ngoai pham vi (giong `assertInScope`:
 * "khong ton tai" va "khong duoc xem" phai khong phan biet duoc).
 *
 * Luat phai TRUNG voi luat danh sach cung loai, neu khong man hinh se hien mot dong
 * ma bam vao lai 404 (hoac nguoc lai):
 *  - Bang: `routes/boards.ts` GET / — bang minh thay, bang chua co chu, CONG bang co
 *    viec giao cho minh.
 *  - Viec: `taskScope` o routes/views.ts — doc duoc viec tren bang minh thay, viec
 *    giao cho minh, viec chua giao ai. GHI thi bo nhanh "chua giao ai": thay de con
 *    biet no ton tai, khong co nghia la duoc sua viec tren bang nguoi khac.
 *
 * Bat bien test: server/src/test/recordAccess.test.ts quet MOI route co `:id` bang
 * tai khoan phong khac va doi 404.
 */

/** Chu so huu `owner` co nam trong pham vi `resource × action` cua nguoi goi khong. */
export function ownerInScope(
  req: Request,
  resource: PermissionResource,
  action: PermissionAction,
  owner: number | null | undefined
): boolean {
  const visible = accessOf(req).visibleContactIds(resource, action);
  if (visible === 'all') return true;
  if (visible.length === 0) return false;
  /* Ban ghi vo chu hien voi moi nguoi co pham vi (scopeWhereOrUnowned) — ghi cung
     theo, neu khong du lieu cu truoc v40 khong ai sua duoc ngoai quan tri. */
  if (owner == null) return true;
  return visible.includes(owner);
}

/** Thao tac tren ban ghi suy tu phuong thuc HTTP: doc / xoa / moi thu khac la sua. */
export function methodAction(req: Request): 'read' | 'update' | 'delete' {
  if (req.method === 'GET' || req.method === 'HEAD') return 'read';
  if (req.method === 'DELETE') return 'delete';
  return 'update';
}

/**
 * Tao bo kiem `router.param(...)`: chay TRUOC moi handler co tham so do trong router,
 * nen mot route con them sau nay (`/:id/abc`) khong the quen kiem pham vi.
 */
export function paramGuard(
  check: (req: Request, id: number) => void
): (req: Request, res: unknown, next: (error?: unknown) => void, value: unknown) => void {
  return (req, _res, next, value) => {
    try {
      const id = Number(value);
      if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Mã không hợp lệ');
      check(req, id);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Kiem chu so huu cho bo kiem `router.param` cua ban ghi goc (co hoi, du an, khach hang).
 *
 * DOC theo luat danh sach (`scopeWhereOrUnowned`: ban ghi vo chu hien voi moi nguoi
 * co pham vi) — neu khong, dong hien o danh sach ma bam vao lai 404. GHI / XOA giu
 * luat chat cua route sua san co (`assertInScope`): ban ghi vo chu chi nguoi pham vi
 * `all` sua duoc, de quan tri giao lai cho dung nguoi truoc.
 */
export function assertRootOwner(
  req: Request,
  resource: PermissionResource,
  owner: number | null,
  message: string
): void {
  const action = methodAction(req);
  const visible = accessOf(req).visibleContactIds(resource, action);
  if (visible === 'all') return;
  const allowed = owner == null ? action === 'read' && visible.length > 0 : visible.includes(owner);
  if (!allowed) notFound(message);
}

function notFound(message: string): never {
  throw new HttpError(404, message);
}

/* ---------------- Bang / danh sach ---------------- */

export interface BoardAccessRow {
  id: number;
  owner_contact_id: number | null;
  project_id: number | null;
  customer_id: number | null;
}

function hasCardAssignedTo(boardId: number, contactId: number | null): boolean {
  if (contactId == null) return false;
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM cards k JOIN lists l ON l.id = k.list_id
          WHERE l.board_id = ? AND k.assignee_contact_id = ? LIMIT 1`
      )
      .get(boardId, contactId)
  );
}

/** Doc: bang minh thay hoac co viec giao cho minh. Ghi: theo quyen `boards`. */
export function boardAllowed(
  req: Request,
  board: { id: number; owner_contact_id: number | null },
  action: PermissionAction
): boolean {
  if (ownerInScope(req, 'boards', action, board.owner_contact_id)) return true;
  return action === 'read' && hasCardAssignedTo(board.id, accessOf(req).contactId);
}

export function assertBoardAccess(
  req: Request,
  boardId: number,
  action: PermissionAction
): BoardAccessRow {
  const board = db
    .prepare(`SELECT id, owner_contact_id, project_id, customer_id FROM boards WHERE id = ?`)
    .get(boardId) as BoardAccessRow | undefined;
  if (!board || !boardAllowed(req, board, action)) notFound('Không tìm thấy bảng');
  return board;
}

export function assertListAccess(
  req: Request,
  listId: number,
  action: PermissionAction
): { id: number; board_id: number } {
  const row = db
    .prepare(
      `SELECT l.id, l.board_id, b.owner_contact_id
         FROM lists l JOIN boards b ON b.id = l.board_id WHERE l.id = ?`
    )
    .get(listId) as { id: number; board_id: number; owner_contact_id: number | null } | undefined;
  if (
    !row ||
    !boardAllowed(req, { id: row.board_id, owner_contact_id: row.owner_contact_id }, action)
  ) {
    notFound('Không tìm thấy danh sách');
  }
  return { id: row.id, board_id: row.board_id };
}

/**
 * Tha mot viec vao danh sach `listId` (tao moi, chuyen, sao chep).
 *
 * Chi can THAY bang dich: nguoi duoc giao viec tren bang cua truong phong van tao
 * duoc viec con, keo viec qua cot ben canh. Dong quyen ghi `boards` o day se chan
 * dung cai duong lam viec ma luat "viec giao cho minh" sinh ra de giu.
 */
export function assertListPlaceable(
  req: Request,
  listId: number
): { id: number; board_id: number } {
  return assertListAccess(req, listId, 'read');
}

/* ---------------- Cong viec ---------------- */

export interface CardAccessRow {
  id: number;
  list_id: number;
  board_id: number;
  board_owner: number | null;
  assignee_contact_id: number | null;
}

export function cardAllowed(req: Request, card: CardAccessRow, action: PermissionAction): boolean {
  if (ownerInScope(req, 'tasks', action, card.board_owner)) return true;
  /* Nguoi duoc giao doc va sua duoc viec cua minh tren bang nguoi khac, nhung XOA la
     quyen cua chu bang — xoa nham thi mat ca viec con, checklist, tep dinh kem. */
  const me = accessOf(req).contactId;
  if (me != null && card.assignee_contact_id === me && action !== 'delete') return true;
  if (action !== 'read') return false;
  /* Viec chua giao ai: doc duoc (xem taskScope o views.ts), nhung chi khi nguoi
     goi co pham vi cong viec — khong co thi `visible` rong va khong thay gi ca. */
  const visible = accessOf(req).visibleContactIds('tasks', 'read');
  return card.assignee_contact_id == null && (visible === 'all' || visible.length > 0);
}

export function loadCardAccess(cardId: number): CardAccessRow | undefined {
  return db
    .prepare(
      `SELECT k.id, k.list_id, l.board_id, b.owner_contact_id AS board_owner, k.assignee_contact_id
         FROM cards k
         JOIN lists l ON l.id = k.list_id
         JOIN boards b ON b.id = l.board_id
        WHERE k.id = ?`
    )
    .get(cardId) as CardAccessRow | undefined;
}

/**
 * `action` la thao tac tren CHINH the: doc → 'read', sua / them binh luan / tick
 * checklist → 'update', xoa → 'delete'.
 */
export function assertCardAccess(
  req: Request,
  cardId: number,
  action: PermissionAction,
  message = 'Không tìm thấy thẻ'
): CardAccessRow {
  const card = loadCardAccess(cardId);
  if (!card || !cardAllowed(req, card, action)) notFound(message);
  return card;
}

/* ---------------- Ban ghi theo loai (nhan, lien ket chung) ---------------- */

/**
 * Mot ban ghi `type × id` co nam trong pham vi cua nguoi goi khong — dung cho cac
 * module gan len NHIEU loai ban ghi (nhan). Ban ghi khong ton tai coi nhu ngoai pham vi.
 */
export function entityAllowed(
  req: Request,
  type: 'card' | 'customer' | 'deal' | 'contact' | 'contract',
  id: number,
  action: PermissionAction
): boolean {
  if (type === 'card') {
    const card = loadCardAccess(id);
    return card != null && cardAllowed(req, card, action);
  }
  if (type === 'contract') {
    const row = derivedOwner('contracts', id);
    return row != null && ownerInScope(req, 'contracts', action, row.owner);
  }
  const sql = {
    customer: `SELECT owner_contact_id AS owner FROM customers WHERE id = ?`,
    deal: `SELECT owner_contact_id AS owner FROM deals WHERE id = ?`,
    contact: `SELECT c.owner_contact_id AS owner FROM contacts x
                JOIN customers c ON c.id = x.customer_id WHERE x.id = ?`,
  }[type];
  const resource = ({ customer: 'customers', deal: 'deals', contact: 'contacts' } as const)[type];
  const row = db.prepare(sql).get(id) as { owner: number | null } | undefined;
  return row != null && ownerInScope(req, resource, action, row.owner);
}

/* ---------------- CRM ---------------- */

/** Chu so huu suy dien cua hop dong / bao gia: co hoi truoc, roi khach hang. */
function derivedOwner(
  table: 'contracts' | 'quotations',
  id: number
): { owner: number | null } | undefined {
  return db
    .prepare(
      `SELECT COALESCE(d.owner_contact_id, c.owner_contact_id) AS owner
         FROM ${table} x
         LEFT JOIN deals d ON d.id = x.deal_id
         LEFT JOIN customers c ON c.id = x.customer_id
        WHERE x.id = ?`
    )
    .get(id) as { owner: number | null } | undefined;
}

export function assertContractAccess(req: Request, id: number, action: PermissionAction): void {
  const row = derivedOwner('contracts', id);
  if (!row || !ownerInScope(req, 'contracts', action, row.owner))
    notFound('Không tìm thấy hợp đồng');
}

export function assertQuotationAccess(req: Request, id: number, action: PermissionAction): void {
  const row = derivedOwner('quotations', id);
  if (!row || !ownerInScope(req, 'quotations', action, row.owner))
    notFound('Không tìm thấy báo giá');
}

/**
 * Cac khoa lien ket trong body (customer_id, deal_id, contract_id, quotation_id,
 * contact_id, project_id) phai tro toi ban ghi nguoi goi XEM duoc.
 *
 * `assertEntityLinks` chi kiem ton tai va cung khach hang; thieu buoc nay thi gan
 * duoc tai lieu / hop dong / dong doanh thu vao khach hang phong khac — va ban ghi
 * vua gan se hien ra o man hinh cua phong do. Chi kiem DOC: gan mot hop dong vao co
 * hoi minh xem duoc la viec binh thuong, khong doi quyen sua co hoi.
 */
export function assertLinkTargetsInScope(req: Request, links: Record<string, unknown>): void {
  const id = (key: string): number | null => {
    const value = links[key];
    return typeof value === 'number' && Number.isInteger(value) ? value : null;
  };
  const check = (key: string, resource: PermissionResource, sql: string, message: string): void => {
    const value = id(key);
    if (value == null) return;
    const row = db.prepare(sql).get(value) as { owner: number | null } | undefined;
    if (!row) return; // ton tai hay khong la viec cua assertEntityLinks
    if (!ownerInScope(req, resource, 'read', row.owner)) {
      throw new HttpError(422, message, { code: 'LINK_OUT_OF_SCOPE', field: key });
    }
  };
  check(
    'customer_id',
    'customers',
    `SELECT owner_contact_id AS owner FROM customers WHERE id = ? AND org_kind = 'customer'`,
    'Không thể gắn với khách hàng ngoài phạm vi của bạn'
  );
  check(
    'deal_id',
    'deals',
    `SELECT owner_contact_id AS owner FROM deals WHERE id = ?`,
    'Không thể gắn với cơ hội ngoài phạm vi của bạn'
  );
  check(
    'project_id',
    'projects',
    `SELECT owner_contact_id AS owner FROM projects WHERE id = ?`,
    'Không thể gắn với dự án ngoài phạm vi của bạn'
  );
  check(
    'contact_id',
    'contacts',
    `SELECT c.owner_contact_id AS owner FROM contacts x
       JOIN customers c ON c.id = x.customer_id AND c.org_kind = 'customer'
      WHERE x.id = ?`,
    'Không thể gắn với người liên hệ ngoài phạm vi của bạn'
  );
  for (const [key, table, resource] of [
    ['contract_id', 'contracts', 'contracts'],
    ['quotation_id', 'quotations', 'quotations'],
  ] as const) {
    const value = id(key);
    if (value == null) continue;
    const row = derivedOwner(table, value);
    if (row && !ownerInScope(req, resource, 'read', row.owner)) {
      throw new HttpError(422, 'Không thể gắn với bản ghi ngoài phạm vi của bạn', {
        code: 'LINK_OUT_OF_SCOPE',
        field: key,
      });
    }
  }
}
