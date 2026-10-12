import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * Hieu nang dot 1 (1.37.1): cac API khong con tra "toan bo" khi chi can mot phan.
 * Do o 120.000 viec: o tim viec phu thuoc tung tai 56 MB, lich khong tham so quet tu
 * 1970 toi 2999, o chon lien ket tai lieu tai ca danh sach co hoi day du (17 MB).
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-perf-limits-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';

const { createApp } = await import('../app.ts');
const { db, closeDatabase } = await import('../db/connection.ts');
const { SqliteSessionStore } = await import('../services/auth/SqliteSessionStore.ts');

let server: Server;
let baseUrl = '';

before(async () => {
  server = createApp({ auth: false }).listen(0);
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

async function get<T>(pathname: string): Promise<{ status: number; data: T; text: string }> {
  const response = await fetch(`${baseUrl}${pathname}`);
  const text = await response.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* CSV */
  }
  return { status: response.status, data: data as T, text };
}

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const customerId = Number(
  db
    .prepare(
      `INSERT INTO customers (name, org_kind, status) VALUES ('Khách hiệu năng', 'customer', 'customer')`
    )
    .run().lastInsertRowid
);
const dealId = Number(
  db
    .prepare(
      `INSERT INTO deals (customer_id, title, stage, position, expected_close_date)
       VALUES (?, 'Cơ hội hiệu năng', 'lead', 1024, ?)`
    )
    .run(customerId, day(5)).lastInsertRowid
);
db.prepare(`INSERT INTO contracts (customer_id, deal_id, name) VALUES (?, ?, 'HĐ hiệu năng')`).run(
  customerId,
  dealId
);
db.prepare(`INSERT INTO quotations (customer_id, deal_id, code) VALUES (?, ?, 'BG-01')`).run(
  customerId,
  dealId
);
const boardId = Number(
  db.prepare(`INSERT INTO boards (name) VALUES ('Bảng hiệu năng')`).run().lastInsertRowid
);
const listId = Number(
  db.prepare(`INSERT INTO lists (board_id, name, position) VALUES (?, 'Cột', 1024)`).run(boardId)
    .lastInsertRowid
);
for (let i = 1; i <= 30; i++) {
  db.prepare(
    `INSERT INTO cards (list_id, title, position, search_text, due_date) VALUES (?, ?, ?, ?, ?)`
  ).run(listId, `Việc số ${i}`, i * 1024, i % 10 === 0 ? `muc tieu ${i}` : `viec ${i}`, day(i));
}

test('/views/tasks: limit va q chi tra dung so dong can', async () => {
  const limited = await get<{ id: number }[]>('/api/views/tasks?done=0&limit=5');
  assert.equal(limited.status, 200);
  assert.equal(limited.data.length, 5);

  const matched = await get<{ title: string; label_ids: number[] }[]>(
    '/api/views/tasks?done=0&limit=20&q=muc%20tieu'
  );
  assert.deepEqual(
    matched.data.map((row) => row.title),
    ['Việc số 10', 'Việc số 20', 'Việc số 30']
  );
  assert.ok(Array.isArray(matched.data[0].label_ids), 'van gan nhan theo lo');

  const all = await get<unknown[]>('/api/views/tasks?done=0');
  assert.equal(all.data.length, 30, 'khong truyen limit thi giu hanh vi cu');
});

test('/views/calendar: khong tham so khong quet het, khoang qua dai bi cat', async () => {
  const fallback = await get<{ kind: string }[]>('/api/views/calendar');
  assert.equal(fallback.status, 200);
  assert.ok(
    fallback.data.some((item) => item.kind === 'deal_close'),
    'mac dinh quanh hom nay'
  );

  /* Ngay chot +5 ngay nam ngoai khoang 1970 + 120 ngay. */
  const clamped = await get<{ kind: string }[]>(
    '/api/views/calendar?from=1970-01-01&to=2999-12-31'
  );
  assert.equal(clamped.status, 200);
  assert.equal(clamped.data.length, 0);
});

test('fields=basic: o chon chi nhan cot can thiet', async () => {
  const deals = await get<Record<string, unknown>[]>('/api/deals?fields=basic');
  assert.ok(Array.isArray(deals.data));
  assert.deepEqual(Object.keys(deals.data[0]).sort(), [
    'customer_id',
    'customer_name',
    'id',
    'stage',
    'title',
  ]);
  const contracts = await get<Record<string, unknown>[]>('/api/contracts?fields=basic');
  assert.equal(contracts.data[0].name, 'HĐ hiệu năng');
  assert.equal('days_left' in contracts.data[0], false);
  const quotations = await get<Record<string, unknown>[]>('/api/quotations?fields=basic');
  assert.equal(quotations.data[0].code, 'BG-01');
  assert.equal('document_count' in quotations.data[0], false);
});

test('xuat CSV theo luong van co BOM, tieu de va dong du lieu', async () => {
  const res = await fetch(`${baseUrl}/api/export/customers.csv`);
  assert.equal(res.status, 200);
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'BOM de Excel doc dung tieng Viet');
  const text = new TextDecoder().decode(bytes.slice(3));
  const [header, ...lines] = text.split('\r\n');
  assert.ok(header.split(',').length > 1);
  assert.ok(lines.some((line) => line.includes('Khách hiệu năng')));
});

test('phien dang nhap: gia han lien tiep chi ghi CSDL mot lan trong 10 phut', () => {
  const store = new SqliteSessionStore();
  const session = {
    cookie: { originalMaxAge: 60_000, expires: new Date(Date.now() + 60_000) },
    userId: null,
  } as unknown as Parameters<typeof store.set>[1];
  store.set('sid-perf', session, () => {});
  const expiresOf = () =>
    (
      db.prepare(`SELECT expires_at FROM sessions ORDER BY rowid DESC LIMIT 1`).get() as {
        expires_at: number;
      }
    ).expires_at;
  const first = expiresOf();
  const later = {
    ...session,
    cookie: { originalMaxAge: 60_000, expires: new Date(Date.now() + 3_600_000) },
  } as unknown as Parameters<typeof store.touch>[1];
  store.touch('sid-perf', later, () => {});
  assert.equal(expiresOf(), first, 'vua ghi phien xong thi touch khong ghi lai');
});
