import crypto from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { accessOf } from '../middleware/currentUser.ts';
import { crmBaseUrl } from '../lib/requestBaseUrl.ts';
import { HttpError, parseBody } from '../lib/validate.ts';
import { decryptSecret, encryptSecret } from '../services/ai/secretStore.ts';
import { findUserById } from '../services/auth/users.ts';
import { getEmailConfig, sendMail } from '../services/email/emailService.ts';
import { lockPinEmail } from '../services/email/templates.ts';

/*
 * Ma khoa man hinh cho (v58).
 *
 * Khoa rieng tu, KHONG phai lop xac thuc: phien dang nhap van song khi man hinh
 * khoa, nen ai mo duoc DevTools van vao duoc. Viec cua ma la che man hinh khoi
 * nguoi di ngang qua ban. Vi vay ma la PIN 4–6 so va luu ma hoa (khong bam) de
 * gui lai dung ma qua email khi nguoi dung quen.
 *
 * Van chan thu ma lien tuc va spam hop thu: bo dem trong bo nho, giong /login.
 */

const router = Router();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_VERIFY_FAILURES = 10;
const EMAIL_WINDOW_MS = 60 * 60 * 1000;
const MAX_EMAILS = 3;
const counters = new Map<string, { count: number; resetAt: number }>();

function hit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = counters.get(key);
  if (!entry || entry.resetAt < now) {
    counters.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}

function userIdOf(req: Request): number {
  const id = accessOf(req).userId;
  if (!id) throw new HttpError(400, 'Cần đăng nhập để dùng khóa màn hình');
  return id;
}

interface PinRow {
  pin_ciphertext: string;
  pin_iv: string;
  pin_tag: string;
}

function storedPin(userId: number): string | null {
  const row = db
    .prepare('SELECT pin_ciphertext, pin_iv, pin_tag FROM user_lock_pins WHERE user_id = ?')
    .get(userId) as PinRow | undefined;
  if (!row) return null;
  return decryptSecret({ ciphertext: row.pin_ciphertext, iv: row.pin_iv, tag: row.pin_tag });
}

function samePin(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/** Kiem ma hien tai truoc khi doi/tat. Sai qua nhieu lan thi chan nhu /verify. */
function assertCurrentPin(userId: number, current: string | undefined): void {
  const pin = storedPin(userId);
  if (pin === null) return;
  if (hit(`verify:${userId}`, MAX_VERIFY_FAILURES, WINDOW_MS)) {
    throw new HttpError(429, 'Nhập sai quá nhiều lần, vui lòng đợi ít phút rồi thử lại');
  }
  if (!current || !samePin(current, pin)) throw new HttpError(400, 'Mã hiện tại không đúng');
  counters.delete(`verify:${userId}`);
}

const pinSchema = z.string().regex(/^\d{4,6}$/, 'Mã gồm 4 đến 6 chữ số');

router.get('/', (req, res) => {
  const userId = userIdOf(req);
  const user = findUserById(userId);
  res.json({
    has_pin: storedPin(userId) !== null,
    /* Nut "Gui ma qua email" chi co nghia khi tai khoan co email va may chu gui
       duoc thu; khong thi man khoa chi con loi thoat Dang xuat. */
    can_email: Boolean(user?.email) && getEmailConfig(db).ready,
  });
});

const setSchema = z.object({ pin: pinSchema, current_pin: z.string().max(6).optional() });

/** Dat ma moi, hoac doi ma (khi da co ma thi bat buoc dung `current_pin`). */
router.put('/pin', (req, res) => {
  const userId = userIdOf(req);
  const body = parseBody(setSchema, req);
  assertCurrentPin(userId, body.current_pin);
  const sealed = encryptSecret(body.pin);
  db.prepare(
    `INSERT INTO user_lock_pins (user_id, pin_ciphertext, pin_iv, pin_tag, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       pin_ciphertext = excluded.pin_ciphertext,
       pin_iv = excluded.pin_iv,
       pin_tag = excluded.pin_tag,
       updated_at = excluded.updated_at`
  ).run(userId, sealed.ciphertext, sealed.iv, sealed.tag);
  res.json({ has_pin: true });
});

const removeSchema = z.object({ current_pin: z.string().max(6) });

router.post('/pin/remove', (req, res) => {
  const userId = userIdOf(req);
  const body = parseBody(removeSchema, req);
  assertCurrentPin(userId, body.current_pin);
  db.prepare('DELETE FROM user_lock_pins WHERE user_id = ?').run(userId);
  res.json({ has_pin: false });
});

const verifySchema = z.object({ pin: z.string().max(6) });

router.post('/verify', (req, res) => {
  const userId = userIdOf(req);
  const { pin } = parseBody(verifySchema, req);
  const stored = storedPin(userId);
  if (stored === null) {
    res.json({ ok: true });
    return;
  }
  if (hit(`verify:${userId}`, MAX_VERIFY_FAILURES, WINDOW_MS)) {
    throw new HttpError(429, 'Nhập sai quá nhiều lần, vui lòng đợi ít phút rồi thử lại');
  }
  const ok = samePin(pin, stored);
  if (ok) counters.delete(`verify:${userId}`);
  res.json({ ok });
});

/** Gui lai DUNG ma dang dung vao email tai khoan — khong doi ma. */
router.post('/send-pin', async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const user = findUserById(userId);
    const pin = storedPin(userId);
    if (pin === null) throw new HttpError(400, 'Bạn chưa đặt mã khóa màn hình');
    if (!user?.email) throw new HttpError(400, 'Tài khoản chưa có email');
    if (!getEmailConfig(db).ready) {
      throw new HttpError(400, 'Máy chủ chưa cấu hình gửi email. Hãy đăng xuất rồi đăng nhập lại.');
    }
    if (hit(`email:${userId}`, MAX_EMAILS, EMAIL_WINDOW_MS)) {
      throw new HttpError(429, 'Đã gửi mã nhiều lần trong giờ qua, vui lòng kiểm tra hộp thư');
    }
    await sendMail(db, lockPinEmail(user.email, user.full_name ?? '', pin, crmBaseUrl(db, req)));
    res.json({ sent_to: maskEmail(user.email) });
  } catch (err) {
    next(err);
  }
});

/** an@congty.vn -> a•@congty.vn: nguoi dung nhan ra hop thu, nguoi dung ngoai thi khong. */
function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain) return email;
  const head = name.slice(0, Math.min(2, Math.max(1, name.length - 1)));
  return `${head}${'•'.repeat(Math.max(1, name.length - head.length))}@${domain}`;
}

export default router;
