import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * 1.42.0 — hai cho cung mot khai niem tung song lech nhau:
 *  1. Hoan thanh cong viec ma co hoi dang lay lam "Viec ke tiep" thi next action cap nhat.
 *  2. Bien ban hop (Trang tai lieu, muc dich Hop) tinh la lan lien he voi khach.
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-sync-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';
process.env.WORKFLOW_RESPONSE_CACHE = 'off';

const { createApp } = await import('../app.ts');
const { db, closeDatabase } = await import('../db/connection.ts');
const { setCardStatus } = await import('../services/cardService.ts');
const { careStatusOf } = await import('../services/customerCare.ts');
const { flushCustomerStats } = await import('../services/customerStats.ts');

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
  assert.equal(response.status, 200, pathname);
  return await response.json();
}

const insert = (sql: string, ...args: unknown[]) =>
  Number(db.prepare(sql).run(...args).lastInsertRowid);

function customer(name: string): number {
  return insert(
    `INSERT INTO customers (name, org_kind, status) VALUES (?, 'customer', 'customer')`,
    name
  );
}

function deal(customerId: number, nextAction: string | null, stage = 'negotiating'): number {
  return insert(
    `INSERT INTO deals (customer_id, title, stage, value_vnd, next_action, next_action_date,
                        created_at)
     VALUES (?, 'Cơ hội', ?, 100, ?, date('now','localtime','-1 day'),
             datetime('now','localtime','-60 days'))`,
    customerId,
    stage,
    nextAction
  );
}

const listId = insert(
  `INSERT INTO lists (board_id, name, position) VALUES (?, 'Việc', 1)`,
  insert(`INSERT INTO boards (name) VALUES ('Bảng đồng bộ')`)
);

function card(dealId: number, title: string, dueDate: string | null = null): number {
  return insert(
    `INSERT INTO cards (list_id, title, position, deal_id, due_date) VALUES (?, ?, 1, ?, ?)`,
    listId,
    title,
    dealId,
    dueDate
  );
}

const nextActionOf = (dealId: number) =>
  db.prepare(`SELECT next_action, next_action_date FROM deals WHERE id = ?`).get(dealId) as {
    next_action: string | null;
    next_action_date: string | null;
  };

test('xong cong viec trung next action: xoa next action khi khong con viec nao', () => {
  const dealId = deal(customer('KH xoá'), 'Gửi báo giá');
  const cardId = card(dealId, '  gửi   BÁO GIÁ ');
  setCardStatus(cardId, 'done');
  assert.deepEqual(nextActionOf(dealId), { next_action: null, next_action_date: null });
});

test('xong cong viec trung next action: lay viec mo co han som nhat lam next action moi', () => {
  const dealId = deal(customer('KH nối tiếp'), 'Demo sản phẩm');
  const cardId = card(dealId, 'Demo sản phẩm');
  card(dealId, 'Chưa có hạn');
  card(dealId, 'Ký hợp đồng', '2099-03-01');
  card(dealId, 'Gửi đề xuất', '2099-02-01');
  setCardStatus(cardId, 'done');
  assert.deepEqual(nextActionOf(dealId), {
    next_action: 'Gửi đề xuất',
    next_action_date: '2099-02-01',
  });
});

test('khong dong toi next action nguoi dung tu go, hay co hoi da dong', () => {
  const custom = deal(customer('KH tự gõ'), 'Mời ăn trưa giám đốc');
  setCardStatus(card(custom, 'Gửi báo giá'), 'done');
  assert.equal(nextActionOf(custom).next_action, 'Mời ăn trưa giám đốc');

  const won = deal(customer('KH đã thắng'), 'Gửi báo giá', 'won');
  setCardStatus(card(won, 'Gửi báo giá'), 'done');
  assert.equal(nextActionOf(won).next_action, 'Gửi báo giá');
});

test('cong viec lap lai: ban ke tiep tro thanh next action voi han moi', () => {
  const dealId = deal(customer('KH lặp'), 'Gọi chăm sóc');
  const cardId = card(dealId, 'Gọi chăm sóc', '2099-01-10');
  db.prepare(`UPDATE cards SET recur_rule = '{"unit":"week","interval":1}' WHERE id = ?`).run(
    cardId
  );
  setCardStatus(cardId, 'done');
  const next = nextActionOf(dealId);
  assert.equal(next.next_action, 'Gọi chăm sóc');
  assert.equal(next.next_action_date, '2099-01-17');
});

