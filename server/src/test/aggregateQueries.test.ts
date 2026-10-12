import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-aggregate-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';
process.env.WORKFLOW_RESPONSE_CACHE = 'off';

const { createApp } = await import('../app.ts');
const { db, closeDatabase } = await import('../db/connection.ts');

let server: Server;
let baseUrl = '';

before(async () => {
  server = createApp({ auth: false }).listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Không khởi động được server test');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  closeDatabase();
  if (fixtureRoot.startsWith(os.tmpdir())) fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

async function call(pathname: string) {
  const response = await fetch(`${baseUrl}${pathname}`);
  return {
    status: response.status,
    data: (await response.json()) as Record<string, unknown>,
  };
}

const board = Number(db.prepare(`INSERT INTO boards (name) VALUES ('B')`).run().lastInsertRowid);
const list = Number(
  db.prepare(`INSERT INTO lists (board_id, name, position) VALUES (?, 'L', 1)`).run(board)
    .lastInsertRowid
);
const customer = Number(
  db.prepare(`INSERT INTO customers (name, org_kind) VALUES ('Khách', 'customer')`).run()
    .lastInsertRowid
);

function card(
  title: string,
  due: string | null,
  done = 0,
  archived = 0,
  completedAt: string | null = null
) {
  return Number(
    db
      .prepare(
        `INSERT INTO cards
          (list_id, customer_id, title, position, is_done, is_archived, due_date, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ${due}, ${completedAt})`
      )
      .run(list, customer, title, Date.now(), done, archived).lastInsertRowid
  );
}

test('các tổng hợp mở/xong giữ đúng biên ngày', async () => {
  card('Hôm qua', `date('now','localtime','-1 day') || ' 23:59'`);
  card('Hôm nay lúc 0', `date('now','localtime') || ' 00:00'`);
  card('Hôm nay', `date('now','localtime')`);
  card('Ngày mai', `date('now','localtime','+1 day') || ' 00:00'`);
  card('Không hạn', null);
  card(
    'Xong hôm qua',
    `date('now','localtime','-1 day')`,
    1,
    0,
    `date('now','localtime') || ' 12:00'`
  );
  card('Lưu trữ', `date('now','localtime','-1 day')`, 0, 1);

  const counts = await call('/api/views/tasks/counts');
  assert.equal(counts.status, 200);
  assert.equal(counts.data.owned, 5);
  assert.equal(counts.data.completed, 1);
  assert.equal(counts.data.nudge_today, 2);

  const dashboard = await call('/api/views/dashboard');
  assert.equal(dashboard.status, 200);
  const taskCounts = dashboard.data.task_counts as Record<string, unknown>;
  assert.equal(taskCounts.overdue, 1);
  assert.equal(taskCounts.today, 2);
});

test('báo cáo và focus dùng nửa khoảng ngày', async () => {
  const from = String(
    (db.prepare(`SELECT date('now','localtime','-2 days') AS d`).get() as { d: string }).d
  );
  const to = String(
    (db.prepare(`SELECT date('now','localtime','-1 day') AS d`).get() as { d: string }).d
  );
  card(
    'Hoàn thành biên',
    `date('now','localtime','-2 days')`,
    1,
    0,
    `date('now','localtime','-2 days') || ' 00:00:00'`
  );
  card(
    'Hoàn thành giữa',
    `date('now','localtime','-1 day')`,
    1,
    0,
    `date('now','localtime','-1 day') || ' 23:59:59'`
  );
  const reports = await call(`/api/views/reports?from=${from}&to=${to}`);
  assert.equal(reports.status, 200);
  assert.equal((reports.data.summary as Record<string, unknown>).overdue_count, 1);
  const reminder = db
    .prepare(
      `INSERT INTO reminders (title, due_at, customer_id) VALUES ('Nhắc', date('now','localtime','-1 day') || ' 23:59', ?)`
    )
    .run(customer);
  assert.ok(reminder.lastInsertRowid);
  const focus = await call(`/api/focus?from=${from}&to=${to}`);
  assert.equal(focus.status, 200);
  const items = focus.data.items as Array<Record<string, unknown>>;
  assert.equal(items.filter((item) => item.kind === 'reminder').length, 1);
});

test('kế hoạch truy vấn có thể dùng chỉ mục việc mở', () => {
  const plan = db
    .prepare(
      `EXPLAIN QUERY PLAN
        SELECT COUNT(*) FROM cards k
         WHERE k.is_done = 0 AND k.is_archived = 0
           AND k.due_date < date('now','localtime')`
    )
    .all() as Array<{ detail: string }>;
  assert.ok(plan.some((row) => row.detail.includes('idx_cards_open_due')));
});
