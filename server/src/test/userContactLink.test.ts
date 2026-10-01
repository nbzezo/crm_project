import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * Moi noi giua tai khoan va so danh ba, va mat khau do quan tri dat thay.
 *
 * Don vi nam tren contact, nen doi/xoa contact la doi/xoa cho ngoi va pham vi
 * du lieu cua mot nguoi dang dang nhap. Cac test o day kiem nhung duong do deu
 * di qua dung rao quyen, va mat khau quan tri dat chi dung duoc de doi lai.
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-userlink-'));
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

const ownOrgId = Number(
  db.prepare(`INSERT INTO customers (name, org_kind) VALUES ('Công ty tôi', 'own')`).run()
    .lastInsertRowid
);
const rootUnitId = (
  db.prepare('SELECT id FROM org_units WHERE parent_id IS NULL').get() as { id: number }
).id;
const phongP1 = Number(
  db
    .prepare(`INSERT INTO org_units (name, parent_id, position) VALUES ('Phòng P1', ?, 1024)`)
    .run(rootUnitId).lastInsertRowid
);

function positionId(code: string): number {
  return (db.prepare('SELECT id FROM positions WHERE code = ?').get(code) as { id: number }).id;
}

function addContact(fullName: string): number {
  return Number(
    db
      .prepare(`INSERT INTO contacts (customer_id, full_name, is_active) VALUES (?, ?, 1)`)
      .run(ownOrgId, fullName).lastInsertRowid
  );
}

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
  return { status: res.status, data: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}

async function signIn(login: string, password: string) {
  cookie = '';
  const res = await call('POST', '/api/auth/login', { username: login, password });
  assert.equal(res.status, 200, `dang nhap that bai cho ${login}`);
}

const signInAdmin = () => signIn('admin@congty.vn', 'admin-password-1');

function userIdByEmail(email: string): number | undefined {
  return (
    db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined
  )?.id;
}

const customerOrgId = Number(
  db.prepare(`INSERT INTO customers (name, org_kind) VALUES ('Khách hàng A', 'customer')`).run()
    .lastInsertRowid
);

function placeContact(contactId: number, unitId: number | null): void {
  db.prepare('UPDATE contacts SET org_unit_id = ? WHERE id = ?').run(unitId, contactId);
}

async function createWithPassword(
  email: string,
  positionCodes: string[],
  contactId: number | null = null
): Promise<number> {
  await signInAdmin();
  const res = await call('POST', '/api/users', {
    email,
    full_name: email,
    contact_id: contactId,
    positions: positionCodes.map((code) => ({ position_id: positionId(code) })),
  });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  const id = Number(res.data.id);
  await setPassword(id, 'mat-khau-test-1');
  return id;
}

/* Vi tri chi quan ly tai khoan — khong co admin.org, khong co admin.positions. */
let hrPosition = 0;
async function hrPositionId(): Promise<number> {
  if (hrPosition) return hrPosition;
  await signInAdmin();
  const created = await call('POST', '/api/positions', { name: 'Quản lý tài khoản' });
  hrPosition = Number(created.data.id);
  await call('PUT', `/api/positions/${hrPosition}/permissions`, {
    permissions: [
      { resource: 'admin.users', action: 'read', scope: 'all' },
      { resource: 'admin.users', action: 'update', scope: 'all' },
    ],
  });
  return hrPosition;
}

test('email trung phan truoc @ van tao duoc — username tu them hau to', async () => {
  await signInAdmin();
  const first = await call('POST', '/api/users', { email: 'an@congty.vn', full_name: 'An 1' });
  const second = await call('POST', '/api/users', { email: 'an@gmail.com', full_name: 'An 2' });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.notEqual(first.data.username, second.data.username);
});

