import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-api-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';

const { createApp } = await import('../app.ts');
const { db, closeDatabase, FILES_DIR } = await import('../db/connection.ts');

let server: Server;
let baseUrl = '';

before(async () => {
  server = createApp().listen(0);
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
  return {
    status: response.status,
    data: (await response.json()) as Record<string, unknown>,
  };
}

async function createCustomer(name: string): Promise<number> {
  const response = await json('POST', '/api/customers', { name });
  assert.equal(response.status, 201);
  return Number(response.data.id);
}

test('health check kiem tra ca ung dung va database', async () => {
  const response = await json('GET', '/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(response.data, { ok: true, app: 'WorkFlow', database: 'ready' });

  const missing = await json('GET', '/api/khong-ton-tai');
  assert.equal(missing.status, 404);
});

test('API chan lien ket contact/deal/contract khac khach hang', async () => {
  const customerA = await createCustomer('Khach hang A');
  const customerB = await createCustomer('Khach hang B');
  const contactInfo = db
    .prepare(`INSERT INTO contacts (customer_id, full_name) VALUES (?, ?)`)
    .run(customerB, 'Lien he B');
  const contactB = Number(contactInfo.lastInsertRowid);

  const invalidDeal = await json('POST', '/api/deals', {
    customer_id: customerA,
    contact_id: contactB,
    title: 'Co hoi sai lien ket',
  });
  assert.equal(invalidDeal.status, 422);
  assert.equal(invalidDeal.data.code, 'CROSS_CUSTOMER_LINK');

  const deal = await json('POST', '/api/deals', {
    customer_id: customerA,
    title: 'Co hoi hop le',
  });
  assert.equal(deal.status, 201);

  const invalidContract = await json('POST', '/api/contracts', {
    customer_id: customerB,
    deal_id: Number(deal.data.id),
    name: 'Hop dong sai lien ket',
  });
  assert.equal(invalidContract.status, 422);

  const invalidBoard = await json('POST', '/api/boards', {
    name: 'Bang sai lien ket',
    customer_id: 999_999,
  });
  assert.equal(invalidBoard.status, 404);

  const invalidField = await json('POST', '/api/card-fields', {
    name: 'Truong sai lien ket',
    board_id: 999_999,
  });
  assert.equal(invalidField.status, 404);
});

test('reorder chi chap nhan hang xom trong dung scope va rollback khi loi', async () => {
  const boardResponse = await json('POST', '/api/boards', { name: 'Bang integration' });
  assert.equal(boardResponse.status, 201);
  const boardId = Number(boardResponse.data.id);
  const full = await json('GET', `/api/boards/${boardId}/full`);
  const lists = full.data.lists as { id: number }[];
  assert.ok(lists.length >= 2);

  const cardA = await json('POST', '/api/cards', { list_id: lists[0].id, title: 'The A' });
  const cardB = await json('POST', '/api/cards', { list_id: lists[1].id, title: 'The B' });
  const cardAId = Number(cardA.data.id);
  const cardBId = Number(cardB.data.id);

  const invalidMove = await json('PATCH', `/api/cards/${cardAId}/move`, {
    list_id: lists[0].id,
    beforeId: cardBId,
    afterId: null,
  });
  assert.equal(invalidMove.status, 422);
  const afterInvalid = db.prepare(`SELECT list_id FROM cards WHERE id = ?`).get(cardAId) as {
    list_id: number;
  };
  assert.equal(afterInvalid.list_id, lists[0].id);

  const selfNeighbor = await json('PATCH', `/api/cards/${cardAId}/move`, {
    list_id: lists[0].id,
    beforeId: cardAId,
    afterId: null,
  });
  assert.equal(selfNeighbor.status, 422);

  const validMove = await json('PATCH', `/api/cards/${cardAId}/move`, {
    list_id: lists[1].id,
    beforeId: cardBId,
    afterId: null,
  });
  assert.equal(validMove.status, 200);
  assert.equal(validMove.data.list_id, lists[1].id);
});

test('stage gate rollback khi bi chan va ghi history khi override', async () => {
  const customerId = await createCustomer('Khach hang stage gate');
  const created = await json('POST', '/api/deals', {
    customer_id: customerId,
    title: 'Co hoi stage gate',
  });
  assert.equal(created.status, 201);
  const dealId = Number(created.data.id);

  const blocked = await json('PATCH', `/api/deals/${dealId}/move`, {
    stage: 'quoted',
    beforeId: null,
    afterId: null,
  });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.code, 'STAGE_GATE_BLOCKED');
  const afterBlocked = db.prepare(`SELECT stage FROM deals WHERE id = ?`).get(dealId) as {
    stage: string;
  };
  assert.equal(afterBlocked.stage, 'lead');

  const overridden = await json(
    'PATCH',
    `/api/deals/${dealId}/move?override=1&reason=Chap%20nhan%20cho%20kiem%20thu`,
    { stage: 'quoted', beforeId: null, afterId: null }
  );
  assert.equal(overridden.status, 200);
  assert.equal(overridden.data.stage, 'quoted');
  assert.equal(overridden.data.probability, 60);
  const history = db
    .prepare(
      `SELECT reason FROM deal_score_history
        WHERE deal_id = ? AND factor = 'stage_gate_override'`
    )
    .all(dealId) as { reason: string }[];
  assert.equal(history.length, 1);
  assert.match(history[0].reason, /lead -> quoted/);
});

test('upload sai metadata khong de lai file mo coi', async () => {
  const customerA = await createCustomer('Tai lieu A');
  const customerB = await createCustomer('Tai lieu B');
  const contactInfo = db
    .prepare(`INSERT INTO contacts (customer_id, full_name) VALUES (?, ?)`)
    .run(customerB, 'Lien he tai lieu B');

  const form = new FormData();
  form.set('file', new Blob(['noi dung test'], { type: 'text/plain' }), 'kiem-thu.txt');
  form.set('customer_id', String(customerA));
  form.set('contact_id', String(contactInfo.lastInsertRowid));
  const response = await fetch(`${baseUrl}/api/documents`, { method: 'POST', body: form });
  assert.equal(response.status, 422);
  assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM documents`).get() as { n: number }).n, 0);

  const storedFiles = fs
    .readdirSync(FILES_DIR, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile());
  assert.equal(storedFiles.length, 0);
});
