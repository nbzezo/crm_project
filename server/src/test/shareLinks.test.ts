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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- du lieu test, kiem tung truong
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- du lieu test, kiem tung truong
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
      .prepare(
        `INSERT INTO customers (name, search_text) VALUES ('Cong ty Khach', 'cong ty khach')`
      )
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

test('v51 -> v52: bo CHECK loai ban ghi, giu nguyen link va nhat ky, quay lui duoc', async () => {
  const { default: Database } = await import('better-sqlite3');
  const { migrate } = await import('../db/migrate.ts');
  const mem = new Database(':memory:');
  mem.pragma('foreign_keys = ON');
  migrate(mem, 50);
  migrate(mem, 51);
  assert.throws(() =>
    mem
      .prepare(
        `INSERT INTO share_links (token_hash, entity_type, entity_id) VALUES ('h', 'page', 1)`
      )
      .run()
  );
  mem
    .prepare(
      `INSERT INTO share_links (token_hash, entity_type, entity_id, title) VALUES ('h1', 'document', 7, 'Cu')`
    )
    .run();
  mem.prepare(`INSERT INTO share_link_views (link_id, ip) VALUES (1, '1.2.3.4')`).run();

  migrate(mem);
  const kept = mem.prepare(`SELECT id, title FROM share_links`).all();
  assert.deepEqual(kept, [{ id: 1, title: 'Cu' }]);
  assert.equal(
    (mem.prepare(`SELECT COUNT(*) AS n FROM share_link_views`).get() as { n: number }).n,
    1
  );
  mem
    .prepare(
      `INSERT INTO share_links (token_hash, entity_type, entity_id) VALUES ('h2', 'page', 1)`
    )
    .run();
  assert.deepEqual(mem.pragma('foreign_key_check'), []);
  /* Xoa link thi nhat ky xoa theo: khoa ngoai van noi dung sau khi thay bang. */
  mem.prepare(`DELETE FROM share_links WHERE id = 1`).run();
  assert.equal(
    (mem.prepare(`SELECT COUNT(*) AS n FROM share_link_views`).get() as { n: number }).n,
    0
  );

  /* Quay lui theo dung thu tu: v57 them cot vao share_links nen phai go truoc khi
     v52 dung lai bang theo dang cu. */
  mem.exec(fs.readFileSync(new URL('../db/migrate-v57-rollback.sql', import.meta.url), 'utf8'));
  mem.exec(fs.readFileSync(new URL('../db/migrate-v52-rollback.sql', import.meta.url), 'utf8'));
  assert.equal(
    (
      mem.prepare(`SELECT COUNT(*) AS n FROM share_links WHERE entity_type = 'page'`).get() as {
        n: number;
      }
    ).n,
    0,
    'link trang tai lieu bi go khi quay ve v51'
  );
  assert.throws(() =>
    mem
      .prepare(
        `INSERT INTO share_links (token_hash, entity_type, entity_id) VALUES ('h3', 'page', 1)`
      )
      .run()
  );
  mem.exec(fs.readFileSync(new URL('../db/migrate-v51-rollback.sql', import.meta.url), 'utf8'));
  const tables = (
    mem.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]
  ).map((t) => t.name);
  assert.equal(tables.includes('share_links'), false);
  assert.equal(tables.includes('drive_backup_settings'), true);
});

