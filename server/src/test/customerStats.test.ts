import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-customer-stats-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';
process.env.WORKFLOW_RESPONSE_CACHE = 'off';

const { createApp } = await import('../app.ts');
const { db, closeDatabase } = await import('../db/connection.ts');
const { rebuildCustomerStats } = await import('../services/customerStats.ts');

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

async function call(method: string, pathname: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: (await response.json()) as unknown };
}

function customer(name: string): number {
  return Number(
    db
      .prepare(`INSERT INTO customers (name, org_kind, status) VALUES (?, 'customer', 'customer')`)
      .run(name).lastInsertRowid
  );
}

function oracle(customerId: number): Record<string, unknown> {
  const get = (sql: string) =>
    (db.prepare(sql).get(customerId) as Record<string, unknown> | undefined) ?? { value: null };
  return {
    open_deal_count: get(
      `SELECT COUNT(*) AS value FROM deals d WHERE d.customer_id = ? AND d.stage_category = 'open'`
    ).value,
    deal_count: get(`SELECT COUNT(*) AS value FROM deals d WHERE d.customer_id = ?`).value,
    open_task_count: get(
      `SELECT COUNT(*) AS value FROM cards k WHERE k.customer_id = ? AND k.is_done = 0 AND k.is_archived = 0`
    ).value,
    overdue_task_count: get(
      `SELECT COUNT(*) AS value FROM cards k WHERE k.customer_id = ? AND k.is_done = 0 AND k.is_archived = 0 AND k.due_date IS NOT NULL AND substr(k.due_date, 1, 10) < date('now','localtime')`
    ).value,
    total_won_vnd: get(
      `SELECT COALESCE(SUM(d.value_vnd), 0) AS value FROM deals d WHERE d.customer_id = ? AND d.stage_category = 'won'`
    ).value,
    open_pipeline_vnd: get(
      `SELECT COALESCE(SUM(d.value_vnd), 0) AS value FROM deals d WHERE d.customer_id = ? AND d.stage_category = 'open'`
    ).value,
    active_contract_count: get(
      `SELECT COUNT(*) AS value FROM contracts k WHERE k.customer_id = ? AND k.status = 'active'`
    ).value,
    last_activity_at: get(
      `SELECT MAX(i.occurred_at) AS value FROM interactions i WHERE i.customer_id = ?`
    ).value,
    deals_without_next_action_count: get(
      `SELECT COUNT(*) AS value FROM deals d WHERE d.customer_id = ? AND d.stage_category = 'open' AND trim(COALESCE(d.next_action, '')) = ''`
    ).value,
    overdue_next_action_count: get(
      `SELECT COUNT(*) AS value FROM deals d WHERE d.customer_id = ? AND d.stage_category = 'open' AND d.next_action_date IS NOT NULL AND substr(d.next_action_date, 1, 10) < date('now','localtime')`
    ).value,
    next_deal_action: get(
      `SELECT d.next_action AS value FROM deals d WHERE d.customer_id = ? AND d.stage_category = 'open' AND trim(COALESCE(d.next_action, '')) <> '' ORDER BY d.next_action_date IS NULL, d.next_action_date, d.updated_at DESC LIMIT 1`
    ).value,
    next_deal_action_date: get(
      `SELECT d.next_action_date AS value FROM deals d WHERE d.customer_id = ? AND d.stage_category = 'open' AND trim(COALESCE(d.next_action, '')) <> '' ORDER BY d.next_action_date IS NULL, d.next_action_date, d.updated_at DESC LIMIT 1`
    ).value,
    next_task_title: get(
      `SELECT k.title AS value FROM cards k WHERE k.customer_id = ? AND k.is_done = 0 AND k.is_archived = 0 ORDER BY k.due_date IS NULL, k.due_date, k.updated_at DESC LIMIT 1`
    ).value,
    next_task_due_date: get(
      `SELECT k.due_date AS value FROM cards k WHERE k.customer_id = ? AND k.is_done = 0 AND k.is_archived = 0 ORDER BY k.due_date IS NULL, k.due_date, k.updated_at DESC LIMIT 1`
    ).value,
    next_reminder_title: get(
      `SELECT r.title AS value FROM reminders r WHERE r.customer_id = ? AND r.is_done = 0 ORDER BY r.due_at LIMIT 1`
    ).value,
    next_reminder_due_at: get(
      `SELECT r.due_at AS value FROM reminders r WHERE r.customer_id = ? AND r.is_done = 0 ORDER BY r.due_at LIMIT 1`
    ).value,
  };
}

const statNames = Object.keys(oracle(0));

