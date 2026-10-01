import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * Tach doanh thu Moi + Mo rong / Nen qua API (v45).
 *
 * Dong A: doanh thu dau tien T8/2025 -> 2026 co T1-T7 o Moi, T8-T12 o Nen.
 * Dong B: Mo rong, bat dau T3/2026 -> ca 2026 o Mo rong.
 * Kiem rang bang dong, bang tong va bang so sanh cung chia dung mot cach.
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-revgroup-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';
process.env.WORKFLOW_SESSION_SECRET = 'test-secret-value-at-least-32-characters-long';
process.env.WORKFLOW_ADMIN_USER = 'admin';
process.env.WORKFLOW_ADMIN_PASSWORD = 'admin-password-1';
process.env.WORKFLOW_ADMIN_EMAIL = 'admin@congty.vn';

const { createApp } = await import('../app.ts');
const { db, closeDatabase } = await import('../db/connection.ts');
const { ensureAdminUser } = await import('../services/auth/bootstrapAdmin.ts');

await ensureAdminUser();

let server: Server;
let baseUrl = '';
let cookie = '';

const customerId = Number(
  db.prepare(`INSERT INTO customers (name, org_kind) VALUES ('Khách A', 'customer')`).run()
    .lastInsertRowid
);

function addLine(kind: 'new' | 'expansion'): number {
  return Number(
    db
      .prepare(`INSERT INTO customer_services (customer_id, contract_kind) VALUES (?, ?)`)
      .run(customerId, kind).lastInsertRowid
  );
}

function addRevenue(lineId: number, period: string, amount: number): void {
  db.prepare(
    `INSERT INTO service_revenues (line_id, period, amount_vnd, forecast_vnd) VALUES (?, ?, ?, ?)`
  ).run(lineId, period, amount, amount);
}

const lineA = addLine('new');
for (let m = 8; m <= 12; m += 1) addRevenue(lineA, `2025-${String(m).padStart(2, '0')}`, 100);
for (let m = 1; m <= 12; m += 1) addRevenue(lineA, `2026-${String(m).padStart(2, '0')}`, 100);
const lineB = addLine('expansion');
addRevenue(lineB, '2026-03', 50);

