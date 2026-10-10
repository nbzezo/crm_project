import type { Request } from 'express';
import { db } from '../db/connection.ts';
import { HttpError } from '../lib/validate.ts';
import { accessOf } from '../middleware/currentUser.ts';

/*
 * Bang tin nhom (v68) — ai thuoc nhom nao, ai quan tri nhom nao.
 *
 * Thanh vien cua ba loai nhom tu dong (company / unit / project) TINH KHI DOC tu
 * so do to chuc va du an, khong chep vao bang: chep thi phai nho dong bo moi lan
 * ai do chuyen phong, nhan viec hay roi du an — va mot lan quen la mot nguoi doc
 * duoc tin noi bo cua phong ho da roi di. `feed_group_members` chi giu ngoai le
 * (nguoi ngoai duoc them vao, vai tro quan tri) va toan bo thanh vien nhom tu lap.
 *
 * MOT CHO DUY NHAT tra loi "toi thuoc nhom nao": `memberGroupsSql`. Ca bang tin,
 * tai xuong tep dinh kem va kho tai lieu (lib/documentScope.ts) deu di qua no.
 */

export type GroupKind = 'company' | 'unit' | 'project' | 'custom';
export type GroupRole = 'admin' | 'moderator' | 'member';

export interface GroupRow {
  id: number;
  kind: GroupKind;
  name: string;
  description: string;
  color: string | null;
  org_unit_id: number | null;
  project_id: number | null;
  visibility: 'public' | 'private';
  posting: 'all' | 'admins';
  require_approval: number;
  created_by_contact_id: number | null;
  is_archived: number;
  created_at: string;
}

/** Nhan su dang lam viec: contact co tai khoan dang hoat dong. */
const STAFF = `SELECT u.contact_id FROM users u WHERE u.is_active = 1 AND u.contact_id IS NOT NULL`;

/**
 * Tao/dong bo nhom tu dong: mot nhom Toan cong ty, mot nhom moi don vi dang hoat
 * dong, mot nhom moi du an chua luu tru. Ten di theo ten nguon. Don vi ngung hoat
 * dong / du an luu tru thi nhom luu tru theo (bai cu van con, khong mat).
 *
 * Chay moi lan mo bang tin — vai cau INSERT ... WHERE NOT EXISTS re hon nhieu so
 * voi viec moc vao moi duong tao don vi / du an (co it nhat ba duong).
 */
export function ensureAutoGroups(): void {
  db.transaction(() => {
    db.prepare(
      `INSERT INTO feed_groups (kind, name, description, posting)
       SELECT 'company', 'Toàn công ty', 'Tin chung của cả công ty.', 'all'
        WHERE NOT EXISTS (SELECT 1 FROM feed_groups WHERE kind = 'company')`
    ).run();
    db.prepare(
      `INSERT INTO feed_groups (kind, name, org_unit_id)
       SELECT 'unit', u.name, u.id FROM org_units u
        WHERE u.is_active = 1 AND u.parent_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM feed_groups g WHERE g.org_unit_id = u.id)`
    ).run();
    db.prepare(
      `UPDATE feed_groups
          SET name = (SELECT name FROM org_units WHERE id = feed_groups.org_unit_id),
              is_archived = 1 - (SELECT is_active FROM org_units WHERE id = feed_groups.org_unit_id),
              updated_at = datetime('now','localtime')
        WHERE kind = 'unit'
          AND (name <> (SELECT name FROM org_units WHERE id = feed_groups.org_unit_id)
               OR is_archived <> 1 - (SELECT is_active FROM org_units WHERE id = feed_groups.org_unit_id))`
    ).run();
    db.prepare(
      `INSERT INTO feed_groups (kind, name, project_id)
       SELECT 'project', p.name, p.id FROM projects p
        WHERE p.is_archived = 0
          AND NOT EXISTS (SELECT 1 FROM feed_groups g WHERE g.project_id = p.id)`
    ).run();
    db.prepare(
      `UPDATE feed_groups
          SET name = (SELECT name FROM projects WHERE id = feed_groups.project_id),
              is_archived = (SELECT is_archived FROM projects WHERE id = feed_groups.project_id),
              updated_at = datetime('now','localtime')
        WHERE kind = 'project'
          AND (name <> (SELECT name FROM projects WHERE id = feed_groups.project_id)
               OR is_archived <> (SELECT is_archived FROM projects WHERE id = feed_groups.project_id))`
    ).run();
  })();
}