test('customer stats khop oracle, trigger SQL va rebuild', async () => {
  const a = customer('Khach A');
  const b = customer('Khach B');
  customer('Khach C');
  db.prepare(
    `INSERT INTO deals (customer_id, title, stage, value_vnd, next_action, next_action_date) VALUES (?, 'Mo', 'negotiating', 120, 'Goi lai', date('now','localtime','-1 day'))`
  ).run(a);
  db.prepare(
    `INSERT INTO deals (customer_id, title, stage, value_vnd) VALUES (?, 'Da thang', 'won', 900)`
  ).run(a);
  db.prepare(`INSERT INTO contracts (customer_id, name, status) VALUES (?, 'HD A', 'active')`).run(
    a
  );
  db.prepare(
    `INSERT INTO interactions (customer_id, type, occurred_at, summary) VALUES (?, 'call', '2026-01-02', 'Goi')`
  ).run(a);
  db.prepare(
    `INSERT INTO reminders (customer_id, title, due_at) VALUES (?, 'Nho A', '2026-01-03')`
  ).run(a);
  const board = Number(db.prepare(`INSERT INTO boards (name) VALUES ('B')`).run().lastInsertRowid);
  const list = Number(
    db.prepare(`INSERT INTO lists (board_id, name, position) VALUES (?, 'L', 1)`).run(board)
      .lastInsertRowid
  );
  db.prepare(
    `INSERT INTO cards (list_id, customer_id, title, position, is_done, is_archived, due_date) VALUES (?, ?, 'Viec A', 1, 0, 0, date('now','localtime','-1 day'))`
  ).run(list, a);

  const first = await call('GET', '/api/customers');
  assert.equal(first.status, 200);
  for (const row of first.data as Array<Record<string, unknown>>) {
    const expected = oracle(Number(row.id));
    for (const name of statNames)
      assert.equal(row[name], expected[name], `${name} customer ${row.id}`);
  }
  assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM stats_dirty`).get() as { n: number }).n, 0);

  db.prepare(
    `UPDATE deals SET value_vnd = 777 WHERE customer_id = ? AND stage = 'negotiating'`
  ).run(a);
  const afterSql = await call('GET', '/api/customers');
  const afterRow = (afterSql.data as Array<Record<string, unknown>>).find((row) => row.id === a);
  assert.equal(afterRow?.open_pipeline_vnd, oracle(a).open_pipeline_vnd);

  /* Ghi qua API (ca 2 cua dac ta): moi lan doc lai phai khop oracle ngay, ca khach cu lan
     khach moi khi mot co hoi doi khach. */
  const expectMatches = async (ids: number[], label: string) => {
    const rows = (await call('GET', '/api/customers')).data as Array<Record<string, unknown>>;
    for (const id of ids) {
      const row = rows.find((item) => item.id === id);
      for (const name of statNames)
        assert.equal(row?.[name], oracle(id)[name], `${label}: ${name} #${id}`);
    }
  };
  const openDeal = (
    db.prepare(`SELECT id FROM deals WHERE customer_id = ? AND stage = 'negotiating'`).get(a) as {
      id: number;
    }
  ).id;
  assert.equal((await call('PATCH', `/api/deals/${openDeal}`, { customer_id: b })).status, 200);
  await expectMatches([a, b], 'chuyen co hoi sang khach khac');
  const cardId = (db.prepare(`SELECT id FROM cards WHERE customer_id = ?`).get(a) as { id: number })
    .id;
  assert.equal((await call('PATCH', `/api/cards/${cardId}`, { is_done: true })).status, 200);
  await expectMatches([a], 'viec xong');
  const contractId = (
    db.prepare(`SELECT id FROM contracts WHERE customer_id = ?`).get(a) as { id: number }
  ).id;
  assert.equal((await call('DELETE', `/api/contracts/${contractId}`)).status, 200);
  await expectMatches([a], 'xoa hop dong');
  assert.equal(
    (
      await call('POST', '/api/interactions', {
        customer_id: b,
        type: 'call',
        occurred_at: '2026-02-01 09:00',
        summary: 'Goi B',
      })
    ).status,
    201
  );
  await expectMatches([b], 'them tuong tac');
  const reminderId = (
    db.prepare(`SELECT id FROM reminders WHERE customer_id = ?`).get(a) as { id: number }
  ).id;
  assert.equal(
    (await call('PATCH', `/api/reminders/${reminderId}`, { is_done: true })).status,
    200
  );
  await expectMatches([a], 'nhac hen xong');

  db.prepare(`DELETE FROM customer_stats`).run();
  rebuildCustomerStats(db);
  const afterRebuild = await call('GET', '/api/customers');
  const rebuilt = (afterRebuild.data as Array<Record<string, unknown>>).find((row) => row.id === a);
  for (const name of statNames) assert.equal(rebuilt?.[name], oracle(a)[name], name);

  const created = await call('POST', '/api/customers', { name: 'Khach moi' });
  assert.equal(created.status, 201);
  const listed = await call('GET', '/api/customers');
  const newRow = (listed.data as Array<Record<string, unknown>>).find(
    (row) => row.name === 'Khach Moi'
  );
  assert.equal(newRow?.open_deal_count, 0);
  assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM stats_dirty`).get() as { n: number }).n, 0);
});
