import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
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

test('tao cong viec tu mot khoa CRM tu suy ra cac lien ket cap tren', async () => {
  const customerId = await createCustomer('Khach hang suy dien');
  const contactId = Number(
    db
      .prepare(`INSERT INTO contacts (customer_id, full_name) VALUES (?, ?)`)
      .run(customerId, 'Nguoi lien he chinh').lastInsertRowid
  );
  const deal = await json('POST', '/api/deals', {
    customer_id: customerId,
    contact_id: contactId,
    title: 'Co hoi suy dien',
  });
  assert.equal(deal.status, 201);
  const dealId = Number(deal.data.id);
  const contract = await json('POST', '/api/contracts', {
    customer_id: customerId,
    deal_id: dealId,
    name: 'Hop dong suy dien',
  });
  assert.equal(contract.status, 201);
  const contractId = Number(contract.data.id);

  // Chi biet co hoi -> phai tu ra khach hang va nguoi lien he cua co hoi do.
  const fromDeal = await json('POST', '/api/cards', {
    title: 'Goi lai khach hang',
    deal_id: dealId,
    description: 'Chi tiet cuoc goi',
  });
  assert.equal(fromDeal.status, 201);
  assert.equal(fromDeal.data.customer_id, customerId);
  assert.equal(fromDeal.data.contact_id, contactId);
  assert.equal(fromDeal.data.contact_name, 'Nguoi lien he chinh');
  // Truoc day description bi rot mat o POST va search_text chi index title.
  assert.equal(fromDeal.data.description, 'Chi tiet cuoc goi');
  const indexed = db
    .prepare(`SELECT search_text FROM cards WHERE id = ?`)
    .get(Number(fromDeal.data.id)) as { search_text: string };
  assert.match(indexed.search_text, /chi tiet cuoc goi/);

  // Chi biet hop dong -> ra ca co hoi lan khach hang.
  const fromContract = await json('POST', '/api/cards', {
    title: 'Gui ban ky',
    contract_id: contractId,
  });
  assert.equal(fromContract.status, 201);
  assert.equal(fromContract.data.deal_id, dealId);
  assert.equal(fromContract.data.customer_id, customerId);
  // Suy dien di het chuoi: hop dong -> co hoi -> nguoi lien he cua co hoi.
  assert.equal(fromContract.data.contact_id, contactId);

  // Cong viec phai hien ra o ho so nguoi lien he va o chi tiet hop dong.
  const contactFull = await json('GET', `/api/contacts/${contactId}/full`);
  assert.equal(contactFull.status, 200);
  assert.equal((contactFull.data.tasks as unknown[]).length, 2);
  const contractDetail = await json('GET', `/api/contracts/${contractId}`);
  assert.equal((contractDetail.data.tasks as unknown[]).length, 1);

  // Ngu canh mo form: mot lan goi ra du lien ket + ung vien cua dung khach hang.
  const context = await json('GET', `/api/cards/context?contract_id=${contractId}`);
  assert.equal(context.status, 200);
  assert.deepEqual(context.data.links, {
    customer_id: customerId,
    contact_id: contactId,
    deal_id: dealId,
    contract_id: contractId,
    quotation_id: null,
  });
  assert.equal(
    (context.data.display as Record<string, unknown>).customer_name,
    'Khach hang suy dien'
  );
  assert.equal((context.data.deals as unknown[]).length, 1);
  assert.ok(context.data.suggested_list_id);
});

test('cong viec chan lien ket cheo khach hang va go lien ket cap duoi khi doi khach hang', async () => {
  const customerA = await createCustomer('Cong viec khach A');
  const customerB = await createCustomer('Cong viec khach B');
  const dealB = await json('POST', '/api/deals', { customer_id: customerB, title: 'Co hoi cua B' });
  assert.equal(dealB.status, 201);

  const crossed = await json('POST', '/api/cards', {
    title: 'Cong viec sai lien ket',
    customer_id: customerA,
    deal_id: Number(dealB.data.id),
  });
  assert.equal(crossed.status, 422);
  assert.equal(crossed.data.code, 'CROSS_CUSTOMER_LINK');

  const card = await json('POST', '/api/cards', {
    title: 'Cong viec cua B',
    deal_id: Number(dealB.data.id),
  });
  assert.equal(card.status, 201);
  assert.equal(card.data.customer_id, customerB);

  // Doi khach hang thi co hoi cu thuoc khach cu phai bi go, khong duoc giu lai.
  const moved = await json('PATCH', `/api/cards/${Number(card.data.id)}`, {
    customer_id: customerA,
  });
  assert.equal(moved.status, 200);
  assert.equal(moved.data.customer_id, customerA);
  assert.equal(moved.data.deal_id, null);
  assert.equal(moved.data.contact_id, null);
});

