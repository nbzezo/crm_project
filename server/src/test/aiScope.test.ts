import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AiScopes } from '../services/ai/contextBuilder.ts';

/*
 * Pham vi du lieu cua TRO LY AI (v41).
 *
 * Tach rieng khoi dataScope.test.ts vi day la mot duong ro ri khac han ve ban
 * chat: cac man hinh loc sai thi nguoi dung NHIN THAY dong la, con tro ly ke
 * lai du lieu phong khac thi khong de lai dau vet nao tren giao dien. Ma tran
 * o day dem so dong trong NGU CANH gui cho mo hinh, chu khong phai so dong
 * hien ra man hinh.
 *
 * Goi thang `buildSearchContext` chu khong qua `POST /api/ai/ask`: cai sau can
 * mot nha cung cap AI that. Dieu muon khang dinh nam o tang truy van, va no
 * kiem tra duoc ma khong can goi ai ca.
 *
 * Cay dung trong test — cung hinh dang voi dataScope.test.ts:
 *
 *   Cong ty
 *   └─ Khoi A
 *      ├─ Phong P1   Truong phong P1 · Nhan vien N1
 *      └─ Phong P2   Nhan vien N2
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-ai-scope-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';
process.env.WORKFLOW_SESSION_SECRET = 'test-secret-value-at-least-32-characters-long';
process.env.WORKFLOW_ADMIN_USER = 'admin';
process.env.WORKFLOW_ADMIN_PASSWORD = 'admin-password-1';
process.env.WORKFLOW_ADMIN_EMAIL = 'admin@congty.vn';

const { createApp } = await import('../app.ts');
const { db, closeDatabase } = await import('../db/connection.ts');
const { ensureAdminUser } = await import('../services/auth/bootstrapAdmin.ts');
const { setPassword } = await import('../services/auth/users.ts');
const { buildAccess } = await import('../services/auth/access.ts');
const { buildQuickNoteContext, buildSearchContext } =
  await import('../services/ai/contextBuilder.ts');

await ensureAdminUser();

let server: Server;
let baseUrl = '';
let cookie = '';

/* ---------- Dung cay va du lieu ---------- */

const ownOrgId = Number(
  db.prepare(`INSERT INTO customers (name, org_kind) VALUES ('Công ty tôi', 'own')`).run()
    .lastInsertRowid
);

function unitId(name: string): number {
  return (db.prepare('SELECT id FROM org_units WHERE name = ?').get(name) as { id: number }).id;
}

function addUnit(name: string, parent: string): void {
  db.prepare(`INSERT INTO org_units (name, parent_id, position) VALUES (?, ?, 1024)`).run(
    name,
    unitId(parent)
  );
}

interface Person {
  contactId: number;
  userId: number;
  email: string;
}

