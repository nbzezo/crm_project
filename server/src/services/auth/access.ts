import {
  permissionKey,
  widerScope,
  type PermissionAction,
  type PermissionMap,
  type PermissionResource,
  type PermissionScope,
} from '@workflow/contracts';
import { db } from '../../db/connection.ts';

/*
 * Tinh quyen va pham vi du lieu cua mot nguoi dung.
 *
 * Hai cau hoi khac nhau, dung chung mot nguon:
 *
 *   can()      — "duoc dung tinh nang nay khong". Chan o middleware, tra 403.
 *   scopeFor() — "duoc thay du lieu CUA AI". Tra ve mot tap contact id, hoac
 *                'all' khi khong gioi han.
 *
 * KHONG CACHE XUYEN REQUEST. Doi mot o trong ma tran quyen la request ke tiep cua
 * nguoi do da theo quyen moi — khong phai dang xuat, khong phai cho het phien.
 * Mot cache quyen la mot nguon lech, va lech o day nghia la ai do nhin thay du
 * lieu khong duoc phep. Trong PHAM VI mot request thi co nho lai (xem `Access`),
 * vi mot request co the hoi cung mot cau nhieu lan.
 */

export interface Access {
  /** 0 khi chay o che do tat xac thuc (test). */
  userId: number;
  /** Dong `contacts` cua nguoi nay. null khi tai khoan chua gan vao so danh ba. */
  contactId: number | null;
  /** Don vi nguoi nay ngoi. null khi chua xep vao so do to chuc. */
  orgUnitId: number | null;
  /** Ma tran quyen da gop tu moi vi tri dang giu. */
  permissions: PermissionMap;
  can(resource: PermissionResource, action: PermissionAction): boolean;
  scopeOf(resource: PermissionResource, action: PermissionAction): PermissionScope;
  /**
   * Tap contact id ma nguoi nay duoc nhin du lieu cua ho, cho mot quyen cu the.
   *
   * Tra ve contact id chu khong phai user id de khop voi cac cot `*_contact_id`
   * da co san khap schema (assignee_contact_id, owner_contact_id, actor_contact_id).
   * Mang RONG nghia la khong thay gi — khac han 'all'.
   */
  visibleContactIds(resource: PermissionResource, action: PermissionAction): 'all' | number[];
}

interface PositionRow {
  position_id: number;
  scope_unit_id: number | null;
}

/**
 * Gop ma tran quyen cua moi vi tri mot nguoi dang giu.
 *
 * Giu mot vi tri thi duoc quyen cua vi tri do; giu hai thi duoc pham vi RONG HON
 * o tung o. Giu them mot vi tri khong bao gio lam ai mat quyen — neu khong, gan
 * kiem nhiem cho mot Truong phong se am tham thu hep quyen cua ho.
 */
export function loadPermissions(userId: number): PermissionMap {
  const rows = db
    .prepare(
      `SELECT pp.resource, pp.action, pp.scope
         FROM user_positions up
         JOIN position_permissions pp ON pp.position_id = up.position_id
        WHERE up.user_id = ?`
    )
    .all(userId) as {
    resource: PermissionResource;
    action: PermissionAction;
    scope: PermissionScope;
  }[];

  const map: PermissionMap = {};
  for (const row of rows) {
    const key = permissionKey(row.resource, row.action);
    const current = map[key];
    map[key] = current ? widerScope(current, row.scope) : row.scope;
  }
  return map;
}

/**
 * Mot don vi va toan bo don vi con, o moi do sau.
 *
 * Dung recursive CTE thay vi mot bang closure: bang closure la mot ban sao cua
 * cay, va moi ban sao la mot thu phai duoc cap nhat dung luc — quen mot lan la
 * co nguoi nhin thay nham mot nhanh. Cay don vi cua mot cong ty chi vai chuc
 * node nen truy van nay khong dang de danh doi lay rui ro do.
 */
export function unitSubtree(rootUnitId: number): number[] {
  const rows = db
    .prepare(
      `WITH RECURSIVE sub(id) AS (
         SELECT id FROM org_units WHERE id = ?
         UNION
         SELECT o.id FROM org_units o JOIN sub ON o.parent_id = sub.id
       )
       SELECT id FROM sub`
    )
    .all(rootUnitId) as { id: number }[];
  return rows.map((row) => row.id);
}

