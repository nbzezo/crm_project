import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * GET /api/reminders/due — nguon cua popup nhac giua man hinh (1.15.0).
 * Chi nhac cua chinh minh (hoac chua co chu), da toi gio, chua xong, lui toi da mot ngay.
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-due-reminders-'));
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
  return { status: res.status, data: text ? (JSON.parse(text) as unknown) : {} };
}

function localAt(modifier: string): string {
  return (
    db.prepare(`SELECT strftime('%Y-%m-%dT%H:%M', 'now', 'localtime', ?) AS v`).get(modifier) as {
      v: string;
    }
  ).v;
}

test('chi tra nhac da toi gio, chua xong, cua minh, trong mot ngay qua', async () => {
  const create = async (title: string, due_at: string, extra: Record<string, unknown> = {}) => {
    const res = await call('POST', '/api/reminders', { title, due_at, ...extra });
    assert.equal(res.status, 201);
    return Number((res.data as { id: number }).id);
  };

  const list = Number(
    db
      .prepare(`INSERT INTO lists (board_id, name, position) VALUES (?, 'Việc', 1)`)
      .run(db.prepare(`INSERT INTO boards (name) VALUES ('Bảng nhắc')`).run().lastInsertRowid)
      .lastInsertRowid
  );
  const cardId = Number(
    db
      .prepare(`INSERT INTO cards (list_id, title, position) VALUES (?, 'Gọi anh Nam', 1)`)
      .run(list).lastInsertRowid
  );

  const due = await create('Đã tới giờ', localAt('-5 minutes'), { card_id: cardId });
  await create('Chưa tới giờ', localAt('+30 minutes'));
  await create('Quá cũ', localAt('-2 days'));
  const done = await create('Đã xong', localAt('-10 minutes'));
  assert.equal((await call('PATCH', `/api/reminders/${done}`, { is_done: true })).status, 200);

  const other = await create('Của người khác', localAt('-3 minutes'));
  const otherContact = Number(
    db
      .prepare(
        `INSERT INTO contacts (customer_id, full_name, is_active) VALUES (?, 'Người khác', 1)`
      )
      .run(db.prepare(`INSERT INTO customers (name) VALUES ('Công ty khác')`).run().lastInsertRowid)
      .lastInsertRowid
  );
  db.prepare(`UPDATE reminders SET owner_contact_id = ? WHERE id = ?`).run(otherContact, other);

  const legacy = await create('Chưa có chủ', localAt('-1 minutes'));
  db.prepare(`UPDATE reminders SET owner_contact_id = NULL WHERE id = ?`).run(legacy);

  const res = await call('GET', '/api/reminders/due');
  assert.equal(res.status, 200);
  const rows = res.data as { id: number; title: string; card_title: string | null }[];
  assert.deepEqual(
    rows.map((r) => r.title),
    ['Đã tới giờ', 'Chưa có chủ']
  );
  assert.equal(rows.find((r) => r.id === due)?.card_title, 'Gọi anh Nam');

  // Viec da hoan thanh: nhac cua no thoi bat len.
  db.prepare(`UPDATE cards SET is_done = 1 WHERE id = ?`).run(cardId);
  const afterDone = (await call('GET', '/api/reminders/due')).data as { id: number }[];
  assert.deepEqual(
    afterDone.map((r) => r.id),
    [legacy]
  );
  db.prepare(`UPDATE cards SET is_done = 0 WHERE id = ?`).run(cardId);

  // Hoan = doi gio: nhac roi khoi danh sach cho toi gio moi.
  await call('PATCH', `/api/reminders/${due}`, { due_at: localAt('+10 minutes') });
  const after = (await call('GET', '/api/reminders/due')).data as { id: number }[];
  assert.deepEqual(
    after.map((r) => r.id),
    [legacy]
  );
});
