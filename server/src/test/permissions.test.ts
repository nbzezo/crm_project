import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * Phan cap quan ly, vi tri va ma tran phan quyen (v39).
 *
 * Dung mot cay don vi that thay vi mock:
 *
 *   Cong ty
 *   └─ Trung tam A
 *      ├─ Khoi A1
 *      │  ├─ Phong P1   (Truong phong P1, Nhan vien N1)
 *      │  └─ Phong P2   (Nhan vien N2)
 *      └─ Khoi A2       (Giam doc Khoi A2)
 *
 * Phan lon test o day kiem hai thu ma CSDL mot minh khong dien ta duoc: rao chan
 * chong tu khoa cua, va chuyen "pham vi den tu CHO NGOI trong cay, khong tu ten
 * vi tri".
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-perm-'));
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

await ensureAdminUser();

let server: Server;
let baseUrl = '';
let cookie = '';

/* ---------- Du lieu nen ---------- */

const ownOrgId = Number(
  db.prepare(`INSERT INTO customers (name, org_kind) VALUES ('Công ty tôi', 'own')`).run()
    .lastInsertRowid
);

function unitId(name: string): number {
  return (db.prepare('SELECT id FROM org_units WHERE name = ?').get(name) as { id: number }).id;
}

function addUnit(name: string, parent: string, kind: string): number {
  return Number(
    db
      .prepare(
        `INSERT INTO org_units (name, parent_id, kind_id, position)
         VALUES (?, ?, (SELECT id FROM org_unit_kinds WHERE name = ?), 1024)`
      )
      .run(name, unitId(parent), kind).lastInsertRowid
  );
}

/** Mot nhan su + mot tai khoan + mot vi tri, gan vao mot don vi. */
function addPerson(fullName: string, unit: string, positionCode: string) {
  const contactId = Number(
    db
      .prepare(
        `INSERT INTO contacts (customer_id, full_name, org_unit_id, is_active)
         VALUES (?, ?, ?, 1)`
      )
      .run(ownOrgId, fullName, unitId(unit)).lastInsertRowid
  );
  const email = `${fullName.toLowerCase().replace(/[^a-z0-9]+/g, '')}@congty.vn`;
  const userId = Number(
    db
      .prepare(
        `INSERT INTO users (username, password_hash, password_salt, email, full_name, contact_id)
         VALUES (?, '', '', ?, ?, ?)`
      )
      .run(email, email, fullName, contactId).lastInsertRowid
  );
  db.prepare(
    `INSERT INTO user_positions (user_id, position_id, is_primary)
     VALUES (?, (SELECT id FROM positions WHERE code = ?), 1)`
  ).run(userId, positionCode);
  return { contactId, userId, email };
}

addUnit('Trung tâm A', 'Công ty', 'Trung tâm');
addUnit('Khối A1', 'Trung tâm A', 'Khối');
addUnit('Khối A2', 'Trung tâm A', 'Khối');
addUnit('Phòng P1', 'Khối A1', 'Phòng');
addUnit('Phòng P2', 'Khối A1', 'Phòng');

const truongPhongP1 = addPerson('Truong Phong P1', 'Phòng P1', 'department_head');
const nhanVienN1 = addPerson('Nhan Vien N1', 'Phòng P1', 'staff');
const nhanVienN2 = addPerson('Nhan Vien N2', 'Phòng P2', 'staff');
const giamDocA2 = addPerson('Giam Doc A2', 'Khối A2', 'division_director');
const adminDoanhThu = addPerson('Admin Doanh Thu', 'Công ty', 'revenue_admin');

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

/** Dang nhap thang bang cach dat mat khau roi goi API — nhanh hon di qua thu moi. */
async function signInAs(userId: number, email: string) {
  const { setPassword } = await import('../services/auth/users.ts');
  await setPassword(userId, 'mat-khau-test-1');
  cookie = '';
  const res = await call('POST', '/api/auth/login', {
    username: email,
    password: 'mat-khau-test-1',
  });
  assert.equal(res.status, 200, `dang nhap that bai cho ${email}`);
}

function contactsOf(names: string[]): number[] {
  return names
    .map(
      (n) => (db.prepare('SELECT id FROM contacts WHERE full_name = ?').get(n) as { id: number }).id
    )
    .sort((a, b) => a - b);
}

/* ---------- Pham vi den tu CHO NGOI, khong tu ten vi tri ---------- */

