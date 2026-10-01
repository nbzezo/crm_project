import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';

/*
 * Nhap doanh thu tu Excel qua API: tai file mau -> dien -> xem truoc -> ghi.
 * File mau la nguon duy nhat nguoi dung cam vao, nen test di dung vong do.
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-revimport-'));
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

db.prepare(
  `INSERT INTO users (username, password_hash, password_salt, email, full_name) VALUES ('minh', 'x', 'x', 'minh@congty.vn', 'Nguyễn Minh')`
).run();
const alpha = Number(
  db.prepare(`INSERT INTO customers (name, org_kind) VALUES ('Công ty Alpha', 'customer')`).run()
    .lastInsertRowid
);
db.prepare(`INSERT INTO customers (name, org_kind) VALUES ('Beta', 'customer')`).run();
const cx = Number(
  db.prepare(`INSERT INTO services (name) VALUES ('Tổng đài CX')`).run().lastInsertRowid
);
db.prepare(`INSERT INTO services (name) VALUES ('SMS')`).run();
const existing = Number(
  db
    .prepare(`INSERT INTO customer_services (customer_id, service_id, am) VALUES (?, ?, 'Lan')`)
    .run(alpha, cx).lastInsertRowid
);
db.prepare(
  `INSERT INTO service_revenues (line_id, period, amount_vnd, forecast_vnd, stage) VALUES (?, '2026-01', 100, 100, 'paid')`
).run(existing);

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
  assert.equal(res.status, 200);
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

async function downloadTemplate(): Promise<ExcelJS.Workbook> {
  const res = await fetch(`${baseUrl}/api/revenues/import-template.xlsx?year=2026`, {
    headers: { cookie },
  });
  assert.equal(res.status, 200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await res.arrayBuffer());
  return wb;
}

/* Test doc sau vao JSON tra ve — khai bao kieu day du cho tung endpoint khong dang. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

async function upload(
  wb: ExcelJS.Workbook,
  commit: boolean
): Promise<{ status: number; data: Json }> {
  const form = new FormData();
  const buffer = await wb.xlsx.writeBuffer();
  form.append('file', new Blob([buffer]), 'doanh-thu.xlsx');
  const res = await fetch(`${baseUrl}/api/revenues/import${commit ? '?commit=1' : ''}`, {
    method: 'POST',
    headers: { cookie },
    body: form,
  });
  return { status: res.status, data: await res.json() };
}

test('file mau dien san dong dang co, kem ma dong va so tien thang', async () => {
  const wb = await downloadTemplate();
  const ws = wb.getWorksheet('Doanh thu')!;
  assert.equal(ws.getCell('A1').value, 'Mã dòng');
  assert.equal(ws.getCell('A2').value, existing);
  assert.equal(ws.getCell('B2').value, 'Công ty Alpha');
  assert.equal(ws.getCell('M2').value, 100);
});

test('xem truoc khong ghi gi; ghi thi bo qua dong loi, ghi dong hop le', async () => {
  const wb = await downloadTemplate();
  const ws = wb.getWorksheet('Doanh thu')!;
  // Sua dong dang co: T2, TB nam truoc, moc.
  ws.getCell('N2').value = 200;
  ws.getCell('K2').value = 90;
  ws.getCell('J2').value = 'Toàn bộ là Nền';
  ws.getCell('L2').value = 'Dự kiến';
  // Dong moi hop le.
  ws.getRow(3).values = [
    '',
    'Beta',
    'SMS',
    'Minh',
    'Mở rộng',
    '',
    '',
    '',
    '',
    '',
    '',
    'Dự kiến',
    50,
    60,
  ];
  // Dong loi: khach hang khong co.
  ws.getRow(4).values = ['', 'Không có thật', '', '', '', '', '', '', '', '', '', '', 10];

  const preview = await upload(wb, false);
  assert.equal(preview.status, 200);
  assert.equal(preview.data.committed, false);
  assert.deepEqual(
    { ...preview.data.summary, amount_vnd: undefined },
    { total: 3, create: 1, update: 1, error: 1, cells: 3, amount_vnd: undefined }
  );
  assert.match(preview.data.rows[2].errors[0], /Không tìm thấy khách hàng/);
  const count = () =>
    (db.prepare('SELECT COUNT(*) AS n FROM customer_services').get() as { n: number }).n;
  assert.equal(count(), 1);

  const done = await upload(wb, true);
  assert.equal(done.data.committed, true);
  assert.equal(count(), 2);
  const cell = db
    .prepare(
      `SELECT amount_vnd, stage FROM service_revenues WHERE line_id = ? AND period = '2026-02'`
    )
    .get(existing) as { amount_vnd: number; stage: string };
  assert.deepEqual({ ...cell }, { amount_vnd: 200, stage: 'forecast' });
  // T1 dien san trong file mau, khong doi so tien -> giu nguyen trang thai cu.
  const jan = db
    .prepare(`SELECT stage FROM service_revenues WHERE line_id = ? AND period = '2026-01'`)
    .get(existing) as { stage: string };
  assert.equal(jan.stage, 'paid');
  const line = db
    .prepare(`SELECT revenue_anchor_mode FROM customer_services WHERE id = ?`)
    .get(existing) as { revenue_anchor_mode: string };
  assert.equal(line.revenue_anchor_mode, 'base');
  const baseline = db
    .prepare(`SELECT avg_monthly_vnd FROM revenue_baselines WHERE line_id = ? AND year = 2026`)
    .get(existing) as { avg_monthly_vnd: number };
  assert.equal(baseline.avg_monthly_vnd, 90);
  const created = db
    .prepare(
      `SELECT cs.contract_kind, cs.am FROM customer_services cs JOIN customers c ON c.id = cs.customer_id WHERE c.name = 'Beta'`
    )
    .get() as { contract_kind: string; am: string };
  assert.deepEqual({ ...created }, { contract_kind: 'expansion', am: 'Nguyễn Minh' });

  // Nhap lai cung file: dong Beta da co nen thanh cap nhat, khong tao trung.
  const again = await upload(wb, false);
  assert.equal(again.data.summary.create, 0);
  assert.equal(again.data.summary.update, 2);
});

test('tu choi file khong phai .xlsx', async () => {
  const form = new FormData();
  form.append('file', new Blob(['a,b']), 'data.csv');
  const res = await fetch(`${baseUrl}/api/revenues/import`, {
    method: 'POST',
    headers: { cookie },
    body: form,
  });
  assert.equal(res.status, 422);
});
