import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { ContractExtraction } from '../services/ai/contractExtract.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * Tai tep hop dong len -> AI tu dien form -> luu kem tep + khach hang moi.
 * Nha cung cap AI duoc gia lap bang fetch: dieu can kiem la phan CUA MINH
 * (chuan hoa gia tri, khop khach hang, tao khach hang, dinh kem tep), khong phai
 * chat luong cua mot mo hinh that.
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-contract-upload-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';
process.env.WORKFLOW_SESSION_SECRET = 'test-secret-value-at-least-32-characters-long';
process.env.WORKFLOW_ADMIN_USER = 'admin';
process.env.WORKFLOW_ADMIN_PASSWORD = 'admin-password-1';
process.env.WORKFLOW_ADMIN_EMAIL = 'admin@congty.vn';

const { createApp } = await import('../app.ts');
const { db, closeDatabase } = await import('../db/connection.ts');
const { ensureAdminUser } = await import('../services/auth/bootstrapAdmin.ts');
const { updateProviderConfig } = await import('../services/ai/configService.ts');
const { normalizeDate, normalizeMoney, normalizeTaxCode, addMonthsMinusOneDay, matchCustomer } =
  await import('../services/ai/contractExtract.ts');

await ensureAdminUser();

let server: Server;
let baseUrl = '';
let cookie = '';
const realFetch = globalThis.fetch;