test('ba vi tri quan ly co ma tran quyen giong het nhau', () => {
  const signature = (code: string) =>
    (
      db
        .prepare(
          `SELECT resource || ':' || action || '=' || scope AS s
             FROM position_permissions pp JOIN positions p ON p.id = pp.position_id
            WHERE p.code = ? ORDER BY s`
        )
        .all(code) as { s: string }[]
    )
      .map((r) => r.s)
      .join('|');

  /* Day KHONG phai trung lap can gom lai. Ba cap quan ly khac nhau o CHO NGOI
     trong cay chu khong o bo quyen — do la thu lam cho "them mot cap" chi la
     them mot node thay vi sua code. */
  assert.equal(signature('center_director'), signature('division_director'));
  assert.equal(signature('division_director'), signature('department_head'));
  assert.notEqual(signature('department_head'), signature('staff'));
});

test('Truong phong thay ca cay don vi minh ngoi, Nhan vien chi thay minh', () => {
  const head = buildAccess(truongPhongP1.userId, truongPhongP1.contactId);
  const staff = buildAccess(nhanVienN1.userId, nhanVienN1.contactId);

  const headVisible = head.visibleContactIds('deals', 'read');
  assert.notEqual(headVisible, 'all');
  assert.deepEqual(
    [...(headVisible as number[])].sort((a, b) => a - b),
    contactsOf(['Truong Phong P1', 'Nhan Vien N1']),
    'Truong phong P1 thay nguoi trong P1, KHONG thay P2'
  );

  assert.deepEqual(staff.visibleContactIds('deals', 'read'), [nhanVienN1.contactId]);
});

test('Giam doc Khoi A2 khong thay nguoi cua Khoi A1', () => {
  const access = buildAccess(giamDocA2.userId, giamDocA2.contactId);
  const visible = access.visibleContactIds('deals', 'read') as number[];
  assert.ok(!visible.includes(nhanVienN1.contactId), 'khong duoc thay nhan vien khoi khac');
  assert.ok(visible.includes(giamDocA2.contactId));
});

test('chuyen mot nguoi sang don vi khac la doi pham vi cua ca cap tren', () => {
  const before_ = buildAccess(truongPhongP1.userId, truongPhongP1.contactId).visibleContactIds(
    'deals',
    'read'
  ) as number[];
  assert.ok(!before_.includes(nhanVienN2.contactId));

  db.prepare('UPDATE contacts SET org_unit_id = ? WHERE id = ?').run(
    unitId('Phòng P1'),
    nhanVienN2.contactId
  );

  /* buildAccess moi = request moi. Khong co cache xuyen request nen thay doi co
     hieu luc ngay, khong phai dang xuat hay cho het phien. */
  const after_ = buildAccess(truongPhongP1.userId, truongPhongP1.contactId).visibleContactIds(
    'deals',
    'read'
  ) as number[];
  assert.ok(after_.includes(nhanVienN2.contactId));

  db.prepare('UPDATE contacts SET org_unit_id = ? WHERE id = ?').run(
    unitId('Phòng P2'),
    nhanVienN2.contactId
  );
});

test('nguoi chua duoc xep don vi van thay du lieu cua chinh minh', () => {
  const orphan = addPerson('Nguoi Chua Xep', 'Công ty', 'staff');
  db.prepare('UPDATE contacts SET org_unit_id = NULL WHERE id = ?').run(orphan.contactId);

  const access = buildAccess(orphan.userId, orphan.contactId);
  assert.deepEqual(access.visibleContactIds('deals', 'read'), [orphan.contactId]);
});

/* ---------- Chan tinh nang ---------- */

test('Admin doanh thu thay doanh thu toan cong ty nhung khong mo duoc pipeline', async () => {
  await signInAs(adminDoanhThu.userId, adminDoanhThu.email);

  const revenue = await call('GET', '/api/revenues/lines');
  assert.equal(revenue.status, 200, 'phai vao duoc man doanh thu');

  const deals = await call('GET', '/api/deals');
  assert.equal(deals.status, 403, 'khong duoc thay pipeline — 403 chu khong phai danh sach rong');

  const access = buildAccess(adminDoanhThu.userId, adminDoanhThu.contactId);
  assert.equal(access.scopeOf('revenues', 'read'), 'all');
  assert.equal(access.scopeOf('deals', 'read'), 'none');
});

test('Nhan vien khong vao duoc trang quan tri', async () => {
  await signInAs(nhanVienN1.userId, nhanVienN1.email);
  assert.equal((await call('GET', '/api/users')).status, 403);
  assert.equal((await call('GET', '/api/positions')).status, 403);
  assert.equal((await call('GET', '/api/org-units')).status, 403);
  assert.equal((await call('GET', '/api/export')).status, 403, 'xuat toan bo CSDL phai bi chan');
});

