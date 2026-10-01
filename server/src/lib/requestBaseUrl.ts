import type { Request } from 'express';
import type { Database } from 'better-sqlite3';
import { appBaseUrl } from '../services/email/emailService.ts';

/*
 * Goc URL cua CRM, dung de tinh redirect URI gui cho Google.
 *
 * Phai trung TUNG KY TU voi dong da khai bao o Google Cloud Console, nen may chu
 * tu tinh va tra ve cho man Cai dat hien ra de sao chep — khong de nguoi dung
 * tu go. Uu tien `app_base_url` da khai bao (dung sau proxy), khong thi suy tu
 * request.
 */
export function crmBaseUrl(db: Database, req: Request): string {
  const host = req.get('host');
  return appBaseUrl(db, host ? `${req.protocol}://${host}` : undefined);
}
