import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * Dang nhap bang email, moi tai khoan va lay lai mat khau (v38).
 *
 * Chua cau hinh SMTP nen emailService in noi dung thu ra console thay vi gui.
 * Test bat lay dong log do de rut token — chinh la cach mot nguoi dung that lay
 * token tu hop thu. Khong co duong nao khac: CSDL chi giu sha256(token).
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-auth-email-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';
process.env.WORKFLOW_SESSION_SECRET = 'test-secret-value-at-least-32-characters-long';
process.env.WORKFLOW_ADMIN_USER = 'admin';
process.env.WORKFLOW_ADMIN_PASSWORD = 'admin-password-1';
process.env.WORKFLOW_ADMIN_EMAIL = 'admin@congty.vn';

const { createApp } = await import('../app.ts');
const { db, closeDatabase } = await import('../db/connection.ts');
const { ensureAdminUser } = await import('../services/auth/bootstrapAdmin.ts');

await ensureAdminUser();

let server: Server;
let baseUrl = '';
let cookie = '';

before(async () => {
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Khong khoi dong duoc test server');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  closeDatabase();
  if (fixtureRoot.startsWith(os.tmpdir())) fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

async function call(method: string, pathname: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.getSetCookie();
  if (setCookie.length > 0) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  const text = await res.text();
  return { status: res.status, data: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}

/** Chay `fn` va tra ve token rut tu lien ket ma emailService in ra console. */
async function captureToken(fn: () => Promise<unknown>): Promise<string | null> {
  const original = console.log;
  let captured = '';
  console.log = (...args: unknown[]) => {
    captured += args.map(String).join(' ');
  };
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return /reset-password\?token=([A-Za-z0-9_-]+)/.exec(captured)?.[1] ?? null;
}

async function loginAsAdmin(password = 'admin-password-1') {
  cookie = '';
  return call('POST', '/api/auth/login', { username: 'admin@congty.vn', password });
}

test('bootstrap gan email cho tai khoan dau tien', () => {
  const row = db.prepare('SELECT email, is_active FROM users WHERE username = ?').get('admin') as {
    email: string;
    is_active: number;
  };
  assert.equal(row.email, 'admin@congty.vn');
  assert.equal(row.is_active, 1);
});

test('dang nhap bang email, /me tra ve ho so day du', async () => {
  const login = await loginAsAdmin();
  assert.equal(login.status, 200);
  assert.equal(login.data.email, 'admin@congty.vn');

  const me = await call('GET', '/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.email, 'admin@congty.vn');
  assert.equal(me.data.is_active, true);
  // Khong duoc lo bat cu thu gi lien quan toi mat khau.
  assert.equal(me.data.password_hash, undefined);
  assert.equal(me.data.password_salt, undefined);
});

test('van dang nhap duoc bang username cu', async () => {
  cookie = '';
  const login = await call('POST', '/api/auth/login', {
    username: 'admin',
    password: 'admin-password-1',
  });
  assert.equal(login.status, 200);
});

test('quen mat khau: email khong ton tai van tra 204 va khong sinh token', async () => {
  cookie = '';
  const before_ = (
    db.prepare('SELECT COUNT(*) AS n FROM password_reset_tokens').get() as { n: number }
  ).n;

  const res = await call('POST', '/api/auth/forgot-password', { email: 'khong-co@dau-do.vn' });
  assert.equal(res.status, 204, 'khong duoc phan biet email co that voi email bia');

  const after_ = (
    db.prepare('SELECT COUNT(*) AS n FROM password_reset_tokens').get() as { n: number }
  ).n;
  assert.equal(after_, before_, 'khong duoc tao token cho email khong ton tai');
});

test('quen mat khau: dat lai duoc, token chi dung mot lan', async () => {
  cookie = '';
  const token = await captureToken(() =>
    call('POST', '/api/auth/forgot-password', { email: 'admin@congty.vn' })
  );
  assert.ok(token, 'phai sinh duoc lien ket dat lai mat khau');

  const check = await call('GET', `/api/auth/reset-token/${token}`);
  assert.equal(check.status, 200);
  assert.equal(check.data.kind, 'reset');
  assert.equal(check.data.email, 'admin@congty.vn');

  const reset = await call('POST', '/api/auth/reset-password', {
    token,
    new_password: 'mat-khau-dat-lai-9',
  });
  assert.equal(reset.status, 200);

  // Dung lai chinh token do phai bi tu choi.
  const reuse = await call('POST', '/api/auth/reset-password', {
    token,
    new_password: 'mot-mat-khau-khac',
  });
  assert.equal(reuse.status, 400);

  // Mat khau cu chet, mat khau moi song.
  assert.equal((await loginAsAdmin('admin-password-1')).status, 401);
  assert.equal((await loginAsAdmin('mat-khau-dat-lai-9')).status, 200);
});

test('token het han bi tu choi', async () => {
  cookie = '';
  const token = await captureToken(() =>
    call('POST', '/api/auth/forgot-password', { email: 'admin@congty.vn' })
  );
  assert.ok(token);

  db.prepare('UPDATE password_reset_tokens SET expires_at = 1 WHERE used_at IS NULL').run();
  const res = await call('GET', `/api/auth/reset-token/${token}`);
  assert.equal(res.status, 400);
});

/** Tai khoan rieng cho moi test ve quen mat khau — bo dem gioi han la theo email. */
function seedUser(email: string): number {
  return Number(
    db
      .prepare(
        `INSERT INTO users (username, password_hash, password_salt, email, full_name)
         VALUES (?, '', '', ?, ?)`
      )
      .run(email.split('@')[0], email, 'Nguoi Thu Nghiem').lastInsertRowid
  );
}

test('xin lien ket moi lam lien ket cu het hieu luc', async () => {
  cookie = '';
  const email = 'doi-lien-ket@congty.vn';
  seedUser(email);

  const first = await captureToken(() => call('POST', '/api/auth/forgot-password', { email }));
  const second = await captureToken(() => call('POST', '/api/auth/forgot-password', { email }));
  assert.ok(first && second);
  assert.notEqual(first, second);

  /* Bam "gui lai" nhieu lan khong duoc de lai nhieu duong vao con song song:
     moi lien ket la mot chia khoa vao tai khoan. */
  assert.equal((await call('GET', `/api/auth/reset-token/${first}`)).status, 400);
  assert.equal((await call('GET', `/api/auth/reset-token/${second}`)).status, 200);
});

test('gioi han so lan xin lien ket theo tung email', async () => {
  cookie = '';
  const email = 'bi-spam@congty.vn';
  seedUser(email);

  const issued: (string | null)[] = [];
  for (let i = 0; i < 5; i += 1) {
    issued.push(await captureToken(() => call('POST', '/api/auth/forgot-password', { email })));
  }

  /* Van luon 204 — chan bang cach IM LANG bo qua, khong bang ma loi. Tra 429 o
     day se to cao email nao dang ton tai va dang bi nham toi. */
  assert.equal((await call('POST', '/api/auth/forgot-password', { email })).status, 204);
  assert.ok(
    issued.filter(Boolean).length <= 3,
    'khong duoc gui qua 3 thu cho cung mot dia chi trong mot cua so thoi gian'
  );
  assert.equal(issued[issued.length - 1], null, 'lan thu 5 phai bi chan');
});

test('moi tai khoan moi: chua kich hoat thi chua dang nhap duoc', async () => {
  await loginAsAdmin('mat-khau-dat-lai-9');

  const created = await call('POST', '/api/users', {
    email: 'nhanvien@congty.vn',
    full_name: 'Nguyen Van Nhan',
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.pending_invite, true);
  // Chua cau hinh SMTP nen lien ket duoc tra ve de con kich hoat tay.
  const link = String(created.data.invite_link ?? '');
  const token = /reset-password\?token=([A-Za-z0-9_-]+)/.exec(link)?.[1];
  assert.ok(token, 'phai tra ve lien ket kich hoat khi chua cau hinh SMTP');

  // Tai khoan ton tai nhung chua co mat khau nao dang nhap duoc.
  cookie = '';
  const tooEarly = await call('POST', '/api/auth/login', {
    username: 'nhanvien@congty.vn',
    password: '',
  });
  assert.equal(tooEarly.status, 400, 'mat khau rong bi schema tu choi truoc');

  const check = await call('GET', `/api/auth/reset-token/${token}`);
  assert.equal(check.data.kind, 'invite');

  const activated = await call('POST', '/api/auth/reset-password', {
    token,
    new_password: 'mat-khau-nhan-vien',
  });
  assert.equal(activated.status, 200);

  cookie = '';
  const login = await call('POST', '/api/auth/login', {
    username: 'nhanvien@congty.vn',
    password: 'mat-khau-nhan-vien',
  });
  assert.equal(login.status, 200);
  assert.equal(login.data.pending_invite, false);
});

test('nguoi dung thuong khong quan ly duoc tai khoan', async () => {
  cookie = '';
  await call('POST', '/api/auth/login', {
    username: 'nhanvien@congty.vn',
    password: 'mat-khau-nhan-vien',
  });
  const denied = await call('GET', '/api/users');
  assert.equal(denied.status, 403, 'chi tai khoan quan tri moi xem duoc danh sach nguoi dung');
});

test('email trung bi tu choi', async () => {
  await loginAsAdmin('mat-khau-dat-lai-9');
  const clash = await call('POST', '/api/users', {
    email: 'nhanvien@congty.vn',
    full_name: 'Nguoi khac',
  });
  assert.equal(clash.status, 409);
});

test('khoa tai khoan: cat phien dang mo va chan dang nhap lai', async () => {
  await loginAsAdmin('mat-khau-dat-lai-9');
  const staff = (
    db.prepare('SELECT id FROM users WHERE email = ?').get('nhanvien@congty.vn') as {
      id: number;
    }
  ).id;

  const locked = await call('PATCH', `/api/users/${staff}`, { is_active: false });
  assert.equal(locked.status, 200);
  assert.equal(locked.data.is_active, false);

  const sessionsLeft = (
    db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').get(staff) as { n: number }
  ).n;
  assert.equal(sessionsLeft, 0, 'khoa tai khoan phai cat luon phien dang mo');

  cookie = '';
  const blocked = await call('POST', '/api/auth/login', {
    username: 'nhanvien@congty.vn',
    password: 'mat-khau-nhan-vien',
  });
  assert.equal(blocked.status, 401);

  // Bi khoa thi cung khong xin duoc lien ket dat lai mat khau.
  const noToken = await captureToken(() =>
    call('POST', '/api/auth/forgot-password', { email: 'nhanvien@congty.vn' })
  );
  assert.equal(noToken, null);
});

test('khong the tu khoa tai khoan dang dang nhap', async () => {
  const me = await loginAsAdmin('mat-khau-dat-lai-9');
  const res = await call('PATCH', `/api/users/${me.data.id}`, { is_active: false });
  assert.equal(res.status, 400);
});
