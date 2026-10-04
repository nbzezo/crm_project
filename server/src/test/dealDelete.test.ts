/**
 * Xoa co hoi co chon loc (dealDeleteService).
 *
 * Bat bien: chi nhung muc nguoi dung chon moi bi xoa; muc con lai duoc giu va
 * bo lien ket. Truoc day bien ban hop + tai lieu dinh kem bien ban va nhac viec
 * bi SQLite hard-delete am tham qua ON DELETE CASCADE.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { type Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-deal-delete-'));
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
  return { status: response.status, data: (await response.json()) as Record<string, unknown> };
}

function insert(sql: string, ...params: unknown[]): number {
  return Number(db.prepare(sql).run(...params).lastInsertRowid);
}

interface Fixture {
  dealId: number;
  customerId: number;
  contractId: number;
  quotationId: number;
  docId: number;
  sharedDocId: number;
  noteId: number;
  noteAttachmentId: number;
  trashedNoteId: number;
  cardId: number;
  cardDocId: number;
  interactionId: number;
  reminderId: number;
}

async function seed(title: string): Promise<Fixture> {
  const customer = await json('POST', '/api/customers', { name: `KH ${title}` });
  const customerId = Number(customer.data.id);
  const deal = await json('POST', '/api/deals', { customer_id: customerId, title });
  assert.equal(deal.status, 201);
  const dealId = Number(deal.data.id);

  const contractId = insert(
    `INSERT INTO contracts (customer_id, deal_id, name) VALUES (?, ?, ?)`,
    customerId,
    dealId,
    `HĐ ${title}`
  );
  const quotationId = insert(
    `INSERT INTO quotations (customer_id, deal_id, code) VALUES (?, ?, ?)`,
    customerId,
    dealId,
    `BG-${title}`
  );
  const doc = (name: string, extra: Record<string, number | null> = {}) =>
    insert(
      `INSERT INTO documents (name, file_name, stored_name, customer_id, deal_id, contract_id, meeting_note_id, card_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      name,
      `${name}.pdf`,
      `${name}-stored`,
      customerId,
      extra.deal_id === undefined ? dealId : extra.deal_id,
      extra.contract_id ?? null,
      extra.meeting_note_id ?? null,
      extra.card_id ?? null
    );
  const docId = doc('rieng');
  const sharedDocId = doc('dung-chung', { contract_id: contractId });
  const noteId = insert(
    `INSERT INTO meeting_notes (deal_id, title) VALUES (?, ?)`,
    dealId,
    `Họp ${title}`
  );
  const noteAttachmentId = doc('dinh-kem-bien-ban', { deal_id: null, meeting_note_id: noteId });
  const trashedNoteId = insert(
    `INSERT INTO meeting_notes (deal_id, title, deleted_at) VALUES (?, ?, datetime('now'))`,
    dealId,
    'Trang đã ở thùng rác'
  );
  const boardId = insert(`INSERT INTO boards (name) VALUES (?)`, `Bảng ${title}`);
  const listId = insert(
    `INSERT INTO lists (board_id, name, position) VALUES (?, 'Việc', 1)`,
    boardId
  );
  const cardId = insert(
    `INSERT INTO cards (list_id, title, position, deal_id) VALUES (?, ?, 1, ?)`,
    listId,
    `Việc ${title}`,
    dealId
  );
  const cardDocId = doc('dinh-kem-viec', { deal_id: null, card_id: cardId });
  const interactionId = insert(
    `INSERT INTO interactions (customer_id, deal_id, type, occurred_at, summary)
     VALUES (?, ?, 'call', '2026-10-01', 'Gọi chào hàng')`,
    customerId,
    dealId
  );
  const reminderId = insert(
    `INSERT INTO reminders (title, due_at, deal_id) VALUES ('Gọi lại', '2026-10-10', ?)`,
    dealId
  );
  return {
    dealId,
    customerId,
    contractId,
    quotationId,
    docId,
    sharedDocId,
    noteId,
    noteAttachmentId,
    trashedNoteId,
    cardId,
    cardDocId,
    interactionId,
    reminderId,
  };
}

function row(table: string, id: number): Record<string, unknown> | undefined {
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as
    Record<string, unknown> | undefined;
}

test('xem truoc liet ke tung muc kem lien ket dung chung', async () => {
  const f = await seed('preview');
  const { status, data } = await json('GET', `/api/deals/${f.dealId}/delete-preview`);
  assert.equal(status, 200);
  const groups = data.groups as Record<string, { id: number; links: { kind: string }[] }[]>;
  assert.deepEqual(
    groups.documents.map((d) => d.id).sort(),
    [f.docId, f.sharedDocId].sort(),
    'chi tai lieu gan truc tiep, khong gom tai lieu trong thung rac hay dinh kem bien ban'
  );
  const shared = groups.documents.find((d) => d.id === f.sharedDocId);
  assert.deepEqual(
    shared?.links.map((l) => l.kind),
    ['contract']
  );
  assert.deepEqual(
    groups.meeting_notes.map((n) => n.id),
    [f.noteId],
    'trang da o thung rac khong hien de chon'
  );
  for (const group of ['quotations', 'contracts', 'cards', 'interactions', 'reminders']) {
    assert.equal(groups[group].length, 1, group);
  }
});

test('khong chon gi: giu lai moi thu, chi bo lien ket co hoi', async () => {
  const f = await seed('keep');
  const { status } = await json('DELETE', `/api/deals/${f.dealId}`);
  assert.equal(status, 200);
  assert.equal(row('deals', f.dealId), undefined);

  for (const [table, id] of [
    ['documents', f.docId],
    ['documents', f.sharedDocId],
    ['documents', f.noteAttachmentId],
    ['documents', f.cardDocId],
    ['meeting_notes', f.noteId],
    ['meeting_notes', f.trashedNoteId],
    ['quotations', f.quotationId],
    ['contracts', f.contractId],
    ['cards', f.cardId],
    ['interactions', f.interactionId],
    ['reminders', f.reminderId],
  ] as const) {
    const current = row(table, id);
    assert.ok(current, `${table} #${id} phai con`);
    assert.equal(current.deal_id, null, `${table} #${id} phai bo lien ket`);
  }
  assert.equal(row('documents', f.docId)?.deleted_at, null);
  assert.equal(row('meeting_notes', f.noteId)?.deleted_at, null);
  assert.equal(
    row('meeting_notes', f.noteId)?.customer_id,
    f.customerId,
    'bien ban giu lai duoc gan ve khach hang'
  );
  assert.equal(row('reminders', f.reminderId)?.customer_id, f.customerId);
  assert.equal(row('cards', f.cardId)?.customer_id, f.customerId);
});

test('chon xoa mot phan: chi muc da chon bi xoa, tai lieu va bien ban vao thung rac', async () => {
  const f = await seed('partial');
  const { status, data } = await json('DELETE', `/api/deals/${f.dealId}`, {
    delete: {
      documents: [f.docId],
      meeting_notes: [f.noteId],
      cards: [f.cardId],
      interactions: [f.interactionId],
      reminders: [f.reminderId],
      quotations: [f.quotationId],
    },
  });
  assert.equal(status, 200, JSON.stringify(data));

  assert.ok(row('documents', f.docId)?.deleted_at, 'tai lieu da chon vao thung rac');
  assert.equal(row('documents', f.sharedDocId)?.deleted_at, null, 'tai lieu khong chon giu nguyen');
  assert.equal(row('documents', f.sharedDocId)?.contract_id, f.contractId);
  assert.ok(row('meeting_notes', f.noteId)?.deleted_at, 'bien ban da chon vao thung rac');
  assert.equal(row('meeting_notes', f.noteId)?.deal_id, null);
  assert.ok(row('documents', f.noteAttachmentId), 'dinh kem bien ban khong bi hard-delete');
  assert.ok(row('meeting_notes', f.trashedNoteId), 'trang trong thung rac van con');
  assert.equal(row('cards', f.cardId), undefined);
  assert.ok(row('documents', f.cardDocId)?.deleted_at, 'dinh kem cua viec vao thung rac');
  assert.equal(row('interactions', f.interactionId), undefined);
  assert.equal(row('reminders', f.reminderId), undefined);
  assert.equal(row('quotations', f.quotationId), undefined);
  assert.ok(row('contracts', f.contractId), 'hop dong khong chon thi giu');
});

test('id khong thuoc co hoi: tu choi va khong xoa gi', async () => {
  const f = await seed('stale');
  const other = await seed('other');
  const { status } = await json('DELETE', `/api/deals/${f.dealId}`, {
    delete: { documents: [f.docId, other.docId] },
  });
  assert.equal(status, 409);
  assert.ok(row('deals', f.dealId));
  assert.equal(row('documents', f.docId)?.deleted_at, null);
  assert.equal(row('documents', other.docId)?.deleted_at, null);
});

test('hop dong con dong doanh thu: khong cho xoa theo, co hoi van con', async () => {
  const f = await seed('in-use');
  insert(
    `INSERT INTO customer_services (customer_id, contract_id) VALUES (?, ?)`,
    f.customerId,
    f.contractId
  );
  const preview = await json('GET', `/api/deals/${f.dealId}/delete-preview`);
  const contracts = (preview.data.groups as Record<string, { blocked: string | null }[]>).contracts;
  assert.ok(contracts[0].blocked);

  const { status } = await json('DELETE', `/api/deals/${f.dealId}`, {
    delete: { contracts: [f.contractId] },
  });
  assert.equal(status, 400);
  assert.ok(row('deals', f.dealId));
  assert.ok(row('contracts', f.contractId));
});
