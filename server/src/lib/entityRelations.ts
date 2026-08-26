import type { Database } from 'better-sqlite3';
import type { EntityLinks } from '@workflow/contracts/schemas';
import { HttpError, required } from './validate.ts';

export type { EntityLinks };

type CustomerOwner = { id: number; customer_id: number | null };

function owner(
  db: Database,
  table: 'contacts' | 'deals' | 'contracts' | 'quotations' | 'cards',
  id: number,
  label: string
): CustomerOwner {
  return required(
    db.prepare(`SELECT id, customer_id FROM ${table} WHERE id = ?`).get(id) as
      CustomerOwner | undefined,
    `Khong tim thay ${label}`
  );
}

/**
 * Xac nhan moi khoa ngoai co that va tat ca doi tuong lien quan cung thuoc mot khach hang.
 * SQLite FK chi dam bao ban ghi ton tai, khong the dien ta rang buoc lien bang nay.
 */
export function assertEntityLinks(db: Database, links: EntityLinks): void {
  const owners: { label: string; customerId: number }[] = [];
  const addOwner = (label: string, customerId: number | null) => {
    if (customerId != null) owners.push({ label, customerId });
  };

  if (links.customer_id != null) {
    required(
      db.prepare(`SELECT id FROM customers WHERE id = ?`).get(links.customer_id),
      'Khong tim thay khach hang'
    );
    addOwner('khach hang', links.customer_id);
  }
  if (links.contact_id != null)
    addOwner('nguoi lien he', owner(db, 'contacts', links.contact_id, 'nguoi lien he').customer_id);
  if (links.deal_id != null)
    addOwner('co hoi', owner(db, 'deals', links.deal_id, 'co hoi').customer_id);
  if (links.contract_id != null)
    addOwner('hop dong', owner(db, 'contracts', links.contract_id, 'hop dong').customer_id);
  if (links.quotation_id != null)
    addOwner('bao gia', owner(db, 'quotations', links.quotation_id, 'bao gia').customer_id);
  if (links.card_id != null)
    addOwner('cong viec', owner(db, 'cards', links.card_id, 'cong viec').customer_id);
  if (links.service_id != null)
    required(
      db.prepare(`SELECT id FROM services WHERE id = ?`).get(links.service_id),
      'Khong tim thay dich vu'
    );

  const expected = owners[0]?.customerId;
  const mismatch = owners.find((entry) => entry.customerId !== expected);
  if (mismatch) {
    throw new HttpError(422, `Lien ket ${mismatch.label} khong thuoc cung khach hang`, {
      code: 'CROSS_CUSTOMER_LINK',
    });
  }
}

/**
 * Dam bao mot thuc the CRM that su tro toi mot tai khoan khach hang.
 *
 * Bang `customers` dong thoi la danh ba to chuc noi bo/doi tac/nha cung cap. FK
 * chi biet ban ghi ton tai, nen moi duong ghi CRM phai them rang buoc nghiep vu
 * nay de mot to chuc noi bo khong lot vao pipeline hay doanh thu.
 */
export function assertCrmCustomer(db: Database, customerId: number): void {
  const row = required(
    db.prepare(`SELECT id, org_kind FROM customers WHERE id = ?`).get(customerId) as
      { id: number; org_kind: string } | undefined,
    'Khong tim thay khach hang'
  );
  if (row.org_kind !== 'customer') {
    throw new HttpError(422, 'Chỉ tổ chức loại Khách hàng mới được dùng trong CRM', {
      code: 'ORG_NOT_CRM_CUSTOMER',
    });
  }
}

interface ProjectCustomerLink {
  project_id?: number | null;
  customer_id?: number | null;
}

/**
 * Xac nhan thuc the gan du an khong thuoc mot khach hang khac.
 *
 * Du an noi bo (`customer_id IS NULL`) co the gom cong viec cho nhieu ben; khi
 * du an da mang mot khach hang cu the thi moi lien ket ben duoi phai trung.
 */
export function assertProjectCustomerLink(
  db: Database,
  links: ProjectCustomerLink,
  label: string
): void {
  if (links.project_id == null) return;
  const project = required(
    db.prepare(`SELECT id, customer_id FROM projects WHERE id = ?`).get(links.project_id) as
      { id: number; customer_id: number | null } | undefined,
    'Khong tim thay du an'
  );
  if (
    project.customer_id != null &&
    links.customer_id != null &&
    project.customer_id !== links.customer_id
  ) {
    throw new HttpError(422, `${label} và dự án không thuộc cùng một khách hàng`, {
      code: 'CROSS_CUSTOMER_LINK',
    });
  }
}

