import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-api-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';

const { createApp } = await import('../app.ts');
const { db, closeDatabase, FILES_DIR } = await import('../db/connection.ts');

let server: Server;
let baseUrl = '';

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

async function json(
  method: string,
  pathname: string,
  body?: unknown
): Promise<{ status: number; data: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    data: (await response.json()) as Record<string, unknown>,
  };
}

async function createCustomer(name: string): Promise<number> {
  const response = await json('POST', '/api/customers', { name });
  assert.equal(response.status, 201);
  return Number(response.data.id);
}

test('health check kiem tra ca ung dung va database', async () => {
  const response = await json('GET', '/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(response.data, { ok: true, app: 'WorkFlow', database: 'ready' });

  const missing = await json('GET', '/api/khong-ton-tai');
  assert.equal(missing.status, 404);
});

test('API chan lien ket contact/deal/contract khac khach hang', async () => {
  const customerA = await createCustomer('Khach hang A');
  const customerB = await createCustomer('Khach hang B');
  const contactInfo = db
    .prepare(`INSERT INTO contacts (customer_id, full_name) VALUES (?, ?)`)
    .run(customerB, 'Lien he B');
  const contactB = Number(contactInfo.lastInsertRowid);

  const invalidDeal = await json('POST', '/api/deals', {
    customer_id: customerA,
    contact_id: contactB,
    title: 'Co hoi sai lien ket',
  });
  assert.equal(invalidDeal.status, 422);
  assert.equal(invalidDeal.data.code, 'CROSS_CUSTOMER_LINK');

  const deal = await json('POST', '/api/deals', {
    customer_id: customerA,
    title: 'Co hoi hop le',
  });
  assert.equal(deal.status, 201);

  const invalidContract = await json('POST', '/api/contracts', {
    customer_id: customerB,
    deal_id: Number(deal.data.id),
    name: 'Hop dong sai lien ket',
  });
  assert.equal(invalidContract.status, 422);

  const invalidBoard = await json('POST', '/api/boards', {
    name: 'Bang sai lien ket',
    customer_id: 999_999,
  });
  assert.equal(invalidBoard.status, 404);

  const invalidField = await json('POST', '/api/card-fields', {
    name: 'Truong sai lien ket',
    board_id: 999_999,
  });
  assert.equal(invalidField.status, 404);
});

test('reorder chi chap nhan hang xom trong dung scope va rollback khi loi', async () => {
  const boardResponse = await json('POST', '/api/boards', { name: 'Bang integration' });
  assert.equal(boardResponse.status, 201);
  const boardId = Number(boardResponse.data.id);
  const full = await json('GET', `/api/boards/${boardId}/full`);
  const lists = full.data.lists as { id: number }[];
  assert.ok(lists.length >= 2);

  const cardA = await json('POST', '/api/cards', { list_id: lists[0].id, title: 'The A' });
  const cardB = await json('POST', '/api/cards', { list_id: lists[1].id, title: 'The B' });
  const cardAId = Number(cardA.data.id);
  const cardBId = Number(cardB.data.id);

  const invalidMove = await json('PATCH', `/api/cards/${cardAId}/move`, {
    list_id: lists[0].id,
    beforeId: cardBId,
    afterId: null,
  });
  assert.equal(invalidMove.status, 422);
  const afterInvalid = db.prepare(`SELECT list_id FROM cards WHERE id = ?`).get(cardAId) as {
    list_id: number;
  };
  assert.equal(afterInvalid.list_id, lists[0].id);

  const selfNeighbor = await json('PATCH', `/api/cards/${cardAId}/move`, {
    list_id: lists[0].id,
    beforeId: cardAId,
    afterId: null,
  });
  assert.equal(selfNeighbor.status, 422);

  const validMove = await json('PATCH', `/api/cards/${cardAId}/move`, {
    list_id: lists[1].id,
    beforeId: cardBId,
    afterId: null,
  });
  assert.equal(validMove.status, 200);
  assert.equal(validMove.data.list_id, lists[1].id);
});

test('tao cong viec tu mot khoa CRM tu suy ra cac lien ket cap tren', async () => {
  const customerId = await createCustomer('Khach hang suy dien');
  const contactId = Number(
    db
      .prepare(`INSERT INTO contacts (customer_id, full_name) VALUES (?, ?)`)
      .run(customerId, 'Nguoi lien he chinh').lastInsertRowid
  );
  const deal = await json('POST', '/api/deals', {
    customer_id: customerId,
    contact_id: contactId,
    title: 'Co hoi suy dien',
  });
  assert.equal(deal.status, 201);
  const dealId = Number(deal.data.id);
  const contract = await json('POST', '/api/contracts', {
    customer_id: customerId,
    deal_id: dealId,
    name: 'Hop dong suy dien',
  });
  assert.equal(contract.status, 201);
  const contractId = Number(contract.data.id);

  // Chi biet co hoi -> phai tu ra khach hang va nguoi lien he cua co hoi do.
  const fromDeal = await json('POST', '/api/cards', {
    title: 'Goi lai khach hang',
    deal_id: dealId,
    description: 'Chi tiet cuoc goi',
  });
  assert.equal(fromDeal.status, 201);
  assert.equal(fromDeal.data.customer_id, customerId);
  assert.equal(fromDeal.data.contact_id, contactId);
  assert.equal(fromDeal.data.contact_name, 'Nguoi lien he chinh');
  // Truoc day description bi rot mat o POST va search_text chi index title.
  assert.equal(fromDeal.data.description, 'Chi tiet cuoc goi');
  const indexed = db
    .prepare(`SELECT search_text FROM cards WHERE id = ?`)
    .get(Number(fromDeal.data.id)) as { search_text: string };
  assert.match(indexed.search_text, /chi tiet cuoc goi/);

  // Chi biet hop dong -> ra ca co hoi lan khach hang.
  const fromContract = await json('POST', '/api/cards', {
    title: 'Gui ban ky',
    contract_id: contractId,
  });
  assert.equal(fromContract.status, 201);
  assert.equal(fromContract.data.deal_id, dealId);
  assert.equal(fromContract.data.customer_id, customerId);
  // Suy dien di het chuoi: hop dong -> co hoi -> nguoi lien he cua co hoi.
  assert.equal(fromContract.data.contact_id, contactId);

  // Cong viec phai hien ra o ho so nguoi lien he va o chi tiet hop dong.
  const contactFull = await json('GET', `/api/contacts/${contactId}/full`);
  assert.equal(contactFull.status, 200);
  assert.equal((contactFull.data.tasks as unknown[]).length, 2);
  const contractDetail = await json('GET', `/api/contracts/${contractId}`);
  assert.equal((contractDetail.data.tasks as unknown[]).length, 1);

  // Ngu canh mo form: mot lan goi ra du lien ket + ung vien cua dung khach hang.
  const context = await json('GET', `/api/cards/context?contract_id=${contractId}`);
  assert.equal(context.status, 200);
  assert.deepEqual(context.data.links, {
    customer_id: customerId,
    contact_id: contactId,
    deal_id: dealId,
    contract_id: contractId,
    quotation_id: null,
  });
  assert.equal(
    (context.data.display as Record<string, unknown>).customer_name,
    'Khach hang suy dien'
  );
  assert.equal((context.data.deals as unknown[]).length, 1);
  assert.ok(context.data.suggested_list_id);
});

test('cong viec chan lien ket cheo khach hang va go lien ket cap duoi khi doi khach hang', async () => {
  const customerA = await createCustomer('Cong viec khach A');
  const customerB = await createCustomer('Cong viec khach B');
  const dealB = await json('POST', '/api/deals', { customer_id: customerB, title: 'Co hoi cua B' });
  assert.equal(dealB.status, 201);

  const crossed = await json('POST', '/api/cards', {
    title: 'Cong viec sai lien ket',
    customer_id: customerA,
    deal_id: Number(dealB.data.id),
  });
  assert.equal(crossed.status, 422);
  assert.equal(crossed.data.code, 'CROSS_CUSTOMER_LINK');

  const card = await json('POST', '/api/cards', {
    title: 'Cong viec cua B',
    deal_id: Number(dealB.data.id),
  });
  assert.equal(card.status, 201);
  assert.equal(card.data.customer_id, customerB);

  // Doi khach hang thi co hoi cu thuoc khach cu phai bi go, khong duoc giu lai.
  const moved = await json('PATCH', `/api/cards/${Number(card.data.id)}`, {
    customer_id: customerA,
  });
  assert.equal(moved.status, 200);
  assert.equal(moved.data.customer_id, customerA);
  assert.equal(moved.data.deal_id, null);
  assert.equal(moved.data.contact_id, null);
});

test('stage gate rollback khi bi chan va ghi history khi override', async () => {
  const customerId = await createCustomer('Khach hang stage gate');
  const created = await json('POST', '/api/deals', {
    customer_id: customerId,
    title: 'Co hoi stage gate',
  });
  assert.equal(created.status, 201);
  const dealId = Number(created.data.id);

  const blocked = await json('PATCH', `/api/deals/${dealId}/move`, {
    stage: 'quoted',
    beforeId: null,
    afterId: null,
  });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.code, 'STAGE_GATE_BLOCKED');
  const afterBlocked = db.prepare(`SELECT stage FROM deals WHERE id = ?`).get(dealId) as {
    stage: string;
  };
  assert.equal(afterBlocked.stage, 'lead');

  const overridden = await json(
    'PATCH',
    `/api/deals/${dealId}/move?override=1&reason=Chap%20nhan%20cho%20kiem%20thu`,
    { stage: 'quoted', beforeId: null, afterId: null }
  );
  assert.equal(overridden.status, 200);
  assert.equal(overridden.data.stage, 'quoted');
  assert.equal(overridden.data.probability, 60);
  const history = db
    .prepare(
      `SELECT reason FROM deal_score_history
        WHERE deal_id = ? AND factor = 'stage_gate_override'`
    )
    .all(dealId) as { reason: string }[];
  assert.equal(history.length, 1);
  assert.match(history[0].reason, /lead -> quoted/);
});

