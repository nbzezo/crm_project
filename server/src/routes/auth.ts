import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { HttpError, parseBody } from '../lib/validate.ts';
import {
  deleteUserSessions,
  findUserById,
  findUserByLogin,
  getPublicUser,
  setPassword,
  touchLastLogin,
} from '../services/auth/users.ts';
import { verifyPassword } from '../services/auth/passwords.ts';
import { consumeToken, issueToken, purgeExpiredTokens, resolveToken } from '../services/auth/tokens.ts';
import { appBaseUrl, sendMail } from '../services/email/emailService.ts';
import { resetEmail } from '../services/email/templates.ts';

const router = Router();

/* ---------- Chan thu dang nhap lien tuc (brute-force) ----------

   Dem theo CA HAI truc, va mot trong hai vuot nguong la chan:

   - theo IP: chong mot may quet nhieu tai khoan;
   - theo email: chong mot mang may (hoac mot proxy doi IP) don vao dung mot tai
     khoan. Truoc v37 he thong chi co mot tai khoan nen dem theo IP la du; voi
     nhieu nguoi dung, bo dem theo IP mot minh bao ve dung... cai IP do.

   Bo dem nam trong bo nho: ung dung chay mot tien trinh, va mat bo dem khi khoi
   dong lai la chap nhan duoc — khoi dong lai khong phai thu ma ke tan cong dieu
   khien duoc. */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, { count: number; resetAt: number }>();

function hitRateLimit(key: string, max = MAX_ATTEMPTS): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}

function clearRateLimit(...keys: string[]): void {
  for (const key of keys) attempts.delete(key);
}

function promisify(fn: (cb: (err?: unknown) => void) => void): Promise<void> {
  return new Promise((resolve, reject) => fn((err) => (err ? reject(err) : resolve())));
}

/** Goc URL ma nguoi dung dang mo, dung khi chua khai bao app_base_url o Cai dat. */
function requestOrigin(req: Request): string {
  const proto = req.protocol;
  const host = req.get('host');
  return host ? `${proto}://${host}` : 'http://localhost:5173';
}

async function startSession(req: Request, userId: number, username: string): Promise<void> {
  // Doi session id sau khi dang nhap de chong co dinh phien (session fixation).
  await promisify((cb) => req.session.regenerate(cb));
  req.session.userId = userId;
  req.session.username = username;
  await promisify((cb) => req.session.save(cb));
}

/* ---------- Dang nhap ---------- */

const credentialsSchema = z.object({
  /* Ten o van la `username` de client cu khong vo; gia tri thi nhan ca email lan
     ten dang nhap (xem findUserByLogin). */
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
});

router.post('/login', async (req, res, next) => {
  try {
    const ip = req.ip ?? 'unknown';
    const body = parseBody(credentialsSchema, req);
    const login = body.username.trim().toLowerCase();

    if (hitRateLimit(`ip:${ip}`) || hitRateLimit(`login:${login}`)) {
      throw new HttpError(429, 'Thử đăng nhập quá nhiều lần, vui lòng đợi ít phút rồi thử lại');
    }

    const user = findUserByLogin(body.username);
    const ok =
      user && user.password_hash
        ? await verifyPassword(body.password, user.password_hash, user.password_salt)
        : false;

    /* Tai khoan bi khoa tra ve dung thong bao "sai email hoac mat khau" nhu moi
       truong hop khac: noi ro "tai khoan da bi khoa" la xac nhan email do co
       that. Nguoi bi khoa that su se hoi quan tri, khong doan qua man dang nhap. */
    if (!user || !ok || !user.is_active) {
      throw new HttpError(401, 'Sai email hoặc mật khẩu');
    }

    clearRateLimit(`ip:${ip}`, `login:${login}`);
    await startSession(req, user.id, user.username);
    touchLastLogin(user.id);
    res.json(getPublicUser(user.id));
  } catch (err) {
    next(err);
  }
});

router.get('/me', (req, res) => {
  const userId = req.session?.userId;
  if (!userId) throw new HttpError(401, 'Chua dang nhap');
  const user = getPublicUser(userId);
  /* Phien con song nhung tai khoan da bi xoa hoac khoa giua chung: coi nhu chua
     dang nhap, de client dua ve man dang nhap thay vi hien mot vo rong. */
  if (!user || !user.is_active) throw new HttpError(401, 'Chua dang nhap');
  res.json(user);
});

