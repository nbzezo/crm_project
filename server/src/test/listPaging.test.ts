import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * Danh sach lon tai dan (1.21.0): man Cong viec chi lay viec dang mo + viec xong
 * trong 30 ngay, phan cu hon tai theo trang; thu vien tai lieu theo trang; huy hieu
 * "Can theo doi" va so dem thanh ben tinh o may chu thay vi tai het viec ve dem.
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-paging-'));
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

interface TaskRow {
  id: number;
  title: string;
  is_done: number;
}
interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

/** Bang rieng cho test, kem mot cot. Viec da xong gan `completed_at` lui `daysAgo` ngay. */
const listId = (() => {
  const boardId = Number(
    db.prepare(`INSERT INTO boards (name) VALUES ('Bang phan trang')`).run().lastInsertRowid
  );
  return Number(
    db.prepare(`INSERT INTO lists (board_id, name, position) VALUES (?, 'Cot', 1)`).run(boardId)
      .lastInsertRowid
  );
})();

function addTask(
  title: string,
  opts: { doneDaysAgo?: number; due?: string; status?: string } = {}
): number {
  const done = opts.doneDaysAgo != null;
  return Number(
    db
      .prepare(
        `INSERT INTO cards (list_id, title, search_text, position, is_done, completed_at, due_date, status)
         VALUES (?, ?, lower(?), 1, ?, ${done ? `datetime('now','localtime','-' || ? || ' days')` : '?'}, ?, ?)`
      )
      .run(
        listId,
        title,
        title,
        done ? 1 : 0,
        done ? opts.doneDaysAgo : null,
        opts.due ?? null,
        opts.status ?? (done ? 'done' : 'todo')
      ).lastInsertRowid
  );
}

const openId = addTask('Zpg mo');
const recentDoneId = addTask('Zpg xong 5 ngay', { doneDaysAgo: 5 });
/* 7 viec xong lau, cach nhau tung ngay: 40, 41, ... 46 ngay truoc. */
const oldDoneIds = Array.from({ length: 7 }, (_, i) =>
  addTask(`Zpg xong cu ${i}`, { doneDaysAgo: 40 + i })
);

test('recent_days=30: viec dang mo + viec xong trong 30 ngay, khong co viec xong lau', async () => {
  const { status, data } = await get<TaskRow[]>(`/api/views/tasks?recent_days=30&q=zpg`);
  assert.equal(status, 200);
  const ids = new Set(data.map((row) => row.id));
  assert.ok(ids.has(openId));
  assert.ok(ids.has(recentDoneId));
  for (const id of oldDoneIds) assert.ok(!ids.has(id), 'viec xong qua 30 ngay phai de trang sau');

  /* Khong gui recent_days thi giu hanh vi cu: tra tat ca. */
  const all = await get<TaskRow[]>(`/api/views/tasks?q=zpg`);
  assert.equal(all.data.length, 9);
});

test('/tasks/older: trang 3 dong, moi nhat truoc, khong lap khong sot, het thi next_cursor = null', async () => {
  const seen: number[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const query: string = `days=30&limit=3&q=zpg${cursor ? `&cursor=${cursor}` : ''}`;
    const { status, data }: { status: number; data: Page<TaskRow> } = await get<Page<TaskRow>>(
      `/api/views/tasks/older?${query}`
    );
    assert.equal(status, 200);
    assert.ok(data.items.length <= 3);
    seen.push(...data.items.map((row) => row.id));
    cursor = data.next_cursor;
    pages += 1;
  } while (cursor && pages < 10);
  assert.equal(pages, 3);
  /* oldDoneIds xep tu moi den cu (40 ngay truoc dau tien) — dung thu tu tra ve. */
  assert.deepEqual(seen, oldDoneIds);
});

test('/tasks/older: con tro hong tra 400, so ngay ngoai 1..365 tra 400', async () => {
  assert.equal((await get('/api/views/tasks/older?cursor=khong-hop-le')).status, 400);
  assert.equal((await get('/api/views/tasks/older?days=0')).status, 400);
  assert.equal((await get('/api/views/tasks?recent_days=999')).status, 400);
});