test('nguoi phu trach la truc rieng, khong bi rang buoc cung khach hang', async () => {
  const ownOrg = await createCustomer('To chuc noi bo');
  await json('PATCH', `/api/customers/${ownOrg}`, { org_kind: 'own' });
  const customerA = await createCustomer('Khach hang co viec');

  const staff = await json('POST', `/api/customers/${ownOrg}/contacts`, {
    full_name: 'Nhan su noi bo',
    is_me: true,
  });
  assert.equal(staff.status, 201);
  const staffId = Number(staff.data.id);

  /*
   * Diem then chot cua ca tinh nang: mot viec VE khach hang A do nhan su cong ty
   * MINH lam. Neu assignee_contact_id lot vao TASK_LINK_KEYS thi day se la 422.
   */
  const card = await json('POST', '/api/cards', {
    title: 'Viec cua khach A do noi bo lam',
    customer_id: customerA,
    assignee_contact_id: staffId,
  });
  assert.equal(card.status, 201);
  assert.equal(card.data.customer_id, customerA);
  assert.equal(card.data.assignee_contact_id, staffId);
  // assignee_org_id luon suy ra tu contact — khong bao giu duoc phep lech.
  assert.equal(card.data.assignee_org_id, ownOrg);
  assert.equal(card.data.assignee_name, 'Nhan su noi bo');
  const cardId = Number(card.data.id);

  // Doi khach hang go lien ket cap duoi nhung KHONG duoc lam mat nguoi phu trach.
  const moved = await json('PATCH', `/api/cards/${cardId}`, { customer_id: null });
  assert.equal(moved.status, 200);
  assert.equal(moved.data.customer_id, null);
  assert.equal(moved.data.assignee_contact_id, staffId);

  // Client co tu ghi assignee_org_id sai thi may chu van tinh lai tu contact.
  const forced = await json('PATCH', `/api/cards/${cardId}`, {
    assignee_contact_id: staffId,
    assignee_org_id: customerA,
  });
  assert.equal(forced.status, 200);
  assert.equal(forced.data.assignee_org_id, ownOrg);

  // Nhan su nghi viec: giu lich su nhung khong giao viec moi duoc nua.
  await json('PATCH', `/api/contacts/${staffId}`, { is_active: false });
  const inactive = await json('POST', '/api/cards', {
    title: 'Giao cho nguoi da nghi',
    assignee_contact_id: staffId,
  });
  assert.equal(inactive.status, 400);
  assert.equal(inactive.data.code, 'ASSIGNEE_INACTIVE');

  const missing = await json('POST', '/api/cards', {
    title: 'Giao cho nguoi khong ton tai',
    assignee_contact_id: 999_999,
  });
  assert.equal(missing.status, 404);

  // To chuc 'own' phai nam ngoai danh sach khach hang mac dinh cua CRM.
  const crmList = await fetch(`${baseUrl}/api/customers`);
  const crmOrgs = (await crmList.json()) as { id: number }[];
  assert.ok(!crmOrgs.some((org) => org.id === ownOrg));
  const allList = await fetch(`${baseUrl}/api/customers?org_kind=all`);
  const allOrgs = (await allList.json()) as { id: number }[];
  assert.ok(allOrgs.some((org) => org.id === ownOrg));

  // Nhung van phai giao viec duoc: /assignable khong loc theo khach hang.
  const assignable = await fetch(`${baseUrl}/api/contacts/assignable`);
  const people = (await assignable.json()) as { id: number }[];
  // Da tat is_active o tren nen khong con trong danh sach.
  assert.ok(!people.some((person) => person.id === staffId));
});

