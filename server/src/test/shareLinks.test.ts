import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * Chia se cong khai bang link (v51): tao, mo khong can dang nhap, mat khau,
 * het han, thu hoi, dong bang phien ban, an thong tin noi bo, chan tai ve.
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-share-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';
process.env.WORKFLOW_SESSION_SECRET = 'test-secret-value-at-least-32-characters-long';
process.env.WORKFLOW_ADMIN_USER = 'admin';
process.env.WORKFLOW_ADMIN_PASSWORD = 'admin-password-1';
process.env.WORKFLOW_ADMIN_EMAIL = 'admin@congty.vn';

const { createApp } = await import('../app.ts');
const { db, closeDatabase, FILES_DIR } = await import('../db/connection.ts');
const { ensureAdminUser } = await import('../services/auth/bootstrapAdmin.ts');

await ensureAdminUser();

let server: Server;
let baseUrl = '';
let cookie = '';

interface Reply {
  status: number;
  json: Record<string, any>;
  text: string;
  res: Response;
}

async function call(
  method: string,
  url: string,
  body?: unknown,
  withCookie = true
): Promise<Reply> {
  const res = await fetch(`${baseUrl}${url}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(withCookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, any> = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* tep nhi phan hoac van ban */
  }
  return { status: res.status, json, text, res };
}

let customerId = 0;
let quotationId = 0;
let documentId = 0;
let secretDocId = 0;

before(async () => {
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Khong khoi dong duoc test server');
  baseUrl = `http://127.0.0.1:${address.port}`;
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin-password-1' }),
  });
  assert.equal(login.status, 200);
  cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');

  customerId = Number(
    db
      .prepare(`INSERT INTO customers (name, search_text) VALUES ('Cong ty Khach', 'cong ty khach')`)
      .run().lastInsertRowid
  );
  quotationId = Number(
    db
      .prepare(
        `INSERT INTO quotations (customer_id, code, version, value_vnd, status, notes)
         VALUES (?, 'BG-01', 1, 1000000, 'sent', 'GHI CHU NOI BO gia von 700k')`
      )
      .run(customerId).lastInsertRowid
  );
  fs.writeFileSync(path.join(FILES_DIR, 'x-share.txt'), 'noi dung tep chia se');
  fs.writeFileSync(path.join(FILES_DIR, 'x-secret.txt'), 'tai lieu mat');
  documentId = Number(
    db
      .prepare(
        `INSERT INTO documents (name, file_name, stored_name, mime, size, customer_id, quotation_id, search_text)
         VALUES ('Phu luc', 'phuluc.txt', 'x-share.txt', 'text/plain', 20, ?, ?, 'phu luc')`
      )
      .run(customerId, quotationId).lastInsertRowid
  );
  secretDocId = Number(
    db
      .prepare(
        `INSERT INTO documents (name, file_name, stored_name, mime, size, customer_id, confidentiality, search_text)
         VALUES ('Mat', 'mat.txt', 'x-secret.txt', 'text/plain', 12, ?, 'confidential', 'mat')`
      )
      .run(customerId).lastInsertRowid
  );
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  closeDatabase();
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

test('v51: bang chia se co rang buoc loai ban ghi va quay lui duoc', async () => {
  const { default: Database } = await import('better-sqlite3');
  const { migrate } = await import('../db/migrate.ts');
  const mem = new Database(':memory:');
  mem.pragma('foreign_keys = ON');
  migrate(mem, 50);
  migrate(mem);
  assert.throws(() =>
    mem
      .prepare(`INSERT INTO share_links (token_hash, entity_type, entity_id) VALUES ('h', 'deal', 1)`)
      .run()
  );
  mem.exec(fs.readFileSync(new URL('../db/migrate-v51-rollback.sql', import.meta.url), 'utf8'));
  const tables = (
    mem.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]
  ).map((t) => t.name);
  assert.equal(tables.includes('share_links'), false);
  assert.equal(tables.includes('drive_backup_settings'), true);
});