/** Kiem tra nhanh lien ket Project cua bang chua mot danh sach. */
export function assertListProjectCustomer(
  db: Database,
  listId: number,
  customerId: number | null | undefined,
  label = 'Công việc'
): void {
  const row = required(
    db
      .prepare(`SELECT b.project_id FROM lists l JOIN boards b ON b.id = l.board_id WHERE l.id = ?`)
      .get(listId) as { project_id: number | null } | undefined,
    'Khong tim thay danh sach'
  );
  assertProjectCustomerLink(db, { project_id: row.project_id, customer_id: customerId }, label);
}

/**
 * Kiem tra cac quan he nguoc truoc khi doi khach hang cua du an.
 *
 * Board duoc dong bo trong route Project; Deal, Contract va Card la du lieu CRM
 * co chu so huu rieng nen khong duoc am tham doi theo.
 */
export function assertProjectCustomerChange(
  db: Database,
  projectId: number,
  customerId: number | null
): void {
  if (customerId == null) return;
  const mismatch = db
    .prepare(
      `SELECT kind, entity_id FROM (
         SELECT 'cơ hội' AS kind, id AS entity_id
           FROM deals WHERE project_id = ? AND customer_id <> ?
         UNION ALL
         SELECT 'hợp đồng' AS kind, id AS entity_id
           FROM contracts WHERE project_id = ? AND customer_id <> ?
         UNION ALL
         SELECT 'công việc' AS kind, k.id AS entity_id
           FROM cards k
           JOIN lists l ON l.id = k.list_id
           JOIN boards b ON b.id = l.board_id
          WHERE b.project_id = ? AND k.customer_id IS NOT NULL AND k.customer_id <> ?
       ) LIMIT 1`
    )
    .get(projectId, customerId, projectId, customerId, projectId, customerId) as
    { kind: string; entity_id: number } | undefined;
  if (mismatch) {
    throw new HttpError(
      422,
      `Không thể đổi khách hàng: ${mismatch.kind} #${mismatch.entity_id} đang thuộc khách hàng khác`,
      { code: 'PROJECT_CUSTOMER_CONFLICT', entity_id: mismatch.entity_id }
    );
  }
}