test('trang thai va is_done luon dong bo, viec lap lai sinh ban ke tiep', async () => {
  const board = await json('POST', '/api/boards', { name: 'Bang vong doi' });
  assert.equal(board.status, 201);
  const list = await json('POST', '/api/lists', {
    board_id: Number(board.data.id),
    name: 'Cần làm',
  });
  assert.equal(list.status, 201);
  const listId = Number(list.data.id);

  const created = await json('POST', '/api/cards', { list_id: listId, title: 'Viec vong doi' });
  assert.equal(created.status, 201);
  const cardId = Number(created.data.id);
  assert.equal(created.data.status, 'todo');
  assert.equal(created.data.is_done, 0);

  // status -> is_done
  const done = await json('PATCH', `/api/cards/${cardId}`, { status: 'done' });
  assert.equal(done.data.is_done, 1);
  assert.ok(done.data.completed_at);

  // is_done -> status (loi tat cu van phai giu hai cot khop nhau)
  const reopened = await json('PATCH', `/api/cards/${cardId}`, { is_done: false });
  assert.equal(reopened.data.status, 'todo');
  assert.equal(reopened.data.is_done, 0);
  assert.equal(reopened.data.completed_at, null);

  /* `is_done: false` gui len mot the DANG LAM khong duoc keo no ve 'todo' —
     day la bay de nhat khi dich hai cot vao nhau. */
  await json('PATCH', `/api/cards/${cardId}`, { status: 'doing' });
  const noop = await json('PATCH', `/api/cards/${cardId}`, { is_done: false });
  assert.equal(noop.data.status, 'doing');

  // Chan viec: giu ly do va moc bat dau bi chan; go chan thi xoa ca hai.
  const blocked = await json('PATCH', `/api/cards/${cardId}`, {
    status: 'blocked',
    blocked_reason: 'Chờ khách gửi dữ liệu đầu vào',
  });
  assert.equal(blocked.data.blocked_reason, 'Chờ khách gửi dữ liệu đầu vào');
  assert.ok(blocked.data.blocked_since);
  const unblocked = await json('PATCH', `/api/cards/${cardId}`, { status: 'doing' });
  assert.equal(unblocked.data.blocked_reason, null);
  assert.equal(unblocked.data.blocked_since, null);

  // Viec lap lai: dong ban nay thi sinh ban ke tiep, moc tinh tu HAN CU.
  const repeating = await json('POST', '/api/cards', {
    list_id: listId,
    title: 'Bao cao tuan',
    due_date: '2026-01-05',
  });
  const repeatId = Number(repeating.data.id);
  await json('PATCH', `/api/cards/${repeatId}`, {
    recur_rule: JSON.stringify({ unit: 'week', interval: 1 }),
  });
  const closed = await json('PATCH', `/api/cards/${repeatId}`, { status: 'done' });
  assert.equal(closed.data.is_done, 1);
  // Ban vua dong khong con lap — hoan thanh lai khong duoc sinh trung.
  assert.equal(closed.data.recur_rule, null);

  /* Tim theo BANG chu khong theo cot: tu v19 the tu nhay sang cot mang dung
     trang thai, va ban ke tiep bat dau lai o cot dau quy trinh. */
  const next = db
    .prepare(
      `SELECT k.id, k.due_date, k.status, l.status_mapping
         FROM cards k JOIN lists l ON l.id = k.list_id
        WHERE l.board_id = ? AND k.title = 'Bao cao tuan' AND k.id <> ?`
    )
    .get(Number(board.data.id), repeatId) as
    { due_date: string; status: string; status_mapping: string | null } | undefined;
  assert.ok(next, 'phai sinh ban ke tiep');
  assert.equal(next.due_date, '2026-01-12');
  assert.equal(next.status, 'todo');
  // Ban moi phai o dau quy trinh, khong ke thua cot 'Hoan thanh' cua ban vua dong.
  assert.equal(next.status_mapping, 'todo');

  // recur_rule hong khong duoc lam vo luong hoan thanh.
  const broken = await json('POST', '/api/cards', {
    list_id: listId,
    title: 'Lich hong',
    due_date: '2026-02-01',
  });
  const brokenId = Number(broken.data.id);
  await json('PATCH', `/api/cards/${brokenId}`, { recur_rule: '{khong-phai-json' });
  const brokenDone = await json('PATCH', `/api/cards/${brokenId}`, { status: 'done' });
  assert.equal(brokenDone.status, 200);
  assert.equal(
    (db.prepare(`SELECT COUNT(*) AS n FROM cards WHERE title = 'Lich hong'`).get() as { n: number })
      .n,
    1
  );
});

test('nhat ky nhac ghi dung nguoi phu trach tai thoi diem nhac', async () => {
  const board = await json('POST', '/api/boards', { name: 'Bang nhac viec' });
  const list = await json('POST', '/api/lists', {
    board_id: Number(board.data.id),
    name: 'Cần làm',
  });
  const org = await createCustomer('To chuc nhac viec');
  await json('PATCH', `/api/customers/${org}`, { org_kind: 'partner' });
  const person = await json('POST', `/api/customers/${org}/contacts`, { full_name: 'Doi tac A' });
  const personId = Number(person.data.id);

  const card = await json('POST', '/api/cards', {
    list_id: Number(list.data.id),
    title: 'Viec can nhac',
    assignee_contact_id: personId,
  });
  const cardId = Number(card.data.id);

  const nudge = await json('POST', '/api/nudges', {
    card_id: cardId,
    channel: 'zalo',
    message: 'Anh cho em xin mốc hoàn thành nhé.',
  });
  assert.equal(nudge.status, 201);
  // contact_id lay tu the, khong nhan tu client.
  assert.equal(nudge.data.contact_id, personId);
  assert.equal(nudge.data.responded_at, null);

  const answered = await json('PATCH', `/api/nudges/${Number(nudge.data.id)}`, {
    response: 'Thứ 6 tuần này xong.',
  });
  assert.equal(answered.data.response, 'Thứ 6 tuần này xong.');
  assert.ok(answered.data.responded_at);

  const reloaded = await json('GET', `/api/cards/${cardId}`);
  assert.equal(reloaded.data.nudge_count, 1);
  assert.ok(reloaded.data.last_nudged_at);
});