test('/api/auth/me tra ve quyen va cho ngoi trong cay', async () => {
  await signInAs(truongPhongP1.userId, truongPhongP1.email);
  const me = await call('GET', '/api/auth/me');
  assert.equal(me.status, 200);

  const permissions = me.data.permissions as Record<string, string>;
  assert.equal(permissions['deals:read'], 'subtree');
  assert.equal(permissions['deals:update'], 'own');
  assert.equal(permissions['admin.users:read'], undefined, 'khong co dong = khong co quyen');

  const orgUnit = me.data.org_unit as { name: string } | null;
  assert.equal(orgUnit?.name, 'Phòng P1');
  assert.ok(Number(me.data.permissions_version) >= 1);
});

/* ---------- Cau hinh dong ---------- */

test('doi mot o trong ma tran co hieu luc NGAY, khong phai dang nhap lai', async () => {
  await signInAs(nhanVienN1.userId, nhanVienN1.email);
  assert.equal((await call('GET', '/api/positions')).status, 403);

  const staffPosition = (
    db.prepare(`SELECT id FROM positions WHERE code = 'staff'`).get() as { id: number }
  ).id;
  db.prepare(
    `INSERT INTO position_permissions (position_id, resource, action, scope)
     VALUES (?, 'admin.positions', 'read', 'all')`
  ).run(staffPosition);

  /* Cung phien, cung cookie, khong dang nhap lai. Day la ly do `Access` co y
     khong cache xuyen request: mot cache quyen la mot nguon lech. */
  assert.equal((await call('GET', '/api/positions')).status, 200);

  db.prepare(
    `DELETE FROM position_permissions WHERE position_id = ? AND resource = 'admin.positions'`
  ).run(staffPosition);
  assert.equal((await call('GET', '/api/positions')).status, 403);
});

test('tao cap moi bang cach nhan ban vi tri — khong dong code nao', async () => {
  await signInAs(1, 'admin@congty.vn');

  const kind = await call('POST', '/api/org-units/kinds', { name: 'Tổ nhỏ', level_order: 5 });
  assert.equal(kind.status, 201);

  const unit = await call('POST', '/api/org-units', {
    name: 'Tổ P1-A',
    parent_id: unitId('Phòng P1'),
    kind_id: kind.data.id,
  });
  assert.equal(unit.status, 201);

  const head = (
    db.prepare(`SELECT id FROM positions WHERE code = 'department_head'`).get() as { id: number }
  ).id;
  const cloned = await call('POST', '/api/positions', {
    name: 'Tổ trưởng',
    code: 'team_lead',
    copy_from_position_id: head,
  });
  assert.equal(cloned.status, 201);

  const original = await call('GET', `/api/positions/${head}/permissions`);
  const copy = await call('GET', `/api/positions/${cloned.data.id}/permissions`);
  assert.deepEqual(copy.data, original.data, 'ban sao phai mang y nguyen ma tran cua ban goc');
});

test('o `none` khong duoc luu — khong co dong nghia la khong co quyen', async () => {
  await signInAs(1, 'admin@congty.vn');
  const position = (
    db.prepare(`SELECT id FROM positions WHERE code = 'team_lead'`).get() as { id: number }
  ).id;

  const res = await call('PUT', `/api/positions/${position}/permissions`, {
    permissions: [
      { resource: 'deals', action: 'read', scope: 'subtree' },
      { resource: 'deals', action: 'delete', scope: 'none' },
    ],
  });
  assert.equal(res.status, 200);
  const rows = res.data as unknown as { resource: string; action: string }[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, 'read');
});

test('o khong co trong danh muc bi tu choi', async () => {
  await signInAs(1, 'admin@congty.vn');
  const position = (
    db.prepare(`SELECT id FROM positions WHERE code = 'team_lead'`).get() as { id: number }
  ).id;

  const badResource = await call('PUT', `/api/positions/${position}/permissions`, {
    permissions: [{ resource: 'khong-co-that', action: 'read', scope: 'all' }],
  });
  assert.equal(badResource.status, 400);

  /* `report.*` khong co thao tac xoa. Cho qua se la hua mot thu khong ton tai. */
  const badAction = await call('PUT', `/api/positions/${position}/permissions`, {
    permissions: [{ resource: 'report.sales', action: 'delete', scope: 'all' }],
  });
  assert.equal(badAction.status, 400);
});