test('bao gia: link dong bang, an ghi chu noi bo, mo duoc khong can dang nhap', async () => {
  const created = await call('POST', '/api/shares', {
    entity_type: 'quotation',
    entity_id: quotationId,
    expires_in_days: 7,
  });
  assert.equal(created.status, 201);
  assert.match(created.json.url, /\/s\/[A-Za-z0-9_-]{43}$/);
  assert.equal(created.json.locked_version, true);
  assert.equal(created.json.has_password, false);
  const token = String(created.json.token);

  /* Token khong nam trong CSDL, chi co ban bam. */
  const stored = db
    .prepare(`SELECT * FROM share_links WHERE id = ?`)
    .get(created.json.id) as Record<string, unknown>;
  assert.equal(JSON.stringify(stored).includes(token), false);

  /* Doi gia sau khi chia se: ban dong bang van giu so cu. */
  db.prepare(`UPDATE quotations SET value_vnd = 9999999 WHERE id = ?`).run(quotationId);

  const view = await call('GET', `/api/public/share/${token}`, undefined, false);
  assert.equal(view.status, 200);
  assert.equal(view.json.fields.value_vnd, 1000000);
  assert.equal(view.json.fields.customer_name, 'Cong ty Khach');
  assert.equal(view.json.locked_version, true);
  assert.equal(view.json.files.length, 1);
  assert.equal(view.text.includes('GHI CHU NOI BO'), false, 'khong lo ghi chu noi bo');
  assert.equal(view.text.includes('gia von'), false);
  assert.equal(view.res.headers.get('cache-control'), 'no-store');
  assert.equal(view.res.headers.get('referrer-policy'), 'no-referrer');

  /* Nhat ky: lan mo lap lai tu cung IP trong 10 phut khong dem them. */
  await call('GET', `/api/public/share/${token}`, undefined, false);
  const list = await call('GET', `/api/shares?entity_type=quotation&entity_id=${quotationId}`);
  const mine = (list.json as unknown as { id: number; view_count: number }[]).find(
    (l) => l.id === created.json.id
  );
  assert.equal(mine?.view_count, 1);
  assert.equal(list.text.includes(token), false, 'danh sach khong tra lai token');

  /* Tep: tai ve duoc khi cho phep. */
  const file = await call(
    'GET',
    `/api/public/share/${token}/file/${documentId}?download=1`,
    undefined,
    false
  );
  assert.equal(file.status, 200);
  assert.equal(file.text, 'noi dung tep chia se');
  const views = await call('GET', `/api/shares/${created.json.id}/views`);
  assert.ok((views.json as unknown as { action: string }[]).some((v) => v.action === 'download'));
});

test('khong do duoc tep ngoai danh sach da chia se, va token sai tra 404', async () => {
  const created = await call('POST', '/api/shares', {
    entity_type: 'quotation',
    entity_id: quotationId,
  });
  const token = String(created.json.token);
  const other = await call('GET', `/api/public/share/${token}/file/${secretDocId}`, undefined, false);
  assert.equal(other.status, 404);
  const bad = await call('GET', `/api/public/share/${'a'.repeat(43)}`, undefined, false);
  assert.equal(bad.status, 404);
  const malformed = await call('GET', '/api/public/share/abc', undefined, false);
  assert.equal(malformed.status, 404);
});

test('tai lieu mat khong duoc chia se cong khai', async () => {
  const res = await call('POST', '/api/shares', { entity_type: 'document', entity_id: secretDocId });
  assert.equal(res.status, 422);
  assert.equal(res.json.code, 'SHARE_BLOCKED');
});