before(async () => {
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Khong khoi dong duoc test server');
  baseUrl = `http://127.0.0.1:${address.port}`;
  const res = await realFetch(`${baseUrl}/api/auth/login`, {
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
  globalThis.fetch = realFetch;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  closeDatabase();
  if (fixtureRoot.startsWith(os.tmpdir())) fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

/* ---------- Ham thuan ---------- */

test('chuan hoa ngay, tien, MST', () => {
  assert.equal(normalizeDate('15/03/2025'), '2025-03-15');
  assert.equal(normalizeDate('2025-3-5'), '2025-03-05');
  assert.equal(normalizeDate('31/02/2025'), null, 'ngay khong ton tai');
  assert.equal(normalizeDate('mot ngay nao do'), null);
  assert.equal(normalizeMoney('1.500.000.000 đồng'), 1_500_000_000);
  assert.equal(normalizeMoney(2_000_000.4), 2_000_000);
  assert.equal(normalizeMoney(null), 0);
  assert.equal(normalizeTaxCode('0 1 0 2.030.405'), '0102030405');
  assert.equal(normalizeTaxCode('0102030405-001'), '0102030405-001');
  assert.equal(normalizeTaxCode('123'), null);
});

test('thoi han tinh tu ngay bat dau', () => {
  assert.equal(addMonthsMinusOneDay('2025-03-01', 12), '2026-02-28');
  assert.equal(addMonthsMinusOneDay('2025-01-31', 1), '2025-02-27');
  assert.equal(addMonthsMinusOneDay('2025-03-01', 0), null);
});

test('khop khach hang: MST va ten trung han thi tu nhan, gan giong chi la ung vien', () => {
  const rows = [
    { id: 1, name: 'Công ty TNHH Vina Tech', tax_code: '0102030405' },
    { id: 2, name: 'Vina Tech Holdings', tax_code: null },
    { id: 3, name: 'Công ty Cổ phần An Phát', tax_code: null },
  ];
  assert.equal(matchCustomer(rows, 'Tên khác hẳn', '0102030405').customer_match?.id, 1);
  const byName = matchCustomer(rows, 'CÔNG TY CỔ PHẦN AN PHÁT', null);
  assert.equal(byName.customer_match?.id, 3);
  assert.equal(byName.customer_match?.reason, 'name');
  const fuzzy = matchCustomer(rows, 'Vina', null);
  assert.equal(fuzzy.customer_match, null, 'chi gan giong thi khong tu gan');
  assert.deepEqual(fuzzy.customer_candidates.map((c) => c.id).sort(), [1, 2]);
});

/* ---------- Route ---------- */

function aiAnswer(payload: unknown): typeof globalThis.fetch {
  return async (input, init) => {
    if (String(input).startsWith(baseUrl)) return realFetch(input, init);
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };
}

function multipart(file: { name: string; body: string }, fields: Record<string, string> = {}) {
  const form = new FormData();
  form.append('file', new Blob([file.body], { type: 'text/plain' }), file.name);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return form;
}

async function post(url: string, form: FormData) {
  const res = await realFetch(`${baseUrl}${url}`, {
    method: 'POST',
    headers: { cookie },
    body: form,
  });
  return {
    status: res.status,
    data: (await res.json()) as ContractExtraction & Record<string, unknown>,
  };
}

const CONTRACT_TEXT = 'HỢP ĐỒNG DỊCH VỤ. '.repeat(30);

test('chua co AI thi bao khong kha dung va /extract tra 409, nhap tay van luu duoc', async () => {
  const status = await realFetch(`${baseUrl}/api/contracts/ai-status`, { headers: { cookie } });
  assert.deepEqual(await status.json(), { available: false });

  const extract = await post(
    '/api/contracts/extract',
    multipart({ name: 'hd.txt', body: CONTRACT_TEXT })
  );
  assert.equal(extract.status, 409);

  const customerId = Number(
    db
      .prepare(
        `INSERT INTO customers (name, org_kind, status) VALUES ('KH Tay', 'customer', 'customer')`
      )
      .run().lastInsertRowid
  );
  const saved = await post(
    '/api/contracts/from-file',
    multipart(
      { name: 'hd-tay.txt', body: CONTRACT_TEXT },
      { payload: JSON.stringify({ contract: { name: 'HĐ nhập tay', customer_id: customerId } }) }
    )
  );
  assert.equal(saved.status, 201);
  assert.equal(saved.data.customer_created, false);
  assert.equal(saved.data.document_error, null);
  assert.equal(saved.data.document_count, 1, 'tep duoc dinh kem vao hop dong');
});

test('AI doc hop dong: khach hang co san duoc khop, so lieu duoc chuan hoa', async () => {
  updateProviderConfig(db, 'gemini', {
    apiKey: 'k',
    enabled: true,
    defaultModel: 'gemini-x',
    fastModel: 'gemini-x',
  });
  db.prepare(`UPDATE ai_provider_configs SET status = 'ready' WHERE provider = 'gemini'`).run();
  db.prepare(`INSERT INTO customers (name, org_kind) VALUES ('Công ty chúng tôi', 'own')`).run();
  const known = Number(
    db
      .prepare(
        `INSERT INTO customers (name, tax_code, org_kind, status) VALUES ('Công ty TNHH Sao Mai', '0312345678', 'customer', 'customer')`
      )
      .run().lastInsertRowid
  );
  const dealId = Number(
    db
      .prepare(
        `INSERT INTO deals (customer_id, title, stage, position, value_vnd) VALUES (?, 'Triển khai CRM', 'negotiating', 1, 500000000)`
      )
      .run(known).lastInsertRowid
  );

  globalThis.fetch = aiAnswer({
    contract: {
      name: 'Hợp đồng triển khai CRM',
      number: 'HD-01/2025',
      value: '500.000.000 đồng',
      currency: 'VND',
      sign_date: '15/03/2025',
      start_date: '2025-04-01',
      end_date: null,
      duration_months: 12,
      payment_terms: '50% tạm ứng',
      is_signed: true,
    },
    customer: {
      name: 'CTY TNHH SAO MAI',
      tax_code: '0312 345 678',
      representative: 'Nguyễn Văn A',
    },
    summary: 'Triển khai CRM',
    key_points: ['Bảo hành 12 tháng'],
    risks: [],
    confidence: 0.9,
  });
  const res = await post(
    '/api/contracts/extract',
    multipart({ name: 'hd.txt', body: CONTRACT_TEXT })
  );
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.contract.value_vnd, 500_000_000);
  assert.equal(res.data.contract.sign_date, '2025-03-15');
  assert.equal(res.data.contract.end_date, '2026-03-31', 'tinh tu thoi han 12 thang');
  assert.equal(res.data.customer_match?.id, known);
  assert.equal(res.data.customer_match?.reason, 'tax_code');
  assert.equal(res.data.suggested_deal_id, dealId);
  assert.equal(res.data.contract.status, 'expired', 'het han truoc hom nay');
  assert.ok(res.data.warnings.some((w: string) => /thời hạn 12 tháng/.test(w)));
});

test('loi nha cung cap AI tra ve mo ta cu the, khong phai 502 tro tron', async () => {
  const failWith =
    (status: number, message: string): typeof globalThis.fetch =>
    async (input, init) => {
      if (String(input).startsWith(baseUrl)) return realFetch(input, init);
      return new Response(JSON.stringify({ error: { message } }), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    };
  const cases: [number, RegExp][] = [
    [429, /giới hạn tốc độ.*HTTP 429.*het quota/],
    [401, /HTTP 401.*API key sai/],
    [404, /Model AI không tồn tại.*HTTP 404/],
    [503, /lỗi tạm thời.*HTTP 503/],
  ];
  for (const [status, pattern] of cases) {
    globalThis.fetch = failWith(status, 'het quota');
    const res = await post(
      '/api/contracts/extract',
      multipart({ name: 'hd.txt', body: CONTRACT_TEXT })
    );
    assert.equal(res.status, 424, `HTTP ${status} cua nha cung cap`);
    assert.match(String(res.data.error), pattern);
  }
  globalThis.fetch = realFetch;
});

test('khach hang chua co: tao moi cung hop dong, tep va nguoi dai dien', async () => {
  globalThis.fetch = realFetch;
  const saved = await post(
    '/api/contracts/from-file',
    multipart(
      { name: 'hd-moi.txt', body: CONTRACT_TEXT },
      {
        payload: JSON.stringify({
          contract: { name: 'HĐ khách mới', value_vnd: 1000, end_date: '2030-01-01' },
          new_customer: { name: 'Công ty Mới Hoàn Toàn', tax_code: '0999888777' },
          new_contact: { full_name: 'Trần B', title: 'Giám đốc' },
        }),
      }
    )
  );
  assert.equal(saved.status, 201, JSON.stringify(saved.data));
  assert.equal(saved.data.customer_created, true);
  const customer = db
    .prepare(`SELECT * FROM customers WHERE id = ?`)
    .get(saved.data.customer_id) as { name: string; status: string; org_kind: string };
  assert.equal(customer.name, 'Công ty Mới Hoàn Toàn');
  assert.equal(customer.org_kind, 'customer');
  const contact = db
    .prepare(`SELECT full_name, is_primary FROM contacts WHERE customer_id = ?`)
    .get(saved.data.customer_id) as { full_name: string; is_primary: number };
  assert.equal(contact.full_name, 'Trần B');
  assert.equal(contact.is_primary, 1);
  assert.equal(saved.data.document_count, 1);
});

test('hop dong loi thi khach hang moi khong bi tao treo', async () => {
  const before = (db.prepare(`SELECT COUNT(*) AS n FROM customers`).get() as { n: number }).n;
  const bad = await post(
    '/api/contracts/from-file',
    multipart(
      { name: 'x.txt', body: 'x' },
      {
        payload: JSON.stringify({
          contract: { name: 'HĐ sai ngày', start_date: '2030-01-01', end_date: '2020-01-01' },
          new_customer: { name: 'Khách không được tạo' },
        }),
      }
    )
  );
  assert.equal(bad.status, 422);
  assert.equal(
    (db.prepare(`SELECT COUNT(*) AS n FROM customers`).get() as { n: number }).n,
    before
  );
});

test('khach hang moi trung MST bi tu choi (409)', async () => {
  const dup = await post(
    '/api/contracts/from-file',
    multipart(
      { name: 'x.txt', body: 'x' },
      {
        payload: JSON.stringify({
          contract: { name: 'HĐ trùng MST' },
          new_customer: { name: 'Khác tên', tax_code: '0312345678' },
        }),
      }
    )
  );
  assert.equal(dup.status, 409);
  assert.equal(dup.data.code, 'DUPLICATE_TAX_CODE');
});