test('du an gom bang va cong viec, suc khoe tinh khi doc', async () => {
  const project = await json('POST', '/api/projects', {
    name: 'Trien khai he thong',
    code: 'DA-01',
    plan_start: '2026-01-01',
    plan_end: '2026-12-31',
    budget_vnd: 500_000_000,
  });
  assert.equal(project.status, 201);
  const projectId = Number(project.data.id);
  assert.equal(project.data.health, 'green');
  assert.equal(project.data.progress_pct, 0);

  const board = await json('POST', '/api/boards', {
    name: 'Bang trien khai',
    project_id: projectId,
  });
  assert.equal(board.status, 201);
  const boardId = Number(board.data.id);
  const full = await json('GET', `/api/boards/${boardId}/full`);
  const listId = (full.data.lists as { id: number }[])[0].id;

  // Cong viec tao trong bang cua du an tu mang project_id — khong phai gui kem.
  const card = await json('POST', '/api/cards', { list_id: listId, title: 'Khao sat' });
  assert.equal(card.data.project_id, projectId);
  assert.equal(card.data.project_name, 'Trien khai he thong');
  const cardId = Number(card.data.id);

  const withOne = await json('GET', `/api/projects/${projectId}`);
  assert.equal(withOne.data.task_total, 1);
  assert.equal(withOne.data.progress_pct, 0);

  await json('PATCH', `/api/cards/${cardId}`, { status: 'done' });
  const halfway = await json('GET', `/api/projects/${projectId}`);
  assert.equal(halfway.data.task_done, 1);
  assert.equal(halfway.data.progress_pct, 100);
  assert.equal(halfway.data.health, 'green');

  // Mot viec bi chan la DO: du an se khong tu chay tiep neu khong ai lam gi.
  const blocked = await json('POST', '/api/cards', { list_id: listId, title: 'Cho ha tang' });
  await json('PATCH', `/api/cards/${Number(blocked.data.id)}`, {
    status: 'blocked',
    blocked_reason: 'Cho cap VPN',
  });
  const red = await json('GET', `/api/projects/${projectId}`);
  assert.equal(red.data.health, 'red');
  assert.equal(red.data.task_waiting, 1);

  // Nhan su suy ra tu nguoi phu trach cac viec, khong phai bang thanh vien rieng.
  const org = await createCustomer('To chuc du an');
  await json('PATCH', `/api/customers/${org}`, { org_kind: 'own' });
  const person = await json('POST', `/api/customers/${org}/contacts`, { full_name: 'Ky su A' });
  await json('PATCH', `/api/cards/${cardId}`, {
    assignee_contact_id: Number(person.data.id),
  });
  const withPeople = await json('GET', `/api/projects/${projectId}`);
  assert.equal((withPeople.data.people as unknown[]).length, 1);

  /* Gan mot bang DA CO cong viec vao du an phai keo theo ca cong viec cu — neu
     khong, bao cao du an se bo qua toan bo phan lam truoc khi gan. */
  const other = await json('POST', '/api/boards', { name: 'Bang roi' });
  const otherFull = await json('GET', `/api/boards/${Number(other.data.id)}/full`);
  const otherList = (otherFull.data.lists as { id: number }[])[0].id;
  const orphan = await json('POST', '/api/cards', { list_id: otherList, title: 'Viec co truoc' });
  assert.equal(orphan.data.project_id, null);
  await json('PATCH', `/api/boards/${Number(other.data.id)}`, { project_id: projectId });
  const adopted = await json('GET', `/api/cards/${Number(orphan.data.id)}`);
  assert.equal(adopted.data.project_id, projectId);

  /* Xoa du an KHONG duoc xoa cong viec: du an la lop nhom, cong viec la du lieu
     that. ON DELETE SET NULL o moi khoa ngoai. */
  await json('DELETE', `/api/projects/${projectId}`);
  const survived = await json('GET', `/api/cards/${cardId}`);
  assert.equal(survived.status, 200);
  assert.equal(survived.data.project_id, null);
  const boardAfter = await json('GET', `/api/boards/${boardId}/full`);
  assert.equal(boardAfter.data.project_id, null);
});