test('mat khau: can mo khoa, sai thi bi chan, dung thi xem va tai duoc', async () => {
  const created = await call('POST', '/api/shares', {
    entity_type: 'document',
    entity_id: documentId,
    password: 'mat-khau-1',
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.has_password, true);
  const token = String(created.json.token);

  const locked = await call('GET', `/api/public/share/${token}`, undefined, false);
  assert.equal(locked.json.requires_password, true);
  assert.equal(locked.json.files, undefined, 'chua mo khoa thi khong lo noi dung');
  const noAccess = await call(
    'GET',
    `/api/public/share/${token}/file/${documentId}`,
    undefined,
    false
  );
  assert.equal(noAccess.status, 401);

  const wrong = await call('POST', `/api/public/share/${token}/unlock`, { password: 'sai' }, false);
  assert.equal(wrong.status, 401);

  const ok = await call(
    'POST',
    `/api/public/share/${token}/unlock`,
    { password: 'mat-khau-1' },
    false
  );
  assert.equal(ok.status, 200);
  const access = String(ok.json.access);

  const res = await fetch(`${baseUrl}/api/public/share/${token}`, {
    headers: { 'x-share-access': access },
  });
  const json = (await res.json()) as Record<string, any>;
  assert.equal(json.requires_password, false);
  assert.equal(json.files[0].id, documentId);
  const file = await call(
    'GET',
    `/api/public/share/${token}/file/${documentId}?a=${encodeURIComponent(access)}`,
    undefined,
    false
  );
  assert.equal(file.status, 200);
  const forged = await call(
    'GET',
    `/api/public/share/${token}/file/${documentId}?a=${Date.now() + 999999}.xxxx`,
    undefined,
    false
  );
  assert.equal(forged.status, 401);
});

test('mat khau: thu sai qua nhieu lan bi khoa tam', async () => {
  const created = await call('POST', '/api/shares', {
    entity_type: 'document',
    entity_id: documentId,
    password: 'mat-khau-2',
  });
  const token = String(created.json.token);
  for (let i = 0; i < 8; i++) {
    const r = await call(
      'POST',
      `/api/public/share/${token}/unlock`,
      { password: `sai${i}` },
      false
    );
    assert.equal(r.status, 401);
  }
  const blocked = await call(
    'POST',
    `/api/public/share/${token}/unlock`,
    { password: 'mat-khau-2' },
    false
  );
  assert.equal(blocked.status, 429);
});

test('chi xem: chan tai ve va chan tep khong xem truc tiep duoc', async () => {
  const created = await call('POST', '/api/shares', {
    entity_type: 'document',
    entity_id: documentId,
    allow_download: false,
  });
  const token = String(created.json.token);
  const inline = await call('GET', `/api/public/share/${token}/file/${documentId}`, undefined, false);
  assert.equal(inline.status, 200);
  assert.match(String(inline.res.headers.get('content-disposition')), /^inline/);
  const download = await call(
    'GET',
    `/api/public/share/${token}/file/${documentId}?download=1`,
    undefined,
    false
  );
  assert.equal(download.status, 403);

  db.prepare(`UPDATE documents SET mime = 'application/msword' WHERE id = ?`).run(documentId);
  const doc = await call('GET', `/api/public/share/${token}/file/${documentId}`, undefined, false);
  assert.equal(doc.status, 403);
  db.prepare(`UPDATE documents SET mime = 'text/plain' WHERE id = ?`).run(documentId);
});

test('het han va thu hoi: tra 410, giu nguyen nhat ky', async () => {
  const created = await call('POST', '/api/shares', { entity_type: 'document', entity_id: documentId });
  const token = String(created.json.token);
  assert.equal((await call('GET', `/api/public/share/${token}`, undefined, false)).status, 200);

  db.prepare(
    `UPDATE share_links SET expires_at = datetime('now','localtime','-1 minutes') WHERE id = ?`
  ).run(created.json.id);
  const expired = await call('GET', `/api/public/share/${token}`, undefined, false);
  assert.equal(expired.status, 410);
  assert.equal(expired.json.code, 'expired');

  const another = await call('POST', '/api/shares', { entity_type: 'document', entity_id: documentId });
  const revoke = await call('POST', `/api/shares/${another.json.id}/revoke`);
  assert.equal(revoke.json.status, 'revoked');
  const gone = await call('GET', `/api/public/share/${another.json.token}`, undefined, false);
  assert.equal(gone.status, 410);
  assert.equal(gone.json.code, 'revoked');
});

test('xoa ban ghi goc thi link ngung hoat dong', async () => {
  const created = await call('POST', '/api/shares', { entity_type: 'document', entity_id: documentId });
  db.prepare(`UPDATE documents SET deleted_at = datetime('now','localtime') WHERE id = ?`).run(
    documentId
  );
  const view = await call('GET', `/api/public/share/${created.json.token}`, undefined, false);
  assert.equal(view.status, 404);
  db.prepare(`UPDATE documents SET deleted_at = NULL WHERE id = ?`).run(documentId);
});

test('nhac theo doi: lan mo dau tien tao nhac viec gan khach hang', async () => {
  const created = await call('POST', '/api/shares', {
    entity_type: 'quotation',
    entity_id: quotationId,
    notify_on_view: true,
  });
  await call('GET', `/api/public/share/${created.json.token}`, undefined, false);
  await call('GET', `/api/public/share/${created.json.token}`, undefined, false);
  const reminders = db
    .prepare(`SELECT title, customer_id FROM reminders WHERE title LIKE 'Khách vừa mở liên kết%'`)
    .all() as { title: string; customer_id: number }[];
  assert.equal(reminders.length, 1, 'chi nhac mot lan');
  assert.equal(reminders[0].customer_id, customerId);
});

test('quan tri tat chia se cong khai: tao moi bi chan, link cu tra 410', async () => {
  const created = await call('POST', '/api/shares', { entity_type: 'document', entity_id: documentId });
  const off = await call('PUT', '/api/shares/settings', { public_enabled: false });
  assert.equal(off.json.public_enabled, false);
  const blocked = await call('POST', '/api/shares', { entity_type: 'document', entity_id: documentId });
  assert.equal(blocked.status, 403);
  const old = await call('GET', `/api/public/share/${created.json.token}`, undefined, false);
  assert.equal(old.status, 410);
  assert.equal(old.json.code, 'disabled');
  await call('PUT', '/api/shares/settings', { public_enabled: true });
  const back = await call('GET', `/api/public/share/${created.json.token}`, undefined, false);
  assert.equal(back.status, 200);
});

test('route quan ly can dang nhap', async () => {
  const res = await call(
    'POST',
    '/api/shares',
    { entity_type: 'document', entity_id: documentId },
    false
  );
  assert.equal(res.status, 401);
});
