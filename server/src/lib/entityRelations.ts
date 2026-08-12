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
}