test('nudge=1: qua han / sap den han trong 3 ngay / bi chan cua nguoi khac, bo viec cua minh, viec con, viec xa, cho khach chua co han', async () => {
  const today = new Date();
  const iso = (offset: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  /* Tat xac thuc thi "toi" la contact is_me (xem middleware/currentUser.ts). */
  const company = Number(
    db.prepare(`INSERT INTO customers (name) VALUES ('Cong ty nhac viec')`).run().lastInsertRowid
  );
  const addContact = (name: string, isMe: 0 | 1) =>
    Number(
      db
        .prepare(
          `INSERT INTO contacts (customer_id, full_name, is_me, is_active) VALUES (?, ?, ?, 1)`
        )
        .run(company, name, isMe).lastInsertRowid
    );
  const me = addContact('Toi', 1);
  const other = addContact('Nguoi nhan nhac', 0);
  const assign = (id: number, contactId: number) =>
    db.prepare(`UPDATE cards SET assignee_contact_id = ? WHERE id = ?`).run(contactId, id);

  const overdue = addTask('Znudge qua han', { due: iso(-2) });
  const soon = addTask('Znudge sap den', { due: iso(2) });
  const blocked = addTask('Znudge bi chan', { status: 'blocked' });
  const unassigned = addTask('Znudge chua giao', { due: iso(-1) });
  const far = addTask('Znudge con xa', { due: iso(20) });
  const child = addTask('Znudge viec con', { due: iso(-1) });
  const mine = addTask('Znudge cua minh', { due: iso(-3) });
  const mineBlocked = addTask('Znudge cua minh bi chan', { status: 'blocked' });
  const waitingNoDue = addTask('Znudge cho khach', { status: 'waiting_customer' });
  const waitingDue = addTask('Znudge cho khach co han', {
    status: 'waiting_customer',
    due: iso(1),
  });
  for (const id of [overdue, soon, blocked, far, child, waitingNoDue, waitingDue])
    assign(id, other);
  assign(mine, me);
  assign(mineBlocked, me);
  db.prepare(`UPDATE cards SET parent_id = ? WHERE id = ?`).run(overdue, child);

  const { data } = await get<TaskRow[]>(`/api/views/tasks?done=0&nudge=1&q=znudge`);
  const ids = data.map((row) => row.id).sort((a, b) => a - b);
  assert.deepEqual(
    ids,
    [overdue, soon, blocked, unassigned, waitingDue].sort((a, b) => a - b)
  );
  for (const id of [far, child, mine, mineBlocked, waitingNoDue]) assert.ok(!ids.includes(id));

  /* Huy hieu dem bang cung luat: so dem khop voi danh sach. */
  const { data: all } = await get<TaskRow[]>(`/api/views/tasks?done=0&nudge=1`);
  const { data: counts } = await get<Record<string, number>>('/api/views/tasks/counts');
  assert.equal(counts.nudge, all.length);
  assert.equal(typeof counts.nudge_today, 'number');
});

test('/tasks/counts khop voi dem tren danh sach day du', async () => {
  const { data: counts } = await get<Record<string, number>>('/api/views/tasks/counts');
  const { data: all } = await get<TaskRow[]>('/api/views/tasks');
  assert.equal(counts.owned, all.filter((row) => !row.is_done).length);
  assert.equal(counts.completed, all.filter((row) => row.is_done).length);
  assert.equal(typeof counts.watching, 'number');
});

test('/documents/page: moi nhat truoc, tai dan theo con tro, loc theo id de mo tu lien ket', async () => {
  const insert = db.prepare(
    `INSERT INTO documents (name, file_name, stored_name, search_text, created_at)
     VALUES (?, ?, ?, ?, datetime('now','localtime','-' || ? || ' hours'))`
  );
  const ids = Array.from({ length: 5 }, (_, i) =>
    Number(insert.run(`Tai lieu ${i}`, `t${i}.pdf`, `s${i}.pdf`, `zpgdoc ${i}`, i).lastInsertRowid)
  );
  const first = await get<Page<{ id: number }>>(`/api/documents/page?q=zpgdoc&limit=2`);
  assert.deepEqual(
    first.data.items.map((d) => d.id),
    ids.slice(0, 2)
  );
  assert.ok(first.data.next_cursor);
  const rest: number[] = [];
  let cursor: string | null = first.data.next_cursor;
  while (cursor) {
    const page: { status: number; data: Page<{ id: number }> } = await get<Page<{ id: number }>>(
      `/api/documents/page?q=zpgdoc&limit=2&cursor=${cursor}`
    );
    rest.push(...page.data.items.map((d) => d.id));
    cursor = page.data.next_cursor;
  }
  assert.deepEqual(rest, ids.slice(2));

  const focused = await get<{ id: number }[]>(`/api/documents?id=${ids[4]}`);
  assert.deepEqual(
    focused.data.map((d) => d.id),
    [ids[4]]
  );
});

test('/customers?fields=basic: cung danh sach, khong kem so lieu tinh tu bang con', async () => {
  const full = await get<Record<string, unknown>[]>('/api/customers');
  const basic = await get<Record<string, unknown>[]>('/api/customers?fields=basic');
  assert.equal(basic.status, 200);
  assert.deepEqual(
    basic.data.map((c) => c.id),
    full.data.map((c) => c.id)
  );
  for (const customer of basic.data) {
    assert.equal(typeof customer.name, 'string');
    assert.equal(customer.open_deal_count, undefined);
  }
});

test('/revenues/comparison: totals khop tong tung dong, lines=none bo phan chi tiet', async () => {
  const customerId = Number(
    db
      .prepare(
        `INSERT INTO customers (name, org_kind, search_text) VALUES ('Khach doanh thu', 'customer', 'khach doanh thu')`
      )
      .run().lastInsertRowid
  );
  const serviceId = Number(
    db.prepare(`INSERT INTO services (name) VALUES ('Dich vu so sanh')`).run().lastInsertRowid
  );
  const year = new Date().getFullYear();
  const insertCell = db.prepare(
    `INSERT INTO service_revenues (line_id, period, amount_vnd, stage) VALUES (?, ?, ?, 'paid')`
  );
  for (let i = 0; i < 3; i++) {
    const lineId = Number(
      db
        .prepare(
          `INSERT INTO customer_services (customer_id, service_id, status) VALUES (?, ?, 'using')`
        )
        .run(customerId, serviceId).lastInsertRowid
    );
    for (let m = 1; m <= 12; m++) {
      insertCell.run(lineId, `${year - 1}-${String(m).padStart(2, '0')}`, 1_000_000 * (i + 1));
      if (m <= 3)
        insertCell.run(lineId, `${year}-${String(m).padStart(2, '0')}`, 1_200_000 * (i + 1));
    }
  }
  interface ComparisonLine {
    projected_total_vnd: number;
    prev_total_vnd: number;
  }
  interface Comparison {
    totals: { projected_total_vnd: number; prev_total_vnd: number };
    lines: ComparisonLine[];
  }
  const full = await get<Comparison>(`/api/revenues/comparison?year=${year}&group=all`);
  assert.equal(full.status, 200);
  assert.ok(full.data.lines.length >= 3);
  assert.equal(
    full.data.totals.projected_total_vnd,
    full.data.lines.reduce((sum, line) => sum + line.projected_total_vnd, 0)
  );
  assert.equal(
    full.data.totals.prev_total_vnd,
    full.data.lines.reduce((sum, line) => sum + line.prev_total_vnd, 0)
  );

  const slim = await get<Comparison>(`/api/revenues/comparison?year=${year}&group=all&lines=none`);
  assert.deepEqual(slim.data.lines, []);
  assert.deepEqual(slim.data.totals, full.data.totals);
});
