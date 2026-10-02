import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * Danh ba ca nhan + dong bo danh ba Google (v50).
 *
 * Tap trung vao nhung gi de hong am tham: chuan hoa so dien thoai, doc vCard/CSV
 * that (QUOTED-PRINTABLE, dong gap, tieng Viet), tim trung khi nap lai, RANH GIOI
 * RIENG TU giua hai nhan vien, doi chieu voi danh ba CRM, va People API (lan dau,
 * lan tang dan, xoa, token het han) bang Google gia trong bo nho.
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-my-contacts-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';
process.env.WORKFLOW_SESSION_SECRET = 'test-secret-value-at-least-32-characters-long';
process.env.WORKFLOW_ADMIN_USER = 'admin';
process.env.WORKFLOW_ADMIN_PASSWORD = 'admin-password-1';
process.env.WORKFLOW_ADMIN_EMAIL = 'admin@congty.vn';

const { createApp } = await import('../app.ts');
const { db, closeDatabase } = await import('../db/connection.ts');
const { ensureAdminUser } = await import('../services/auth/bootstrapAdmin.ts');
const { createUser } = await import('../services/auth/users.ts');
const { updateEmailConfig } = await import('../services/email/emailService.ts');
const { normalizePhone, normalizeEmail } = await import('../services/contacts/contactKeys.ts');
const { parseVCard, parseContactsCsv } = await import('../services/contacts/contactFile.ts');
const { runDueContactSyncs } = await import('../services/contacts/googleContacts.ts');

await ensureAdminUser();

let server: Server;
let baseUrl = '';
let cookie = '';

/* ---------- Google gia ---------- */

interface FakePerson {
  resourceName: string;
  name: string;
  email?: string;
  phone?: string;
  org?: string;
  deleted?: boolean;
}

const google = {
  grantedScope: 'openid email https://www.googleapis.com/auth/contacts.readonly',
  people: [] as FakePerson[],
  /** Danh sach tra ve cho lan goi co syncToken (thay doi tang dan). */
  delta: [] as FakePerson[],
  expireToken: false,
  calls: [] as string[],
  pageSize: 1000,
};

const realFetch = globalThis.fetch;
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

function toApi(p: FakePerson) {
  if (p.deleted) return { resourceName: p.resourceName, metadata: { deleted: true } };
  return {
    resourceName: p.resourceName,
    etag: `etag-${p.resourceName}`,
    names: [{ displayName: p.name }],
    emailAddresses: p.email ? [{ value: p.email }] : [],
    phoneNumbers: p.phone ? [{ value: p.phone }] : [],
    organizations: p.org ? [{ name: p.org, title: 'Giám đốc' }] : [],
  };
}

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!/googleapis\.com|accounts\.google\.com/.test(url)) return realFetch(input, init);
  google.calls.push(url);

  if (url === 'https://oauth2.googleapis.com/token') {
    const form = new URLSearchParams(String(init?.body ?? ''));
    if (form.get('grant_type') === 'authorization_code') {
      if (form.get('code') !== 'ma-tu-google') return json({ error: 'invalid_grant' }, 400);
      return json({
        access_token: 'access-1',
        refresh_token: 'refresh-contacts',
        expires_in: 3600,
        scope: google.grantedScope,
      });
    }
    return json({ access_token: 'access-2', expires_in: 3600 });
  }
  if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
    return json({ email: 'nhanvien@gmail.com', email_verified: true });
  }
  if (url === 'https://oauth2.googleapis.com/revoke') return new Response('', { status: 200 });

  const parsed = new URL(url);
  if (parsed.pathname === '/v1/people/me/connections') {
    const syncToken = parsed.searchParams.get('syncToken');
    if (syncToken && google.expireToken) {
      return json(
        {
          error: {
            status: 'FAILED_PRECONDITION',
            message: 'Sync token is expired. Clear the sync token and retry.',
            details: [{ reason: 'EXPIRED_SYNC_TOKEN' }],
          },
        },
        400
      );
    }
    const source = syncToken ? google.delta : google.people;
    const pageToken = Number(parsed.searchParams.get('pageToken') ?? 0);
    const slice = source.slice(pageToken, pageToken + google.pageSize);
    const next = pageToken + google.pageSize;
    return json({
      connections: slice.map(toApi),
      ...(next < source.length ? { nextPageToken: String(next) } : { nextSyncToken: 'sync-2' }),
    });
  }
  return json({ error: { message: `unexpected ${url}` } }, 404);
}) as typeof fetch;

