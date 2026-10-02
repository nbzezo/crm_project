import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * Ma khoa man hinh cho (v58): dat, doi, tat, kiem ma va gui lai ma qua email.
 * Chua cau hinh SMTP nen "gui ma qua email" phai tu choi ro rang thay vi bao da gui.
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-lock-screen-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';
process.env.WORKFLOW_SESSION_SECRET = 'test-secret-value-at-least-32-characters-long';
process.env.WORKFLOW_ADMIN_USER = 'admin';
process.env.WORKFLOW_ADMIN_PASSWORD = 'admin-password-1';
process.env.WORKFLOW_ADMIN_EMAIL = 'admin@congty.vn';

const { createApp } = await import('../app.ts');
const { db, closeDatabase } = await import('../db/connection.ts');
const { ensureAdminUser } = await import('../services/auth/bootstrapAdmin.ts');
const { lockPinEmail } = await import('../services/email/templates.ts');

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
  const login = await call('POST', '/api/auth/login', {
    username: 'admin@congty.vn',
    password: 'admin-password-1',
  });
  assert.equal(login.status, 200);
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

test('chua dat ma: trang thai rong va mo khoa khong can ma', async () => {
  const status = await call('GET', '/api/lock-screen');
  assert.equal(status.status, 200);
  assert.deepEqual(status.data, { has_pin: false, can_email: false });
  assert.deepEqual((await call('POST', '/api/lock-screen/verify', { pin: '' })).data, { ok: true });
});

test('ma phai la 4-6 chu so', async () => {
  assert.equal((await call('PUT', '/api/lock-screen/pin', { pin: '12' })).status, 400);
  assert.equal((await call('PUT', '/api/lock-screen/pin', { pin: 'abcd' })).status, 400);
  assert.equal((await call('PUT', '/api/lock-screen/pin', { pin: '1234567' })).status, 400);
});

test('dat ma: luu ma hoa, kiem dung/sai', async () => {
  assert.deepEqual((await call('PUT', '/api/lock-screen/pin', { pin: '2468' })).data, {
    has_pin: true,
  });
  const row = db.prepare('SELECT pin_ciphertext FROM user_lock_pins').get() as {
    pin_ciphertext: string;
  };
  assert.notEqual(row.pin_ciphertext, '2468');
  assert.deepEqual((await call('POST', '/api/lock-screen/verify', { pin: '2468' })).data, {
    ok: true,
  });
  assert.deepEqual((await call('POST', '/api/lock-screen/verify', { pin: '1111' })).data, {
    ok: false,
  });
});

test('doi ma phai dung ma hien tai', async () => {
  const wrong = await call('PUT', '/api/lock-screen/pin', { pin: '1357', current_pin: '0000' });
  assert.equal(wrong.status, 400);
  const missing = await call('PUT', '/api/lock-screen/pin', { pin: '1357' });
  assert.equal(missing.status, 400);
  const ok = await call('PUT', '/api/lock-screen/pin', { pin: '135790', current_pin: '2468' });
  assert.equal(ok.status, 200);
  assert.equal((await call('POST', '/api/lock-screen/verify', { pin: '135790' })).data.ok, true);
});

test('chua cau hinh email: gui ma tu choi ro rang', async () => {
  const res = await call('POST', '/api/lock-screen/send-pin');
  assert.equal(res.status, 400);
  assert.match(String(res.data.error ?? res.data.message), /chưa cấu hình gửi email/);
});

test('thu nhac ma chua dung ma dang dung', () => {
  const mail = lockPinEmail('an@congty.vn', 'An', '135790', 'https://crm.local');
  assert.match(mail.text, /135790/);
  assert.match(mail.html ?? '', /135790/);
  assert.equal(mail.to, 'an@congty.vn');
});

test('tat ma phai dung ma hien tai', async () => {
  assert.equal(
    (await call('POST', '/api/lock-screen/pin/remove', { current_pin: '9999' })).status,
    400
  );
  const ok = await call('POST', '/api/lock-screen/pin/remove', { current_pin: '135790' });
  assert.deepEqual(ok.data, { has_pin: false });
  assert.equal((await call('GET', '/api/lock-screen')).data.has_pin, false);
});

test('nhap sai qua nhieu lan thi bi chan tam thoi', async () => {
  await call('PUT', '/api/lock-screen/pin', { pin: '4321' });
  let last = 0;
  for (let i = 0; i < 12; i += 1) {
    last = (await call('POST', '/api/lock-screen/verify', { pin: '0000' })).status;
  }
  assert.equal(last, 429);
});
