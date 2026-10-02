import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CustomerAssistResult } from '../services/ai/companyLookup.ts';

/*
 * Goi y dien form khach hang tu MST / ten.
 * CSDL dang ky (VietQR) va nha cung cap AI deu gia lap bang fetch: dieu can kiem
 * la cach GHEP hai nguon — du lieu dang ky thang du lieu AI, MST do AI doan phai
 * doi chieu duoc moi giu, AI hong van tra duoc du lieu dang ky.
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-customer-assist-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';
process.env.WORKFLOW_SESSION_SECRET = 'test-secret-value-at-least-32-characters-long';
process.env.WORKFLOW_ADMIN_USER = 'admin';
process.env.WORKFLOW_ADMIN_PASSWORD = 'admin-password-1';
process.env.WORKFLOW_ADMIN_EMAIL = 'admin@congty.vn';
process.env.WORKFLOW_TAX_LOOKUP_URL = 'https://registry.test/v2/business';

const { createApp } = await import('../app.ts');
const { db, closeDatabase } = await import('../db/connection.ts');
const { ensureAdminUser } = await import('../services/auth/bootstrapAdmin.ts');
const { updateProviderConfig } = await import('../services/ai/configService.ts');
const { mergeSuggestion, namesLikelyMatch, normalizeWebsite } =
  await import('../services/ai/companyLookup.ts');
const { normalizeOrgName } = await import('@workflow/contracts');

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

const REGISTRY: Record<string, { name: string; shortName?: string; address?: string }> = {
  '0102030405': {
    name: 'CÔNG TY CỔ PHẦN SAO MAI',
    shortName: 'SAO MAI JSC',
    address: '1 Tràng Tiền, Hoàn Kiếm, Hà Nội',
  },
  '0309999999': { name: 'CÔNG TY TNHH KHÁC HẲN' },
};

function fakeWorld(options: { ai?: unknown; registryDown?: boolean }): typeof globalThis.fetch {
  return async (input, init) => {
    const url = String(input);
    if (url.startsWith(baseUrl)) return realFetch(input, init);
    if (url.startsWith('https://registry.test/')) {
      if (options.registryDown) throw new Error('ECONNREFUSED');
      const found = REGISTRY[url.split('/').pop()!];
      return Response.json(
        found
          ? { code: '00', data: { id: url.split('/').pop(), ...found } }
          : { code: '52', desc: 'Not found', data: null }
      );
    }
    if (options.ai === undefined) return new Response('down', { status: 500 });
    return Response.json({
      candidates: [{ content: { parts: [{ text: JSON.stringify(options.ai) }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
    });
  };
}

async function assist(query: string, webSearch = false) {
  const res = await realFetch(`${baseUrl}/api/ai/assist/customer`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ query, web_search: webSearch }),
  });
  return { status: res.status, data: (await res.json()) as CustomerAssistResult };
}

/* ---------- Ham thuan ---------- */

test('chuan hoa website va so ten', () => {
  assert.equal(normalizeWebsite('https://www.SaoMai.vn/gioi-thieu'), 'saomai.vn');
  assert.equal(normalizeWebsite('khong co'), null);
  const record = {
    tax_code: '1',
    name: 'CÔNG TY CỔ PHẦN SAO MAI',
    international_name: null,
    short_name: null,
    address: null,
  };
  assert.equal(namesLikelyMatch('Công ty CP Sao Mai', record), true);
  assert.equal(namesLikelyMatch('Sao Mai Software', record), false, 'khong nhan nham cong ty me');
});

test('du lieu dang ky de len du lieu AI', () => {
  const merged = mergeSuggestion(
    {
      name: 'Sao Mai',
      short_name: null,
      tax_code: null,
      industry: 'Phần mềm',
      address: 'Sai địa chỉ',
      website: 'saomai.vn',
      phone: 'không rõ',
      email: 'not-an-email',
      size: 'enterprise',
      notes: null,
      confidence: 0.7,
      rationale: null,
    },
    {
      tax_code: '0102030405',
      name: 'CÔNG TY CỔ PHẦN SAO MAI',
      international_name: null,
      short_name: null,
      address: 'Hà Nội',
    }
  );
  assert.equal(merged.suggestion.name, 'Công Ty Cổ Phần Sao Mai');
  assert.equal(merged.sources.name, 'registry');
  assert.equal(merged.suggestion.address, 'Hà Nội');
  assert.equal(merged.sources.industry, 'ai');
  assert.equal(merged.suggestion.size, 'Enterprise');
  assert.equal(merged.suggestion.email, undefined, 'email sai dinh dang bi bo');
});

