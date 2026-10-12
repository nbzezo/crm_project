import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-slim-payloads-'));
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

async function get<T>(pathname: string): Promise<{ status: number; data: T }> {
  const response = await fetch(`${baseUrl}${pathname}`);
  return { status: response.status, data: (await response.json()) as T };
}

const boardId = Number(
  db.prepare(`INSERT INTO boards (name) VALUES ('Bảng lịch')`).run().lastInsertRowid
);
const listId = Number(
  db
    .prepare(`INSERT INTO lists (board_id, name, position) VALUES (?, 'Việc cần làm', 1)`)
    .run(boardId).lastInsertRowid
);
const customerId = Number(
  db
    .prepare(
      `INSERT INTO customers (name, short_name, notes, org_kind, owner_contact_id, search_text)
       VALUES ('Khách lịch', 'KHL', 'Ghi chú khách', 'customer', NULL, 'khach lich')`
    )
    .run().lastInsertRowid
);
const contactId = Number(
  db
    .prepare(`INSERT INTO contacts (customer_id, full_name) VALUES (?, 'Người phụ trách')`)
    .run(customerId).lastInsertRowid
);
const cardId = Number(
  db
    .prepare(
      `INSERT INTO cards
         (list_id, title, description, position, due_date, priority, customer_id, assignee_contact_id, search_text)
       VALUES (?, 'Thẻ lịch', 'Không được trả về', 1, '2099-02-03', 'urgent', ?, ?, 'the lich')`
    )
    .run(listId, customerId, contactId).lastInsertRowid
);
const labelId = Number(
  db.prepare(`INSERT INTO labels (name, color) VALUES ('Quan trọng', '#f00')`).run().lastInsertRowid
);
db.prepare(`INSERT INTO card_labels (card_id, label_id) VALUES (?, ?)`).run(cardId, labelId);
db.prepare(`INSERT INTO checklist_items (card_id, content, position) VALUES (?, 'Bước 1', 1)`).run(
  cardId
);

const dealId = Number(
  db
    .prepare(
      `INSERT INTO deals
         (customer_id, title, stage, stage_category, value_vnd, expected_close_date, next_action,
          next_action_date, search_text)
       VALUES (?, 'Cơ hội lịch', 'negotiating', 'open', 123000, '2099-02-04', 'Gọi lại', '2099-02-05', 'co hoi lich')`
    )
    .run(customerId).lastInsertRowid
);
db.prepare(
  `INSERT INTO reminders (title, due_at, card_id, customer_id) VALUES ('Nhắc lịch', '2099-02-06T09:30', ?, ?)`
).run(cardId, customerId);
db.prepare(
  `INSERT INTO calendar_events
     (title, description, location, event_type, start_at, end_at, all_day, status, reminder_minutes, search_text)
   VALUES ('Sự kiện lịch', 'Mô tả', 'Phòng họp', 'meeting', '2099-02-07T09:00', '2099-02-07T10:00', 0,
           'pending', 15, 'su kien lich')`
).run();
db.prepare(
  `INSERT INTO contracts (customer_id, name, value_vnd, end_date, status, search_text)
   VALUES (?, 'Hợp đồng lịch', 456000, '2099-02-08', 'active', 'hop dong lich')`
).run(customerId);

test('calendar card chi tra truong client doc, van dung du lieu dung', async () => {
  const { status, data } = await get<Record<string, unknown>[]>(
    '/api/views/calendar?from=2099-02-01&to=2099-02-10'
  );
  assert.equal(status, 200);
  const card = data.find((item) => item.kind === 'card');
  assert.deepEqual(card, {
    // CalendarView.tsx, calendarModel.ts: dùng để tạo CalEvent và kéo thẻ.
    kind: 'card',
    id: cardId,
    title: 'Thẻ lịch',
    date: '2099-02-03',
    priority: 'urgent',
    is_done: 0,
    board_name: 'Bảng lịch',
    customer_name: 'Khách lịch',
  });
  assert.equal('description' in card!, false);
  assert.equal('checklist_total' in card!, false);
  assert.equal('label_ids' in card!, false);
  assert.equal('assignee_name' in card!, false);
});

test('calendar giu nguyen tap khoa cua cac muc khac', async () => {
  const { data } = await get<Record<string, unknown>[]>(
    '/api/views/calendar?from=2099-02-01&to=2099-02-10'
  );
  // Snapshot shape hiện tại của views.ts trước khi thu gọn card.
  assert.deepEqual(Object.keys(data.find((item) => item.kind === 'event')!).sort(), [
    'all_day',
    'completed_at',
    'created_at',
    'description',
    'end_at',
    'event_type',
    'id',
    'is_overdue',
    'kind',
    'location',
    'original_start_at',
    'owner_contact_id',
    'recurrence_parent_id',
    'recurrence_rule',
    'reminder_at',
    'reminder_minutes',
    'search_text',
    'start_at',
    'status',
    'title',
    'updated_at',
  ]);
  assert.deepEqual(Object.keys(data.find((item) => item.kind === 'reminder')!).sort(), [
    'card_id',
    'date',
    'id',
    'is_done',
    'kind',
    'time',
    'title',
  ]);
  assert.deepEqual(Object.keys(data.find((item) => item.kind === 'next_action')!).sort(), [
    'customer_name',
    'date',
    'id',
    'kind',
    'title',
  ]);
  assert.deepEqual(Object.keys(data.find((item) => item.kind === 'deal_close')!).sort(), [
    'customer_name',
    'date',
    'id',
    'kind',
    'title',
    'value_vnd',
  ]);
  assert.deepEqual(Object.keys(data.find((item) => item.kind === 'contract_end')!).sort(), [
    'customer_name',
    'date',
    'id',
    'kind',
    'title',
    'value_vnd',
  ]);
  assert.ok(data.some((item) => item.kind === 'event'));
  assert.ok(data.some((item) => item.kind === 'reminder'));
  assert.ok(data.some((item) => item.kind === 'next_action'));
  assert.ok(data.some((item) => item.kind === 'deal_close'));
  assert.ok(data.some((item) => item.kind === 'contract_end'));
  assert.equal(
    (data.find((item) => item.kind === 'deal_close') as Record<string, unknown>).id,
    dealId
  );
});

test('customers list bo search_text nhung giu cot goc va thong ke', async () => {
  const { status, data } = await get<Record<string, unknown>[]>('/api/customers');
  assert.equal(status, 200);
  const customer = data.find((item) => item.id === customerId)!;
  const columns = (db.prepare(`PRAGMA table_info(customers)`).all() as { name: string }[])
    .map((column) => column.name)
    .filter((name) => name !== 'search_text');
  for (const column of columns) assert.ok(column in customer, `thiếu cột ${column}`);
  assert.equal('search_text' in customer, false);
  assert.equal(customer.name, 'Khách lịch');
  assert.equal(customer.notes, 'Ghi chú khách');
  assert.equal(customer.org_kind, 'customer');
  assert.equal(customer.owner_contact_id, null);
  assert.equal(customer.open_deal_count, 1);
  assert.equal(customer.deal_count, 1);
  assert.equal(customer.open_task_count, 1);
  assert.equal(customer.overdue_task_count, 0);
  assert.equal(customer.active_contract_count, 1);
});