before(async () => {
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Khong khoi dong duoc test server');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  globalThis.fetch = realFetch;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  closeDatabase();
  if (fixtureRoot.startsWith(os.tmpdir())) fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

async function call(method: string, pathname: string, body?: unknown) {
  const res = await realFetch(`${baseUrl}${pathname}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.getSetCookie();
  if (setCookie.length > 0) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    /* redirect khong co JSON */
  }
  return { status: res.status, location: res.headers.get('location') ?? '', data };
}

async function upload(filename: string, content: string) {
  const form = new FormData();
  form.append('file', new Blob([content]), filename);
  const res = await realFetch(`${baseUrl}/api/my-contacts/import`, {
    method: 'POST',
    headers: cookie ? { cookie } : {},
    body: form,
  });
  return { status: res.status, data: (await res.json()) as Record<string, unknown> };
}

async function signIn(login: string, password: string) {
  cookie = '';
  const res = await call('POST', '/api/auth/login', { username: login, password });
  assert.equal(res.status, 200);
}
const googleError = (location: string) => new URL(location).searchParams.get('google_error') ?? '';
const signInAdmin = () => signIn('admin@congty.vn', 'admin-password-1');

interface Item {
  id: number;
  full_name: string;
  phone: string | null;
  email: string | null;
  org_name: string | null;
  source: string;
  linked_contact_id: number | null;
  matches: { contact_id: number; customer_name: string }[];
}
const list = async (query = '') =>
  (await call('GET', `/api/my-contacts${query}`)).data as unknown as {
    total: number;
    items: Item[];
    counts: { total: number; linked: number; google: number; file: number };
  };

/* ---------- Don vi thuan ---------- */

test('chuan hoa so dien thoai ve mot dang duy nhat', () => {
  for (const raw of ['0901 234 567', '+84 901.234.567', '84901234567', '0084901234567']) {
    assert.equal(normalizePhone(raw), '0901234567', raw);
  }
  assert.equal(normalizePhone('+1 (415) 555-0100'), '+14155550100');
  assert.equal(normalizePhone('123'), null);
  assert.equal(normalizeEmail('  An@Cong-Ty.VN '), 'an@cong-ty.vn');
  assert.equal(normalizeEmail('khong-phai-email'), null);
});

test('doc vCard: dong gap, QUOTED-PRINTABLE, nhieu so, ten tu N khi thieu FN', () => {
  const vcf = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'FN:Nguyễn Văn An',
    'ORG:Công ty ABC;Phòng Kinh doanh',
    'TITLE:Trưởng phòng',
    'TEL;TYPE=CELL:+84 901 234 567',
    'TEL;TYPE=WORK:028 3822 1111',
    'EMAIL;TYPE=INTERNET:An@abc.vn',
    'NOTE:Gặp ở hội thảo\\nlần 2',
    'PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRgABAQ',
    ' EAAAAA',
    'END:VCARD',
    'BEGIN:VCARD',
    'VERSION:2.1',
    'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=4C=C3=AA;=42=C3=A1=6E=68;;;',
    'TEL;CELL:0912 345 678',
    'END:VCARD',
    'BEGIN:VCARD',
    'VERSION:3.0',
    'END:VCARD',
  ].join('\r\n');
  const cards = parseVCard(vcf);
  assert.equal(cards.length, 2, 'the rong bi bo qua');
  assert.equal(cards[0].full_name, 'Nguyễn Văn An');
  assert.equal(cards[0].org_name, 'Công ty ABC - Phòng Kinh doanh');
  assert.equal(cards[0].title, 'Trưởng phòng');
  assert.deepEqual(cards[0].phones, ['+84 901 234 567', '028 3822 1111']);
  assert.deepEqual(cards[0].emails, ['An@abc.vn']);
  assert.equal(cards[0].notes, 'Gặp ở hội thảo\nlần 2');
  assert.equal(cards[1].full_name, 'Bánh Lê');
  assert.deepEqual(cards[1].phones, ['0912 345 678']);
});

test('doc CSV Google: ten ghep tu Ho/Ten, nhieu cot dien thoai/email, o co dau phay trong ngoac kep', () => {
  const csv = [
    'First Name,Last Name,Organization Name,Organization Title,E-mail 1 - Value,E-mail 2 - Value,Phone 1 - Type,Phone 1 - Value,Notes',
    'Văn Bình,Trần,"Công ty X, Y",Giám đốc,binh@x.vn,binh2@x.vn,Mobile,0903 111 222 ::: 0904 333 444,"ghi chú, có phẩy"',
    ',,,,,,,,',
    ',,Chỉ Công Ty,,,,,,',
  ].join('\n');
  const rows = parseContactsCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].full_name, 'Văn Bình Trần');
  assert.equal(rows[0].org_name, 'Công ty X, Y');
  assert.deepEqual(rows[0].emails, ['binh@x.vn', 'binh2@x.vn']);
  assert.deepEqual(rows[0].phones, ['0903 111 222', '0904 333 444']);
  assert.equal(rows[0].notes, 'ghi chú, có phẩy');
  assert.equal(rows[1].full_name, 'Chỉ Công Ty');
  assert.throws(() => parseContactsCsv('a,b,c\n1,2,3'), /Không nhận ra cột/);
});

/* ---------- Nap file + rieng tu ---------- */

const FILE_A = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'FN:An Nguyễn',
  'ORG:Công ty ABC',
  'TEL:+84 901 234 567',
  'EMAIL:an@abc.vn',
  'END:VCARD',
  'BEGIN:VCARD',
  'VERSION:3.0',
  'FN:Bình Trần',
  'TEL:0912 345 678',
  'END:VCARD',
].join('\n');

test('nap file .vcf, nap lai khong nhan doi, cac o con trong duoc dien them', async () => {
  await signInAdmin();
  const first = await upload('danh-ba.vcf', FILE_A);
  assert.equal(first.status, 200);
  assert.deepEqual(first.data, { total: 2, created: 2, updated: 0, skipped: 0 });

  /* Cung nguoi, doi dang so + them email, ten khac: khop theo so dien thoai. */
  const second = await upload(
    'lai.vcf',
    ['BEGIN:VCARD', 'FN:Bình (Zalo)', 'TEL:84912345678', 'EMAIL:binh@x.vn', 'END:VCARD'].join('\n')
  );
  assert.deepEqual(second.data, { total: 1, created: 0, updated: 1, skipped: 0 });

  const all = await list();
  assert.equal(all.total, 2);
  const binh = all.items.find((i) => i.full_name === 'Bình Trần');
  assert.ok(binh, 'ten cu duoc giu, khong ghi de');
  assert.equal(binh.email, 'binh@x.vn');
  assert.equal(all.counts.file, 2);

  const bad = await upload('anh.png', 'khong phai danh ba');
  assert.equal(bad.status, 422);
  const empty = await upload('trong.vcf', 'khong co the nao');
  assert.equal(empty.status, 422);
});

test('RIENG TU: nhan vien khac (ke ca quan tri) khong thay, khong sua, khong xoa danh ba cua nguoi kia', async () => {
  const staff = await createUser({
    username: 'nhanvien2',
    email: 'nhanvien2@congty.vn',
    password: 'nhanvien2-password',
  });
  db.prepare(
    `INSERT INTO user_positions (user_id, position_id, is_primary)
     VALUES (?, (SELECT id FROM positions WHERE code = 'staff'), 1)`
  ).run(staff);

  /* Admin nap o test truoc; nhan vien 2 phai thay danh ba TRONG. */
  await signIn('nhanvien2@congty.vn', 'nhanvien2-password');
  assert.equal((await list()).total, 0);

  const adminId = (
    db.prepare(`SELECT id FROM users WHERE email = 'admin@congty.vn'`).get() as { id: number }
  ).id;
  const adminRow = db
    .prepare(`SELECT id FROM personal_contacts WHERE user_id = ? LIMIT 1`)
    .get(adminId) as { id: number };

  assert.equal(
    (await call('PATCH', `/api/my-contacts/${adminRow.id}`, { full_name: 'x' })).status,
    404
  );
  const del = await call('POST', '/api/my-contacts/delete', { ids: [adminRow.id] });
  assert.equal(del.data.deleted, 0);
  assert.equal((await call('POST', `/api/my-contacts/${adminRow.id}/unlink`)).status, 404);
  assert.ok(db.prepare(`SELECT 1 FROM personal_contacts WHERE id = ?`).get(adminRow.id));

  /* Nap cung mot nguoi o tai khoan nay: la dong RIENG, khong gop voi dong cua admin. */
  await upload('b.vcf', FILE_A);
  assert.equal((await list()).total, 2);
  assert.equal(
    (db.prepare(`SELECT COUNT(*) AS n FROM personal_contacts`).get() as { n: number }).n,
    4
  );
  await signInAdmin();
  assert.equal((await list()).total, 2);
});

/* ---------- Doi chieu CRM + dua vao CRM ---------- */

test('doi chieu voi danh ba CRM theo so/email chuan hoa, roi dua vao CRM khong tao ban sao', async () => {
  const customer = Number(
    db.prepare(`INSERT INTO customers (name) VALUES ('Công ty ABC')`).run().lastInsertRowid
  );
  const other = Number(
    db.prepare(`INSERT INTO customers (name) VALUES ('Công ty Khác')`).run().lastInsertRowid
  );
  const crmContact = Number(
    db
      .prepare(
        `INSERT INTO contacts (customer_id, full_name, phone) VALUES (?, 'Nguyễn Văn An', ?)`
      )
      .run(customer, '0901.234.567 / 0988 000 111').lastInsertRowid
  );

  await signInAdmin();
  const all = await list();
  const an = all.items.find((i) => i.full_name === 'An Nguyễn')!;
  const binh = all.items.find((i) => i.full_name === 'Bình Trần')!;
  assert.deepEqual(
    an.matches.map((m) => [m.contact_id, m.customer_name]),
    [[crmContact, 'Công ty ABC']]
  );
  assert.deepEqual(binh.matches, []);

  /* Mac dinh bo qua dong da co o CRM; dong moi duoc tao va gan lien ket. */
  const promoted = await call('POST', '/api/my-contacts/promote', {
    ids: [an.id, binh.id],
    customer_id: other,
  });
  assert.equal(promoted.status, 201);
  assert.equal(promoted.data.created, 1);
  assert.deepEqual(promoted.data.skipped, [{ id: an.id, reason: 'duplicate' }]);
  const created = db
    .prepare(`SELECT * FROM contacts WHERE customer_id = ? AND full_name = 'Bình Trần'`)
    .get(other) as { phone: string; email: string };
  assert.equal(created.phone, '0912 345 678');
  assert.equal(created.email, 'binh@x.vn');

  const again = await call('POST', '/api/my-contacts/promote', {
    ids: [binh.id],
    customer_id: other,
  });
  assert.deepEqual(again.data.skipped, [{ id: binh.id, reason: 'linked' }]);

  /* Lien ket voi lien he CRM co san, dien vao o con trong. */
  const link = await call('POST', `/api/my-contacts/${an.id}/link`, {
    contact_id: crmContact,
    fill_empty: true,
  });
  assert.equal(link.status, 200);
  const filled = db.prepare(`SELECT email, title FROM contacts WHERE id = ?`).get(crmContact) as {
    email: string;
  };
  assert.equal(filled.email, 'an@abc.vn');
  assert.equal((await list('?filter=linked')).total, 2);
  assert.equal((await list('?filter=unlinked')).total, 0);

  assert.equal((await call('POST', `/api/my-contacts/${an.id}/unlink`)).status, 200);
  assert.equal((await list('?filter=unlinked')).total, 1);
});

/* ---------- Google ---------- */

test('ket noi Gmail: chua co Client -> bao loi; co Client -> state chong gia mao, thieu quyen bi tu choi', async () => {
  await signInAdmin();
  const noClient = await call('GET', '/api/my-contacts/google/start');
  assert.equal(noClient.status, 302);
  assert.match(googleError(noClient.location), /Client ID/);

  updateEmailConfig(db, {
    googleClientId: 'client.apps.googleusercontent.com',
    googleClientSecret: 'bi-mat',
  });
  const start = await call('GET', '/api/my-contacts/google/start');
  assert.equal(start.status, 302);
  const auth = new URL(start.location);
  assert.equal(auth.hostname, 'accounts.google.com');
  assert.match(auth.searchParams.get('scope') ?? '', /contacts\.readonly/);
  assert.doesNotMatch(auth.searchParams.get('scope') ?? '', /gmail\.send/);
  assert.match(
    auth.searchParams.get('redirect_uri') ?? '',
    /\/api\/my-contacts\/google\/callback$/
  );
  const state = auth.searchParams.get('state')!;

  const forged = await call('GET', '/api/my-contacts/google/callback?code=ma-tu-google&state=sai');
  assert.match(googleError(forged.location), /không hợp lệ/);

  /* Nguoi dung bo tick quyen danh ba tren man dong y. */
  await call('GET', '/api/my-contacts/google/start').then(async (r) => {
    google.grantedScope = 'openid email';
    const s = new URL(r.location).searchParams.get('state')!;
    const denied = await call(
      'GET',
      `/api/my-contacts/google/callback?code=ma-tu-google&state=${s}`
    );
    assert.match(googleError(denied.location), /quyền xem danh bạ/);
    google.grantedScope = 'openid email https://www.googleapis.com/auth/contacts.readonly';
  });
  assert.equal((await call('GET', '/api/my-contacts/status')).data.google !== undefined, true);
  void state;
});

test('dong bo: lan dau keo het (nhieu trang), lan sau chi phan thay doi, xoa ben Google thi xoa o day', async () => {
  google.people = Array.from({ length: 5 }, (_, i) => ({
    resourceName: `people/c${i}`,
    name: `Google ${i}`,
    email: `g${i}@gmail.com`,
    phone: `0933 000 00${i}`,
    org: i === 0 ? 'Công ty ABC' : undefined,
  }));
  google.pageSize = 2;

  await signInAdmin();
  const start = await call('GET', '/api/my-contacts/google/start');
  const state = new URL(start.location).searchParams.get('state')!;
  const cb = await call('GET', `/api/my-contacts/google/callback?code=ma-tu-google&state=${state}`);
  assert.match(cb.location, /\/my-contacts\?google=connected$/);

  /* Callback tu keo lan dau o nen — cho no xong. */
  for (let i = 0; i < 100; i++) {
    const status = (await call('GET', '/api/my-contacts/status')).data.google as {
      syncing: boolean;
    };
    if (!status.syncing) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  const status = (await call('GET', '/api/my-contacts/status')).data.google as Record<
    string,
    unknown
  >;
  assert.equal(status.connected, true);
  assert.equal(status.google_account, 'nhanvien@gmail.com');
  assert.equal(status.last_error, null);
  assert.equal((await list('?source=google')).total, 5);
  const tokenRow = db.prepare(`SELECT * FROM google_contact_accounts`).get() as Record<
    string,
    string
  >;
  assert.equal(JSON.stringify(tokenRow).includes('refresh-contacts'), false, 'token duoc ma hoa');
  assert.equal(JSON.stringify(status).includes('refresh-contacts'), false);

  /* Lan tang dan: sua mot nguoi, xoa mot nguoi, them mot nguoi moi. */
  google.delta = [
    {
      resourceName: 'people/c1',
      name: 'Google Một (đổi tên)',
      email: 'g1@gmail.com',
      phone: '0933 000 001',
    },
    { resourceName: 'people/c2', name: '', deleted: true },
    { resourceName: 'people/c9', name: 'Google Mới', email: 'moi@gmail.com' },
  ];
  const sync = await call('POST', '/api/my-contacts/google/sync');
  assert.equal(sync.status, 200);
  assert.equal(sync.data.full, false);
  assert.equal(sync.data.imported, 1);
  assert.equal(sync.data.updated, 1);
  assert.equal(sync.data.removed, 1);
  const names = (await list('?source=google')).items.map((i) => i.full_name);
  assert.ok(names.includes('Google Một (đổi tên)'));
  assert.ok(names.includes('Google Mới'));
  assert.equal(names.includes('Google 2'), false);

  /* syncToken het han: lam lai tu dau va don lien he khong con xuat hien. */
  google.expireToken = true;
  google.people = google.people.filter((p) => p.resourceName !== 'people/c3');
  const full = await call('POST', '/api/my-contacts/google/sync');
  assert.equal(full.status, 200);
  assert.equal(full.data.full, true);
  const afterFull = (await list('?source=google')).items.map((i) => i.full_name);
  assert.equal(afterFull.includes('Google 3'), false, 'ben Google da xoa -> don khoi danh ba');
  assert.equal(afterFull.includes('Google Mới'), false, 'khong con trong danh ba Google');
  google.expireToken = false;
});

test('lien he da dua vao CRM khong bi mat khi ngat ket noi; tuy chon xoa phan con lai', async () => {
  await signInAdmin();
  const google1 = (await list('?source=google')).items;
  assert.ok(google1.length >= 2);
  const target = await call('POST', '/api/my-contacts/promote', {
    ids: [google1[0].id],
    customer_id: (db.prepare(`SELECT id FROM customers LIMIT 1`).get() as { id: number }).id,
    allow_duplicates: true,
  });
  assert.equal(target.data.created, 1);

  const off = await call('POST', '/api/my-contacts/google/disconnect', { remove_contacts: true });
  assert.equal(off.status, 200);
  assert.equal((off.data.google as { connected: boolean }).connected, false);
  const remain = await list();
  assert.ok(
    remain.items.some((i) => i.id === google1[0].id),
    'dong da dua vao CRM duoc giu'
  );
  assert.equal(remain.items.filter((i) => i.source === 'google').length, 1);
  assert.equal(
    (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM personal_contacts WHERE google_resource_name IS NOT NULL`
        )
        .get() as { n: number }
    ).n,
    0,
    'khong con nhan Google de lan dong bo sau xoa nham'
  );

  const noSync = await call('POST', '/api/my-contacts/google/sync');
  assert.equal(noSync.status, 400);
});

