import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * Tao tai khoan KEM vi tri va don vi.
 *
 * Truoc dot nay man Nguoi dung chi tao duoc mot tai khoan trong, va ma tran quyen
 * mac dinh la CAM — nguoi moi kich hoat xong dang nhap vao chi thay 403. Cac test
 * o day kiem ba thu: gan dung, that bai thi khong de lai tai khoan do dang, va quan
 * ly tai khoan khong keo theo quyen phan quyen.
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-onboard-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';
process.env.WORKFLOW_SESSION_SECRET = 'test-secret-value-at-least-32-characters-long';
process.env.WORKFLOW_ADMIN_USER = 'admin';
process.env.WORKFLOW_ADMIN_PASSWORD = 'admin-password-1';
process.env.WORKFLOW_ADMIN_EMAIL = 'admin@congty.vn';

const { createApp } = await import('../app.ts');
const { db, closeDatabase } = await import('../db/connection.ts');
const { ensureAdminUser } = await import('../services/auth/bootstrapAdmin.ts');
const { buildAccess } = await import('../services/auth/access.ts');
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

test('tao tai khoan kem vi tri va don vi — dang nhap vao co quyen ngay', async () => {
  await signInAdmin();
  const contactId = addContact('Nhan Vien Moi');
  const res = await call('POST', '/api/users', {
    email: 'nhanvienmoi@congty.vn',
    full_name: 'Nhân viên mới',
    contact_id: contactId,
    org_unit_id: phongP1,
    positions: [{ position_id: positionId('staff'), is_primary: true }],
  });
  assert.equal(res.status, 201);
  assert.deepEqual(res.data.warnings, []);
  assert.equal(res.data.org_unit_id, phongP1);
  assert.equal(res.data.org_unit_name, 'Phòng P1');
  const positions = res.data.positions as { position_name: string; is_primary: boolean }[];
  assert.equal(positions.length, 1);
  assert.equal(positions[0].position_name, 'Nhân viên');
  assert.equal(positions[0].is_primary, true);

  const userId = Number(res.data.id);
  const access = buildAccess(userId, contactId);
  assert.equal(access.orgUnitId, phongP1);
  assert.equal(access.can('tasks', 'read'), true, 'Nhan vien phai dung duoc cong viec');
  assert.equal(access.can('admin.users', 'read'), false);
});

test('danh sach nguoi dung tra ve vi tri va don vi', async () => {
  await signInAdmin();
  const res = await fetch(`${baseUrl}/api/users`, { headers: { cookie } });
  const rows = (await res.json()) as {
    email: string;
    positions: { position_name: string }[];
    org_unit_name: string | null;
  }[];
  const created = rows.find((row) => row.email === 'nhanvienmoi@congty.vn');
  assert.ok(created);
  assert.deepEqual(
    created.positions.map((p) => p.position_name),
    ['Nhân viên']
  );
  assert.equal(created.org_unit_name, 'Phòng P1');
});

test('khong chon vi tri van tao duoc, kem canh bao', async () => {
  await signInAdmin();
  const res = await call('POST', '/api/users', {
    email: 'chuaphanquyen@congty.vn',
    full_name: 'Chưa phân quyền',
  });
  assert.equal(res.status, 201);
  assert.deepEqual(res.data.warnings, ['no_position']);
  assert.deepEqual(res.data.positions, []);
});

test('vi tri khong ton tai — khong de lai tai khoan do dang', async () => {
  await signInAdmin();
  const res = await call('POST', '/api/users', {
    email: 'vitrisai@congty.vn',
    full_name: 'Vị trí sai',
    positions: [{ position_id: 99999 }],
  });
  assert.equal(res.status, 404);
  assert.equal(userIdByEmail('vitrisai@congty.vn'), undefined);
});

