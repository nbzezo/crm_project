/**
 * v62 — danh muc dong: ly do thua, loai tuong tac, loai tai lieu.
 *
 * Trong tam: gia tri tu them dung duoc ngay o API nghiep vu, gia tri bi an khong
 * dat moi duoc nhung ban ghi cu van sua duoc, gop chuyen du lieu va ghi nhat ky.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { type Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-v62-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';

const { createApp } = await import('../app.ts');
const { db, closeDatabase } = await import('../db/connection.ts');
const { migrate } = await import('../db/migrate.ts');

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

async function json(
  method: string,
  pathname: string,
  body?: unknown
): Promise<{ status: number; data: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    data: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

interface Item {
  id: number;
  item_key: string;
  label: string;
  is_active: number;
  is_system: number;
}

async function items(list: string): Promise<Item[]> {
  const config = await json('GET', '/api/crm-config');
  return (config.data.picklists as Record<string, Item[]>)[list];
}

async function newCustomer(name: string): Promise<number> {
  const customer = await json('POST', '/api/customers', { name });
  assert.equal(customer.status, 201);
  return Number(customer.data.id);
}

test('migration chen san ba danh muc voi dung khoa cu va muc he thong', async () => {
  const lost = await items('lost_reason');
  assert.equal(lost.length, 10);
  assert.deepEqual(
    lost.map((item) => item.item_key),
    [
      'price',
      'competitor',
      'no_budget',
      'project_stopped',
      'solution_mismatch',
      'requirement_unmet',
      'no_contact',
      'bad_timing',
      'self_build',
      'other',
    ]
  );
  assert.equal(lost.find((item) => item.item_key === 'other')?.is_system, 1);
  assert.equal((await items('interaction_type')).length, 9);
  const docs = await items('doc_type');
  assert.equal(docs.find((item) => item.item_key === 'contract')?.is_system, 1);
});

test('interactions khong con CHECK: loai tu them ghi duoc, loai la bi tu choi', async () => {
  const sql = (
    db.prepare(`SELECT sql FROM sqlite_master WHERE name = 'interactions'`).get() as { sql: string }
  ).sql;
  assert.doesNotMatch(sql, /CHECK\s*\(\s*type/i);

  const created = await json('POST', '/api/crm-config/picklists/interaction_type', {
    label: 'Hội thảo trực tuyến',
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.item_key, 'hoi_thao_truc_tuyen');

  const customerId = await newCustomer('KH Tương tác');
  const ok = await json('POST', '/api/interactions', {
    customer_id: customerId,
    type: 'hoi_thao_truc_tuyen',
    occurred_at: '2026-10-01 09:00',
    summary: 'Webinar giới thiệu',
  });
  assert.equal(ok.status, 201);

  const bad = await json('POST', '/api/interactions', {
    customer_id: customerId,
    type: 'khong_ton_tai',
    occurred_at: '2026-10-01 09:00',
    summary: 'x',
  });
  assert.equal(bad.status, 422);
  assert.equal(bad.data.code, 'PICKLIST_VALUE_INVALID');
});

test('muc bi an: khong dat moi duoc, ban ghi cu van sua duoc', async () => {
  const customerId = await newCustomer('KH Ẩn mục');
  const deal = await json('POST', '/api/deals', {
    customer_id: customerId,
    title: 'Cơ hội thua vì giá',
    stage: 'lost',
    lost_reason: 'price',
  });
  assert.equal(deal.status, 201);

  const price = (await items('lost_reason')).find((item) => item.item_key === 'price')!;
  const hidden = await json('PATCH', `/api/crm-config/picklists/lost_reason/${price.id}`, {
    is_active: false,
  });
  assert.equal(hidden.status, 200);

  // Sua co hoi cu, giu nguyen ly do da an: van luu duoc
  const edit = await json('PATCH', `/api/deals/${deal.data.id}`, {
    title: 'Đổi tên',
    lost_reason: 'price',
  });
  assert.equal(edit.status, 200);

  // Dat moi ly do da an cho co hoi khac: bi tu choi
  const other = await json('POST', '/api/deals', {
    customer_id: customerId,
    title: 'Cơ hội khác',
    stage: 'lost',
    lost_reason: 'price',
  });
  assert.equal(other.status, 422);

  await json('PATCH', `/api/crm-config/picklists/lost_reason/${price.id}`, { is_active: true });
});

test('muc he thong khong an, khong gop, khong xoa duoc', async () => {
  const other = (await items('lost_reason')).find((item) => item.item_key === 'other')!;
  const price = (await items('lost_reason')).find((item) => item.item_key === 'price')!;
  assert.equal(
    (await json('PATCH', `/api/crm-config/picklists/lost_reason/${other.id}`, { is_active: false }))
      .status,
    422
  );
  assert.equal(
    (
      await json('POST', `/api/crm-config/picklists/lost_reason/${other.id}/merge`, {
        into_id: price.id,
      })
    ).status,
    422
  );
  assert.equal(
    (await json('DELETE', `/api/crm-config/picklists/lost_reason/${other.id}`)).status,
    422
  );
  // Doi ten thi duoc
  const renamed = await json('PATCH', `/api/crm-config/picklists/lost_reason/${other.id}`, {
    label: 'Lý do khác',
  });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.data.label, 'Lý do khác');
});

test('nhan trung (khong phan biet dau, hoa thuong) bi tu choi', async () => {
  const dup = await json('POST', '/api/crm-config/picklists/lost_reason', { label: 'gia cao' });
  assert.equal(dup.status, 409);
  assert.equal(dup.data.code, 'PICKLIST_LABEL_TAKEN');
});

test('gop muc: chuyen moi co hoi, ghi nhat ky, xoa muc nguon; con dung thi khong xoa han', async () => {
  const customerId = await newCustomer('KH Gộp');
  const created = await json('POST', '/api/crm-config/picklists/lost_reason', {
    label: 'Giá không cạnh tranh',
  });
  const fromId = Number(created.data.id);
  const deal = await json('POST', '/api/deals', {
    customer_id: customerId,
    title: 'Thua vì giá 2',
    stage: 'lost',
    lost_reason: created.data.item_key,
  });
  assert.equal(deal.status, 201);

  const blocked = await json('DELETE', `/api/crm-config/picklists/lost_reason/${fromId}`);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.code, 'PICKLIST_ITEM_IN_USE');

  const usage = await json('GET', '/api/crm-config/picklists/lost_reason/usage');
  assert.equal(usage.data[fromId], 1);

  const price = (await items('lost_reason')).find((item) => item.item_key === 'price')!;
  const merged = await json('POST', `/api/crm-config/picklists/lost_reason/${fromId}/merge`, {
    into_id: price.id,
  });
  assert.equal(merged.status, 200);
  assert.equal(merged.data.moved, 1);

  const row = db.prepare(`SELECT lost_reason FROM deals WHERE id = ?`).get(deal.data.id) as {
    lost_reason: string;
  };
  assert.equal(row.lost_reason, 'price');
  assert.ok(!(await items('lost_reason')).some((item) => item.id === fromId));

  const log = db
    .prepare(
      `SELECT old_value, new_value, note FROM entity_change_log
        WHERE entity_type = 'deal' AND entity_id = ? AND field = 'lost_reason'
        ORDER BY id DESC LIMIT 1`
    )
    .get(deal.data.id) as { old_value: string; new_value: string; note: string };
  assert.equal(log.old_value, 'gia_khong_canh_tranh');
  assert.equal(log.new_value, 'price');
  assert.equal(log.note, 'Gộp mục danh mục');
});

test('sap xep phai gom dung moi muc', async () => {
  const list = await items('doc_type');
  const reversed = list.map((item) => item.id).reverse();
  const ok = await json('PUT', '/api/crm-config/picklists/doc_type/order', { ids: reversed });
  assert.equal(ok.status, 200);
  assert.deepEqual(
    (await items('doc_type')).map((item) => item.id),
    reversed
  );
  const partial = await json('PUT', '/api/crm-config/picklists/doc_type/order', {
    ids: reversed.slice(1),
  });
  assert.equal(partial.status, 422);
});

test('danh muc khong ton tai tra 404', async () => {
  assert.equal(
    (await json('POST', '/api/crm-config/picklists/khong_co', { label: 'x' })).status,
    404
  );
});

test('v62: gia tri la co san thanh muc an; quay lui keo gia tri tu them ve other', () => {
  const scratch = new Database(':memory:');
  scratch.pragma('foreign_keys = ON');
  migrate(scratch, 61);
  scratch.exec(`
    INSERT INTO customers (id, name) VALUES (1, 'KH');
    INSERT INTO deals (customer_id, title, stage, lost_reason) VALUES (1, 'D', 'lost', 'legacy_reason');
  `);
  migrate(scratch, 62);
  const legacy = scratch
    .prepare(`SELECT label, is_active FROM picklist_items WHERE item_key = 'legacy_reason'`)
    .get() as { label: string; is_active: number };
  assert.deepEqual({ ...legacy }, { label: 'legacy_reason', is_active: 0 });

  scratch.exec(`
    INSERT INTO interactions (customer_id, type, occurred_at, summary) VALUES (1, 'webinar', '2026-01-01', 's');
  `);
  scratch.exec(fs.readFileSync(new URL('../db/migrate-v62-rollback.sql', import.meta.url), 'utf8'));
  assert.equal(
    (scratch.prepare(`SELECT type FROM interactions`).get() as { type: string }).type,
    'other'
  );
  assert.equal(
    (scratch.prepare(`SELECT lost_reason FROM deals`).get() as { lost_reason: string }).lost_reason,
    'other'
  );
  assert.equal(
    scratch.prepare(`SELECT name FROM sqlite_master WHERE name = 'picklist_items'`).get(),
    undefined
  );
  scratch.close();
});
