import type { NextFunction, Request, Response } from 'express';
import type { PermissionAction, PermissionResource } from '@workflow/contracts';
import { db } from '../db/connection.ts';
import { HttpError } from '../lib/validate.ts';
import { buildAccess, SYSTEM_ACCESS, type Access } from '../services/auth/access.ts';

/*
 * Gan danh tinh VA quyen cua nguoi dang dang nhap vao request.
 *
 * Truoc v38, cau hoi "toi la ai" duoc tra loi bang co singleton `contacts.is_me`
 * — dung duoc dung mot lan trong toan he thong. Moi cho can biet "toi" (mac dinh
 * nguoi phu trach, bo loc Viec cua toi, actor cua nhat ky thay doi) deu tu chay
 * mot cau SELECT rieng vao co do. Tu day tat ca doc `req.currentUser`.
 *
 * v39 mo rong chinh doi tuong do thanh `Access` (them `can()` va
 * `visibleContactIds()`) thay vi dat canh no mot doi tuong thu hai — hai nguon
 * tra loi "nguoi nay la ai va duoc lam gi" se lech nhau vao mot luc nao do.
 *
 * Mount NGAY SAU requireAuth trong app.ts, TRUOC moi router nghiep vu.
 *
 * KHI TAT XAC THUC (`createApp({ auth: false })`, dung trong toan bo integration
 * test) khong co phien nao ca. Khi do middleware dung SYSTEM_ACCESS va lui ve
 * `contacts.is_me` cho danh tinh, de cac test cu giu nguyen hanh vi. Day la cho
 * DUY NHAT con doc `is_me`; no bien mat cung voi cot do o dot phan quyen du lieu.
 */

export type CurrentUser = Access;

function fallbackContactId(): number | null {
  const me = db.prepare(`SELECT id FROM contacts WHERE is_me = 1 AND is_active = 1`).get() as
    { id: number } | undefined;
  return me?.id ?? null;
}

export function attachCurrentUser(req: Request, _res: Response, next: NextFunction): void {
  const userId = req.session?.userId;
  if (userId) {
    const row = db.prepare('SELECT contact_id FROM users WHERE id = ?').get(userId) as
      { contact_id: number | null } | undefined;
    req.currentUser = buildAccess(userId, row?.contact_id ?? null);
  } else {
    req.currentUser = { ...SYSTEM_ACCESS, contactId: fallbackContactId() };
  }
  next();
}

/**
 * Contact cua nguoi dang thao tac.
 *
 * Dung o moi cho truoc day hoi `contacts.is_me`. Tra ve null khi tai khoan chua
 * gan contact — khuyet nguoi thuc hien van tot hon la gan bua cho mot nguoi bat
 * ky, dung lap luan da ghi trong lib/changeLog.ts tu v24.
 */
export function actorContactId(req: Request): number | null {
  return req.currentUser?.contactId ?? null;
}

/** Quyen cua request hien tai. Nem khi middleware chua chay — do la loi lap trinh. */
export function accessOf(req: Request): Access {
  if (!req.currentUser) throw new Error('attachCurrentUser chua chay truoc route nay');
  return req.currentUser;
}

/**
 * Chan ca mot router theo mot quyen cu the.
 *
 * Tra 403 chu khong phai 404: nguoi dung DA dang nhap va endpoint co that; giau
 * di chi lam ho tuong he thong hong. 401 danh rieng cho "chua dang nhap".
 *
 * Day la lop chan TINH NANG. Lop chan DU LIEU (ai thay ban ghi cua ai) la
 * `visibleContactIds` va duoc ghep vao tung truy van o dot ke tiep — hai lop doc
 * lap, va mot endpoint mo khong co nghia la moi dong deu hien ra.
 */
export function requirePermission(resource: PermissionResource, action: PermissionAction) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (accessOf(req).can(resource, action)) {
      next();
      return;
    }
    next(new HttpError(403, 'Bạn không có quyền dùng chức năng này'));
  };
}

/*
 * Chan theo METHOD: doc can `read`, ghi can action tuong ung.
 *
 * Gan het router deu la CRUD tren mot resource, nen mot middleware duy nhat thay
 * cho viec rai `requirePermission` len tung route — va quan trong hon, khong the
 * quen mot route moi them vao sau nay. Router nao lech khoi khuon nay (vi du POST
 * chi de doc) thi khai bao rieng bang `requirePermission`.
 */
const METHOD_ACTION: Record<string, PermissionAction> = {
  GET: 'read',
  HEAD: 'read',
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

export function requireResource(resource: PermissionResource) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const action = METHOD_ACTION[req.method] ?? 'read';
    if (accessOf(req).can(resource, action)) {
      next();
      return;
    }
    next(new HttpError(403, 'Bạn không có quyền dùng chức năng này'));
  };
}