test('lich tu dong: chi dong bo tai khoan bat tu dong va da qua 24 gio', async () => {
  const adminId = (
    db.prepare(`SELECT id FROM users WHERE email = 'admin@congty.vn'`).get() as { id: number }
  ).id;
  db.prepare(
    `INSERT INTO google_contact_accounts (user_id, google_account, last_sync_at, auto_sync)
     VALUES (?, 'nhanvien@gmail.com', datetime('now','localtime','-1 hours'), 1)`
  ).run(adminId);
  assert.equal(await runDueContactSyncs(db), 0, 'moi dong bo 1 gio truoc');

  db.prepare(
    `UPDATE google_contact_accounts SET last_sync_at = datetime('now','localtime','-25 hours')`
  ).run();
  db.prepare(`UPDATE google_contact_accounts SET auto_sync = 0`).run();
  assert.equal(await runDueContactSyncs(db), 0, 'tat tu dong');

  db.prepare(`UPDATE google_contact_accounts SET auto_sync = 1`).run();
  assert.equal(await runDueContactSyncs(db), 1, 'qua 24 gio va bat tu dong -> dong bo');
  const row = db
    .prepare(`SELECT last_success_at, last_error FROM google_contact_accounts`)
    .get() as {
    last_success_at: string | null;
    last_error: string | null;
  };
  assert.ok(row.last_success_at);
  assert.equal(row.last_error, null);
  assert.equal(await runDueContactSyncs(db), 0, 'vua dong bo xong thi khong chay lai');
});
