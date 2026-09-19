import {
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  PERMISSION_SCOPES,
  RESOURCE_ACTIONS,
  type PermissionAction,
  type PermissionResource,
  type PermissionScope,
} from '@workflow/contracts';
import { db } from '../../db/connection.ts';
import { HttpError } from '../../lib/validate.ts';
import { bumpPermissionsVersion } from './access.ts';

/*
 * Quy tac cua so do to chuc va ma tran phan quyen.
 *
 * Nhung gi o day khong phai validation cho dep — moi ham deu chan mot cach lam
 * hong he thong ma CSDL mot minh khong dien ta duoc.
 */

/* ---------- Rao chan chong tu khoa cua ---------- */

/**
 * Phai LUON con it nhat mot nguoi dang hoat dong quan tri duoc ca nguoi dung lan
 * phan quyen.
 *
 * Khong co rao nay thi mot lan bo nham tick la ca he thong mat duong vao quan
 * tri, va cach sua duy nhat la mo CSDL len sua tay tren may chu. Kiem tra SAU khi
 * ghi, trong cung transaction, roi rollback neu vi pham: "ket qua cua thao tac
 * nay la gi" moi la cau hoi dung, chu khong phai "thao tac nay trong nhu the nao".
 */
export function assertAdminRemains(): void {
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT up.user_id) AS n
         FROM user_positions up
         JOIN users u ON u.id = up.user_id AND u.is_active = 1
        WHERE up.position_id IN (
                SELECT position_id FROM position_permissions
                 WHERE resource = 'admin.users' AND action = 'update' AND scope = 'all'
              )
          AND up.position_id IN (
                SELECT position_id FROM position_permissions
                 WHERE resource = 'admin.positions' AND action = 'update' AND scope = 'all'
              )`
    )
    .get() as { n: number };

  if (row.n === 0) {
    throw new HttpError(
      409,
      'Thao tác này sẽ khiến không còn ai quản trị được người dùng và phân quyền. ' +
        'Hãy giao quyền quản trị cho một người khác trước.'
    );
  }
}

/* ---------- Cay don vi ---------- */

/**
 * Chan chu trinh khi doi cha cua mot don vi.
 *
 * SQLite khong dien ta duoc rang buoc "do thi khong co chu trinh". Mot chu trinh
 * o day se lam recursive CTE tinh pham vi chay mai khong dung — tuc la mot request
 * treo, khong phai mot loi doc duoc. Chan tai cho ghi, giong cach addDependency
 * chan chu trinh phu thuoc cong viec tu v18.
 */
export function assertNoCycle(unitId: number, parentId: number | null): void {
  if (parentId == null) return;
  if (parentId === unitId)
    throw new HttpError(400, 'Một đơn vị không thể là cấp trên của chính nó');

  const rows = db
    .prepare(
      `WITH RECURSIVE up(id, parent_id) AS (
         SELECT id, parent_id FROM org_units WHERE id = ?
         UNION
         SELECT o.id, o.parent_id FROM org_units o JOIN up ON o.id = up.parent_id
       )
       SELECT id FROM up`
    )
    .all(parentId) as { id: number }[];

  if (rows.some((row) => row.id === unitId)) {
    throw new HttpError(400, 'Không thể đặt một đơn vị nằm dưới chính cấp dưới của nó');
  }
}

export function assertUnitEmpty(unitId: number): void {
  const children = db
    .prepare('SELECT COUNT(*) AS n FROM org_units WHERE parent_id = ?')
    .get(unitId) as {
    n: number;
  };
  if (children.n > 0) {
    throw new HttpError(409, 'Đơn vị này còn đơn vị cấp dưới — chuyển hoặc xoá chúng trước');
  }

  const people = db
    .prepare('SELECT COUNT(*) AS n FROM contacts WHERE org_unit_id = ?')
    .get(unitId) as {
    n: number;
  };
  if (people.n > 0) {
    throw new HttpError(409, 'Đơn vị này còn người — chuyển họ sang đơn vị khác trước');
  }
}

/* ---------- Vi tri ---------- */

export function assertPositionUnused(positionId: number): void {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM user_positions WHERE position_id = ?')
    .get(positionId) as { n: number };
  if (row.n > 0) {
    throw new HttpError(409, 'Vị trí này đang có người giữ — chuyển họ sang vị trí khác trước');
  }
}

export function assertNotSystemPosition(positionId: number): void {
  const row = db.prepare('SELECT is_system FROM positions WHERE id = ?').get(positionId) as
    { is_system: number } | undefined;
  if (!row) throw new HttpError(404, 'Không tìm thấy vị trí');
  if (row.is_system) {
    throw new HttpError(409, 'Không thể xoá vị trí quản trị hệ thống');
  }
}

export interface PermissionInput {
  resource: string;
  action: string;
  scope: string;
}

/**
 * Kiem tra mot o trong ma tran co that su ton tai trong danh muc.
 *
 * `position_permissions` co y khong co CHECK liet ke resource/action (xem
 * migrate-v39.sql): danh sach do dai them theo tinh nang va se bien moi lan them
 * mot man hinh thanh mot migration. Doi lai, cho ghi phai tu kiem — neu khong,
 * mot resource go sai chinh ta se nam im trong CSDL va khong bao gio co hieu luc,
 * trong khi nguoi cau hinh tin rang minh vua cap quyen.
 */
function assertValidCell(cell: PermissionInput): asserts cell is {
  resource: PermissionResource;
  action: PermissionAction;
  scope: PermissionScope;
} {
  if (!(PERMISSION_RESOURCES as readonly string[]).includes(cell.resource)) {
    throw new HttpError(400, `Không có nhóm chức năng "${cell.resource}"`);
  }
  if (!(PERMISSION_ACTIONS as readonly string[]).includes(cell.action)) {
    throw new HttpError(400, `Không có thao tác "${cell.action}"`);
  }
  if (!(PERMISSION_SCOPES as readonly string[]).includes(cell.scope)) {
    throw new HttpError(400, `Không có phạm vi "${cell.scope}"`);
  }
  const allowed = RESOURCE_ACTIONS[cell.resource as PermissionResource];
  if (!allowed.includes(cell.action as PermissionAction)) {
    throw new HttpError(400, `Thao tác "${cell.action}" không áp dụng cho "${cell.resource}"`);
  }
}

/**
 * Ghi de toan bo ma tran quyen cua mot vi tri.
 *
 * Ghi de ca bang thay vi sua tung o: client gui ve trang thai no muon thay, nen
 * hai nguoi cung sua mot vi tri thi nguoi luu sau thang — de hieu hon nhieu so
 * voi viec tron hai ban sua tung o thanh mot ket qua khong ai chon.
 *
 * O `none` KHONG duoc luu: khong co dong nghia la khong co quyen. Nho vay them
 * mot resource moi trong tuong lai mac dinh la cam voi moi vi tri cu.
 */
export function setPositionPermissions(positionId: number, cells: PermissionInput[]): void {
  for (const cell of cells) assertValidCell(cell);

  db.transaction(() => {
    db.prepare('DELETE FROM position_permissions WHERE position_id = ?').run(positionId);
    const insert = db.prepare(
      'INSERT INTO position_permissions (position_id, resource, action, scope) VALUES (?, ?, ?, ?)'
    );
    for (const cell of cells) {
      if (cell.scope === 'none') continue;
      insert.run(positionId, cell.resource, cell.action, cell.scope);
    }
    assertAdminRemains();
    bumpPermissionsVersion();
  })();
}

/** Ma tran hien tai cua mot vi tri. O khong co dong duoc hieu la `none` o phia client. */
export function getPositionPermissions(positionId: number): PermissionInput[] {
  return db
    .prepare(
      'SELECT resource, action, scope FROM position_permissions WHERE position_id = ? ORDER BY resource, action'
    )
    .all(positionId) as PermissionInput[];
}
