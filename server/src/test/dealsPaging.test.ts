import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-deals-paging-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';

const { createApp } = await import('../app.ts');
const { db, closeDatabase } = await import('../db/connection.ts');

let server: Server;
let baseUrl = '';

before(async () => {
  server = createApp({ auth: false }).listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Không khởi động được test server');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  closeDatabase();
  if (fixtureRoot.startsWith(os.tmpdir())) fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

async function get<T>(pathname: string): Promise<{ status: number; data: T }> {
  const response = await fetch(`${baseUrl}${pathname}`);
  return { status: response.status, data: (await response.json()) as T };
}

const customerId = Number(
  db.prepare(`INSERT INTO customers (name) VALUES ('Khách paging')`).run().lastInsertRowid
);
for (let position = 1; position <= 7; position += 1) {
  db.prepare(
    `INSERT INTO deals (customer_id, title, stage, probability, value_vnd, position)
     VALUES (?, ?, 'lead', ?, ?, ?)`
  ).run(customerId, `Lead ${position}`, position * 10, position * 1000, position);
}
for (let position = 1; position <= 2; position += 1) {
  db.prepare(
    `INSERT INTO deals (customer_id, title, stage, probability, value_vnd, position)
     VALUES (?, ?, 'quoted', ?, ?, ?)`
  ).run(customerId, `Quoted ${position}`, 50, position * 2000, position);
}

test('per_stage trả trang đầu, more và totals toàn bộ khớp phản hồi đầy đủ', async () => {
  const full = await get<{ stages: Record<string, unknown[]>; totals: Record<string, unknown> }>(
    '/api/deals'
  );
  const paged = await get<{
    stages: Record<string, Array<{ position: number }>>;
    totals: Record<string, unknown>;
    more: Record<string, number>;
  }>('/api/deals?per_stage=3');
  assert.equal(paged.status, 200);
  assert.deepEqual(
    paged.data.stages.lead.map((deal) => deal.position),
    [1, 2, 3]
  );
  assert.equal(paged.data.more.lead, 4);
  assert.equal(paged.data.more.quoted, 0);
  assert.deepEqual(paged.data.totals, full.data.totals);
  for (const stage of ['lead', 'quoted', 'won', 'lost']) {
    assert.ok(stage in paged.data.stages);
    assert.ok(stage in paged.data.totals);
    assert.ok(stage in paged.data.more);
  }
});

test('stage paging dùng offset và limit', async () => {
  const middle = await get<Array<{ position: number }>>('/api/deals?stage=lead&offset=3&limit=3');
  const last = await get<Array<{ position: number }>>('/api/deals?stage=lead&offset=6&limit=3');
  assert.deepEqual(
    middle.data.map((deal) => deal.position),
    [4, 5, 6]
  );
  assert.deepEqual(
    last.data.map((deal) => deal.position),
    [7]
  );
});

test('tham số paging sai trả 400', async () => {
  for (const pathname of [
    '/api/deals?per_stage=0',
    '/api/deals?per_stage=abc',
    '/api/deals?stage=lead&offset=-1&limit=3',
    '/api/deals?stage=lead&limit=999',
  ])
    assert.equal((await get(pathname)).status, 400);
});

test('không tham số giữ hình dạng cũ, không có more', async () => {
  const response = await get<Record<string, unknown>>('/api/deals');
  assert.equal(response.status, 200);
  assert.equal('more' in response.data, false);
});