/**
 * `SELECT id` cac nhom (chua luu tru) ma contact nay la thanh vien. Dung de nhung
 * vao `IN (...)`. Tra ve `SELECT NULL WHERE 0` khi khong co contact.
 *
 * Viec thuoc du an qua BANG chua no (v19) — cards khong co cot du an rieng.
 */
export function memberGroupsSql(contactId: number | null): { sql: string; params: unknown[] } {
  if (contactId == null) return { sql: 'SELECT NULL WHERE 0', params: [] };
  return {
    sql: `SELECT g.id FROM feed_groups g
           WHERE g.is_archived = 0 AND (
                 g.kind = 'company'
              OR (g.kind = 'unit' AND g.org_unit_id IN (
                    WITH RECURSIVE up(id, parent_id) AS (
                      SELECT u.id, u.parent_id FROM org_units u
                       WHERE u.id = (SELECT org_unit_id FROM contacts WHERE id = ?)
                      UNION ALL
                      SELECT u.id, u.parent_id FROM org_units u JOIN up ON u.id = up.parent_id
                    ) SELECT id FROM up))
              OR (g.kind = 'project' AND g.project_id IN (
                    SELECT p.id FROM projects p WHERE p.owner_contact_id = ?
                    UNION SELECT b.project_id FROM cards k
                      JOIN lists l ON l.id = k.list_id JOIN boards b ON b.id = l.board_id
                     WHERE k.assignee_contact_id = ? AND b.project_id IS NOT NULL AND k.is_archived = 0))
              OR g.id IN (SELECT m.group_id FROM feed_group_members m WHERE m.contact_id = ?))`,
    params: [contactId, contactId, contactId, contactId],
  };
}

export function myGroupIds(contactId: number | null): number[] {
  const { sql, params } = memberGroupsSql(contactId);
  return (db.prepare(sql).all(...params) as { id: number }[]).map((row) => row.id);
}

/** Quan tri he thong (quan tri so do to chuc) quan ly duoc moi nhom. */
export function isFeedSuperAdmin(req: Request): boolean {
  return accessOf(req).can('admin.org', 'update');
}

export function loadGroup(id: number): GroupRow {
  const group = db.prepare(`SELECT * FROM feed_groups WHERE id = ?`).get(id) as
    GroupRow | undefined;
  if (!group) throw new HttpError(404, 'Không tìm thấy nhóm');
  return group;
}

export function isMember(group: GroupRow, contactId: number | null): boolean {
  if (contactId == null || group.is_archived) return false;
  const { sql, params } = memberGroupsSql(contactId);
  return Boolean(db.prepare(`SELECT 1 FROM (${sql}) WHERE id = ?`).get(...params, group.id));
}

/**
 * Vai tro cua nguoi dang xem trong nhom, hoac null neu khong thuoc nhom.
 *
 * Quan tri tu nhien: truong don vi voi nhom don vi, chu du an voi nhom du an,
 * nguoi lap voi nhom tu lap. Mot dong `feed_group_members` co the nang vai tro.
 */
export function roleOf(req: Request, group: GroupRow): GroupRole | null {
  const me = accessOf(req).contactId;
  if (isFeedSuperAdmin(req)) return 'admin';
  if (me == null) return null;
  const manual = db
    .prepare(`SELECT role FROM feed_group_members WHERE group_id = ? AND contact_id = ?`)
    .get(group.id, me) as { role: GroupRole } | undefined;
  if (manual?.role === 'admin') return 'admin';
  if (group.kind === 'unit') {
    const head = db
      .prepare(`SELECT head_contact_id FROM org_units WHERE id = ?`)
      .get(group.org_unit_id) as { head_contact_id: number | null } | undefined;
    if (head?.head_contact_id === me) return 'admin';
  }
  if (group.kind === 'project') {
    const owner = db
      .prepare(`SELECT owner_contact_id FROM projects WHERE id = ?`)
      .get(group.project_id) as { owner_contact_id: number | null } | undefined;
    if (owner?.owner_contact_id === me) return 'admin';
  }
  if (group.kind === 'custom' && group.created_by_contact_id === me) return 'admin';
  if (manual) return manual.role;
  return isMember(group, me) ? 'member' : null;
}

/**
 * Xem duoc bai cua nhom khong: thanh vien, quan tri he thong, hoac nhom tu lap
 * cong khai (nguoi ngoai doc duoc truoc khi tham gia — nhu nhom Facebook).
 * Nhom phong ban / du an thi KHONG cong khai cho phong khac.
 */