test('chuan hoa ten to chuc: Viet Hoa Chu Dau, giu viet tat', () => {
  const cases: [string, string][] = [
    ['CÔNG TY CỔ PHẦN TẬP ĐOÀN GOLDEN GATE', 'Công Ty Cổ Phần Tập Đoàn Golden Gate'],
    [
      'NGÂN HÀNG THƯƠNG MẠI CỔ PHẦN ĐẦU TƯ VÀ PHÁT TRIỂN VIỆT NAM',
      'Ngân Hàng Thương Mại Cổ Phần Đầu Tư Và Phát Triển Việt Nam',
    ],
    ['CÔNG TY TNHH MTV DỊCH VỤ FPT', 'Công Ty TNHH MTV Dịch Vụ FPT'],
    ['CÔNG TY TNHH SÀI GÒN-HÀ NỘI (VIỆT NAM)', 'Công Ty TNHH Sài Gòn-Hà Nội (Việt Nam)'],
    ['CÔNG TY CP XÂY DỰNG SỐ II', 'Công Ty CP Xây Dựng Số II'],
    ['  công   ty cổ phần sao mai ', 'Công Ty Cổ Phần Sao Mai'],
    ['công ty tnhh mtv y tế', 'Công Ty TNHH MTV Y Tế'],
    // Ten da co chu thuong: chu nguoi dung go hoa duoc giu nguyen.
    ['Ngân hàng TMCP Ngoại thương (Vietcombank)', 'Ngân Hàng TMCP Ngoại Thương (Vietcombank)'],
    ['HUD Holdings', 'HUD Holdings'],
    ['eBay Việt Nam', 'eBay Việt Nam'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(normalizeOrgName(input), expected);
    assert.equal(normalizeOrgName(expected), expected, 'chuan hoa lan hai khong doi gi');
  }
});

/* ---------- Route ---------- */

test('luu khach hang: ten duoc chuan hoa khi tao va khi sua ten', async () => {
  const send = (method: string, url: string, body: unknown) =>
    realFetch(`${baseUrl}${url}`, {
      method,
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const created = (await (
    await send('POST', '/api/customers', { name: 'CÔNG TY TNHH ÁNH DƯƠNG' })
  ).json()) as { id: number; name: string };
  assert.equal(created.name, 'Công Ty TNHH Ánh Dương');
  const renamed = (await (
    await send('PATCH', `/api/customers/${created.id}`, { name: 'công ty tnhh ánh dương mới' })
  ).json()) as { name: string };
  assert.equal(renamed.name, 'Công Ty TNHH Ánh Dương Mới');
});

test('chua co AI: go MST van dien duoc tu CSDL dang ky', async () => {
  globalThis.fetch = fakeWorld({});
  const { status, data } = await assist('0102 030 405');
  assert.equal(status, 200);
  assert.equal(data.suggestion.name, 'Công Ty Cổ Phần Sao Mai');
  assert.equal(data.suggestion.tax_code, '0102030405');
  assert.equal(data.sources.address, 'registry');
  assert.ok(data.warnings.some((w) => /Chưa cấu hình AI/.test(w)));
  assert.equal(data.meta, null);
});

test('chua co AI va go ten: 409 ro rang', async () => {
  globalThis.fetch = fakeWorld({});
  const { status } = await assist('Sao Mai');
  assert.equal(status, 409);
});

test('co AI: MST + AI bo sung nganh nghe, quy mo', async () => {
  updateProviderConfig(db, 'gemini', {
    apiKey: 'k',
    enabled: true,
    defaultModel: 'gemini-x',
    fastModel: 'gemini-x',
  });
  db.prepare(`UPDATE ai_provider_configs SET status = 'ready' WHERE provider = 'gemini'`).run();
  globalThis.fetch = fakeWorld({
    ai: { name: 'Sao Mai', industry: 'Phân phối thiết bị', size: 'SME', website: 'saomai.vn' },
  });
  const { status, data } = await assist('0102030405');
  assert.equal(status, 200);
  assert.equal(data.suggestion.name, 'Công Ty Cổ Phần Sao Mai');
  assert.equal(data.suggestion.short_name, 'SAO MAI JSC');
  assert.equal(data.suggestion.industry, 'Phân phối thiết bị');
  assert.equal(data.sources.industry, 'ai');
  assert.equal(data.suggestion.website, 'saomai.vn');
});

test('go ten: MST AI doan khop CSDL thi giu, lech ten thi bo', async () => {
  globalThis.fetch = fakeWorld({ ai: { name: 'Công ty CP Sao Mai', tax_code: '0102030405' } });
  const ok = await assist('Sao Mai');
  assert.equal(ok.data.suggestion.tax_code, '0102030405');
  assert.equal(ok.data.sources.tax_code, 'registry');
  assert.equal(ok.data.suggestion.address, '1 Tràng Tiền, Hoàn Kiếm, Hà Nội');

  globalThis.fetch = fakeWorld({ ai: { name: 'Công ty CP Sao Mai', tax_code: '0309999999' } });
  const wrong = await assist('Sao Mai');
  assert.equal(wrong.data.suggestion.tax_code, undefined);
  assert.ok(wrong.data.warnings.some((w) => /KHÁC HẲN/.test(w)));

  globalThis.fetch = fakeWorld({ ai: { name: 'Công ty CP Sao Mai', tax_code: '0300000000' } });
  const missing = await assist('Sao Mai');
  assert.equal(missing.data.suggestion.tax_code, undefined);

  globalThis.fetch = fakeWorld({
    ai: { name: 'Công ty CP Sao Mai', tax_code: '0300000000' },
    registryDown: true,
  });
  const unverified = await assist('Sao Mai');
  assert.equal(unverified.data.suggestion.tax_code, '0300000000');
  assert.equal(unverified.data.sources.tax_code, 'ai');
  assert.ok(unverified.data.warnings.some((w) => /chưa được xác minh/.test(w)));
});

test('tim web: gui google_search, tra nguon; bi tu choi thi lui ve khong tim', async () => {
  const sent: Record<string, unknown>[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(baseUrl)) return realFetch(input, init);
    if (url.startsWith('https://registry.test/')) return Response.json({ code: '52', data: null });
    sent.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
    return Response.json({
      candidates: [
        {
          content: {
            parts: [{ text: 'Kết quả:\n```json\n{"name":"Sao Mai","phone":"024 1234 5678"}\n```' }],
          },
          groundingMetadata: {
            webSearchQueries: ['Sao Mai'],
            groundingChunks: [{ web: { uri: 'https://saomai.vn', title: 'Sao Mai' } }],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
    });
  };
  const { status, data } = await assist('Sao Mai', true);
  assert.equal(status, 200);
  assert.ok(sent[0].tools, 'co bat cong cu tim web');
  assert.equal(data.web_searched, true);
  assert.deepEqual(data.web_sources, [{ url: 'https://saomai.vn', title: 'Sao Mai' }]);
  assert.equal(data.suggestion.phone, '024 1234 5678');

  // Nha cung cap tu choi cong cu (400) -> thu lai khong tim web, kem canh bao.
  sent.length = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(baseUrl)) return realFetch(input, init);
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    sent.push(body);
    if (body.tools) return Response.json({ error: { message: 'tools off' } }, { status: 400 });
    return Response.json({
      candidates: [{ content: { parts: [{ text: '{"name":"Sao Mai"}' }] } }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    });
  };
  const fallback = await assist('Sao Mai', true);
  assert.equal(fallback.status, 200);
  assert.equal(fallback.data.web_searched, false);
  assert.ok(fallback.data.warnings.some((w) => /Không tìm được trên web/.test(w)));
});

test('9Router: chon model tim kiem trong Cai dat thi tra cuu co nguon web', async () => {
  db.prepare(`UPDATE ai_provider_configs SET enabled = 0 WHERE provider = 'gemini'`).run();
  updateProviderConfig(db, '9router', {
    apiKey: 'k',
    enabled: true,
    defaultModel: 'gc/gemini-2.5-flash',
    fastModel: 'gc/gemini-2.5-flash',
  });
  db.prepare(`UPDATE ai_provider_configs SET status = 'ready' WHERE provider = '9router'`).run();

  const queries: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(baseUrl)) return realFetch(input, init);
    if (url.startsWith('https://registry.test/')) return Response.json({ code: '52', data: null });
    if (url.endsWith('/models/web')) {
      return Response.json({ data: [{ id: 'tavily/search' }, { id: 'jina-reader/fetch' }] });
    }
    if (url.endsWith('/search')) {
      queries.push(String((JSON.parse(String(init?.body)) as { query: string }).query));
      return Response.json({
        results: [{ title: 'Sao Mai', url: 'https://saomai.vn', snippet: 'Phân phối' }],
      });
    }
    return Response.json({
      choices: [{ message: { content: '{"name":"Sao Mai","industry":"Phân phối"}' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
  };
  const call = (method: string, url: string, body?: unknown) =>
    realFetch(`${baseUrl}${url}`, {
      method,
      headers: { cookie, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  // Chua chon model: van tra loi, canh bao ro ly do.
  const before = await assist('Sao Mai', true);
  assert.equal(before.data.web_searched, false);
  assert.ok(before.data.warnings.some((w) => /chưa chọn model tìm kiếm/.test(w)));

  assert.deepEqual(await (await call('GET', '/api/ai/web-search-models')).json(), [
    'tavily/search',
  ]);
  await call('PUT', '/api/ai/web-search-model', { model: 'tavily/search' });
  assert.deepEqual(await (await call('GET', '/api/ai/web-search-model')).json(), {
    model: 'tavily/search',
  });

  const after = await assist('Sao Mai', true);
  assert.equal(after.status, 200);
  assert.equal(after.data.web_searched, true);
  assert.deepEqual(after.data.web_sources, [{ url: 'https://saomai.vn', title: 'Sao Mai' }]);
  assert.ok(queries.some((q) => /mã số thuế/.test(q)));
  assert.equal(after.data.suggestion.industry, 'Phân phối');
});
