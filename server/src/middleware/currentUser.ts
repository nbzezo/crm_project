import type { NextFunction, Request, Response } from 'express';
import { db } from '../db/connection.ts';

/*
 * Gan danh tinh cua nguoi dang dang nhap vao request.
 *
 * Truoc v37, cau hoi "toi la ai" duoc tra loi bang co singleton `contacts.is_me`
 * — dung duoc dung mot lan trong toan he thong. Moi cho can biet "toi" (mac dinh
 * nguoi phu trach, bo loc Viec cua toi, actor cua nhat ky thay doi) deu tu chay
 * mot cau SELECT rieng vao co do. Tu day tat ca doc `req.currentUser.contactId`.
 *
 * Mount NGAY SAU requireAuth trong app.ts. Dot 2 se mo rong chinh doi tuong nay
 * thanh AccessContext (them `can()` va `scopeFor()`); giu ten rieng o buoc nay de
 * thay doi sau khong keo theo viec sua lai moi cho goi.
 *
 * KHI TAT XAC THUC (`createApp({ auth: false })`, dung trong toan bo integration
 * test) khong co phien nao ca. Khi do middleware lui ve `contacts.is_me` de cac
 * test cu giu nguyen hanh vi. Day la cho DUY NHAT con doc `is_me`; no bien mat
 * cung voi cot do o Dot 3.
 */

export interface CurrentUser {
  /** 0 khi chay o che do tat xac thuc (test). */
  userId: number;
  /** Dong `contacts` cua nguoi nay. null khi tai khoan chua duoc gan vao so danh ba. */
  contactId: number | null;
}

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
    req.currentUser = { userId, contactId: row?.contact_id ?? null };
  } else {
    req.currentUser = { userId: 0, contactId: fallbackContactId() };
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