function contactsInUnits(unitIds: number[]): number[] {
  if (unitIds.length === 0) return [];
  const placeholders = unitIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT id FROM contacts WHERE org_unit_id IN (${placeholders})`)
    .all(...unitIds) as { id: number }[];
  return rows.map((row) => row.id);
}

/**
 * Cac don vi mot nguoi "dung dau", da tinh ca kiem nhiem.
 *
 * Mac dinh la don vi ho ngoi (`contacts.org_unit_id`) — don vi mot quan ly quan
 * ly CHINH LA don vi ho ngoi, do la thu lam cho "them mot cap" chi la them mot
 * node. `user_positions.scope_unit_id` ghi de cho truong hop kiem nhiem mot don
 * vi khac, va KHONG thay the don vi goc: nguoi kiem nhiem van phu trach cho cu.
 */
function scopeUnitsOf(positions: PositionRow[], ownUnitId: number | null): number[] {
  const units = new Set<number>();
  if (ownUnitId != null) units.add(ownUnitId);
  for (const row of positions) {
    if (row.scope_unit_id != null) units.add(row.scope_unit_id);
  }
  return [...units];
}

export function buildAccess(userId: number, contactId: number | null): Access {
  const orgUnitId =
    contactId == null
      ? null
      : ((
          db.prepare('SELECT org_unit_id FROM contacts WHERE id = ?').get(contactId) as
            { org_unit_id: number | null } | undefined
        )?.org_unit_id ?? null);

  const positions = db
    .prepare('SELECT position_id, scope_unit_id FROM user_positions WHERE user_id = ?')
    .all(userId) as PositionRow[];

  const permissions = loadPermissions(userId);
  const scopeUnits = scopeUnitsOf(positions, orgUnitId);

  /* Nho lai trong PHAM VI mot request: mot endpoint co the hoi cung mot quyen o
     nhieu cho (kiem tra dau vao, loc danh sach, dem tong). Cache nay chet cung
     voi request nen khong bao gio cu. */
  const visibleCache = new Map<string, 'all' | number[]>();

  const scopeOf = (resource: PermissionResource, action: PermissionAction): PermissionScope =>
    permissions[permissionKey(resource, action)] ?? 'none';

  return {
    userId,
    contactId,
    orgUnitId,
    permissions,
    scopeOf,
    can: (resource, action) => scopeOf(resource, action) !== 'none',
    visibleContactIds(resource, action) {
      const key = permissionKey(resource, action);
      const cached = visibleCache.get(key);
      if (cached) return cached;

      const scope = scopeOf(resource, action);
      let result: 'all' | number[];
      if (scope === 'all') {
        result = 'all';
      } else if (scope === 'none') {
        result = [];
      } else if (scope === 'own') {
        result = contactId == null ? [] : [contactId];
      } else {
        const units = scope === 'unit' ? scopeUnits : scopeUnits.flatMap(unitSubtree);
        const ids = new Set(contactsInUnits(units));
        /* Luon thay du lieu CUA CHINH MINH, ke ca khi chua duoc xep vao don vi
           nao. Khong co dong nay thi mot nhan vien moi vao, chua ai xep phong,
           se mo he thong len va thay trong tron — ke ca viec ho tu tao. */
        if (contactId != null) ids.add(contactId);
        result = [...ids];
      }

      visibleCache.set(key, result);
      return result;
    },
  };
}

/**
 * Quyen tuyet doi, dung khi TAT xac thuc (`createApp({ auth: false })`).
 *
 * Toan bo integration test chay o che do do. Khong co doi tuong nay thi moi test
 * cu se do cung luc khi them lop phan quyen — mat luoi an toan dung vao luc can
 * no nhat. Day KHONG phai mot duong vong: no chi ton tai khi lop dang nhap da bi
 * tat tu dau, tuc la khong co gi de vong qua.
 */
export const SYSTEM_ACCESS: Access = {
  userId: 0,
  contactId: null,
  orgUnitId: null,
  permissions: {},
  can: () => true,
  scopeOf: () => 'all',
  visibleContactIds: () => 'all',
};

/** Moc phien ban quyen — client so lech de biet khi nao phai nap lai menu. */
export function permissionsVersion(): number {
  const row = db
    .prepare(`SELECT value FROM app_settings WHERE key = 'permissions.version'`)
    .get() as { value: string } | undefined;
  return Number(row?.value ?? 1);
}

export function bumpPermissionsVersion(): void {
  db.prepare(
    `UPDATE app_settings
        SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT),
            updated_at = datetime('now','localtime')
      WHERE key = 'permissions.version'`
  ).run();
}
