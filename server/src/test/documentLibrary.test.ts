import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/* Thu vien "Trang tài liệu" cua trang Tai lieu (1.28.0): tim, loc, dem, phan trang,
   thung rac — va so dem tep cho goi y cheo tab. */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-doc-library-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';

const { createApp } = await import('../app.ts');
const { db, closeDatabase, FILES_DIR } = await import('../db/connection.ts');

let server: Server;
let baseUrl = '';
let customerId = 0;
let dealId = 0;

before(async () => {
  server = createApp({ auth: false }).listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Khong khoi dong duoc test server');
  baseUrl = `http://127.0.0.1:${address.port}`;

  customerId = Number(
    db
      .prepare(
        `INSERT INTO customers (name, org_kind, status, search_text)
         VALUES ('Khách Thư viện', 'customer', 'customer', 'khach thu vien')`
      )
      .run().lastInsertRowid
  );
  dealId = Number(
    db
      .prepare(
        `INSERT INTO deals (customer_id, title, stage, position, value_vnd, search_text)
         VALUES (?, 'Cơ hội thư viện', 'lead', 1024, 0, 'co hoi thu vien')`
      )
      .run(customerId).lastInsertRowid
  );
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
  return { status: response.status, data: (await response.json()) as Record<string, unknown> };
}

type Item = { id: number; title: string; excerpt: string; content_json?: string };

test('thu vien trang: tim khong dau, loc mau va noi gan, dem facet, khong tra content_json', async () => {
  const make = (body: Record<string, unknown>) => json('POST', '/api/meeting-notes', body);
  await make({
    title: 'Biên bản chốt hợp đồng',
    purpose_key: 'meeting',
    content_text: 'Thống nhất điều khoản thanh toán',
    deal_id: dealId,
    customer_id: customerId,
  });
  await make({ title: 'Kế hoạch gia hạn hợp đồng', purpose_key: 'plan', content_text: '' });
  await make({ title: 'Quy trình nội bộ', purpose_key: 'process', content_text: 'Bước 1' });

  const found = await json('GET', '/api/meeting-notes/page?q=hop dong');
  const items = found.data.items as Item[];
  assert.deepEqual(items.map((n) => n.title).sort(), [
    'Biên bản chốt hợp đồng',
    'Kế hoạch gia hạn hợp đồng',
  ]);
  assert.equal(items[0].content_json, undefined);

  const linked = await json('GET', '/api/meeting-notes/page?linked=deal');
  assert.deepEqual(
    (linked.data.items as Item[]).map((n) => n.title),
    ['Biên bản chốt hợp đồng']
  );
  const byCustomer = await json('GET', `/api/meeting-notes/page?customer_id=${customerId}`);
  assert.equal((byCustomer.data.items as Item[]).length, 1);

  // Dem theo mau KHONG bi bo loc mau chinh no thu hep — cac mau khac van co so.
  const facets = await json('GET', '/api/meeting-notes/facets?q=hop dong&purpose_key=plan');
  assert.equal(facets.data.total, 1);
  assert.deepEqual(facets.data.by_purpose, { meeting: 1, plan: 1 });
  assert.deepEqual(facets.data.by_link, { deal: 0, project: 0, none: 1 });
});

test('thu vien trang: phan trang theo con tro khong lap, khong sot', async () => {
  for (let i = 0; i < 5; i += 1) {
    await json('POST', '/api/meeting-notes', { title: `Trang phân trang ${i}`, content_text: '' });
  }
  const seen: number[] = [];
  let cursor = '';
  for (let guard = 0; guard < 10; guard += 1) {
    const page = await json(
      'GET',
      `/api/meeting-notes/page?q=phan trang&limit=2${cursor ? `&cursor=${cursor}` : ''}`
    );
    seen.push(...(page.data.items as Item[]).map((n) => n.id));
    if (!page.data.next_cursor) break;
    cursor = String(page.data.next_cursor);
  }
  assert.equal(seen.length, 5);
  assert.equal(new Set(seen).size, 5);
});

test('thu vien trang: xoa vao thung rac roi khoi phuc', async () => {
  const created = await json('POST', '/api/meeting-notes', {
    title: 'Trang sẽ xoá',
    content_text: '',
  });
  const id = created.data.id as number;
  assert.equal((await json('DELETE', `/api/meeting-notes/${id}`)).status, 200);

  const active = await json('GET', '/api/meeting-notes/page?q=se xoa');
  assert.equal((active.data.items as Item[]).length, 0);
  const trash = await json('GET', '/api/meeting-notes/page?q=se xoa&trash=1');
  assert.deepEqual(
    (trash.data.items as Item[]).map((n) => n.id),
    [id]
  );

  const restored = await json('POST', `/api/meeting-notes/${id}/restore`);
  assert.equal(restored.status, 200);
  assert.equal(restored.data.title, 'Trang sẽ xoá');
  // Khoi phuc lan hai: khong con trong thung rac.
  assert.equal((await json('POST', `/api/meeting-notes/${id}/restore`)).status, 404);
});

test('dem tep theo tu khoa cho goi y cheo tab', async () => {
  db.prepare(
    `INSERT INTO documents (name, file_name, stored_name, mime, size, search_text)
     VALUES ('Hợp đồng đã ký', 'hd.pdf', 'hd-stored.pdf', 'application/pdf', 10, 'hop dong da ky')`
  ).run();
  const count = await json('GET', '/api/documents/count?q=hợp đồng');
  assert.equal(count.data.count, 1);
  const none = await json('GET', '/api/documents/count?q=khong co');
  assert.equal(none.data.count, 0);
});

test('xoa vinh vien trang trong thung rac huy ca tep dinh kem tren o dia', async () => {
  const created = await json('POST', '/api/meeting-notes', {
    title: 'Trang có ghi âm',
    content_text: '',
  });
  const id = created.data.id as number;
  const stored = `ghi-am-${Date.now()}.webm`;
  fs.mkdirSync(FILES_DIR, { recursive: true });
  fs.writeFileSync(path.join(FILES_DIR, stored), 'audio');
  const docId = Number(
    db
      .prepare(
        `INSERT INTO documents (name, file_name, stored_name, size, meeting_note_id)
         VALUES ('Ghi âm', 'ghi-am.webm', ?, 5, ?)`
      )
      .run(stored, id).lastInsertRowid
  );

  // Trang con dang dung: khong xoa vinh vien duoc.
  assert.notEqual((await json('DELETE', `/api/meeting-notes/${id}/permanent`)).status, 200);

  await json('DELETE', `/api/meeting-notes/${id}`);
  assert.equal((await json('DELETE', `/api/meeting-notes/${id}/permanent`)).status, 200);

  assert.equal(db.prepare('SELECT 1 FROM meeting_notes WHERE id = ?').get(id), undefined);
  assert.equal(db.prepare('SELECT 1 FROM documents WHERE id = ?').get(docId), undefined);
  assert.equal(fs.existsSync(path.join(FILES_DIR, stored)), false, 'tep ghi am phai bi huy');
  assert.equal((await json('POST', `/api/meeting-notes/${id}/restore`)).status, 404);
});
