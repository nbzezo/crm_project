import type { Request } from 'express';
import type { PermissionAction } from '@workflow/contracts';
import { db } from '../db/connection.ts';
import { accessOf } from '../middleware/currentUser.ts';
import { HttpError } from './validate.ts';
import { scopeWhereOrUnowned, type ScopeClause } from './scope.ts';

/*
 * Pham vi du lieu cua "Trang tài liệu" (bang meeting_notes) — 1.28.1.
 *
 * Truoc ban nay cac route trang tai lieu chi chan theo TINH NANG (`notes`), nen
 * ai mo duoc man hinh Tai lieu la doc duoc moi trang cua moi phong, ke ca bien
 * ban hop cua co hoi minh khong phu trach.
 *
 * Mot trang thay duoc khi:
 *   1. chu trang nam trong pham vi `notes` cua nguoi xem (trang chua co chu — du
 *      lieu cu — van hien, giong man hinh Can theo doi: xem ownOrLegacy o
 *      services/focusService.ts), HOAC
 *   2. trang gan voi mot Co hoi / Du an / Khach hang ma nguoi xem thay duoc.
 *
 * Nhanh 2 la co y: bien ban hop cua mot co hoi la mot phan cua co hoi do — tab
 * "Ghi chú họp" o trang co hoi phai hien du cho moi nguoi cung lam co hoi do, ke
 * ca trang do dong nghiep viet. Cung vi vay, sua/xoa trang gan voi ban ghi can
 * quyen SUA ban ghi do, khong chi quyen doc.
 */

/** Hanh dong tren ban ghi gan kem: doc → read, moi thao tac ghi → update. */
function linkedAction(action: PermissionAction): PermissionAction {
  return action === 'read' ? 'read' : 'update';
}

/** Mot nhanh "gan voi ban ghi X ma nguoi xem thay duoc", dung subquery theo id. */
function linkedBranch(
  req: Request,
  column: string,
  table: string,
  resource: 'deals' | 'projects' | 'customers',
  action: PermissionAction
): ScopeClause {
  const clause = scopeWhereOrUnowned(req, resource, linkedAction(action), 'x.owner_contact_id');
  if (clause.sql === '') return { sql: `${column} IS NOT NULL`, params: [] };
  if (clause.sql === '1 = 0') return clause;
  return {
    sql: `${column} IN (SELECT x.id FROM ${table} x WHERE ${clause.sql})`,
    params: clause.params,
  };
}

/**
 * Dieu kien WHERE cho bang meeting_notes (bi danh `alias`). Chuoi rong khi khong
 * gioi han (pham vi `all` hoac tat xac thuc).
 */
export function meetingNoteScope(req: Request, action: PermissionAction, alias = 'm'): ScopeClause {
  const own = scopeWhereOrUnowned(req, 'notes', action, `${alias}.owner_contact_id`);
  if (own.sql === '') return own;

  const branches = [
    own,
    linkedBranch(req, `${alias}.deal_id`, 'deals', 'deals', action),
    linkedBranch(req, `${alias}.project_id`, 'projects', 'projects', action),
    linkedBranch(req, `${alias}.customer_id`, 'customers', 'customers', action),
  ].filter((branch) => branch.sql !== '1 = 0');
  if (branches.length === 0) return { sql: '1 = 0', params: [] };
  return {
    sql: `(${branches.map((branch) => branch.sql).join(' OR ')})`,
    params: branches.flatMap((branch) => branch.params),
  };
}

/**
 * Kiem mot trang CU THE (route chi tiet, sua, xoa, AI). Nem 404 chu khong phai
 * 403 — giong assertInScope: ngoai pham vi va khong ton tai phai khong phan biet
 * duoc. `includeDeleted` cho thao tac tren trang trong Thung rac.
 */
export function assertMeetingNoteInScope(
  req: Request,
  id: number,
  action: PermissionAction,
  includeDeleted = false
): void {
  if (!accessOf(req).can('notes', action === 'read' ? 'read' : action)) {
    throw new HttpError(403, 'Bạn không có quyền dùng chức năng này');
  }
  const scope = meetingNoteScope(req, action);
  const row = db
    .prepare(
      `SELECT 1 FROM meeting_notes m
        WHERE m.id = ?${includeDeleted ? '' : ' AND m.deleted_at IS NULL'}
          ${scope.sql ? `AND ${scope.sql}` : ''}`
    )
    .get(id, ...scope.params);
  if (!row) throw new HttpError(404, 'Khong tim thay trang tai lieu');
}