test('doi han de lai dau vet, phu thuoc chan chu trinh', async () => {
  const board = await json('POST', '/api/boards', { name: 'Bang truot han' });
  const list = await json('POST', '/api/lists', {
    board_id: Number(board.data.id),
    name: 'Cần làm',
  });
  const listId = Number(list.data.id);

  // Han dat luc TAO chinh la baseline — khong tinh la mot lan truot.
  const created = await json('POST', '/api/cards', {
    list_id: listId,
    title: 'Viec co han',
    due_date: '2026-03-01',
  });
  const cardId = Number(created.data.id);
  assert.equal(created.data.slip_count, 0);

  const first = await json('PATCH', `/api/cards/${cardId}`, {
    due_date: '2026-03-08',
    due_reason: 'Khách chưa duyệt yêu cầu',
  });
  assert.equal(first.data.slip_count, 1);
  assert.equal(first.data.slip_days, 7);

  const second = await json('PATCH', `/api/cards/${cardId}`, { due_date: '2026-03-20' });
  assert.equal(second.data.slip_count, 2);
  // Baseline khong bao gio bi ghi de — no la moc so sanh co dinh.
  assert.equal(second.data.baseline_due_date, '2026-03-01');
  assert.equal(second.data.slip_days, 19);

  const detail = await json('GET', `/api/cards/${cardId}`);
  const changes = detail.data.due_changes as {
    old_due: string;
    new_due: string;
    reason: string | null;
  }[];
  assert.equal(changes.length, 2);
  assert.equal(changes[1].reason, 'Khách chưa duyệt yêu cầu');

  // Dat lai cung mot ngay khong sinh dong lich su rong.
  await json('PATCH', `/api/cards/${cardId}`, { due_date: '2026-03-20' });
  assert.equal(Number((await json('GET', `/api/cards/${cardId}`)).data.slip_count), 2);

  // Viec chua co han: lan dat dau tien la baseline, khong phai mot lan truot.
  const noDue = await json('POST', '/api/cards', { list_id: listId, title: 'Viec chua co han' });
  const noDueId = Number(noDue.data.id);
  const dated = await json('PATCH', `/api/cards/${noDueId}`, { due_date: '2026-04-01' });
  assert.equal(dated.data.slip_count, 0);
  assert.equal(dated.data.baseline_due_date, '2026-04-01');

  /* Phu thuoc: chan tu tham chieu va chan chu trinh. Chu trinh se lam moi thuat
     toan duyet do thi sau nay lap vo han. */
  const selfDep = await json('POST', `/api/cards/${cardId}/dependencies`, {
    predecessor_id: cardId,
  });
  assert.equal(selfDep.status, 400);
  assert.equal(selfDep.data.code, 'SELF_DEPENDENCY');

  const ok = await json('POST', `/api/cards/${noDueId}/dependencies`, {
    predecessor_id: cardId,
  });
  assert.equal(ok.status, 201);
  assert.equal((ok.data.predecessors as unknown[]).length, 1);

  const cycle = await json('POST', `/api/cards/${cardId}/dependencies`, {
    predecessor_id: noDueId,
  });
  assert.equal(cycle.status, 422);
  assert.equal(cycle.data.code, 'DEPENDENCY_CYCLE');

  // Chu trinh gian tiep A -> B -> C -> A cung phai bi chan.
  const third = await json('POST', '/api/cards', { list_id: listId, title: 'Viec thu ba' });
  const thirdId = Number(third.data.id);
  await json('POST', `/api/cards/${thirdId}/dependencies`, { predecessor_id: noDueId });
  const indirect = await json('POST', `/api/cards/${cardId}/dependencies`, {
    predecessor_id: thirdId,
  });
  assert.equal(indirect.status, 422);
  assert.equal(indirect.data.code, 'DEPENDENCY_CYCLE');

  const removed = await json('DELETE', `/api/cards/${noDueId}/dependencies/${cardId}`);
  assert.equal((removed.data.predecessors as unknown[]).length, 0);
});

test('cot Kanban va trang thai dong bo hai chieu, khong lap vo han', async () => {
  const board = await json('POST', '/api/boards', { name: 'Bang anh xa' });
  const boardId = Number(board.data.id);
  const full = await json('GET', `/api/boards/${boardId}/full`);
  const lists = full.data.lists as { id: number; name: string; status_mapping: string | null }[];

  // Bang moi phai co san anh xa — neu khong, cot va trang thai lai troi tu do.
  assert.deepEqual(
    lists.map((l) => l.status_mapping),
    ['todo', 'doing', 'review', 'done']
  );
  const [todoList, doingList, reviewList, doneList] = lists.map((l) => l.id);

  const card = await json('POST', '/api/cards', { list_id: todoList, title: 'Viec anh xa' });
  const cardId = Number(card.data.id);
  assert.equal(card.data.status, 'todo');

  // Chieu 1: keo the sang cot -> trang thai doi theo (va `is_done` di kem).
  const moved = await json('PATCH', `/api/cards/${cardId}/move`, { list_id: doneList });
  assert.equal(moved.status, 200);
  const afterMove = await json('GET', `/api/cards/${cardId}`);
  assert.equal(afterMove.data.status, 'done');
  assert.equal(afterMove.data.is_done, 1);

  // Chieu 2: doi trang thai -> the tu nhay sang cot tuong ung.
  const restatus = await json('PATCH', `/api/cards/${cardId}`, { status: 'review' });
  assert.equal(restatus.data.status, 'review');
  assert.equal(restatus.data.is_done, 0);
  assert.equal(restatus.data.list_id, reviewList);

  /* Khong lap vo han: sau MOT thao tac the dung o dung mot cot, mot trang thai.
     Neu hai ham day nhau qua lai thi cau PATCH tren da khong bao gio tra ve. */
  const settled = await json('GET', `/api/cards/${cardId}`);
  assert.equal(settled.data.list_id, reviewList);
  assert.equal(settled.data.status, 'review');

  // Cot KHONG anh xa: keo vao khong dung den trang thai.
  const freeList = await json('POST', '/api/lists', { board_id: boardId, name: 'Kho ý tưởng' });
  assert.equal(freeList.data.status_mapping, null);
  await json('PATCH', `/api/cards/${cardId}`, { status: 'doing' });
  assert.equal(Number((await json('GET', `/api/cards/${cardId}`)).data.list_id), doingList);
  await json('PATCH', `/api/cards/${cardId}/move`, { list_id: Number(freeList.data.id) });
  const parked = await json('GET', `/api/cards/${cardId}`);
  assert.equal(parked.data.list_id, Number(freeList.data.id));
  assert.equal(parked.data.status, 'doing', 'cot khong anh xa khong duoc doi trang thai');

  /* Gan anh xa cho mot cot DA CO the: keo cac the ben trong ve dung trang thai,
     neu khong cot vua khai bao mot dang ma the ben trong mang mot dang khac. */
  const mapped = await json('PATCH', `/api/lists/${Number(freeList.data.id)}`, {
    status_mapping: 'waiting_customer',
  });
  assert.equal(mapped.data.status_mapping, 'waiting_customer');
  assert.equal((await json('GET', `/api/cards/${cardId}`)).data.status, 'waiting_customer');
});

