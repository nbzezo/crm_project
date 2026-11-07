import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-task-delta-'));
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

async function request<T>(
  pathname: string,
  init?: RequestInit
): Promise<{ status: number; data: T }> {
  const response = await fetch(`${baseUrl}${pathname}`, init);
  return { status: response.status, data: (await response.json()) as T };
}

const boardId = Number(
  db.prepare(`INSERT INTO boards (name) VALUES ('Bảng delta')`).run().lastInsertRowid
);
const listId = Number(
  db.prepare(`INSERT INTO lists (board_id, name, position) VALUES (?, 'Cột delta', 1)`).run(boardId)
    .lastInsertRowid
);
const card = (title: string) =>
  Number(
    db
      .prepare(
        `INSERT INTO cards (list_id, title, search_text, position, is_done, status) VALUES (?, ?, lower(?), ?, 0, 'todo')`
      )
      .run(listId, title, title, Date.now()).lastInsertRowid
  );
const firstId = card('Việc delta một');
const secondId = card('Việc delta hai');

test('delta không since trả items, ids tăng dần và server_time hợp lệ', async () => {
  const result = await request<{ items: { id: number }[]; ids: number[]; server_time: string }>(
    '/api/views/tasks?done=0&delta=1'
  );
  assert.equal(result.status, 200);
  assert.match(result.data.server_time, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.deepEqual(
    result.data.ids,
    result.data.items.map((row) => row.id).sort((a, b) => a - b)
  );
  assert.ok(result.data.ids.includes(firstId) && result.data.ids.includes(secondId));
});

test('since chỉ trả thẻ đã cập nhật, ids vẫn đầy đủ', async () => {
  db.prepare(`UPDATE cards SET updated_at = '2000-01-01 00:00:00'`).run();
  const before = await request<{ items: { id: number }[]; ids: number[] }>(
    '/api/views/tasks?done=0&delta=1&since=2001-01-01%2000:00:00'
  );
  assert.deepEqual(before.data.items, []);
  assert.ok(before.data.ids.includes(firstId));
  await request(`/api/cards/${firstId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Việc delta đã đổi' }),
  });
  const afterUpdate = await request<{ items: { id: number; title: string }[] }>(
    '/api/views/tasks?done=0&delta=1&since=2001-01-01%2000:00:00'
  );
  assert.deepEqual(
    afterUpdate.data.items.map((row) => row.id),
    [firstId]
  );
  assert.equal(afterUpdate.data.items[0].title, 'Việc delta đã đổi');
});

test('thêm checklist làm thẻ xuất hiện trong delta và tăng tổng', async () => {
  db.prepare(`UPDATE cards SET updated_at = '2000-01-01 00:00:00'`).run();
  const response = await request(`/api/cards/${secondId}/checklist`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: 'Bước delta' }),
  });
  assert.equal(response.status, 201);
  const delta = await request<{ items: { id: number; checklist_total: number }[] }>(
    '/api/views/tasks?done=0&delta=1&since=2001-01-01%2000:00:00'
  );
  assert.equal(delta.data.items[0].id, secondId);
  assert.equal(delta.data.items[0].checklist_total, 1);
});

test('xóa thẻ loại id khỏi delta', async () => {
  await request(`/api/cards/${firstId}`, { method: 'DELETE' });
  const delta = await request<{ ids: number[] }>('/api/views/tasks?done=0&delta=1');
  assert.ok(!delta.data.ids.includes(firstId));
});

test('fields=list giữ cột chính và làm rỗng dữ liệu dài', async () => {
  const full = await request<Record<string, unknown>[]>('/api/views/tasks?done=0');
  const list = await request<Record<string, unknown>[]>('/api/views/tasks?done=0&fields=list');
  const fullRow = full.data.find((row) => row.id === secondId)!;
  const listRow = list.data.find((row) => row.id === secondId)!;
  assert.equal(listRow.description, '');
  assert.equal(listRow.assignee_phone, null);
  for (const key of ['title', 'due_date', 'checklist_total', 'label_ids'])
    assert.deepEqual(listRow[key], fullRow[key]);
});

test('validate since và limit; mặc định vẫn trả mảng', async () => {
  assert.equal((await request('/api/views/tasks?delta=1&since=abc')).status, 400);
  assert.equal(
    (await request('/api/views/tasks?delta=1&limit=5&since=2001-01-01%2000:00:00')).status,
    400
  );
  assert.equal((await request('/api/views/tasks?delta=1&limit=0')).status, 400);
  assert.equal((await request('/api/views/tasks?delta=1&limit=5001')).status, 400);
  assert.equal((await request('/api/views/tasks?delta=1&limit=5&before_id=abc')).status, 400);
  const normal = await request<unknown>('/api/views/tasks');
  assert.ok(Array.isArray(normal.data));
});

test('tải theo khúc: đủ mọi việc, không trùng, có tổng và server_time ở khúc đầu', async () => {
  const extra = Array.from({ length: 5 }, (_, i) => card(`Viec khuc ${i}`));
  const all = await request<{ ids: number[] }>('/api/views/tasks?done=0&delta=1');
  type Chunk = {
    items: { id: number; title: string; label_ids: unknown }[];
    next_before_id: number | null;
    total: number | null;
    server_time: string;
  };
  const first = await request<Chunk>('/api/views/tasks?done=0&delta=1&fields=list&limit=2');
  assert.equal(first.status, 200);
  assert.equal(first.data.total, all.data.ids.length);
  assert.match(first.data.server_time, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(first.data.items.length, 2);
  assert.ok(Array.isArray(first.data.items[0].label_ids));
  const seen = first.data.items.map((row) => row.id);
  let next = first.data.next_before_id;
  let rounds = 0;
  while (next !== null) {
    const page = await request<Chunk>(
      `/api/views/tasks?done=0&delta=1&fields=list&limit=2&before_id=${next}`
    );
    assert.equal(page.data.total, null);
    assert.ok(page.data.items.every((row) => row.id < next!));
    seen.push(...page.data.items.map((row) => row.id));
    next = page.data.next_before_id;
    rounds += 1;
    assert.ok(rounds < 20);
  }
  assert.equal(new Set(seen).size, seen.length);
  assert.deepEqual(
    [...seen].sort((a, b) => a - b),
    all.data.ids
  );
  for (const id of extra) assert.ok(seen.includes(id));
});

test('tải theo khúc giữ bộ lọc', async () => {
  const chunk = await request<{ items: { id: number }[]; total: number }>(
    `/api/views/tasks?done=0&delta=1&limit=100&q=${encodeURIComponent('khuc 3')}`
  );
  assert.equal(chunk.data.total, 1);
  assert.equal(chunk.data.items.length, 1);
});