router.post('/logout', async (req, res, next) => {
  try {
    await promisify((cb) => req.session.destroy(cb));
    res.clearCookie('sid');
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/* ---------- Doi mat khau khi dang dang nhap ---------- */

const passwordChangeSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8).max(200),
});

router.patch('/password', async (req, res, next) => {
  try {
    const userId = req.session?.userId;
    if (!userId) throw new HttpError(401, 'Chua dang nhap');

    const body = parseBody(passwordChangeSchema, req);
    const user = findUserById(userId);
    if (!user) throw new HttpError(401, 'Chua dang nhap');
    if (!(await verifyPassword(body.current_password, user.password_hash, user.password_salt))) {
      throw new HttpError(400, 'Mật khẩu hiện tại không đúng');
    }

    await setPassword(userId, body.new_password);
    /* Dang xuat moi thiet bi KHAC cua chinh nguoi nay. Truoc v37 cau lenh o day la
       `DELETE FROM sessions` — xoa sach, tuc la doi mat khau cua mot nguoi se da
       moi nguoi khac ra ngoai. */
    deleteUserSessions(userId);
    await startSession(req, user.id, user.username);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ---------- Quen mat khau ---------- */

const forgotSchema = z.object({ email: z.string().min(1).max(200) });

/**
 * LUON tra ve 204, ke ca khi email khong ton tai.
 *
 * Phan biet "da gui" voi "khong co tai khoan nao" bien endpoint nay thanh mot
 * cong cu do email nao co trong he thong. Ben goi khong duoc biet; nguoi that su
 * so huu hop thu se thay thu, con nguoi khac thi khong hoc duoc gi.
 *
 * Van gioi han so lan theo IP va theo email — khong de ai dung day de dem email
 * cua nguoi khac bang toc do phan hoi hay de spam hop thu nguoi khac.
 */
router.post('/forgot-password', async (req, res, next) => {
  try {
    const ip = req.ip ?? 'unknown';
    const { email } = parseBody(forgotSchema, req);
    const normalized = email.trim().toLowerCase();

    if (hitRateLimit(`forgot-ip:${ip}`, 10) || hitRateLimit(`forgot:${normalized}`, 3)) {
      res.status(204).end();
      return;
    }

    purgeExpiredTokens();
    const user = findUserByLogin(email);
    if (user && user.is_active && user.email) {
      const { token } = issueToken(user.id, 'reset');
      const link = `${appBaseUrl(db, requestOrigin(req))}/reset-password?token=${token}`;
      /* Nuot loi gui thu: mot su co SMTP khong duoc phep bien thanh 500, vi 500 o
         day lai la mot tin hieu "email nay co that". Loi da duoc ghi vao
         email_settings.last_error va hien o man Cai dat. */
      await sendMail(db, resetEmail(user.email, user.full_name ?? '', link)).catch(
        (error: unknown) => {
          console.error('[auth] Khong gui duoc thu dat lai mat khau:', error);
        }
      );
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/** Kiem tra lien ket truoc khi hien form — de khong bat nguoi dung go mat khau roi moi bao token hong. */
router.get('/reset-token/:token', (req, res) => {
  const resolved = resolveToken(req.params.token);
  if (!resolved) throw new HttpError(400, 'Liên kết đã hết hạn hoặc đã được dùng');
  const user = getPublicUser(resolved.userId);
  if (!user) throw new HttpError(400, 'Liên kết đã hết hạn hoặc đã được dùng');
  res.json({ kind: resolved.kind, email: user.email, full_name: user.full_name });
});

const resetSchema = z.object({
  token: z.string().min(1).max(500),
  new_password: z.string().min(8).max(200),
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const body = parseBody(resetSchema, req);
    const resolved = resolveToken(body.token);
    if (!resolved) throw new HttpError(400, 'Liên kết đã hết hạn hoặc đã được dùng');

    const user = findUserById(resolved.userId);
    if (!user || !user.is_active) {
      throw new HttpError(400, 'Liên kết đã hết hạn hoặc đã được dùng');
    }

    await setPassword(user.id, body.new_password);
    consumeToken(body.token);
    /* Dat lai mat khau thi moi phien cu cua chinh nguoi do phai chet: neu ly do
       dat lai la "co nguoi khac vao duoc tai khoan toi" thi de phien cu song
       tiep la khong giai quyet duoc gi. */
    deleteUserSessions(user.id);
    await startSession(req, user.id, user.username);
    res.json(getPublicUser(user.id));
  } catch (err) {
    next(err);
  }
});

export default router;