test('SMTP loi: tai khoan van tao, tra lien ket va canh bao thay vi 5xx', async () => {
  await signInAdmin();
  db.prepare(
    `UPDATE email_settings SET enabled = 1, host = '127.0.0.1', port = 1, from_email = 'a@b.vn'
      WHERE id = 1`
  ).run();
  try {
    const res = await call('POST', '/api/users', {
      email: 'smtploi@congty.vn',
      full_name: 'SMTP lỗi',
    });
    assert.equal(res.status, 201);
    assert.ok(String(res.data.invite_link).includes('/reset-password?token='));
    assert.ok((res.data.warnings as string[]).includes('invite_failed'));
  } finally {
    db.prepare(`UPDATE email_settings SET enabled = 0 WHERE id = 1`).run();
  }
});

test('khong gan duoc tai khoan vao nguoi lien he ben khach hang', async () => {
  await signInAdmin();
  const outsider = Number(
    db
      .prepare(`INSERT INTO contacts (customer_id, full_name, is_active) VALUES (?, 'Khach', 1)`)
      .run(customerOrgId).lastInsertRowid
  );
  const res = await call('POST', '/api/users', {
    email: 'khach@khachhang.vn',
    full_name: 'Khách',
    contact_id: outsider,
  });
  assert.equal(res.status, 400);
  assert.equal(userIdByEmail('khach@khachhang.vn'), undefined);
});

test('doi contact lam doi don vi thi can quyen admin.org', async () => {
  const hr = await hrPositionId();
  await signInAdmin();
  const hrUser = await call('POST', '/api/users', {
    email: 'hr2@congty.vn',
    full_name: 'HR 2',
    positions: [{ position_id: hr }],
  });
  await setPassword(Number(hrUser.data.id), 'mat-khau-test-1');

  const seated = addContact('Da Co Phong');
  placeContact(seated, phongP1);
  const free = addContact('Chua Co Phong');
  const target = await createWithPassword('muctieu@congty.vn', ['staff'], free);

  await signIn('hr2@congty.vn', 'mat-khau-test-1');

  /* Contact chua co don vi: chi la gan danh tinh, admin.users la du. */
  const plain = await call('POST', '/api/users', {
    email: 'gancontact@congty.vn',
    full_name: 'Gắn contact',
    contact_id: addContact('Gan Contact'),
  });
  assert.equal(plain.status, 201);

  /* Tao hoac doi sang contact dang ngoi o mot phong = xep phong. */
  const createSeated = await call('POST', '/api/users', {
    email: 'vaophong@congty.vn',
    full_name: 'Vào phòng',
    contact_id: seated,
  });
  assert.equal(createSeated.status, 403);
  const moveSeated = await call('PATCH', `/api/users/${target}`, { contact_id: seated });
  assert.equal(moveSeated.status, 403);

  /* Go contact cua nguoi dang ngoi o phong = dua ra khoi phong. */
  placeContact(free, phongP1);
  const unlink = await call('PATCH', `/api/users/${target}`, { contact_id: null });
  assert.equal(unlink.status, 403);
  assert.equal(
    (db.prepare('SELECT contact_id FROM users WHERE id = ?').get(target) as { contact_id: number })
      .contact_id,
    free
  );

  /* Sua ten/email khong dung toi contact thi van duoc. */
  const rename = await call('PATCH', `/api/users/${target}`, { full_name: 'Tên mới' });
  assert.equal(rename.status, 200);

  await signInAdmin();
  const asAdmin = await call('PATCH', `/api/users/${target}`, { contact_id: seated });
  assert.equal(asAdmin.status, 200);
  assert.equal(asAdmin.data.org_unit_id, phongP1);
});

