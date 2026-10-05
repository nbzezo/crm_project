import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * Link nhac yeu thich (v59): luu, doi ten khi luu lai cung link, xoa, gioi han so luong,
 * va rieng tu — tai khoan nay khong thay, khong xoa duoc link cua tai khoan kia.
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-music-links-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';
process.env.WORKFLOW_SESSION_SECRET = 'test-secret-value-at-least-32-characters-long';
process.env.WORKFLOW_ADMIN_USER = 'admin';
process.env.WORKFLOW_ADMIN_PASSWORD = 'admin-password-1';
process.env.WORKFLOW_ADMIN_EMAIL = 'admin@congty.vn';

const { createApp } = await import('../app.ts');
const { db, closeDatabase } = await import('../db/connection.ts');
const { ensureAdminUser } = await import('../services/auth/bootstrapAdmin.ts');
const { createUser } = await import('../services/auth/users.ts');
const { MAX_MUSIC_LINKS } = await import('../routes/musicLinks.ts');

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
  await signIn('admin@congty.vn', 'admin-password-1');
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
  return { status: res.status, data: text ? (JSON.parse(text) as unknown) : null };
}

async function signIn(login: string, password: string) {
  cookie = '';
  const res = await call('POST', '/api/auth/login', { username: login, password });
  assert.equal(res.status, 200);
}

interface Row {
  id: number;
  title: string;
  url: string;
}

const list = async () => (await call('GET', '/api/music-links')).data as Row[];

test('luu link, luu lai cung link thi doi ten chu khong tao dong trung', async () => {
  assert.deepEqual(await list(), []);
  const first = await call('POST', '/api/music-links', {
    url: 'https://youtu.be/jfKfPfyJRdk',
    title: 'Lofi Girl',
  });
  assert.equal(first.status, 201);
  assert.equal((first.data as Row).title, 'Lofi Girl');

  const again = await call('POST', '/api/music-links', {
    url: 'https://youtu.be/jfKfPfyJRdk',
    title: 'Lofi học bài',
  });
  assert.equal(again.status, 200);
  assert.equal((again.data as Row).id, (first.data as Row).id);
  const rows = await list();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Lofi học bài');
});

test('chan du lieu rac: khong phai http(s), thieu ten, qua dai', async () => {
  const bad = [
    { url: 'javascript:alert(1)', title: 'x' },
    { url: 'ftp://radio.vn/a.mp3', title: 'x' },
    { url: 'https://youtu.be/abc', title: '' },
    { url: `https://youtu.be/${'a'.repeat(600)}`, title: 'x' },
  ];
  for (const body of bad) {
    assert.equal((await call('POST', '/api/music-links', body)).status, 400, JSON.stringify(body));
  }
});

test(`gioi han ${MAX_MUSIC_LINKS} link moi tai khoan`, async () => {
  const have = (await list()).length;
  for (let i = have; i < MAX_MUSIC_LINKS; i += 1) {
    const res = await call('POST', '/api/music-links', {
      url: `https://radio.vn/kenh-${i}.mp3`,
      title: `Kênh ${i}`,
    });
    assert.equal(res.status, 201);
  }
  const over = await call('POST', '/api/music-links', {
    url: 'https://radio.vn/thua.mp3',
    title: 'Thừa',
  });
  assert.equal(over.status, 400);
  /* Luu lai link da co van duoc (chi doi ten). */
  const rename = await call('POST', '/api/music-links', {
    url: 'https://radio.vn/kenh-3.mp3',
    title: 'Kênh ba',
  });
  assert.equal(rename.status, 200);
});

test('RIENG TU: tai khoan khac khong thay va khong xoa duoc link cua nguoi kia', async () => {
  const adminRows = await list();
  await createUser({
    username: 'nhacsi',
    email: 'nhacsi@congty.vn',
    password: 'nhacsi-password-1',
  });
  await signIn('nhacsi@congty.vn', 'nhacsi-password-1');
  assert.deepEqual(await list(), []);
  assert.equal((await call('DELETE', `/api/music-links/${adminRows[0].id}`)).status, 404);
  assert.ok(db.prepare('SELECT 1 FROM user_music_links WHERE id = ?').get(adminRows[0].id));

  /* Cung link o tai khoan nay la dong rieng. */
  const own = await call('POST', '/api/music-links', {
    url: 'https://youtu.be/jfKfPfyJRdk',
    title: 'Của tôi',
  });
  assert.equal(own.status, 201);
  assert.equal((await call('DELETE', `/api/music-links/${(own.data as Row).id}`)).status, 204);
  assert.deepEqual(await list(), []);
});
