import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';

/*
 * KPI doanh thu theo AM qua API (v46): chi tieu tung AM x tung thang, ghi nhan
 * Moi / Mo rong / Mo rong tu Nen, Lost — va nhap chi tieu tu sheet KPI cua file mau.
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-revkpi-'));
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

function addUser(name: string): number {
  return Number(
    db
      .prepare(
        `INSERT INTO users (username, password_hash, password_salt, email, full_name) VALUES (?, 'x', 'x', ?, ?)`
      )
      .run(name.toLowerCase(), `${name.toLowerCase()}@congty.vn`, name).lastInsertRowid
  );
}
const lan = addUser('Lan');
const minh = addUser('Minh');

const customer = Number(
  db.prepare(`INSERT INTO customers (name, org_kind) VALUES ('Khách A', 'customer')`).run()
    .lastInsertRowid
);
function addLine(am: number, kind = 'new', mode = 'auto'): number {
  return Number(
    db
      .prepare(
        `INSERT INTO customer_services (customer_id, am_user_id, contract_kind, revenue_anchor_mode) VALUES (?, ?, ?, ?)`
      )
      .run(customer, am, kind, mode).lastInsertRowid
  );
}
function rev(line: number, period: string, amount: number, stage = 'paid'): void {
  db.prepare(
    `INSERT INTO service_revenues (line_id, period, amount_vnd, forecast_vnd, stage) VALUES (?, ?, ?, ?, ?)`
  ).run(line, period, amount, amount, stage);
}

const lan1 = addLine(lan);
rev(lan1, '2026-02', 30);
const lanBase = addLine(lan, 'new', 'base');
rev(lanBase, '2026-02', 26);
db.prepare(
  `INSERT INTO revenue_baselines (line_id, year, avg_monthly_vnd) VALUES (?, 2026, 20)`
).run(lanBase);
const minhBase = addLine(minh, 'new', 'base');
rev(minhBase, '2025-02', 55);
rev(minhBase, '2026-02', 50);
rev(minhBase, '2026-03', 40, 'forecast');

before(async () => {
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Khong khoi dong duoc test server');
  baseUrl = `http://127.0.0.1:${address.port}`;
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin-password-1' }),
  });
  cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
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

async function call(method: string, pathname: string, body?: unknown): Promise<Json> {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.ok(res.ok, `${method} ${pathname} -> ${res.status}`);
  return res.json();
}

test('chi tieu theo AM: tong khi khong loc, chi AM do khi loc', async () => {
  await call('PUT', '/api/revenues/kpi-targets', {
    am_user_id: lan,
    period: '2026-02',
    target_vnd: 60,
  });
  await call('PUT', '/api/revenues/kpi-targets', {
    am_user_id: minh,
    period: '2026-02',
    target_vnd: 40,
  });

  const all = await call('GET', '/api/revenues/kpi?year=2026');
  const feb = all.months.find((m: Json) => m.period === '2026-02');
  assert.equal(feb.target_vnd, 100);
  assert.equal(feb.new_vnd, 30);
  assert.equal(feb.base_growth_vnd, 6);
  assert.equal(feb.total_vnd, 36);
  assert.equal(feb.lost_vnd, 5);
  const mar = all.months.find((m: Json) => m.period === '2026-03');
  assert.equal(mar.pending_count, 1);
  assert.deepEqual(
    all.by_am.filter((a: Json) => a.am_user_id !== 1).map((a: Json) => a.am_name),
    ['Lan', 'Minh']
  );

  const onlyMinh = await call('GET', `/api/revenues/kpi?year=2026&am_user_id=${minh}`);
  const minhFeb = onlyMinh.months.find((m: Json) => m.period === '2026-02');
  assert.equal(minhFeb.target_vnd, 40);
  assert.equal(minhFeb.total_vnd, 0);
  assert.equal(minhFeb.lost_vnd, 5);

  await call('PUT', '/api/revenues/kpi-targets', {
    am_user_id: minh,
    period: '2026-02',
    target_vnd: null,
  });
  const after = await call('GET', `/api/revenues/kpi?year=2026&am_user_id=${minh}`);
  assert.equal(after.months.find((m: Json) => m.period === '2026-02').target_vnd, 0);
});

test('nhap chi tieu tu sheet KPI cua file mau', async () => {
  const res = await fetch(`${baseUrl}/api/revenues/import-template.xlsx?year=2026`, {
    headers: { cookie },
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await res.arrayBuffer());
  const ws = wb.getWorksheet('Chỉ tiêu KPI')!;
  let lanRow = 0;
  ws.eachRow((row, n) => {
    if (row.getCell(1).value === 'Lan') lanRow = n;
  });
  assert.ok(lanRow > 1);
  assert.equal(ws.getCell(lanRow, 3).value, 60);
  ws.getCell(lanRow, 4).value = 70; // Lan T3
  ws.getCell(lanRow, 3).value = 0; // xoa Lan T2
  ws.getRow(ws.rowCount + 1).values = ['', 5]; // thieu ten AM
  ws.getRow(ws.rowCount + 1).values = ['Không có người này', 5];

  const form = new FormData();
  form.append('file', new Blob([await wb.xlsx.writeBuffer()]), 'kpi.xlsx');
  const done = (await (
    await fetch(`${baseUrl}/api/revenues/import?commit=1`, {
      method: 'POST',
      headers: { cookie },
      body: form,
    })
  ).json()) as Json;
  assert.equal(done.kpi.cells, 2);
  assert.equal(done.kpi.errors.length, 2);
  const rows = db
    .prepare(
      `SELECT period, target_vnd FROM revenue_kpi_targets WHERE am_user_id = ${lan} ORDER BY period`
    )
    .all();
  assert.deepEqual(
    rows.map((r) => ({ ...(r as object) })),
    [{ period: '2026-03', target_vnd: 70 }]
  );
});