test('khong xoa duoc contact hay to chuc dang gan tai khoan', async () => {
  await signInAdmin();
  const contactId = addContact('Co Tai Khoan');
  const userId = await createWithPassword('cotaikhoan@congty.vn', ['staff'], contactId);
  await signInAdmin();

  const del = await call('DELETE', `/api/contacts/${contactId}`);
  assert.equal(del.status, 409);
  const delOrg = await call('DELETE', `/api/customers/${ownOrgId}`);
  assert.equal(delOrg.status, 409);
  assert.ok(db.prepare('SELECT id FROM contacts WHERE id = ?').get(contactId));

  /* Go lien ket xong thi xoa duoc. */
  assert.equal((await call('PATCH', `/api/users/${userId}`, { contact_id: null })).status, 200);
  assert.equal((await call('DELETE', `/api/contacts/${contactId}`)).status, 200);
});

test('nhan vien khong sua/xoa duoc contact ngoai pham vi, sua duoc dong cua minh', async () => {
  const mine = addContact('Nhan Vien Pham Vi');
  await createWithPassword('phamvi@congty.vn', ['staff'], mine);
  const other = addContact('Dong Nghiep');

  await signIn('phamvi@congty.vn', 'mat-khau-test-1');
  assert.equal((await call('DELETE', `/api/contacts/${other}`)).status, 404);
  assert.equal((await call('PATCH', `/api/contacts/${other}`, { phone: '1' })).status, 404);
  assert.ok(db.prepare('SELECT id FROM contacts WHERE id = ?').get(other));

  const self = await call('PATCH', `/api/contacts/${mine}`, { phone: '0901' });
  assert.equal(self.status, 200);
});

test('quan tri he thong dat mat khau tam — nguoi do phai doi truoc khi dung', async () => {
  const userId = await createWithPassword('quenmk@congty.vn', ['staff'], addContact('Quen MK'));
  await signInAdmin();

  const res = await call('POST', `/api/users/${userId}/password`, {});
  assert.equal(res.status, 200);
  const temp = String(res.data.generated_password);
  assert.ok(temp.length >= 12);
  assert.equal(res.data.must_change_password, true);
  assert.equal(res.data.pending_invite, false);

  /* Mat khau cu het hieu luc. */
  cookie = '';
  const old = await call('POST', '/api/auth/login', {
    username: 'quenmk@congty.vn',
    password: 'mat-khau-test-1',
  });
  assert.equal(old.status, 401);

  await signIn('quenmk@congty.vn', temp);
  const blocked = await call('GET', '/api/cards');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, 'must_change_password');
  assert.equal((await call('GET', '/api/auth/me')).status, 200);

  const changed = await call('PATCH', '/api/auth/password', {
    current_password: temp,
    new_password: 'mat-khau-moi-1',
  });
  assert.equal(changed.status, 200);
  assert.notEqual((await call('GET', '/api/cards')).status, 403);
});

test('quan tri go mat khau va khong bat doi lai', async () => {
  const userId = await createWithPassword('datmk@congty.vn', ['staff']);
  await signInAdmin();
  const res = await call('POST', `/api/users/${userId}/password`, {
    password: 'quan-tri-dat-1',
    require_change: false,
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.generated_password, null);
  await signIn('datmk@congty.vn', 'quan-tri-dat-1');
  assert.notEqual((await call('GET', '/api/cards')).status, 403);
});

test('chi quan tri he thong moi dat mat khau cho nguoi khac, khong cho chinh minh', async () => {
  const hr = await hrPositionId();
  await signInAdmin();
  const hrUser = await call('POST', '/api/users', {
    email: 'hr3@congty.vn',
    full_name: 'HR 3',
    positions: [{ position_id: hr }],
  });
  await setPassword(Number(hrUser.data.id), 'mat-khau-test-1');
  const adminId = userIdByEmail('admin@congty.vn')!;

  await signIn('hr3@congty.vn', 'mat-khau-test-1');
  const escalate = await call('POST', `/api/users/${adminId}/password`, {
    password: 'chiem-quyen-1',
  });
  assert.equal(escalate.status, 403);

  await signInAdmin();
  const self = await call('POST', `/api/users/${adminId}/password`, { password: 'tu-dat-123' });
  assert.equal(self.status, 400);
});