test('upload sai metadata khong de lai file mo coi', async () => {
  const customerA = await createCustomer('Tai lieu A');
  const customerB = await createCustomer('Tai lieu B');
  const contactInfo = db
    .prepare(`INSERT INTO contacts (customer_id, full_name) VALUES (?, ?)`)
    .run(customerB, 'Lien he tai lieu B');

  const form = new FormData();
  form.set('file', new Blob(['noi dung test'], { type: 'text/plain' }), 'kiem-thu.txt');
  form.set('customer_id', String(customerA));
  form.set('contact_id', String(contactInfo.lastInsertRowid));
  const response = await fetch(`${baseUrl}/api/documents`, { method: 'POST', body: form });
  assert.equal(response.status, 422);
  assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM documents`).get() as { n: number }).n, 0);

  const storedFiles = fs
    .readdirSync(FILES_DIR, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile());
  assert.equal(storedFiles.length, 0);
});

test('tai lieu ho tro metadata, cap nhat hang loat, ZIP va thung rac', async () => {
  const customerId = await createCustomer('Khach hang tai lieu v12');
  const ids: number[] = [];

  for (const [index, name] of ['ho-so-a.txt', 'ho-so-b.txt'].entries()) {
    const form = new FormData();
    form.set('file', new Blob([`noi dung ${index}`], { type: 'text/plain' }), name);
    form.set('customer_id', String(customerId));
    form.set('doc_type', 'proposal');
    form.set('description', 'Ho so kiem thu tich hop');
    form.set('tags', 'kiem thu, ho so');
    form.set('owner', 'Nguyen Van A');
    form.set('effective_date', '2026-08-12');
    form.set('expires_at', '2027-08-12');
    form.set('confidentiality', 'confidential');
    const response = await fetch(`${baseUrl}/api/documents`, { method: 'POST', body: form });
    assert.equal(response.status, 201);
    const document = (await response.json()) as Record<string, unknown>;
    assert.equal(document.description, 'Ho so kiem thu tich hop');
    assert.equal(document.confidentiality, 'confidential');
    ids.push(Number(document.id));
  }

  const search = await json('GET', '/api/search?q=ho%20so');
  assert.equal(search.status, 200);
  assert.equal((search.data.documents as unknown[]).length, 2);

  const bulk = await json('PATCH', '/api/documents/bulk', {
    ids,
    doc_type: 'contract',
    owner: 'Tran Thi B',
  });
  assert.equal(bulk.status, 200);
  assert.equal(bulk.data.updated, 2);

  const zip = await fetch(`${baseUrl}/api/documents/download.zip?ids=${ids.join(',')}`);
  assert.equal(zip.status, 200);
  assert.match(zip.headers.get('content-type') ?? '', /application\/zip/);
  const zipBytes = Buffer.from(await zip.arrayBuffer());
  assert.equal(zipBytes.readUInt32LE(0), 0x04034b50);

  const trashed = await json('POST', '/api/documents/bulk/trash', { ids });
  assert.equal(trashed.status, 200);
  assert.equal(trashed.data.trashed, 2);
  const activeList = await json('GET', `/api/documents?customer_id=${customerId}`);
  assert.deepEqual(activeList.data, []);
  const trashList = await json('GET', `/api/documents?customer_id=${customerId}&trash=1`);
  assert.equal((trashList.data as unknown as unknown[]).length, 2);

  const restored = await json('POST', '/api/documents/bulk/restore', { ids });
  assert.equal(restored.status, 200);
  assert.equal(restored.data.restored, 2);

  await json('POST', '/api/documents/bulk/trash', { ids: [ids[0]] });
  const permanent = await json('DELETE', `/api/documents/${ids[0]}/permanent`);
  assert.equal(permanent.status, 200);
  assert.equal(db.prepare(`SELECT id FROM documents WHERE id = ?`).get(ids[0]), undefined);
});

test('AI provider ma hoa API key, tu nhan dien model va tao brief', async () => {
  const mockProvider = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.method === 'GET' && request.url?.startsWith('/v1beta/models')) {
      response.end(
        JSON.stringify({
          models: [
            {
              name: 'models/gemini-test-flash',
              displayName: 'Gemini Test Flash',
              supportedGenerationMethods: ['generateContent'],
              inputTokenLimit: 100000,
              outputTokenLimit: 8000,
            },
          ],
        })
      );
      return;
    }
    if (request.method === 'POST' && request.url?.includes(':generateContent')) {
      response.end(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      headline: 'Ưu tiên hôm nay',
                      summary: 'Tập trung xử lý các đầu việc quá hạn.',
                      risks: ['Còn công việc quá hạn'],
                      next_actions: ['Rà soát Next Action'],
                      sources: ['Công việc và pipeline'],
                    }),
                  },
                ],
              },
            },
          ],
          usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 45 },
        })
      );
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: { message: 'not found' } }));
  });
  mockProvider.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => mockProvider.once('listening', resolve));
  const address = mockProvider.address();
  assert.ok(address && typeof address !== 'string');

  try {
    const saved = await json('PUT', '/api/ai/providers/gemini', {
      base_url: `http://127.0.0.1:${address.port}`,
      api_key: 'gemini-super-secret-key',
      enabled: true,
      daily_token_limit: 10000,
      input_cost_per_million_usd: 1,
      output_cost_per_million_usd: 2,
    });
    assert.equal(saved.status, 200);
    assert.equal(JSON.stringify(saved.data).includes('gemini-super-secret-key'), false);

    const secret = db
      .prepare(
        `SELECT api_key_ciphertext, api_key_iv, api_key_tag FROM ai_provider_configs
          WHERE provider = 'gemini'`
      )
      .get() as { api_key_ciphertext: string; api_key_iv: string; api_key_tag: string };
    assert.ok(secret.api_key_ciphertext);
    assert.equal(secret.api_key_ciphertext.includes('gemini-super-secret-key'), false);
    assert.ok(secret.api_key_iv && secret.api_key_tag);

    const synced = await json('POST', '/api/ai/providers/gemini/sync');
    assert.equal(synced.status, 200);
    assert.equal(synced.data.count, 1);

    const brief = await json('POST', '/api/ai/brief', { context_type: 'today', mode: 'fast' });
    assert.equal(brief.status, 200);
    assert.equal(brief.data.headline, 'Ưu tiên hôm nay');
    const meta = brief.data.meta as Record<string, unknown>;
    assert.equal(meta.provider, 'gemini');
    assert.equal(meta.model, 'gemini-test-flash');
    assert.equal(
      (
        db.prepare(`SELECT COUNT(*) AS n FROM ai_usage_logs WHERE status = 'success'`).get() as {
          n: number;
        }
      ).n,
      1
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      mockProvider.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

test('AI action chi ghi CRM sau khi duoc phe duyet', async () => {
  const list = db.prepare(`SELECT id FROM lists ORDER BY id LIMIT 1`).get() as { id: number };
  const info = db
    .prepare(
      `INSERT INTO ai_action_proposals (action_type, title, explanation, payload_json)
       VALUES ('create_task', 'Tạo việc kiểm thử', 'Đề xuất từ AI', ?)`
    )
    .run(
      JSON.stringify({
        title: 'Công việc do AI đề xuất',
        description: 'Chỉ được tạo sau khi người dùng duyệt',
        list_id: list.id,
        priority: 'high',
        due_date: '2026-08-20',
      })
    );
  const proposalId = Number(info.lastInsertRowid);
  assert.equal(
    (
      db
        .prepare(`SELECT COUNT(*) AS n FROM cards WHERE title = 'Công việc do AI đề xuất'`)
        .get() as {
        n: number;
      }
    ).n,
    0
  );

  const approved = await json('POST', `/api/ai/actions/${proposalId}/approve`);
  assert.equal(approved.status, 200);
  const proposal = approved.data.proposal as Record<string, unknown>;
  assert.equal(proposal.status, 'executed');
  assert.equal(
    (
      db
        .prepare(`SELECT COUNT(*) AS n FROM cards WHERE title = 'Công việc do AI đề xuất'`)
        .get() as {
        n: number;
      }
    ).n,
    1
  );

  const repeated = await json('POST', `/api/ai/actions/${proposalId}/approve`);
  assert.equal(repeated.status, 409);
});

test('RAG lap chi muc noi dung text va loai tai lieu confidential khoi ket qua', async () => {
  const customerId = await createCustomer('Khach hang RAG');
  const upload = async (
    name: string,
    confidentiality: 'internal' | 'confidential',
    content: string
  ) => {
    const form = new FormData();
    form.set('file', new Blob([content], { type: 'text/plain' }), name);
    form.set('customer_id', String(customerId));
    form.set('confidentiality', confidentiality);
    const response = await fetch(`${baseUrl}/api/documents`, { method: 'POST', body: form });
    assert.equal(response.status, 201);
  };
  await upload('chien-luoc.txt', 'internal', 'Ke hoach chien luoc mo rong thi truong Da Nang');
  await upload('bi-mat.txt', 'confidential', 'Mat khau noi bo tuyet mat khong duoc gui AI');

  const publicSearch = await json('GET', '/api/ai/documents/search?q=chien%20luoc%20Da%20Nang');
  assert.equal(publicSearch.status, 200);
  const publicRows = publicSearch.data as unknown as { content: string }[];
  assert.ok(publicRows.some((row) => row.content.includes('Da Nang')));

  const secretSearch = await json('GET', '/api/ai/documents/search?q=mat%20khau%20noi%20bo');
  assert.equal(secretSearch.status, 200);
  assert.equal((secretSearch.data as unknown as unknown[]).length, 0);

  // Nhan trich xuat phai di het duong tu textExtract ra API, khong con la 'text'|'metadata' cung.
  const document = db
    .prepare(`SELECT id FROM documents WHERE file_name = 'chien-luoc.txt'`)
    .get() as { id: number };
  const reindex = await json('POST', `/api/ai/documents/${document.id}/index`);
  assert.equal(reindex.status, 200);
  assert.equal(reindex.data.extraction, 'text');
  assert.ok(Number(reindex.data.chunks) > 0);
});

test('automation AI chi tao canh bao va khong tu y sua CRM', async () => {
  const customerId = await createCustomer('Khach hang automation');
  const deal = await json('POST', '/api/deals', {
    customer_id: customerId,
    title: 'Co hoi follow-up qua han',
    next_action: 'Goi lai khach hang',
    next_action_date: '2020-01-01',
  });
  assert.equal(deal.status, 201);
  const dealId = Number(deal.data.id);

  const result = await json('POST', '/api/ai/automations/2/run');
  assert.equal(result.status, 200);
  assert.ok(Number(result.data.found) >= 1);
  const notifications = await json('GET', '/api/ai/notifications?unread=1');
  assert.equal(notifications.status, 200);
  assert.ok(
    (notifications.data as unknown as { link: string }[]).some(
      (item) => item.link === `/deals/${dealId}`
    )
  );
  const unchanged = db.prepare(`SELECT next_action FROM deals WHERE id = ?`).get(dealId) as {
    next_action: string;
  };
  assert.equal(unchanged.next_action, 'Goi lai khach hang');
});