test('bien ban hop tinh la lan lien he: khach, co hoi, nhip cham soc', async () => {
  const customerId = customer('KH họp');
  const dealId = deal(customerId, null);
  const lastWeek = (
    db.prepare(`SELECT strftime('%Y-%m-%dT%H:%M','now','localtime','-7 days') AS t`).get() as {
      t: string;
    }
  ).t;

  // Chua co gi: co hoi "khong tuong tac" tu luc tao (60 ngay), khach chua lien he lan nao.
  const before = (await get(`/api/deals/${dealId}`)) as { days_idle: number };
  assert.ok(before.days_idle >= 59);

  // Bien ban gan qua CO HOI (khong gan khach truc tiep) van tinh cho khach.
  const noteId = insert(
    `INSERT INTO meeting_notes (deal_id, title, purpose_key, meeting_at) VALUES (?, 'Họp', 'meeting', ?)`,
    dealId,
    lastWeek
  );
  const afterNote = (await get(`/api/deals/${dealId}`)) as {
    days_idle: number;
    last_activity_at: string;
  };
  assert.equal(afterNote.last_activity_at, lastWeek);
  assert.ok(afterNote.days_idle >= 6 && afterNote.days_idle <= 8, String(afterNote.days_idle));

  const care = careStatusOf(db, {
    id: customerId,
    care_tier: 'standard',
    created_at: '2020-01-01 00:00:00',
  });
  assert.equal(care.last_contact_at, lastWeek);

  // Cache so lieu khach (v74) duoc danh dau ban qua trigger cua meeting_notes.
  flushCustomerStats(db);
  const cached = db
    .prepare(`SELECT last_activity_at FROM customer_stats WHERE customer_id = ?`)
    .get(customerId) as { last_activity_at: string | null };
  assert.equal(cached.last_activity_at, lastWeek);

  // Xoa bien ban (thung rac) thi khong con tinh, cache cung tinh lai.
  db.prepare(`UPDATE meeting_notes SET deleted_at = datetime('now','localtime') WHERE id = ?`).run(
    noteId
  );
  flushCustomerStats(db);
  assert.equal(
    (
      db
        .prepare(`SELECT last_activity_at FROM customer_stats WHERE customer_id = ?`)
        .get(customerId) as { last_activity_at: string | null }
    ).last_activity_at,
    null
  );
});

test('khong tinh: ghi chu khong phai bien ban hop, hay hop chua dien ra', () => {
  const customerId = customer('KH chưa họp');
  insert(
    `INSERT INTO meeting_notes (customer_id, title, purpose_key, meeting_at) VALUES (?, 'Kế hoạch', 'plan', '2026-01-01T09:00')`,
    customerId
  );
  insert(
    `INSERT INTO meeting_notes (customer_id, title, purpose_key, meeting_at) VALUES (?, 'Họp sắp tới', 'meeting', '2099-01-01T09:00')`,
    customerId
  );
  const row = db
    .prepare(`SELECT MAX(occurred_at) AS at FROM customer_touchpoints WHERE customer_id = ?`)
    .get(customerId) as { at: string | null };
  assert.equal(row.at, null);
});

test('bien ban gan qua du an tinh cho khach cua du an', () => {
  const customerId = customer('KH dự án');
  const projectId = insert(
    `INSERT INTO projects (name, customer_id) VALUES ('Triển khai', ?)`,
    customerId
  );
  insert(
    `INSERT INTO meeting_notes (project_id, title, purpose_key, meeting_at) VALUES (?, 'Họp triển khai', 'meeting', '2026-02-03T10:00')`,
    projectId
  );
  const row = db
    .prepare(`SELECT MAX(occurred_at) AS at FROM customer_touchpoints WHERE customer_id = ?`)
    .get(customerId) as { at: string | null };
  assert.equal(row.at, '2026-02-03T10:00');
});