test('v57: lay lai duoc link da tao de sao chep, link cu thi bao ro', async () => {
  const created = await call('POST', '/api/shares', {
    entity_type: 'quotation',
    entity_id: quotationId,
    expires_in_days: 7,
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.can_copy, true);

  /* Token van khong nam o dang ro trong CSDL — chi ban bam va ban ma hoa. */
  const stored = db
    .prepare(`SELECT * FROM share_links WHERE id = ?`)
    .get(created.json.id) as Record<string, unknown>;
  assert.equal(JSON.stringify(stored).includes(String(created.json.token)), false);

  const again = await call('GET', `/api/shares/${created.json.id}/url`);
  assert.equal(again.status, 200);
  assert.equal(again.json.url, created.json.url);

  /* Danh sach khong mang link that. */
  const list = await call('GET', '/api/shares');
  assert.equal(list.text.includes(String(created.json.token)), false);

  /* Link tao truoc v57: khong co ban ma hoa. */
  db.prepare(
    `UPDATE share_links SET token_ciphertext = NULL, token_iv = NULL, token_tag = NULL WHERE id = ?`
  ).run(created.json.id);
  const legacy = await call('GET', `/api/shares/${created.json.id}/url`);
  assert.equal(legacy.status, 422);
  assert.equal(legacy.json.code, 'SHARE_URL_UNAVAILABLE');
});

test('loai ban ghi la do API chan (khong con CHECK o CSDL)', async () => {
  const res = await call('POST', '/api/shares', { entity_type: 'deal', entity_id: 1 });
  assert.equal(res.status, 400);
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
  const other = await call(
    'GET',
    `/api/public/share/${token}/file/${secretDocId}`,
    undefined,
    false
  );
  assert.equal(other.status, 404);
  const bad = await call('GET', `/api/public/share/${'a'.repeat(43)}`, undefined, false);
  assert.equal(bad.status, 404);
  const malformed = await call('GET', '/api/public/share/abc', undefined, false);
  assert.equal(malformed.status, 404);
});

test('tai lieu mat khong duoc chia se cong khai', async () => {
  const res = await call('POST', '/api/shares', {
    entity_type: 'document',
    entity_id: secretDocId,
  });
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- du lieu test, kiem tung truong
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
  const inline = await call(
    'GET',
    `/api/public/share/${token}/file/${documentId}`,
    undefined,
    false
  );
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
  const created = await call('POST', '/api/shares', {
    entity_type: 'document',
    entity_id: documentId,
  });
  const token = String(created.json.token);
  assert.equal((await call('GET', `/api/public/share/${token}`, undefined, false)).status, 200);

  db.prepare(
    `UPDATE share_links SET expires_at = datetime('now','localtime','-1 minutes') WHERE id = ?`
  ).run(created.json.id);
  const expired = await call('GET', `/api/public/share/${token}`, undefined, false);
  assert.equal(expired.status, 410);
  assert.equal(expired.json.code, 'expired');

  const another = await call('POST', '/api/shares', {
    entity_type: 'document',
    entity_id: documentId,
  });
  const revoke = await call('POST', `/api/shares/${another.json.id}/revoke`);
  assert.equal(revoke.json.status, 'revoked');
  const gone = await call('GET', `/api/public/share/${another.json.token}`, undefined, false);
  assert.equal(gone.status, 410);
  assert.equal(gone.json.code, 'revoked');
});

test('xoa ban ghi goc thi link ngung hoat dong', async () => {
  const created = await call('POST', '/api/shares', {
    entity_type: 'document',
    entity_id: documentId,
  });
  db.prepare(`UPDATE documents SET deleted_at = datetime('now','localtime') WHERE id = ?`).run(
    documentId
  );
  const view = await call('GET', `/api/public/share/${created.json.token}`, undefined, false);
  assert.equal(view.status, 404);
  db.prepare(`UPDATE documents SET deleted_at = NULL WHERE id = ?`).run(documentId);
});

test('nhac theo doi: lan mo dau tien bao vao chuong thong bao, khong tao nhac hen', async () => {
  const created = await call('POST', '/api/shares', {
    entity_type: 'quotation',
    entity_id: quotationId,
    notify_on_view: true,
  });
  await call('GET', `/api/public/share/${created.json.token}`, undefined, false);
  await call('GET', `/api/public/share/${created.json.token}`, undefined, false);
  const alerts = db
    .prepare(`SELECT title, link FROM ai_notifications WHERE title LIKE 'Khách vừa mở liên kết%'`)
    .all() as { title: string; link: string | null }[];
  assert.equal(alerts.length, 1, 'chi bao mot lan');
  assert.equal(alerts[0].link, `/customers/${customerId}`, 'thong bao dan toi khach hang');
  const reminders = db
    .prepare(`SELECT COUNT(*) AS n FROM reminders WHERE title LIKE 'Khách vừa mở liên kết%'`)
    .get() as { n: number };
  assert.equal(reminders.n, 0, 'khong chen vao lich trinh');
});

test('quan tri tat chia se cong khai: tao moi bi chan, link cu tra 410', async () => {
  const created = await call('POST', '/api/shares', {
    entity_type: 'document',
    entity_id: documentId,
  });
  const off = await call('PUT', '/api/shares/settings', { public_enabled: false });
  assert.equal(off.json.public_enabled, false);
  const blocked = await call('POST', '/api/shares', {
    entity_type: 'document',
    entity_id: documentId,
  });
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

test('Trang tai lieu: chia se noi dung da loc, khong lo nguoi tham du / id / khoi tuy chinh', async () => {
  const content = [
    {
      id: 'a1',
      type: 'heading',
      props: { level: 2 },
      content: [{ type: 'text', text: 'Muc tieu', styles: { bold: true } }],
    },
    {
      id: 'a2',
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Gui ', styles: {} },
        {
          type: 'link',
          href: 'javascript:alert(1)',
          content: [{ type: 'text', text: 'link doc', styles: {} }],
        },
        {
          type: 'link',
          href: 'https://example.com',
          content: [{ type: 'text', text: 'an toan', styles: {} }],
        },
        { type: 'mention', props: { contactId: 4242, label: 'Nguyen Van A' } },
      ],
      children: [
        {
          id: 'a3',
          type: 'bulletListItem',
          content: [{ type: 'text', text: 'y con', styles: {} }],
        },
      ],
    },
    { id: 'a4', type: 'flowchart', props: { data: 'BI-MAT-SO-DO' } },
    {
      id: 'a5',
      type: 'checkListItem',
      props: { checked: true },
      content: [{ type: 'text', text: 'xong', styles: {} }],
    },
  ];
  const attendee = Number(
    db
      .prepare(`INSERT INTO contacts (customer_id, full_name) VALUES (?, 'Nguoi Tham Du Bi Mat')`)
      .run(customerId).lastInsertRowid
  );
  const pageId = Number(
    db
      .prepare(
        `INSERT INTO meeting_notes (title, purpose_key, content_json, content_text, search_text, customer_id)
         VALUES ('Ke hoach Q4', 'plan', ?, 'x', 'ke hoach q4', ?)`
      )
      .run(JSON.stringify(content), customerId).lastInsertRowid
  );
  db.prepare(`INSERT INTO meeting_note_attendees (meeting_note_id, contact_id) VALUES (?, ?)`).run(
    pageId,
    attendee
  );
  db.prepare(
    `INSERT INTO documents (name, file_name, stored_name, mime, size, meeting_note_id, search_text)
     VALUES ('Dinh kem', 'dk.txt', 'x-share.txt', 'text/plain', 20, ?, 'dk')`
  ).run(pageId);

  const created = await call('POST', '/api/shares', {
    entity_type: 'page',
    entity_id: pageId,
    notify_on_view: true,
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.locked_version, false);
  const view = await call('GET', `/api/public/share/${created.json.token}`, undefined, false);
  assert.equal(view.status, 200);
  assert.equal(view.json.title, 'Ke hoach Q4');
  assert.equal(view.json.blocks[0].type, 'heading');
  assert.equal(view.json.blocks[0].level, 2);
  assert.equal(view.json.blocks[0].runs[0].b, true);
  assert.equal(view.json.blocks[1].children[0].type, 'bullet');
  assert.equal(view.json.blocks[2].type, 'omitted');
  assert.equal(view.json.blocks[3].checked, true);
  const runs = view.json.blocks[1].runs as { t: string; href?: string }[];
  assert.equal(runs.find((r) => r.t === 'link doc')?.href, undefined, 'javascript: bi bo');
  assert.equal(runs.find((r) => r.t === 'an toan')?.href, 'https://example.com');
  assert.ok(runs.some((r) => r.t === '@Nguyen Van A'));
  assert.equal(view.text.includes('BI-MAT-SO-DO'), false, 'khoi tuy chinh khong lo props');
  assert.equal(view.text.includes('4242'), false, 'khong lo id danh ba');
  assert.equal(view.text.includes('Nguoi Tham Du Bi Mat'), false);
  assert.equal(view.text.includes('Cong ty Khach'), false, 'khong lo ten khach hang');
  assert.equal(view.json.files.length, 1);
  const alert = db
    .prepare(`SELECT link FROM ai_notifications WHERE title LIKE '%Ke hoach Q4%'`)
    .all() as { link: string | null }[];
  assert.equal(alert.length, 1);
  assert.equal(alert[0].link, `/customers/${customerId}`);

  /* Dong bang: sua trang sau khi chia se khong doi thu nguoi nhan thay. */
  const locked = await call('POST', '/api/shares', {
    entity_type: 'page',
    entity_id: pageId,
    lock_version: true,
  });
  db.prepare(`UPDATE meeting_notes SET title = 'Da doi ten', content_json = '[]' WHERE id = ?`).run(
    pageId
  );
  const frozen = await call('GET', `/api/public/share/${locked.json.token}`, undefined, false);
  assert.equal(frozen.json.title, 'Ke hoach Q4');
  assert.equal(frozen.json.blocks.length, 4);
  const live = await call('GET', `/api/public/share/${created.json.token}`, undefined, false);
  assert.equal(live.json.title, 'Da doi ten');

  /* Xoa mem trang thi link ngung hoat dong. */
  db.prepare(`UPDATE meeting_notes SET deleted_at = datetime('now','localtime') WHERE id = ?`).run(
    pageId
  );
  const gone = await call('GET', `/api/public/share/${locked.json.token}`, undefined, false);
  assert.equal(gone.status, 404);
});

test('gia han: dat lai han tu bay gio, link da thu hoi thi khong gia han', async () => {
  const created = await call('POST', '/api/shares', {
    entity_type: 'document',
    entity_id: documentId,
    expires_in_days: 1,
  });
  db.prepare(
    `UPDATE share_links SET expires_at = datetime('now','localtime','-1 minutes') WHERE id = ?`
  ).run(created.json.id);
  const before = await call('GET', `/api/public/share/${created.json.token}`, undefined, false);
  assert.equal(before.status, 410);
  const extended = await call('POST', `/api/shares/${created.json.id}/extend`, { days: 30 });
  assert.equal(extended.status, 200);
  assert.equal(extended.json.status, 'active');
  const after = await call('GET', `/api/public/share/${created.json.token}`, undefined, false);
  assert.equal(after.status, 200);

  await call('POST', `/api/shares/${created.json.id}/revoke`);
  const refused = await call('POST', `/api/shares/${created.json.id}/extend`, { days: 7 });
  assert.equal(refused.status, 409);
  const bad = await call('POST', `/api/shares/${created.json.id}/extend`, { days: 5 });
  assert.equal(bad.status, 400);
});

test('nhat ky luot mo qua 180 ngay bi don khi tao link moi', async () => {
  const created = await call('POST', '/api/shares', {
    entity_type: 'document',
    entity_id: documentId,
  });
  db.prepare(
    `INSERT INTO share_link_views (link_id, viewed_at, ip) VALUES (?, datetime('now','localtime','-200 days'), 'cu')`
  ).run(created.json.id);
  db.prepare(
    `INSERT INTO share_link_views (link_id, viewed_at, ip) VALUES (?, datetime('now','localtime','-10 days'), 'moi')`
  ).run(created.json.id);
  await call('POST', '/api/shares', { entity_type: 'document', entity_id: documentId });
  const ips = (
    db.prepare(`SELECT ip FROM share_link_views WHERE link_id = ?`).all(created.json.id) as {
      ip: string;
    }[]
  ).map((r) => r.ip);
  assert.deepEqual(ips, ['moi']);
});