test('du an suy tu bang, khong con cot rieng tren the', async () => {
  const project = await json('POST', '/api/projects', { name: 'Du an suy dan' });
  const projectId = Number(project.data.id);

  const boardIn = await json('POST', '/api/boards', {
    name: 'Bang trong du an',
    project_id: projectId,
  });
  const boardOut = await json('POST', '/api/boards', { name: 'Bang ngoai du an' });
  const listIn = (
    (await json('GET', `/api/boards/${Number(boardIn.data.id)}/full`)).data.lists as {
      id: number;
    }[]
  )[0].id;
  const listOut = (
    (await json('GET', `/api/boards/${Number(boardOut.data.id)}/full`)).data.lists as {
      id: number;
    }[]
  )[0].id;

  // Cot project_id da bien mat khoi `cards` — khong the mang du an khac voi bang.
  const columns = db.prepare(`PRAGMA table_info(cards)`).all() as { name: string }[];
  assert.ok(!columns.some((c) => c.name === 'project_id'));

  const card = await json('POST', '/api/cards', { list_id: listIn, title: 'Viec trong du an' });
  const cardId = Number(card.data.id);
  assert.equal(card.data.project_id, projectId);

  // Keo sang bang ngoai du an -> viec roi khoi du an, ngay lap tuc va nhat quan.
  await json('PATCH', `/api/cards/${cardId}/move`, { list_id: listOut });
  assert.equal((await json('GET', `/api/cards/${cardId}`)).data.project_id, null);
  assert.equal((await json('GET', `/api/projects/${projectId}`)).data.task_total, 0);

  // Gan CA BANG vao du an -> moi viec co san trong bang thuoc du an, khong phai cap nhat gi.
  await json('PATCH', `/api/boards/${Number(boardOut.data.id)}`, { project_id: projectId });
  assert.equal((await json('GET', `/api/cards/${cardId}`)).data.project_id, projectId);
  assert.equal((await json('GET', `/api/projects/${projectId}`)).data.task_total, 1);

  /* Tao viec tu trang du an: `project_id` chi dan huong chon bang, va bang duoc
     chon phai THUOC du an do — day la lo hong nang nhat truoc v19. */
  const context = await json('GET', `/api/cards/context?project_id=${projectId}`);
  const boards = context.data.boards as { id: number; project_id: number | null }[];
  assert.ok(boards.length > 0);
  assert.ok(boards.every((b) => b.project_id === projectId));

  const fromProject = await json('POST', '/api/cards', {
    title: 'Viec tao tu trang du an',
    project_id: projectId,
  });
  assert.equal(fromProject.status, 201);
  assert.equal(fromProject.data.project_id, projectId);

  // Cac dang xem pham vi theo du an.
  const timeline = await json('GET', `/api/views/timeline?project_id=${projectId}`);
  assert.equal(timeline.status, 200);
  const tasks = await fetch(`${baseUrl}/api/views/tasks?project_id=${projectId}`);
  const rows = (await tasks.json()) as { project_id: number | null }[];
  assert.ok(rows.length >= 2);
  assert.ok(rows.every((row) => row.project_id === projectId));
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

test('tai lieu ho tro metadata, cap nhat hang loat, ZIP va thung rac', async () => {
  const customerId = await createCustomer('Khach hang tai lieu v12');
  const ids: number[] = [];

  for (const [index, name] of ['ho-so-a.txt', 'ho-so-b.txt'].entries()) {
    const form = new FormData();
    form.set('file', new Blob([`noi dung ${index}`], { type: 'text/plain' }), name);
    form.set('customer_id', String(customerId));
    form.set('doc_type', 'proposal');
    form.set('description', 'Ho so kiem thu tich hop');
    form.set('tags', 'kiem thu, ho so');
    form.set('owner', 'Nguyen Van A');
    form.set('effective_date', '2026-08-12');
    form.set('expires_at', '2027-08-12');
    form.set('confidentiality', 'confidential');
    const response = await fetch(`${baseUrl}/api/documents`, { method: 'POST', body: form });
    assert.equal(response.status, 201);
    const document = (await response.json()) as Record<string, unknown>;
    assert.equal(document.description, 'Ho so kiem thu tich hop');
    assert.equal(document.confidentiality, 'confidential');
    ids.push(Number(document.id));
  }

  const search = await json('GET', '/api/search?q=ho%20so');
  assert.equal(search.status, 200);
  assert.equal((search.data.documents as unknown[]).length, 2);

  const bulk = await json('PATCH', '/api/documents/bulk', {
    ids,
    doc_type: 'contract',
    owner: 'Tran Thi B',
  });
  assert.equal(bulk.status, 200);
  assert.equal(bulk.data.updated, 2);

  const zip = await fetch(`${baseUrl}/api/documents/download.zip?ids=${ids.join(',')}`);
  assert.equal(zip.status, 200);
  assert.match(zip.headers.get('content-type') ?? '', /application\/zip/);
  const zipBytes = Buffer.from(await zip.arrayBuffer());
  assert.equal(zipBytes.readUInt32LE(0), 0x04034b50);

  const trashed = await json('POST', '/api/documents/bulk/trash', { ids });
  assert.equal(trashed.status, 200);
  assert.equal(trashed.data.trashed, 2);
  const activeList = await json('GET', `/api/documents?customer_id=${customerId}`);
  assert.deepEqual(activeList.data, []);
  const trashList = await json('GET', `/api/documents?customer_id=${customerId}&trash=1`);
  assert.equal((trashList.data as unknown as unknown[]).length, 2);

  const restored = await json('POST', '/api/documents/bulk/restore', { ids });
  assert.equal(restored.status, 200);
  assert.equal(restored.data.restored, 2);

  await json('POST', '/api/documents/bulk/trash', { ids: [ids[0]] });
  const permanent = await json('DELETE', `/api/documents/${ids[0]}/permanent`);
  assert.equal(permanent.status, 200);
  assert.equal(db.prepare(`SELECT id FROM documents WHERE id = ?`).get(ids[0]), undefined);
});

test('AI provider ma hoa API key, tu nhan dien model va tao brief', async () => {
  const mockProvider = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.method === 'GET' && request.url?.startsWith('/v1beta/models')) {
      response.end(
        JSON.stringify({
          models: [
            {
              name: 'models/gemini-test-flash',
              displayName: 'Gemini Test Flash',
              supportedGenerationMethods: ['generateContent'],
              inputTokenLimit: 100000,
              outputTokenLimit: 8000,
            },
          ],
        })
      );
      return;
    }
    if (request.method === 'POST' && request.url?.includes(':generateContent')) {
      response.end(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      headline: 'Ưu tiên hôm nay',
                      summary: 'Tập trung xử lý các đầu việc quá hạn.',
                      risks: ['Còn công việc quá hạn'],
                      next_actions: ['Rà soát Next Action'],
                      sources: ['Công việc và pipeline'],
                    }),
                  },
                ],
              },
            },
          ],
          usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 45 },
        })
      );
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: { message: 'not found' } }));
  });
  mockProvider.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => mockProvider.once('listening', resolve));
  const address = mockProvider.address();
  assert.ok(address && typeof address !== 'string');

  try {
    const saved = await json('PUT', '/api/ai/providers/gemini', {
      base_url: `http://127.0.0.1:${address.port}`,
      api_key: 'gemini-super-secret-key',
      enabled: true,
      daily_token_limit: 10000,
      input_cost_per_million_usd: 1,
      output_cost_per_million_usd: 2,
    });
    assert.equal(saved.status, 200);
    assert.equal(JSON.stringify(saved.data).includes('gemini-super-secret-key'), false);

    const secret = db
      .prepare(
        `SELECT api_key_ciphertext, api_key_iv, api_key_tag FROM ai_provider_configs
          WHERE provider = 'gemini'`
      )
      .get() as { api_key_ciphertext: string; api_key_iv: string; api_key_tag: string };
    assert.ok(secret.api_key_ciphertext);
    assert.equal(secret.api_key_ciphertext.includes('gemini-super-secret-key'), false);
    assert.ok(secret.api_key_iv && secret.api_key_tag);

    const synced = await json('POST', '/api/ai/providers/gemini/sync');
    assert.equal(synced.status, 200);
    assert.equal(synced.data.count, 1);

    const brief = await json('POST', '/api/ai/brief', { context_type: 'today', mode: 'fast' });
    assert.equal(brief.status, 200);
    assert.equal(brief.data.headline, 'Ưu tiên hôm nay');
    const meta = brief.data.meta as Record<string, unknown>;
    assert.equal(meta.provider, 'gemini');
    assert.equal(meta.model, 'gemini-test-flash');
    assert.equal(
      (
        db.prepare(`SELECT COUNT(*) AS n FROM ai_usage_logs WHERE status = 'success'`).get() as {
          n: number;
        }
      ).n,
      1
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      mockProvider.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

test('AI action chi ghi CRM sau khi duoc phe duyet', async () => {
  const list = db.prepare(`SELECT id FROM lists ORDER BY id LIMIT 1`).get() as { id: number };
  const info = db
    .prepare(
      `INSERT INTO ai_action_proposals (action_type, title, explanation, payload_json)
       VALUES ('create_task', 'Tạo việc kiểm thử', 'Đề xuất từ AI', ?)`
    )
    .run(
      JSON.stringify({
        title: 'Công việc do AI đề xuất',
        description: 'Chỉ được tạo sau khi người dùng duyệt',
        list_id: list.id,
        priority: 'high',
        due_date: '2026-08-20',
      })
    );
  const proposalId = Number(info.lastInsertRowid);
  assert.equal(
    (
      db
        .prepare(`SELECT COUNT(*) AS n FROM cards WHERE title = 'Công việc do AI đề xuất'`)
        .get() as {
        n: number;
      }
    ).n,
    0
  );

  const approved = await json('POST', `/api/ai/actions/${proposalId}/approve`);
  assert.equal(approved.status, 200);
  const proposal = approved.data.proposal as Record<string, unknown>;
  assert.equal(proposal.status, 'executed');
  assert.equal(
    (
      db
        .prepare(`SELECT COUNT(*) AS n FROM cards WHERE title = 'Công việc do AI đề xuất'`)
        .get() as {
        n: number;
      }
    ).n,
    1
  );

  const repeated = await json('POST', `/api/ai/actions/${proposalId}/approve`);
  assert.equal(repeated.status, 409);
});

test('RAG lap chi muc noi dung text va loai tai lieu confidential khoi ket qua', async () => {
  const customerId = await createCustomer('Khach hang RAG');
  const upload = async (
    name: string,
    confidentiality: 'internal' | 'confidential',
    content: string
  ) => {
    const form = new FormData();
    form.set('file', new Blob([content], { type: 'text/plain' }), name);
    form.set('customer_id', String(customerId));
    form.set('confidentiality', confidentiality);
    const response = await fetch(`${baseUrl}/api/documents`, { method: 'POST', body: form });
    assert.equal(response.status, 201);
  };
  await upload('chien-luoc.txt', 'internal', 'Ke hoach chien luoc mo rong thi truong Da Nang');
  await upload('bi-mat.txt', 'confidential', 'Mat khau noi bo tuyet mat khong duoc gui AI');

  const publicSearch = await json('GET', '/api/ai/documents/search?q=chien%20luoc%20Da%20Nang');
  assert.equal(publicSearch.status, 200);
  const publicRows = publicSearch.data as unknown as { content: string }[];
  assert.ok(publicRows.some((row) => row.content.includes('Da Nang')));

  const secretSearch = await json('GET', '/api/ai/documents/search?q=mat%20khau%20noi%20bo');
  assert.equal(secretSearch.status, 200);
  assert.equal((secretSearch.data as unknown as unknown[]).length, 0);

  // Nhan trich xuat phai di het duong tu textExtract ra API, khong con la 'text'|'metadata' cung.
  const document = db
    .prepare(`SELECT id FROM documents WHERE file_name = 'chien-luoc.txt'`)
    .get() as { id: number };
  const reindex = await json('POST', `/api/ai/documents/${document.id}/index`);
  assert.equal(reindex.status, 200);
  assert.equal(reindex.data.extraction, 'text');
  assert.ok(Number(reindex.data.chunks) > 0);
});

test('automation AI chi tao canh bao va khong tu y sua CRM', async () => {
  const customerId = await createCustomer('Khach hang automation');
  const deal = await json('POST', '/api/deals', {
    customer_id: customerId,
    title: 'Co hoi follow-up qua han',
    next_action: 'Goi lai khach hang',
    next_action_date: '2020-01-01',
  });
  assert.equal(deal.status, 201);
  const dealId = Number(deal.data.id);

  const result = await json('POST', '/api/ai/automations/2/run');
  assert.equal(result.status, 200);
  assert.ok(Number(result.data.found) >= 1);
  const notifications = await json('GET', '/api/ai/notifications?unread=1');
  assert.equal(notifications.status, 200);
  assert.ok(
    (notifications.data as unknown as { link: string }[]).some(
      (item) => item.link === `/deals/${dealId}`
    )
  );
  const unchanged = db.prepare(`SELECT next_action FROM deals WHERE id = ?`).get(dealId) as {
    next_action: string;
  };
  assert.equal(unchanged.next_action, 'Goi lai khach hang');
});
