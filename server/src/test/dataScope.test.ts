import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * Phan quyen DU LIEU: trong mot man hinh, ai thay nhung dong nao (v40).
 *
 * Day la luoi an toan quan trong nhat cua ca he phan quyen. Khong co mot seam
 * chung nao cho 853 cau truy van trong server, nen thu duy nhat bat duoc mot
 * truy van moi quen loc la mot test DEM DUNG SO DONG cho tung vi tri.
 *
 * Cay dung trong test:
 *
 *   Cong ty
 *   └─ Khoi A
 *      ├─ Phong P1   Truong phong P1 · Nhan vien N1
 *      └─ Phong P2   Nhan vien N2
 *
 * Moi nguoi so huu dung mot khach hang, mot co hoi, mot bang va mot dong doanh
 * thu mang ten minh. Nho vay so dong ky vong la mot con so de kiem lai bang tay.
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-scope-'));
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

function addUnit(name: string, parent: string): number {
  return Number(
    db
      .prepare(`INSERT INTO org_units (name, parent_id, position) VALUES (?, ?, 1024)`)
      .run(name, unitId(parent)).lastInsertRowid
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

/** Mot bo du lieu day du mang ten mot nguoi — de dem dong ky vong cho de. */
function seedDataFor(owner: Person, label: string): void {
  const customerId = Number(
    db
      .prepare(
        `INSERT INTO customers (name, org_kind, status, owner_contact_id) VALUES (?, 'customer', 'customer', ?)`
      )
      .run(`Khách của ${label}`, owner.contactId).lastInsertRowid
  );
  db.prepare(
    `INSERT INTO deals (customer_id, title, stage, position, owner_contact_id)
     VALUES (?, ?, 'lead', 1024, ?)`
  ).run(customerId, `Cơ hội của ${label}`, owner.contactId);
  db.prepare(`INSERT INTO boards (name, owner_contact_id) VALUES (?, ?)`).run(
    `Bảng của ${label}`,
    owner.contactId
  );
  db.prepare(`INSERT INTO customer_services (customer_id, owner_contact_id) VALUES (?, ?)`).run(
    customerId,
    owner.contactId
  );
}

addUnit('Khối A', 'Công ty');
addUnit('Phòng P1', 'Khối A');
addUnit('Phòng P2', 'Khối A');

const head = addPerson('Truong Phong P1', 'Phòng P1', 'department_head');
const n1 = addPerson('Nhan Vien N1', 'Phòng P1', 'staff');
const n2 = addPerson('Nhan Vien N2', 'Phòng P2', 'staff');
const revenueAdmin = addPerson('Admin Doanh Thu', 'Công ty', 'revenue_admin');

seedDataFor(head, 'Trưởng phòng');
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

async function signInAs(person: Person | 'admin') {
  const email = person === 'admin' ? 'admin@congty.vn' : person.email;
  const userId =
    person === 'admin'
      ? (db.prepare('SELECT MIN(id) AS id FROM users').get() as { id: number }).id
      : person.userId;
  await setPassword(userId, 'mat-khau-test-1');
  cookie = '';
  const res = await call('POST', '/api/auth/login', {
    username: email,
    password: 'mat-khau-test-1',
  });
  assert.equal(res.status, 200, `dang nhap that bai cho ${email}`);
}

function count(data: unknown): number {
  return Array.isArray(data) ? data.length : 0;
}

/* ---------- Ma tran: vi tri × endpoint × so dong ---------- */

test('khach hang: Nhan vien 1 · Truong phong 2 · Quan tri tat ca', async () => {
  await signInAs(n1);
  assert.equal(count((await call('GET', '/api/customers')).data), 1, 'N1 chi thay khach cua minh');

  await signInAs(n2);
  assert.equal(count((await call('GET', '/api/customers')).data), 1, 'N2 chi thay khach cua minh');

  await signInAs(head);
  assert.equal(
    count((await call('GET', '/api/customers')).data),
    2,
    'Truong phong P1 thay khach cua minh va cua N1, KHONG thay cua N2 (phong khac)'
  );

  await signInAs('admin');
  assert.equal(count((await call('GET', '/api/customers')).data), 3, 'quan tri thay tat ca');
});

test('co hoi ban hang: cung luat pham vi voi khach hang', async () => {
  const pipelineSize = async () => {
    const body = (await call('GET', '/api/deals')).data as { stages: Record<string, unknown[]> };
    return Object.values(body.stages).flat().length;
  };

  await signInAs(n1);
  assert.equal(await pipelineSize(), 1);

  await signInAs(head);
  assert.equal(await pipelineSize(), 2);
});

test('doanh thu: Admin doanh thu thay toan cong ty, Truong phong chi thay cay minh', async () => {
  await signInAs(head);
  const headLines = (await call('GET', '/api/revenues/lines')).data as { lines: unknown[] };
  assert.equal(headLines.lines.length, 2);

  await signInAs(revenueAdmin);
  const adminLines = (await call('GET', '/api/revenues/lines')).data as { lines: unknown[] };
  assert.equal(adminLines.lines.length, 3, 'vi tri nay co pham vi toan cong ty o doanh thu');

  /* Va van KHONG mo duoc pipeline — pham vi rong o mot truc khong keo theo truc
     khac. Day la thu mot he "nhieu hay it quyen" tren mot thang do khong lam duoc. */
  assert.equal((await call('GET', '/api/deals')).status, 403);
});

test('doan id khong mo duoc ban ghi ngoai pham vi', async () => {
  const otherCustomer = (
    db.prepare(`SELECT id FROM customers WHERE owner_contact_id = ?`).get(n2.contactId) as {
      id: number;
    }
  ).id;

  await signInAs(n1);
  const res = await call('GET', `/api/customers/${otherCustomer}/full`);
  /* 404 chu khong 403: ngoai pham vi thi "khong ton tai" va "khong duoc xem" phai
     khong phan biet duoc, neu khong do id la biet duoc ai dang co du lieu gi. */
  assert.equal(res.status, 404);

  const write = await call('PATCH', `/api/customers/${otherCustomer}`, { notes: 'sua trom' });
  assert.equal(write.status, 404, 'chan danh sach thoi thi chua du — phai chan ca duong ghi');

  const del = await call('DELETE', `/api/customers/${otherCustomer}`);
  assert.equal(del.status, 404);
});

test('ban ghi moi tao thuoc ve nguoi tao va hien ra ngay', async () => {
  await signInAs(n1);
  const created = (await call('POST', '/api/customers', { name: 'Khách N1 vừa tạo' })).data as {
    id: number;
    owner_contact_id: number;
  };
  assert.equal(created.owner_contact_id, n1.contactId);

  /* Khong co mac dinh nay thi ban ghi vua tao se vo chu va bien mat khoi chinh
     danh sach cua nguoi vua tao ra no — mot cach hong rat de lot qua review. */
  assert.equal(count((await call('GET', '/api/customers')).data), 2);

  db.prepare('DELETE FROM customers WHERE id = ?').run(created.id);
});

test('bang: thay bang cua minh, CONG bang co viec giao cho minh', async () => {
  await signInAs(n1);
  assert.equal(count((await call('GET', '/api/boards')).data), 1);

  /* Giao mot viec tren bang cua Truong phong cho N1. Bang do khong thuoc pham vi
     cua N1, nhung neu giau di thi N1 khong mo duoc chinh cong viec minh phai lam
     — phan quyen khong duoc chan duong lam viec binh thuong. */
  const headBoard = (
    db.prepare(`SELECT id FROM boards WHERE owner_contact_id = ?`).get(head.contactId) as {
      id: number;
    }
  ).id;
  const listId = Number(
    db
      .prepare(`INSERT INTO lists (board_id, name, position) VALUES (?, 'Cần làm', 1024)`)
      .run(headBoard).lastInsertRowid
  );
  db.prepare(
    `INSERT INTO cards (list_id, title, position, assignee_contact_id) VALUES (?, ?, 1024, ?)`
  ).run(listId, 'Việc giao cho N1', n1.contactId);

  assert.equal(
    count((await call('GET', '/api/boards')).data),
    2,
    'phai thay them bang co viec cua minh'
  );
});

test('danh sach cong viec: viec cua minh, viec tren bang minh thay, va viec chua giao', async () => {
  await signInAs(n2);
  /* N2 khong so huu bang nao co the, va viec duy nhat trong he thong duoc giao
     cho N1 tren bang cua Truong phong — nen N2 khong thay gi. */
  assert.equal(count((await call('GET', '/api/views/tasks')).data), 0);

  await signInAs(n1);
  assert.equal(
    count((await call('GET', '/api/views/tasks')).data),
    1,
    'viec giao cho minh phai thay du nam tren bang nguoi khac'
  );
});

test('tro ly AI khong ke lai du lieu ngoai pham vi nguoi hoi', async () => {
  const otherDeal = (
    db.prepare(`SELECT id FROM deals WHERE owner_contact_id = ?`).get(n2.contactId) as {
      id: number;
    }
  ).id;

  await signInAs(n1);
  const res = await call('POST', '/api/ai/brief', {
    context_type: 'deal',
    context_id: otherDeal,
    mode: 'fast',
  });
  /* Chan TRUOC khi goi nha cung cap AI. Khong co dong nay thi bat ky ai cung moi
     duoc du lieu phong khac ra bang mot cau hoi thuong, va khong man hinh nao lam
     lo ra dieu do. */
  assert.equal(res.status, 404);
});

test('ghi chu nhanh la du lieu ca nhan — cap tren cung khong thay', async () => {
  await signInAs(n1);
  const created = await call('POST', '/api/quick-notes', { title: 'Ghi chú riêng của N1' });
  assert.equal(created.status, 201);

  await signInAs(head);
  const headNotes = JSON.stringify((await call('GET', '/api/quick-notes')).data);
  assert.ok(
    !headNotes.includes('Ghi chú riêng của N1'),
    'ghi chu nhanh la mau giay dan tren man hinh cua rieng mot nguoi — cap tren khong doc'
  );
});

test('xuat toan bo CSDL van chi danh cho nguoi co quyen', async () => {
  await signInAs(head);
  assert.equal((await call('GET', '/api/export')).status, 403);

  await signInAs('admin');
  assert.equal((await call('GET', '/api/export')).status, 200);
});
