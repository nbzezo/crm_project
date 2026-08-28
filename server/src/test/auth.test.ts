import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-auth-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';
process.env.WORKFLOW_SESSION_SECRET = 'test-secret-value-at-least-32-characters-long';
process.env.WORKFLOW_ADMIN_USER = 'admin';
process.env.WORKFLOW_ADMIN_PASSWORD = 'admin-password-1';

const { createApp } = await import('../app.ts');
const { closeDatabase } = await import('../db/connection.ts');
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

test('health mo cong khai, route du lieu doi dang nhap', async () => {
  assert.equal((await call('GET', '/api/health')).status, 200);
  assert.equal((await call('GET', '/api/boards')).status, 401);
  assert.equal((await call('GET', '/api/export')).status, 401);
});

test('sai mat khau bi tu choi', async () => {
  const res = await call('POST', '/api/auth/login', { username: 'admin', password: 'sai' });
  assert.equal(res.status, 401);
});

test('dang nhap dung mo khoa cac route, /me tra ve username', async () => {
  const login = await call('POST', '/api/auth/login', {
    username: 'admin',
    password: 'admin-password-1',
  });
  assert.equal(login.status, 200);
  assert.equal(login.data.username, 'admin');
  assert.ok(cookie.includes('sid='));

  const me = await call('GET', '/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.username, 'admin');

  assert.equal((await call('GET', '/api/boards')).status, 200);
});

test('dang xuat huy phien', async () => {
  assert.equal((await call('POST', '/api/auth/logout')).status, 204);
  cookie = '';
  assert.equal((await call('GET', '/api/auth/me')).status, 401);
  assert.equal((await call('GET', '/api/boards')).status, 401);
});

test('doi mat khau: mat khau cu het hieu luc, mat khau moi dang nhap duoc', async () => {
  await call('POST', '/api/auth/login', { username: 'admin', password: 'admin-password-1' });
  const changed = await call('PATCH', '/api/auth/password', {
    current_password: 'admin-password-1',
    new_password: 'mat-khau-moi-2',
  });
  assert.equal(changed.status, 200);

  cookie = '';
  const oldPw = await call('POST', '/api/auth/login', {
    username: 'admin',
    password: 'admin-password-1',
  });
  assert.equal(oldPw.status, 401);

  const newPw = await call('POST', '/api/auth/login', {
    username: 'admin',
    password: 'mat-khau-moi-2',
  });
  assert.equal(newPw.status, 200);
});

test('chan brute-force sau nhieu lan sai lien tuc', async () => {
  cookie = '';
  let sawRateLimit = false;
  for (let i = 0; i < 12; i += 1) {
    const res = await call('POST', '/api/auth/login', { username: 'admin', password: 'x' });
    if (res.status === 429) {
      sawRateLimit = true;
      break;
    }
  }
  assert.ok(sawRateLimit, 'phai tra 429 sau nhieu lan thu sai');
});