before(async () => {
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Khong khoi dong duoc test server');
  baseUrl = `http://127.0.0.1:${address.port}`;
  const res = await call('POST', '/api/auth/login', {
    username: 'admin',
    password: 'admin-password-1',
  });
  assert.equal(res.status, 200);
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  closeDatabase();
  if (fixtureRoot.startsWith(os.tmpdir())) fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

/* Test doc sau vao JSON tra ve — khai bao kieu day du cho tung endpoint khong dang. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

async function call(
  method: string,
  pathname: string,
  body?: unknown
): Promise<{ status: number; data: Json }> {
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
  return { status: res.status, data: text ? JSON.parse(text) : {} };
}

test('mot dong co thang o Moi va thang o Nen trong cung nam', async () => {
  const { data } = await call('GET', '/api/revenues/lines?year=2026');
  const a = data.lines.find((l: { id: number }) => l.id === lineA);
  assert.equal(a.groups['2026-07'], 'new');
  assert.equal(a.groups['2026-08'], 'base');
  assert.equal(a.anchor.first_period, '2025-08');
  assert.equal(a.anchor.base_from, '2026-08');

  const base = await call('GET', '/api/revenues/lines?year=2026&group=base');
  assert.deepEqual(
    base.data.lines.map((l: { id: number }) => l.id),
    [lineA]
  );
  assert.equal(base.data.lines[0].totals.amount_vnd, 500);
});

test('tong theo nhom cong lai dung bang tong chung', async () => {
  const { data } = await call('GET', '/api/revenues/summary?year=2026');
  assert.equal(data.totals.amount_vnd, 1250);
  assert.equal(data.by_group.new.totals.amount_vnd, 700);
  assert.equal(data.by_group.expansion.totals.amount_vnd, 50);
  assert.equal(data.by_group.base.totals.amount_vnd, 500);

  const ne = await call('GET', '/api/revenues/summary?year=2026&group=new_expansion');
  assert.equal(ne.data.totals.amount_vnd, 750);
  assert.equal(ne.data.line_count, 2);
});

test('so sanh Nen chi doi chieu cac thang thuoc Nen voi cung ky nam truoc', async () => {
  const { data } = await call('GET', '/api/revenues/comparison?year=2026&group=base');
  assert.equal(data.lines.length, 1);
  const row = data.lines[0];
  assert.deepEqual(row.periods, ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12']);
  assert.equal(row.prev_total_vnd, 500);
  assert.equal(row.prev_total_approx, false);
  assert.equal(row.projected_total_vnd, 500);
});

test('xem truoc doi moc bao dung so thang doi nhom, luu thi ghi nhan', async () => {
  const preview = await call('POST', `/api/revenues/lines/${lineA}/anchor-preview`, {
    mode: 'base',
  });
  assert.equal(preview.status, 200);
  // T8/2025 - T7/2026 dang o Moi (12 thang) se chuyen sang Nen.
  assert.equal(preview.data.moved_count, 12);
  assert.deepEqual(preview.data.years, [2025, 2026]);

  const invalid = await call('PUT', `/api/revenues/lines/${lineA}/anchor`, { mode: 'manual' });
  assert.equal(invalid.status, 400);

  const saved = await call('PUT', `/api/revenues/lines/${lineA}/anchor?year=2026`, {
    mode: 'base',
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.line.groups['2026-01'], 'base');

  await call('PUT', `/api/revenues/lines/${lineA}/anchor`, { mode: 'auto' });
});

test('TB nam truoc: nhap tay, tu dien khong ghi de, xoa bang null', async () => {
  const fill = await call('POST', '/api/revenues/baselines/fill', {
    year: 2026,
    line_ids: [lineA, lineB],
  });
  assert.deepEqual(fill.data, { filled: 1, no_data: 1 });

  await call('PUT', `/api/revenues/lines/${lineA}/baseline`, { year: 2026, avg_monthly_vnd: 90 });
  const again = await call('POST', '/api/revenues/baselines/fill', {
    year: 2026,
    line_ids: [lineA],
  });
  assert.equal(again.data.filled, 0);

  const cmp = await call('GET', '/api/revenues/comparison?year=2026&group=base');
  assert.equal(cmp.data.lines[0].prev_avg_vnd, 90);
  assert.equal(cmp.data.lines[0].prev_avg_source, 'manual');

  await call('PUT', `/api/revenues/lines/${lineA}/baseline`, { year: 2026, avg_monthly_vnd: null });
  const cleared = await call('GET', '/api/revenues/lines?year=2026');
  assert.equal(
    cleared.data.lines.find((l: { id: number }) => l.id === lineA).baseline_avg_vnd,
    null
  );
});

test('tao dong Nen kem AM la nguoi dung va TB thang nam truoc', async () => {
  const userId = Number(
    db
      .prepare(
        `INSERT INTO users (username, password_hash, password_salt, email, full_name) VALUES ('hoa', 'x', 'x', 'hoa@congty.vn', 'Trần Hoa')`
      )
      .run().lastInsertRowid
  );
  const created = await call('POST', '/api/revenues/lines', {
    customer_id: customerId,
    am_user_id: userId,
    revenue_anchor_mode: 'base',
    baseline: { year: 2026, avg_monthly_vnd: 30 },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.am_name, 'Trần Hoa');
  assert.equal(created.data.am, 'Trần Hoa');
  assert.equal(created.data.anchor.mode, 'base');
  assert.equal(created.data.groups[`${new Date().getFullYear()}-01`], 'base');

  const line = await call('GET', `/api/revenues/lines/${created.data.id}?year=2026`);
  assert.equal(line.data.baseline_avg_vnd, 30);

  const filtered = await call('GET', `/api/revenues/lines?year=2026&am_user_id=${userId}`);
  assert.deepEqual(
    filtered.data.lines.map((l: { id: number }) => l.id),
    [created.data.id]
  );

  const badAm = await call('POST', '/api/revenues/lines', {
    customer_id: customerId,
    am_user_id: 99999,
  });
  assert.equal(badAm.status, 422);
  const noMonth = await call('POST', '/api/revenues/lines', {
    customer_id: customerId,
    revenue_anchor_mode: 'manual',
  });
  assert.equal(noMonth.status, 422);
});