export function canViewGroup(req: Request, group: GroupRow): boolean {
  if (isFeedSuperAdmin(req)) return true;
  if (group.kind === 'custom' && group.visibility === 'public' && !group.is_archived) return true;
  return isMember(group, accessOf(req).contactId);
}

export function assertCanView(req: Request, group: GroupRow): void {
  /* 404 chu khong phai 403: nhom kin cua nguoi khac phai nhu khong ton tai. */
  if (!canViewGroup(req, group)) throw new HttpError(404, 'Không tìm thấy nhóm');
}

export function requireContact(req: Request): number {
  const me = accessOf(req).contactId;
  if (me == null) {
    throw new HttpError(
      403,
      'Tài khoản của bạn chưa gắn với hồ sơ nhân sự nên chưa dùng được Bảng tin. Nhờ quản trị gắn hồ sơ trong Cài đặt → Người dùng.'
    );
  }
  return me;
}

export interface MemberRow {
  contact_id: number;
  full_name: string;
  title: string | null;
  unit_name: string | null;
  role: GroupRole;
  source: 'auto' | 'manual';
}

/** Danh sach thanh vien day du (tu dong + them tay) cua mot nhom. */
export function groupMembers(group: GroupRow): MemberRow[] {
  let autoSql = '';
  let autoParams: unknown[] = [];
  if (group.kind === 'company') {
    autoSql = `SELECT contact_id AS id FROM (${STAFF})`;
  } else if (group.kind === 'unit') {
    autoSql = `SELECT c.id FROM contacts c
                WHERE c.id IN (${STAFF}) AND c.org_unit_id IN (
                  WITH RECURSIVE down(id) AS (
                    SELECT ? UNION ALL SELECT u.id FROM org_units u JOIN down ON u.parent_id = down.id
                  ) SELECT id FROM down)`;
    autoParams = [group.org_unit_id];
  } else if (group.kind === 'project') {
    autoSql = `SELECT owner_contact_id AS id FROM projects WHERE id = ? AND owner_contact_id IS NOT NULL
               UNION SELECT k.assignee_contact_id FROM cards k
                 JOIN lists l ON l.id = k.list_id JOIN boards b ON b.id = l.board_id
                WHERE b.project_id = ? AND k.assignee_contact_id IS NOT NULL AND k.is_archived = 0`;
    autoParams = [group.project_id, group.project_id];
  }
  const rows = db
    .prepare(
      `WITH auto(id) AS (${autoSql || 'SELECT NULL WHERE 0'}),
            manual AS (SELECT contact_id AS id, role FROM feed_group_members WHERE group_id = ?),
            everyone(id) AS (SELECT id FROM auto UNION SELECT id FROM manual)
       SELECT c.id AS contact_id, c.full_name, c.title, u.name AS unit_name,
              COALESCE(m.role, 'member') AS role,
              CASE WHEN c.id IN (SELECT id FROM auto) THEN 'auto' ELSE 'manual' END AS source
         FROM everyone e
         JOIN contacts c ON c.id = e.id
         LEFT JOIN org_units u ON u.id = c.org_unit_id
         LEFT JOIN manual m ON m.id = c.id
        ORDER BY c.full_name COLLATE NOCASE`
    )
    .all(...autoParams, group.id) as MemberRow[];

  /* Quan tri tu nhien (truong don vi / chu du an / nguoi lap) hien vai tro dung. */
  let naturalAdmin: number | null = null;
  if (group.kind === 'unit') {
    naturalAdmin =
      (
        db.prepare(`SELECT head_contact_id FROM org_units WHERE id = ?`).get(group.org_unit_id) as
          { head_contact_id: number | null } | undefined
      )?.head_contact_id ?? null;
  } else if (group.kind === 'project') {
    naturalAdmin =
      (
        db.prepare(`SELECT owner_contact_id FROM projects WHERE id = ?`).get(group.project_id) as
          { owner_contact_id: number | null } | undefined
      )?.owner_contact_id ?? null;
  } else if (group.kind === 'custom') {
    naturalAdmin = group.created_by_contact_id;
  }
  for (const row of rows) if (row.contact_id === naturalAdmin) row.role = 'admin';
  return rows;
}

export function memberCount(group: GroupRow): number {
  return groupMembers(group).length;
}
