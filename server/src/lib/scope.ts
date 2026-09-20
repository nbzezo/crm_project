import type { Request } from 'express';
import type { PermissionAction, PermissionResource } from '@workflow/contracts';
import { HttpError } from './validate.ts';
import { accessOf } from '../middleware/currentUser.ts';

/*
 * Ghep dieu kien PHAM VI DU LIEU vao mot cau truy van.
 *
 * v39 chan theo tinh nang (vao duoc man hinh nao); day la lop thu hai — trong
 * man hinh do thay nhung dong nao.
 *
 * MOT CHO DUY NHAT dung dieu kien. 853 cau `.prepare(` trong server khong co mot
 * seam chung, nen thu duy nhat giu duoc tinh nhat quan la mot ham nho ma moi
 * module goi, cong voi mot test ma tran dem dung so dong cho tung vi tri
 * (server/src/test/dataScope.test.ts). Ky luat mot minh da tung khong du: luat
 * `org_kind = 'customer'` cung thuoc loai nay va tung bi quen o vai cho.
 */

export interface ScopeClause {
  /** Chuoi SQL de day vao mang `where`, hoac chuoi rong khi khong gioi han. */
  sql: string;
  params: unknown[];
}

const OPEN: ScopeClause = { sql: '', params: [] };

/**
 * Dieu kien cho mot cot chu so huu.
 *
 * `alias` la cot day du, vi du `d.owner_contact_id`. Truyen ca cot chu khong chi
 * bi danh bang de goi duoc ca voi bang con suy tu cha (`c.owner_contact_id` khi
 * loc `deals` qua `customers`).
 *
 * `includeNull`: ban ghi chua co chu (du lieu cu, hoac chuoi suy dan ve NULL) chi
 * hien voi nguoi co pham vi `all`. Bo sot mot ban ghi con hon giao no nham cho
 * ai do — nhung mot ban ghi vo chu thi khong bao gio bien mat han, vi luon co it
 * nhat mot nguoi (quan tri) nhin thay va giao lai duoc.
 */
export function scopeWhere(
  req: Request,
  resource: PermissionResource,
  action: PermissionAction,
  column: string
): ScopeClause {
  const visible = accessOf(req).visibleContactIds(resource, action);
  if (visible === 'all') return OPEN;
  if (visible.length === 0) {
    /* Khong thay ai — ke ca chinh minh (tai khoan chua gan vao so danh ba).
       `1 = 0` thay vi `IN ()`: SQLite khong chap nhan danh sach IN rong. */
    return { sql: '1 = 0', params: [] };
  }
  const placeholders = visible.map(() => '?').join(',');
  return { sql: `${column} IN (${placeholders})`, params: [...visible] };
}

/**
 * Nhu `scopeWhere` nhung cho ban ghi co the chua co chu.
 *
 * Dung cho bang goc co du lieu cu hoac cho chuoi suy dan qua LEFT JOIN. Dieu
 * kien PHAI o menh de WHERE kem nhanh `IS NULL`, khong duoc bien LEFT JOIN thanh
 * INNER JOIN — day la cach am tham nhat de lam mat dong.
 */
export function scopeWhereOrUnowned(
  req: Request,
  resource: PermissionResource,
  action: PermissionAction,
  column: string
): ScopeClause {
  const clause = scopeWhere(req, resource, action, column);
  if (clause.sql === '') return OPEN;
  if (clause.sql === '1 = 0') return clause;
  return { sql: `(${clause.sql} OR ${column} IS NULL)`, params: clause.params };
}

/** Ghep mot ScopeClause vao cap `where[]` / `params[]` ma cac module dang dung. */
export function pushScope(where: string[], params: unknown[], clause: ScopeClause): void {
  if (!clause.sql) return;
  where.push(clause.sql);
  params.push(...clause.params);
}

/**
 * Kiem quyen doc/ghi mot ban ghi CU THE.
 *
 * Route chi tiet (`GET /api/deals/:id`) va route ghi khong loc bang WHERE ma doc
 * thang mot dong; thieu ham nay thi chan danh sach xong van mo duoc tung ban ghi
 * bang cach doan id. Nem 404 chu khong phai 403: voi mot ban ghi nam ngoai pham
 * vi, "khong ton tai" va "khong duoc xem" phai khong phan biet duoc, neu khong
 * thi do id la biet duoc ai dang co du lieu gi.
 */
export function assertInScope(
  req: Request,
  resource: PermissionResource,
  action: PermissionAction,
  ownerContactId: number | null | undefined,
  message = 'Khong tim thay ban ghi'
): void {
  const visible = accessOf(req).visibleContactIds(resource, action);
  if (visible === 'all') return;
  if (ownerContactId == null) throw new HttpError(404, message);
  if (!visible.includes(ownerContactId)) throw new HttpError(404, message);
}

/**
 * Chu so huu mac dinh cho ban ghi moi tao.
 *
 * Nguoi tao la chu, tru khi ho chi dinh nguoi khac VA co quyen lam vay. Khong co
 * quy tac nay thi ban ghi moi se vo chu va bien mat khoi chinh man hinh cua
 * nguoi vua tao ra no.
 */
export function defaultOwner(req: Request, explicit?: number | null): number | null {
  if (explicit != null) return explicit;
  return accessOf(req).contactId;
}
