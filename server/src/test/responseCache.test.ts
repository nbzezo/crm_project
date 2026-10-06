import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * Lop dem cac man tong hop (1.22.0): luu 5 phut, nguoi vua ghi thay ngay thay doi cua
 * minh, `fresh=1` tinh lai ngay nhung khong qua mot lan moi 10 giay.
 *
 * run-tests.mjs tat lop dem cho ca bo test; file nay bat lai.
 */
process.env.WORKFLOW_RESPONSE_CACHE = 'on';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-cache-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';

const { createApp } = await import('../app.ts');
const { closeDatabase } = await import('../db/connection.ts');
const { clearResponseCache } = await import('../lib/responseCache.ts');

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

async function get(pathname: string) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, cache: response.headers.get('x-cache'), body };
}

test('lan doc thu hai trong 5 phut lay tu dem, kem computed_at', async () => {
  clearResponseCache();
  const first = await get('/api/views/dashboard');
  assert.equal(first.status, 200);
  assert.equal(first.cache, 'miss');
  assert.equal(typeof first.body.computed_at, 'string');

  const second = await get('/api/views/dashboard');
  assert.equal(second.cache, 'hit');
  assert.equal(second.body.computed_at, first.body.computed_at);
});

test('query khac nhau la khoa khac nhau', async () => {
  clearResponseCache();
  assert.equal((await get('/api/views/reports?from=2026-01-01&to=2026-03-31')).cache, 'miss');
  assert.equal((await get('/api/views/reports?from=2026-04-01&to=2026-06-30')).cache, 'miss');
  assert.equal((await get('/api/views/reports?from=2026-01-01&to=2026-03-31')).cache, 'hit');
});

test('nguoi dung vua ghi du lieu thi lan doc sau tinh lai', async () => {
  clearResponseCache();
  await get('/api/views/dashboard');
  assert.equal((await get('/api/views/dashboard')).cache, 'hit');

  const created = await fetch(`${baseUrl}/api/customers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Khach moi de bo dem' }),
  });
  assert.equal(created.status, 201);
  assert.equal((await get('/api/views/dashboard')).cache, 'miss');
});

test('ghi that bai (4xx) khong bo dem', async () => {
  clearResponseCache();
  await get('/api/views/dashboard');
  const failed = await fetch(`${baseUrl}/api/customers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.ok(failed.status >= 400);
  assert.equal((await get('/api/views/dashboard')).cache, 'hit');
});

test('fresh=1 tinh lai ngay, nhung bam lien tuc trong 10 giay thi lay dem', async () => {
  clearResponseCache();
  const first = await get('/api/views/pipeline-health');
  const refreshed = await get('/api/views/pipeline-health?fresh=1');
  assert.equal(refreshed.cache, 'miss');
  assert.notEqual(refreshed.body.computed_at, undefined);
  assert.ok(String(refreshed.body.computed_at) >= String(first.body.computed_at));
  /* Lan bam thu hai ngay sau do: khong tinh lai, tra ban vua tinh. */
  const again = await get('/api/views/pipeline-health?fresh=1');
  assert.equal(again.cache, 'hit');
  assert.equal(again.body.computed_at, refreshed.body.computed_at);
});
