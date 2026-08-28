import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { HttpError, parseBody } from '../lib/validate.ts';
import { findUserById, findUserByUsername, setPassword } from '../services/auth/users.ts';
import { verifyPassword } from '../services/auth/passwords.ts';

const router = Router();

/* ---------- Chan thu dang nhap lien tuc (brute-force) ----------
   Bo dem trong bo nho theo IP, cua so 15 phut, toi da 8 lan. Du cho mot tai
   khoan duy nhat; reset khi dang nhap thanh cong. */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, { count: number; resetAt: number }>();

function hitRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

function promisify(fn: (cb: (err?: unknown) => void) => void): Promise<void> {
  return new Promise((resolve, reject) => fn((err) => (err ? reject(err) : resolve())));
}

const credentialsSchema = z.object({
  username: z.string().min(1).max(120),
  password: z.string().min(1).max(200),
});

router.post('/login', async (req, res, next) => {
  try {
    const ip = req.ip ?? 'unknown';
    if (hitRateLimit(ip)) {
      throw new HttpError(429, 'Thu dang nhap qua nhieu lan, vui long doi ít phút roi thu lai');
    }

    const { username, password } = parseBody(credentialsSchema, req);
    const user = findUserByUsername(username);
    const ok = user && (await verifyPassword(password, user.password_hash, user.password_salt));
    if (!user || !ok) {
      throw new HttpError(401, 'Sai ten dang nhap hoac mat khau');
    }

    attempts.delete(ip);
    // Doi session id sau khi dang nhap de chong co dinh phien (session fixation).
    await promisify((cb) => req.session.regenerate(cb));
    req.session.userId = user.id;
    req.session.username = user.username;
    await promisify((cb) => req.session.save(cb));
    res.json({ username: user.username });
  } catch (err) {
    next(err);
  }
});

router.get('/me', (req, res) => {
  if (!req.session?.userId) {
    throw new HttpError(401, 'Chua dang nhap');
  }
  res.json({ username: req.session.username });
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
      throw new HttpError(400, 'Mat khau hien tai khong dung');
    }

    await setPassword(userId, body.new_password);
    // Dang xuat moi phien khac: xoa sach roi cap lai phien hien tai.
    db.prepare('DELETE FROM sessions').run();
    await promisify((cb) => req.session.regenerate(cb));
    req.session.userId = user.id;
    req.session.username = user.username;
    await promisify((cb) => req.session.save(cb));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