test('trung vi tri hoac hai vi tri chinh bi tu choi', async () => {
  await signInAdmin();
  const staff = positionId('staff');
  const dup = await call('POST', '/api/users', {
    email: 'trung@congty.vn',
    full_name: 'Trùng',
    positions: [{ position_id: staff }, { position_id: staff }],
  });
  assert.equal(dup.status, 400);

  const twoPrimary = await call('POST', '/api/users', {
    email: 'haichinh@congty.vn',
    full_name: 'Hai chính',
    positions: [
      { position_id: staff, is_primary: true },
      { position_id: positionId('department_head'), is_primary: true },
    ],
  });
  assert.equal(twoPrimary.status, 400);
  assert.equal(userIdByEmail('trung@congty.vn'), undefined);
  assert.equal(userIdByEmail('haichinh@congty.vn'), undefined);
});

test('khong ai danh dau chinh thi vi tri dau tien la chinh', async () => {
  await signInAdmin();
  const res = await call('POST', '/api/users', {
    email: 'kiemnhiem@congty.vn',
    full_name: 'Kiêm nhiệm',
    positions: [
      { position_id: positionId('department_head') },
      { position_id: positionId('staff'), scope_unit_id: phongP1 },
    ],
  });
  assert.equal(res.status, 201);
  const positions = res.data.positions as {
    position_name: string;
    is_primary: boolean;
    scope_unit_name: string | null;
  }[];
  assert.equal(positions.find((p) => p.is_primary)?.position_name, 'Trưởng phòng');
  assert.equal(positions.find((p) => !p.is_primary)?.scope_unit_name, 'Phòng P1');
});

test('xep don vi can co nguoi trong so danh ba', async () => {
  await signInAdmin();
  const res = await call('POST', '/api/users', {
    email: 'khongcontact@congty.vn',
    full_name: 'Không contact',
    org_unit_id: phongP1,
  });
  assert.equal(res.status, 400);
  assert.equal(userIdByEmail('khongcontact@congty.vn'), undefined);
});

test('quan ly tai khoan KHONG keo theo quyen gan vi tri', async () => {
  await signInAdmin();
  /* Mot vi tri chi quan ly tai khoan — khong co admin.positions / admin.org. */
  const created = await call('POST', '/api/positions', { name: 'Quản lý tài khoản' });
  const hrPosition = Number(created.data.id);
  const matrix = await call('PUT', `/api/positions/${hrPosition}/permissions`, {
    permissions: [
      { resource: 'admin.users', action: 'read', scope: 'all' },
      { resource: 'admin.users', action: 'update', scope: 'all' },
    ],
  });
  assert.equal(matrix.status, 200);

  const hr = await call('POST', '/api/users', {
    email: 'hr@congty.vn',
    full_name: 'HR',
    positions: [{ position_id: hrPosition }],
  });
  assert.equal(hr.status, 201);
  await setPassword(Number(hr.data.id), 'mat-khau-test-1');
  await signIn('hr@congty.vn', 'mat-khau-test-1');

  const escalate = await call('POST', '/api/users', {
    email: 'leoquyen@congty.vn',
    full_name: 'Leo quyền',
    positions: [{ position_id: positionId('system_admin') }],
  });
  assert.equal(escalate.status, 403);
  assert.equal(userIdByEmail('leoquyen@congty.vn'), undefined);

  const moveUnit = await call('POST', '/api/users', {
    email: 'xepdonvi@congty.vn',
    full_name: 'Xếp đơn vị',
    contact_id: addContact('Xep Don Vi'),
    org_unit_id: phongP1,
  });
  assert.equal(moveUnit.status, 403);

  /* Tao tai khoan trong van duoc — dung viec cua vi tri nay. */
  const plain = await call('POST', '/api/users', {
    email: 'binhthuong@congty.vn',
    full_name: 'Bình thường',
  });
  assert.equal(plain.status, 201);
});

test('sua vi tri qua /assignments dung chung rao chan', async () => {
  await signInAdmin();
  const userId = userIdByEmail('chuaphanquyen@congty.vn')!;
  const missingUnit = await call('PUT', `/api/positions/assignments/${userId}`, {
    positions: [{ position_id: positionId('staff'), scope_unit_id: 99999 }],
  });
  assert.equal(missingUnit.status, 404);

  const ok = await call('PUT', `/api/positions/assignments/${userId}`, {
    positions: [{ position_id: positionId('staff') }],
  });
  assert.equal(ok.status, 200);
  const rows = ok.data as unknown as { is_primary: number }[];
  assert.equal(rows[0].is_primary, 1);
});