/* ---------- Rao chan ---------- */

test('khong the tu khoa cua quan tri', async () => {
  await signInAs(1, 'admin@congty.vn');
  const admin = (
    db.prepare(`SELECT id FROM positions WHERE code = 'system_admin'`).get() as { id: number }
  ).id;

  const stripped = await call('PUT', `/api/positions/${admin}/permissions`, {
    permissions: [{ resource: 'deals', action: 'read', scope: 'all' }],
  });
  assert.equal(stripped.status, 409, 'bo quyen quan tri cua nguoi cuoi cung phai bi tu choi');

  // Va quyen cu phai con nguyen — transaction da rollback.
  const still = await call('GET', '/api/positions');
  assert.equal(still.status, 200);

  const wiped = await call('PUT', '/api/positions/assignments/1', { positions: [] });
  assert.equal(wiped.status, 409, 'go vi tri cua quan tri cuoi cung phai bi tu choi');
});

test('khong xoa duoc vi tri dang co nguoi giu, va khong xoa duoc vi tri he thong', async () => {
  await signInAs(1, 'admin@congty.vn');

  const staff = (
    db.prepare(`SELECT id FROM positions WHERE code = 'staff'`).get() as { id: number }
  ).id;
  assert.equal((await call('DELETE', `/api/positions/${staff}`)).status, 409);

  const admin = (
    db.prepare(`SELECT id FROM positions WHERE code = 'system_admin'`).get() as { id: number }
  ).id;
  assert.equal((await call('DELETE', `/api/positions/${admin}`)).status, 409);
});

test('cay don vi: chan chu trinh va chan xoa don vi con nguoi', async () => {
  await signInAs(1, 'admin@congty.vn');

  /* Dat Trung tam A xuong duoi Phong P1 — ma P1 lai nam trong chinh Trung tam A.
     SQLite khong dien ta duoc rang buoc nay; khong chan thi recursive CTE tinh
     pham vi se chay mai khong dung. */
  const cycle = await call('PATCH', `/api/org-units/${unitId('Trung tâm A')}`, {
    parent_id: unitId('Phòng P1'),
  });
  assert.equal(cycle.status, 400);

  const self = await call('PATCH', `/api/org-units/${unitId('Khối A1')}`, {
    parent_id: unitId('Khối A1'),
  });
  assert.equal(self.status, 400);

  assert.equal(
    (await call('DELETE', `/api/org-units/${unitId('Phòng P1')}`)).status,
    409,
    'don vi con nguoi thi khong xoa duoc'
  );
  assert.equal(
    (await call('DELETE', `/api/org-units/${unitId('Khối A1')}`)).status,
    409,
    'don vi con don vi cap duoi thi khong xoa duoc'
  );
});

test('kiem nhiem mo rong pham vi ma khong mat don vi goc', () => {
  const positionId = (
    db.prepare(`SELECT id FROM positions WHERE code = 'department_head'`).get() as { id: number }
  ).id;
  db.prepare(
    'UPDATE user_positions SET scope_unit_id = ? WHERE user_id = ? AND position_id = ?'
  ).run(unitId('Phòng P2'), truongPhongP1.userId, positionId);

  const visible = buildAccess(truongPhongP1.userId, truongPhongP1.contactId).visibleContactIds(
    'deals',
    'read'
  ) as number[];
  assert.ok(visible.includes(nhanVienN2.contactId), 'phai thay them nguoi cua don vi kiem nhiem');
  assert.ok(visible.includes(nhanVienN1.contactId), 'van phai thay nguoi cua don vi goc');

  db.prepare('UPDATE user_positions SET scope_unit_id = NULL WHERE user_id = ?').run(
    truongPhongP1.userId
  );
});

test('giu them mot vi tri chi lam rong ra, khong bao gio hep lai', () => {
  const staffPosition = (
    db.prepare(`SELECT id FROM positions WHERE code = 'staff'`).get() as { id: number }
  ).id;
  db.prepare('INSERT INTO user_positions (user_id, position_id, is_primary) VALUES (?, ?, 0)').run(
    truongPhongP1.userId,
    staffPosition
  );

  const access = buildAccess(truongPhongP1.userId, truongPhongP1.contactId);
  assert.equal(
    access.scopeOf('deals', 'read'),
    'subtree',
    'them vi tri Nhan vien (own) khong duoc keo Truong phong (subtree) xuong'
  );

  db.prepare('DELETE FROM user_positions WHERE user_id = ? AND position_id = ?').run(
    truongPhongP1.userId,
    staffPosition
  );
});