/** Chan doi mot tai khoan CRM thanh loai to chuc khac khi con du lieu nghiep vu. */
export function assertOrgKindChange(db: Database, customerId: number, nextKind: string): void {
  if (nextKind === 'customer') return;
  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM deals WHERE customer_id = ?) AS deals,
         (SELECT COUNT(*) FROM contracts WHERE customer_id = ?) AS contracts,
         (SELECT COUNT(*) FROM quotations WHERE customer_id = ?) AS quotations,
         (SELECT COUNT(*) FROM customer_services WHERE customer_id = ?) AS services`
    )
    .get(customerId, customerId, customerId, customerId) as Record<string, number>;
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (total > 0) {
    throw new HttpError(409, 'Không thể đổi loại tổ chức khi vẫn còn dữ liệu CRM liên quan', {
      code: 'ORG_KIND_HAS_CRM_DATA',
      counts,
    });
  }
}

export interface AssigneeColumns {
  assignee_contact_id: number | null;
  assignee_org_id: number | null;
}

/**
 * Nguoi phu trach — TRUC RIENG, CO Y khong di qua assertEntityLinks.
 *
 * assertEntityLinks bat moi lien ket tren mot the phai cung MOT khach hang, vi
 * chung tra loi cau hoi "viec nay VE cai gi". Nguoi phu trach tra loi cau hoi khac
 * han — "AI LAM" — va cau tra loi thuong xuyen nam ngoai pham vi khach hang do:
 * viec ve khach hang A phan lon do nhan su cong ty minh lam. Neu gop hai truc lai
 * cho gon, moi task giao noi bo se bi tu choi 422 CROSS_CUSTOMER_LINK.
 *
 * `assignee_org_id` luon duoc suy ra tu contact o day, khong bao gio lay tu client:
 * hai cot phai khong bao gio lech nhau, va client khong co ly do gi de biet contact
 * thuoc to chuc nao.
 */
export function resolveAssignee(
  db: Database,
  contactId: number | null | undefined
): AssigneeColumns {
  if (contactId == null) return { assignee_contact_id: null, assignee_org_id: null };
  const row = required(
    db.prepare(`SELECT id, customer_id, is_active FROM contacts WHERE id = ?`).get(contactId) as
      { id: number; customer_id: number; is_active: number } | undefined,
    'Khong tim thay nguoi phu trach'
  );
  if (row.is_active === 0) {
    throw new HttpError(400, 'Người phụ trách đã ngừng hoạt động', { code: 'ASSIGNEE_INACTIVE' });
  }
  return { assignee_contact_id: row.id, assignee_org_id: row.customer_id };
}

type ParentLinks = { customer_id: number | null; deal_id: number | null };

function parentLinks(
  db: Database,
  table: 'contracts' | 'quotations',
  id: number,
  label: string
): ParentLinks {
  return required(
    db.prepare(`SELECT customer_id, deal_id FROM ${table} WHERE id = ?`).get(id) as
      ParentLinks | undefined,
    `Khong tim thay ${label}`
  );
}

/**
 * Suy ra cac lien ket cap tren tu lien ket cu the nhat da biet.
 *
 * Chuoi so huu trong CRM la mot cay: bao gia / hop dong thuoc mot co hoi, co hoi
 * thuoc mot khach hang va co the co nguoi lien he chinh. Khi nguoi dung tao cong
 * viec tu tab Co hoi thi khong nen bat ho chon lai khach hang — du lieu do da xac
 * dinh. Chi dien vao o con trong (undefined hoac null); lua chon tuong minh cua
 * nguoi dung luon thang.
 *
 * Ket qua van phai qua assertEntityLinks vi nguoi dung co the tu ghep hai thuc the
 * cua hai khach hang khac nhau — luc do khong co gi de suy ra, chi co mau thuan.
 */
export function deriveTaskLinks(db: Database, links: EntityLinks): EntityLinks {
  /*
   * Kiem tra lua chon GOC truoc khi suy dien.
   *
   * Neu de den sau, mot lien ket do he thong tu dien se bi bao loi thay cho o ma
   * nguoi dung thuc su chon: chon co hoi cua khach khac thi thong bao lai chi vao
   * "nguoi lien he" — o ma ho chua he dung den.
   */
  assertEntityLinks(db, links);

  const next: EntityLinks = { ...links };
  const fill = (key: 'customer_id' | 'deal_id' | 'contact_id', value: number | null) => {
    if (next[key] == null && value != null) next[key] = value;
  };

  if (next.quotation_id != null) {
    const row = parentLinks(db, 'quotations', next.quotation_id, 'bao gia');
    fill('deal_id', row.deal_id);
    fill('customer_id', row.customer_id);
  }
  if (next.contract_id != null) {
    const row = parentLinks(db, 'contracts', next.contract_id, 'hop dong');
    fill('deal_id', row.deal_id);
    fill('customer_id', row.customer_id);
  }
  if (next.deal_id != null) {
    const row = required(
      db.prepare(`SELECT customer_id, contact_id FROM deals WHERE id = ?`).get(next.deal_id) as
        { customer_id: number | null; contact_id: number | null } | undefined,
      'Khong tim thay co hoi'
    );
    fill('customer_id', row.customer_id);
    fill('contact_id', row.contact_id);
  }
  if (next.contact_id != null) {
    fill('customer_id', owner(db, 'contacts', next.contact_id, 'nguoi lien he').customer_id);
  }

  assertEntityLinks(db, next);
  return next;
}

/** Viec con chi duoc di chuyen trong cung bang voi viec cha. */
export function assertParentListCompatible(
  db: Database,
  cardId: number,
  targetListId: number
): void {
  const row = db
    .prepare(
      `SELECT child.parent_id, child_list.board_id AS target_board_id,
              parent_list.board_id AS parent_board_id
         FROM cards child
         JOIN lists child_list ON child_list.id = ?
         LEFT JOIN cards parent ON parent.id = child.parent_id
         LEFT JOIN lists parent_list ON parent_list.id = parent.list_id
        WHERE child.id = ?`
    )
    .get(targetListId, cardId) as
    | { parent_id: number | null; target_board_id: number; parent_board_id: number | null }
    | undefined;
  const checked = required(row, 'Khong tim thay cong viec hoac danh sach');
  if (checked.parent_id != null && checked.parent_board_id !== checked.target_board_id) {
    throw new HttpError(422, 'Viec con phai nam cung bang voi viec cha', {
      code: 'PARENT_BOARD_MISMATCH',
    });
  }

  /*
   * Chieu nguoc lai: `cardId` la CHA — cac viec con cua no phai VAN cung bang sau
   * khi di chuyen. Thieu ve nay thi doi du an/bang cua viec cha se tach cap
   * cha-con ra hai bang khac nhau, dung dieu kien tren duoc viet de chan.
   */
  const mismatchedChild = db
    .prepare(
      `SELECT k.id FROM cards k
         JOIN lists l ON l.id = k.list_id
        WHERE k.parent_id = ? AND l.board_id <> ?
        LIMIT 1`
    )
    .get(cardId, checked.target_board_id) as { id: number } | undefined;
  if (mismatchedChild) {
    throw new HttpError(422, 'Viec cha phai nam cung bang voi viec con', {
      code: 'PARENT_BOARD_MISMATCH',
    });
  }
}