function addPerson(name: string, unit: string, positionCode: string): Person {
  const contactId = Number(
    db
      .prepare(
        `INSERT INTO contacts (customer_id, full_name, org_unit_id, is_active) VALUES (?, ?, ?, 1)`
      )
      .run(ownOrgId, name, unitId(unit)).lastInsertRowid
  );
  const email = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}@congty.vn`;
  const userId = Number(
    db
      .prepare(
        `INSERT INTO users (username, password_hash, password_salt, email, full_name, contact_id)
         VALUES (?, '', '', ?, ?, ?)`
      )
      .run(email, email, name, contactId).lastInsertRowid
  );
  db.prepare(
    `INSERT INTO user_positions (user_id, position_id, is_primary)
     VALUES (?, (SELECT id FROM positions WHERE code = ?), 1)`
  ).run(userId, positionCode);
  return { contactId, userId, email };
}

/** Mot bo du lieu mang ten mot nguoi — de con so ky vong kiem lai duoc bang tay. */
function seedDataFor(owner: Person, label: string): void {
  const customerId = Number(
    db
      .prepare(
        `INSERT INTO customers (name, org_kind, status, owner_contact_id, search_text)
         VALUES (?, 'customer', 'customer', ?, 'vinatech')`
      )
      .run(`Khách Vinatech của ${label}`, owner.contactId).lastInsertRowid
  );
  db.prepare(
    `INSERT INTO deals (customer_id, title, stage, position, value_vnd, expected_close_date,
                        owner_contact_id, search_text)
     VALUES (?, ?, 'lead', 1024, ?, date('now','localtime','+10 days'), ?, 'vinatech')`
  ).run(customerId, `Cơ hội Vinatech của ${label}`, 100_000_000, owner.contactId);
  db.prepare(
    `INSERT INTO contracts (customer_id, name, number, status, search_text)
     VALUES (?, ?, ?, 'active', 'vinatech')`
  ).run(customerId, `Hợp đồng Vinatech ${label}`, `HD-${label}`);
  db.prepare(
    `INSERT INTO quick_notes (title, content_text, owner_contact_id)
     VALUES (?, 'vinatech', ?)`
  ).run(`Ghi chú của ${label}`, owner.contactId);
}

addUnit('Khối A', 'Công ty');
addUnit('Phòng P1', 'Khối A');
addUnit('Phòng P2', 'Khối A');

const head = addPerson('Truong Phong P1', 'Phòng P1', 'department_head');
const n1 = addPerson('Nhan Vien N1', 'Phòng P1', 'staff');
const n2 = addPerson('Nhan Vien N2', 'Phòng P2', 'staff');

seedDataFor(head, 'Truong phong');
seedDataFor(n1, 'N1');
seedDataFor(n2, 'N2');

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

/* ---------- Ngu canh gui cho mo hinh ---------- */

/** Dung pham vi that cua mot nguoi, giong het cach routes/ai.ts dung no. */
function scopesOf(person: Person): AiScopes {
  const access = buildAccess(person.userId, person.contactId);
  const one = (resource: 'customers' | 'deals' | 'contracts' | 'tasks' | 'notes') => {
    const visible = access.visibleContactIds(resource, 'read');
    return visible === 'all' ? null : visible;
  };
  return {
    customers: one('customers'),
    deals: one('deals'),
    contracts: one('contracts'),
    tasks: one('tasks'),
    notes: one('notes'),
    me: person.contactId,
  };
}

test('tra cuu CRM cho AI: nhan vien thay 1, truong phong thay 2', () => {
  const asN1 = buildSearchContext(db, 'vinatech', scopesOf(n1));
  assert.equal(asN1.customers.length, 1, 'N1 chi thay khach cua minh');
  assert.equal(asN1.deals.length, 1);
  assert.equal(asN1.contracts.length, 1);

  const asN2 = buildSearchContext(db, 'vinatech', scopesOf(n2));
  assert.equal(asN2.customers.length, 1, 'N2 chi thay khach cua minh');

  const asHead = buildSearchContext(db, 'vinatech', scopesOf(head));
  assert.equal(
    asHead.customers.length,
    2,
    'Truong phong P1 thay cua minh va cua N1, KHONG thay cua N2 (phong khac)'
  );
  assert.equal(asHead.deals.length, 2);
  assert.equal(asHead.contracts.length, 2);
});

test('tra cuu CRM cho AI: khong pham vi thi thay tat ca', () => {
  const open = buildSearchContext(db, 'vinatech', {
    customers: null,
    deals: null,
    contracts: null,
    tasks: null,
    notes: null,
    me: null,
  });
  assert.equal(open.customers.length, 3, 'quan tri thay ca ba');
});

test('ghi chu nhanh chi tra ve dung tap contact duoc truyen vao', () => {
  /* Ai ĐƯỢC nam trong tap do la viec cua `visibleContactIds` va da co test
     rieng (dataScope.test.ts khang dinh ghi chu la du lieu ca nhan, cap tren
     khong doc duoc). O day chi khang dinh mot dieu: ham nay khong tu y tra ve
     gi ngoai tap duoc giao. */
  assert.equal(buildQuickNoteContext(db, [n1.contactId]).length, 1);
  assert.equal(buildQuickNoteContext(db, [head.contactId, n1.contactId]).length, 2);
  assert.equal(buildQuickNoteContext(db, []).length, 0, 'khong thay ai thi khong thay ghi chu nao');
});

/* ---------- Phien chat la cua rieng tung nguoi ---------- */

async function call(method: string, pathname: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.getSetCookie();
  if (setCookie.length > 0) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  const text = await res.text();
  return { status: res.status, data: text ? (JSON.parse(text) as unknown) : null };
}

async function signInAs(person: Person) {
  await setPassword(person.userId, 'mat-khau-test-1');
  cookie = '';
  const res = await call('POST', '/api/auth/login', {
    username: person.email,
    password: 'mat-khau-test-1',
  });
  assert.equal(res.status, 200, `dang nhap that bai cho ${person.email}`);
}

test('phien chat cua nguoi khac khong doc, khong sua, khong xoa duoc', async () => {
  await signInAs(n1);
  const created = await call('POST', '/api/ai/chats', { scope: 'all' });
  assert.equal(created.status, 201);
  const mine = (created.data as { id: number }).id;
  assert.equal((await call('GET', '/api/ai/chats')).status, 200);
  assert.equal(((await call('GET', '/api/ai/chats')).data as unknown[]).length, 1);

  await signInAs(n2);
  assert.deepEqual(
    (await call('GET', '/api/ai/chats')).data,
    [],
    'danh sach phien cua N2 khong duoc co phien cua N1'
  );

  /* 404 chu khong phai 403: "khong ton tai" va "khong duoc xem" phai khong
     phan biet duoc, neu khong thi do id la dem duoc nguoi khac co bao nhieu
     hoi thoai. */
  assert.equal((await call('GET', `/api/ai/chats/${mine}`)).status, 404);
  assert.equal((await call('PATCH', `/api/ai/chats/${mine}`, { title: 'Doi ten' })).status, 404);
  assert.equal((await call('DELETE', `/api/ai/chats/${mine}`)).status, 404);

  await signInAs(n1);
  const still = (await call('GET', `/api/ai/chats/${mine}`)).data as { id: number; title: string };
  assert.equal(still.id, mine, 'phien cua N1 phai con nguyen sau khi N2 thu xoa');
  assert.equal(still.title, '', 'va khong bi N2 doi ten');
});

test('gioi han 20 phien tinh TREN MOI NGUOI, khong phai tren he thong', async () => {
  await signInAs(n2);
  for (let i = 0; i < 21; i++) await call('POST', '/api/ai/chats', { scope: 'all' });
  assert.equal(
    ((await call('GET', '/api/ai/chats')).data as unknown[]).length,
    20,
    'N2 giu dung 20 phien gan nhat cua CHINH minh'
  );

  await signInAs(n1);
  assert.equal(
    ((await call('GET', '/api/ai/chats')).data as unknown[]).length,
    1,
    'phien cua N1 khong bi hoat dong cua N2 day ra ngoai'
  );
});
