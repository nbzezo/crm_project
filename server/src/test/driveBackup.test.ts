import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

/*
 * Sao luu CSDL va tep tai len ra Google Drive (v49).
 *
 * Drive duoc thay bang mot ban gia trong bo nho, du de kiem nhung gi quan trong:
 * thu muc duoc tao dung, tep chi len MOT lan, ban sao CSDL cu bi don, xoa o CRM
 * khong lan sang Drive, thu muc bi xoa tay thi tao lai, va khoi phuc tep thieu.
 * Moi request khac (chinh test goi vao server) di qua fetch that.
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-drive-backup-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';
process.env.WORKFLOW_SESSION_SECRET = 'test-secret-value-at-least-32-characters-long';
process.env.WORKFLOW_ADMIN_USER = 'admin';
process.env.WORKFLOW_ADMIN_PASSWORD = 'admin-password-1';
process.env.WORKFLOW_ADMIN_EMAIL = 'admin@congty.vn';

const { createApp } = await import('../app.ts');
const { db, closeDatabase, FILES_DIR, BACKUP_DIR } = await import('../db/connection.ts');
const { ensureAdminUser } = await import('../services/auth/bootstrapAdmin.ts');
const { setPassword } = await import('../services/auth/users.ts');
const { runDueDriveBackupCheck } = await import('../services/backup/driveBackup.ts');
const { driveRetry, DRIVE_FILE_SCOPE } = await import('../services/backup/driveApi.ts');

await ensureAdminUser();
driveRetry.baseDelayMs = 0;

let server: Server;
let baseUrl = '';
let cookie = '';

/* ---------- Drive gia ---------- */

interface FakeFile {
  id: string;
  name: string;
  parents: string[];
  folder: boolean;
  content: Buffer;
  description: string;
  createdTime: string;
  trashed: boolean;
}

const drive = {
  files: new Map<string, FakeFile>(),
  sessions: new Map<string, { name: string; parents: string[]; description: string }>(),
  counter: 0,
  calls: [] as string[],
  grantedScope: `openid email ${DRIVE_FILE_SCOPE}`,
  /** Tu choi tai len tep co ten nay (tru ban sao CSDL `app-*`) bang loi dung luong. */
  quotaOnFiles: false,
  quotaOnEverything: false,
  /** So lan PUT dau tien tra 503 truoc khi thanh cong. */
  transientFailures: 0,
};

function reset() {
  drive.files.clear();
  drive.sessions.clear();
  drive.calls = [];
  drive.quotaOnFiles = false;
  drive.quotaOnEverything = false;
  drive.transientFailures = 0;
}

function add(partial: Partial<FakeFile> & { name: string }): FakeFile {
  drive.counter += 1;
  const file: FakeFile = {
    id: `fid-${drive.counter}`,
    parents: [],
    folder: false,
    content: Buffer.alloc(0),
    description: '',
    createdTime: new Date(Date.UTC(2026, 0, 1) + drive.counter * 1000).toISOString(),
    trashed: false,
    ...partial,
  };
  drive.files.set(file.id, file);
  return file;
}

const childrenOf = (id: string) =>
  [...drive.files.values()].filter((f) => f.parents.includes(id) && !f.trashed);
const named = (name: string) =>
  [...drive.files.values()].find((f) => f.name === name && !f.trashed);

const realFetch = globalThis.fetch;
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
const quotaError = () =>
  json(
    {
      error: {
        message: 'The user storage quota has been exceeded.',
        errors: [{ reason: 'storageQuotaExceeded' }],
      },
    },
    403
  );

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!/googleapis\.com|accounts\.google\.com|upload\.fake/.test(url)) {
    return realFetch(input, init);
  }
  const method = init?.method ?? 'GET';
  drive.calls.push(`${method} ${url}`);
  const parsed = new URL(url);

  /* --- OAuth --- */
  if (url === 'https://oauth2.googleapis.com/token') {
    const form = new URLSearchParams(String(init?.body ?? ''));
    if (form.get('grant_type') === 'authorization_code') {
      if (form.get('code') !== 'ma-tu-google') return json({ error: 'invalid_grant' }, 400);
      return json({
        access_token: 'access-1',
        refresh_token: 'refresh-drive',
        expires_in: 3600,
        scope: drive.grantedScope,
      });
    }
    return json({ access_token: 'access-2', expires_in: 3600 });
  }
  if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
    return json({ email: 'sao.luu@gmail.com', email_verified: true });
  }
  if (url === 'https://oauth2.googleapis.com/revoke') return new Response('', { status: 200 });

  if (drive.quotaOnEverything && method !== 'GET') return quotaError();

  /* --- Tai len (resumable) --- */
  if (parsed.pathname === '/upload/drive/v3/files') {
    const meta = JSON.parse(String(init?.body)) as {
      name: string;
      parents: string[];
      description?: string;
    };
    if (drive.quotaOnFiles && !meta.name.startsWith('app-')) return quotaError();
    drive.counter += 1;
    const id = `session-${drive.counter}`;
    drive.sessions.set(id, {
      name: meta.name,
      parents: meta.parents,
      description: meta.description ?? '',
    });
    return new Response('', { status: 200, headers: { location: `https://upload.fake/${id}` } });
  }
  if (parsed.hostname === 'upload.fake') {
    if (drive.transientFailures > 0) {
      drive.transientFailures -= 1;
      return json({ error: { message: 'backend error' } }, 503);
    }
    const session = drive.sessions.get(parsed.pathname.slice(1));
    assert.ok(session, 'phien tai len khong ton tai');
    const body = Buffer.from(await new Response(init?.body as ReadableStream).arrayBuffer());
    const file = add({ ...session, content: body });
    return json({ id: file.id, name: file.name, size: String(body.length) });
  }

  /* --- Tep va thu muc --- */
  if (parsed.pathname === '/drive/v3/files' && method === 'POST') {
    const meta = JSON.parse(String(init?.body)) as {
      name: string;
      mimeType?: string;
      parents?: string[];
      description?: string;
    };
    const file = add({
      name: meta.name,
      parents: meta.parents ?? [],
      folder: meta.mimeType === 'application/vnd.google-apps.folder',
      description: meta.description ?? '',
    });
    return json({ id: file.id, name: file.name });
  }
  if (parsed.pathname === '/drive/v3/files' && method === 'GET') {
    const parent = /'([^']+)' in parents/.exec(parsed.searchParams.get('q') ?? '')?.[1] ?? '';
    const rows = childrenOf(parent).sort((a, b) => b.createdTime.localeCompare(a.createdTime));
    return json({
      files: rows.map((f) => ({
        id: f.id,
        name: f.name,
        size: String(f.content.length),
        createdTime: f.createdTime,
      })),
    });
  }
  const single = /^\/drive\/v3\/files\/([^/]+)$/.exec(parsed.pathname);
  if (single) {
    const file = drive.files.get(decodeURIComponent(single[1]));
    if (method === 'DELETE') {
      if (!file) return json({ error: { message: 'not found' } }, 404);
      drive.files.delete(file.id);
      return new Response(null, { status: 204 });
    }
    if (!file) return json({ error: { message: 'File not found' } }, 404);
    if (parsed.searchParams.get('alt') === 'media') {
      return new Response(new Uint8Array(file.content), { status: 200 });
    }
    return json({ id: file.id, trashed: file.trashed });
  }
  return json({ error: { message: `unexpected ${method} ${url}` } }, 404);
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

async function signIn(login: string, password: string) {
  cookie = '';
  const res = await call('POST', '/api/auth/login', { username: login, password });
  assert.equal(res.status, 200);
}
const signInAdmin = () => signIn('admin@congty.vn', 'admin-password-1');

type Config = Record<string, unknown> & {
  running: boolean;
  last_error: string | null;
  last_files_uploaded: number | null;
  last_files_failed: number | null;
  tracked_files: number;
  pending_files: number;
};

async function config(): Promise<Config> {
  return (await call('GET', '/api/drive-backup/config')).data as Config;
}

async function waitIdle(): Promise<Config> {
  for (let i = 0; i < 200; i++) {
    const current = await config();
    if (!current.running) return current;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Sao luu khong ket thuc');
}

async function runBackup(): Promise<Config> {
  const started = await call('POST', '/api/drive-backup/run');
  assert.equal(started.status, 202);
  return waitIdle();
}

function addLocalFile(storedName: string, content: string, originalName?: string): void {
  fs.writeFileSync(path.join(FILES_DIR, storedName), content);
  if (originalName) {
    db.prepare(
      `INSERT INTO documents (name, file_name, stored_name, mime, size) VALUES (?, ?, ?, 'text/plain', ?)`
    ).run(originalName, originalName, storedName, content.length);
  }
}

const dbBackups = () => {
  const root = named('WorkFlow CRM — Sao lưu');
  const folder = root && childrenOf(root.id).find((f) => f.name === 'database');
  return folder ? childrenOf(folder.id) : [];
};
const driveFiles = () => {
  const root = named('WorkFlow CRM — Sao lưu');
  const folder = root && childrenOf(root.id).find((f) => f.name === 'files');
  return folder ? childrenOf(folder.id) : [];
};

/* ---------- Test ---------- */

test('cau hinh: Client Secret khong lo ra ngoai, redirect URI do may chu tinh', async () => {
  await signInAdmin();
  const res = await call('PUT', '/api/drive-backup/config', {
    google_client_id: 'client-drive.apps.googleusercontent.com',
    google_client_secret: 'bi-mat-drive',
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.has_google_client_secret, true);
  assert.equal(JSON.stringify(res.data).includes('bi-mat-drive'), false);
  assert.match(String(res.data.google_redirect_uri), /\/api\/drive-backup\/oauth\/callback$/);
  assert.equal(res.data.app_base_url_set, false);
  await call('PUT', '/api/email/config', { app_base_url: 'https://crm.congty.vn' });
  const withBase = await call('GET', '/api/drive-backup/config');
  assert.equal(withBase.data.app_base_url_set, true);
  assert.equal(
    withBase.data.google_redirect_uri,
    'https://crm.congty.vn/api/drive-backup/oauth/callback'
  );
  await call('PUT', '/api/email/config', { app_base_url: '' });

  const bad = await call('PUT', '/api/drive-backup/config', { keep_db_count: 0 });
  assert.equal(bad.status, 400);
});

test('dung lai Client cua Email: chep nguyen khoi da ma hoa, chua co thi bao ro', async () => {
  await signInAdmin();
  const none = await call('PUT', '/api/drive-backup/config', { copy_client_from_email: true });
  assert.equal(none.status, 400);

  await call('PUT', '/api/email/config', {
    google_client_id: 'client-email.apps.googleusercontent.com',
    google_client_secret: 'bi-mat-email',
  });
  assert.equal((await config()).email_client_available, true);
  const copied = await call('PUT', '/api/drive-backup/config', { copy_client_from_email: true });
  assert.equal(copied.status, 200);
  assert.equal(copied.data.google_client_id, 'client-email.apps.googleusercontent.com');
  assert.equal(JSON.stringify(copied.data).includes('bi-mat-email'), false);

  /* Tra lai Client rieng cho cac test sau. */
  await call('PUT', '/api/drive-backup/config', {
    google_client_id: 'client-drive.apps.googleusercontent.com',
    google_client_secret: 'bi-mat-drive',
  });
});

test('chua dang nhap Google thi khong chay duoc', async () => {
  await signInAdmin();
  assert.equal((await call('POST', '/api/drive-backup/run')).status, 400);
  assert.equal((await call('POST', '/api/drive-backup/restore-missing')).status, 400);
  assert.equal((await call('POST', '/api/drive-backup/disconnect')).status, 400);
});

async function connect(): Promise<void> {
  const start = await call('GET', '/api/drive-backup/oauth/start');
  assert.equal(start.status, 302);
  const state = new URL(start.location).searchParams.get('state');
  const back = await call(
    'GET',
    `/api/drive-backup/oauth/callback?code=ma-tu-google&state=${state}`
  );
  assert.equal(new URL(back.location).searchParams.get('drive'), 'connected');
}

test('trang dong y xin dung quyen tao tep cua CRM, khong xin doc ca Drive', async () => {
  await signInAdmin();
  const start = await call('GET', '/api/drive-backup/oauth/start');
  const url = new URL(start.location);
  const scopes = (url.searchParams.get('scope') ?? '').split(' ');
  assert.ok(scopes.includes(DRIVE_FILE_SCOPE));
  assert.equal(scopes.includes('https://www.googleapis.com/auth/drive'), false);
  assert.equal(
    scopes.some((s) => s.includes('gmail')),
    false
  );
  assert.equal(url.searchParams.get('access_type'), 'offline');
});

test('state sai, bo tick quyen, huy o Google deu khong ket noi', async () => {
  await signInAdmin();
  const start = await call('GET', '/api/drive-backup/oauth/start');
  const state = new URL(start.location).searchParams.get('state');

  const forged = await call('GET', '/api/drive-backup/oauth/callback?code=ma-tu-google&state=gia');
  assert.match(new URL(forged.location).searchParams.get('drive_error') ?? '', /không hợp lệ/);

  /* state vua dung (gia) da bi huy — callback that voi state cu cung phai that bai. */
  const replay = await call(
    'GET',
    `/api/drive-backup/oauth/callback?code=ma-tu-google&state=${state}`
  );
  assert.match(new URL(replay.location).searchParams.get('drive_error') ?? '', /không hợp lệ/);

  drive.grantedScope = 'openid email';
  try {
    const s2 = new URL(
      (await call('GET', '/api/drive-backup/oauth/start')).location
    ).searchParams.get('state');
    const res = await call('GET', `/api/drive-backup/oauth/callback?code=ma-tu-google&state=${s2}`);
    assert.match(new URL(res.location).searchParams.get('drive_error') ?? '', /Google Drive/);
  } finally {
    drive.grantedScope = `openid email ${DRIVE_FILE_SCOPE}`;
  }

  const s3 = new URL(
    (await call('GET', '/api/drive-backup/oauth/start')).location
  ).searchParams.get('state');
  const cancelled = await call(
    'GET',
    `/api/drive-backup/oauth/callback?error=access_denied&state=${s3}`
  );
  assert.match(new URL(cancelled.location).searchParams.get('drive_error') ?? '', /huỷ/);
  assert.equal((await config()).connected, false);
});

test('dang nhap thanh cong: luu tai khoan, tu bat sao luu, ban dau tien den han ngay', async () => {
  await signInAdmin();
  await connect();
  const current = await config();
  assert.equal(current.connected, true);
  assert.equal(current.google_account, 'sao.luu@gmail.com');
  assert.equal(current.enabled, true);
  assert.equal(current.next_run_at, null, 'chua tung chay thi den han ngay');
  assert.equal(JSON.stringify(current).includes('refresh-drive'), false);
});

test('lan dau: tao thu muc, day ban sao CSDL da nen va moi tep, kem ten goc', async () => {
  await signInAdmin();
  reset();
  addLocalFile('1700000000000-111.pdf', 'noi dung hop dong', 'Hợp đồng ABC.pdf');
  addLocalFile('1700000000001-222.txt', 'bao gia', 'Báo giá.txt');
  addLocalFile('1700000000002-333.bin', 'khong co ban ghi');
  fs.writeFileSync(path.join(FILES_DIR, '.hidden'), 'bo qua');
  const backupsBefore = fs.readdirSync(BACKUP_DIR).length;

  const result = await runBackup();
  assert.equal(result.last_error, null);
  assert.equal(result.last_files_uploaded, 3);
  assert.equal(result.last_files_failed, 0);
  assert.equal(result.tracked_files, 3);
  assert.equal(result.pending_files, 0);
  assert.match(String(result.folder_url), /drive\.google\.com\/drive\/folders\//);

  const root = named('WorkFlow CRM — Sao lưu');
  assert.ok(root);
  assert.deepEqual(
    childrenOf(root.id)
      .map((f) => f.name)
      .sort(),
    ['database', 'files']
  );

  const backups = dbBackups();
  assert.equal(backups.length, 1);
  assert.match(backups[0].name, /^app-\d{8}-\d{6}\.db\.gz$/);
  const raw = zlib.gunzipSync(backups[0].content);
  assert.equal(raw.subarray(0, 15).toString(), 'SQLite format 3');

  const files = driveFiles();
  assert.deepEqual(files.map((f) => f.name).sort(), [
    '1700000000000-111.pdf',
    '1700000000001-222.txt',
    '1700000000002-333.bin',
  ]);
  const contract = files.find((f) => f.name === '1700000000000-111.pdf');
  assert.equal(contract?.content.toString(), 'noi dung hop dong');
  assert.equal(contract?.description, 'Tên gốc: Hợp đồng ABC.pdf');
  assert.equal(
    files.some((f) => f.name === '.hidden'),
    false
  );

  assert.equal(fs.readdirSync(BACKUP_DIR).length, backupsBefore, 'khong de lai ban chup tam');
});

test('lan sau chi day tep MOI, khong tai lai tep cu', async () => {
  await signInAdmin();
  addLocalFile('1700000000003-444.txt', 'tep moi', 'Tệp mới.txt');
  drive.calls = [];
  const result = await runBackup();
  assert.equal(result.last_files_uploaded, 1);
  assert.equal(result.tracked_files, 4);
  assert.equal(driveFiles().length, 4, 'khong tao ban trung');
  const fileUploads = drive.calls.filter((c) => c.startsWith('POST') && c.includes('/upload/'));
  assert.equal(fileUploads.length, 2, 'mot ban sao CSDL + mot tep moi');
});

test('chi giu so ban sao CSDL da dat, ban cu hon bi don', async () => {
  await signInAdmin();
  await call('PUT', '/api/drive-backup/config', { keep_db_count: 2 });
  for (let i = 0; i < 3; i++) await runBackup();
  assert.equal(dbBackups().length, 2);
  assert.equal(driveFiles().length, 4, 'tep tai len khong bao gio bi don');
});

test('xoa tep o CRM KHONG xoa ban sao tren Drive', async () => {
  await signInAdmin();
  fs.rmSync(path.join(FILES_DIR, '1700000000002-333.bin'));
  await runBackup();
  assert.ok(driveFiles().some((f) => f.name === '1700000000002-333.bin'));
});

test('tep mat khoi dia: khoi phuc duoc tep da len Drive, bao ro tep chua tung sao luu', async () => {
  await signInAdmin();
  fs.rmSync(path.join(FILES_DIR, '1700000000000-111.pdf'));
  addLocalFile('1700000000009-999.txt', 'chua kip sao luu', 'Chưa sao lưu.txt');
  fs.rmSync(path.join(FILES_DIR, '1700000000009-999.txt'));

  const before = await config();
  assert.equal(before.missing_on_disk, 2);
  assert.equal(before.missing_restorable, 1);

  assert.equal((await call('POST', '/api/drive-backup/restore-missing')).status, 202);
  const after = await waitIdle();
  assert.deepEqual(
    after.last_restore as { restored: number; failed: number; notBackedUp: number },
    { ...(after.last_restore as object), restored: 1, failed: 0, notBackedUp: 1 }
  );
  assert.equal(
    fs.readFileSync(path.join(FILES_DIR, '1700000000000-111.pdf'), 'utf8'),
    'noi dung hop dong'
  );
  assert.equal(after.missing_on_disk, 1);
  assert.equal(
    fs.existsSync(path.join(FILES_DIR, '1700000000000-111.pdf.part')),
    false,
    'khong de lai tep nua chung'
  );
});

test('khoi phuc khong bao gio ghi de tep dang co', async () => {
  await signInAdmin();
  fs.writeFileSync(path.join(FILES_DIR, '1700000000000-111.pdf'), 'da sua tren dia');
  await call('POST', '/api/drive-backup/restore-missing');
  await waitIdle();
  assert.equal(
    fs.readFileSync(path.join(FILES_DIR, '1700000000000-111.pdf'), 'utf8'),
    'da sua tren dia'
  );
});

test('thu muc bi xoa tay tren Drive thi tao lai va tai len lai tu dau', async () => {
  await signInAdmin();
  const root = named('WorkFlow CRM — Sao lưu');
  assert.ok(root);
  for (const f of [...drive.files.values()]) {
    if (f.id === root.id || f.parents.length) drive.files.delete(f.id);
  }
  const result = await runBackup();
  assert.equal(result.last_error, null);
  const recreated = named('WorkFlow CRM — Sao lưu');
  assert.ok(recreated);
  assert.notEqual(recreated.id, root.id);
  assert.equal(dbBackups().length, 1);
  const names = driveFiles()
    .map((f) => f.name)
    .sort();
  assert.ok(names.includes('1700000000000-111.pdf'), 'tep da len truoc do duoc tai len lai');
  assert.equal(result.tracked_files, names.length);
});

test('loi tam thoi cua Google (503) duoc thu lai', async () => {
  await signInAdmin();
  addLocalFile('1700000000010-010.txt', 'tep sau loi tam', 'Sau lỗi.txt');
  drive.transientFailures = 1;
  const result = await runBackup();
  assert.equal(result.last_error, null);
  assert.ok(driveFiles().some((f) => f.name === '1700000000010-010.txt'));
});

test('day dung luong: ban sao CSDL van len, tep loi duoc gom lai va dung som', async () => {
  await signInAdmin();
  for (let i = 0; i < 5; i++) addLocalFile(`17000000001${i}0-q${i}.txt`, `q${i}`);
  drive.quotaOnFiles = true;
  const result = await runBackup();
  assert.equal(result.last_files_uploaded, 0);
  assert.equal(result.last_files_failed, 5);
  assert.match(String(result.last_error), /5 tệp chưa sao lưu được/);
  assert.match(String(result.last_error), /đầy dung lượng/);
  assert.match(String(result.last_error), /Dừng sớm/);
  assert.ok(result.last_success_at, 'ban sao CSDL van thanh cong');
  assert.equal(result.pending_files, 5, 'tep loi duoc thu lai o lan sau');

  drive.quotaOnFiles = false;
  const retry = await runBackup();
  assert.equal(retry.last_files_uploaded, 5);
  assert.equal(retry.last_error, null);
});

test('day dung luong ngay ca ban sao CSDL thi lan chay that bai, noi ro ly do', async () => {
  await signInAdmin();
  drive.quotaOnEverything = true;
  const result = await runBackup();
  assert.match(String(result.last_error), /đầy dung lượng/);
  drive.quotaOnEverything = false;
});

test('lich: chua den han thi khong chay, den han thi chay', async () => {
  await signInAdmin();
  db.prepare(
    `UPDATE drive_backup_settings SET next_run_at = datetime('now','localtime','+5 hours')`
  ).run();
  drive.calls = [];
  await runDueDriveBackupCheck(db);
  assert.equal(drive.calls.length, 0);

  db.prepare(
    `UPDATE drive_backup_settings SET next_run_at = datetime('now','localtime','-1 minutes')`
  ).run();
  await runDueDriveBackupCheck(db);
  assert.ok(drive.calls.some((c) => c.includes('/upload/')));
  const after = await config();
  assert.ok(after.next_run_at && String(after.next_run_at) > String(after.last_run_at));

  db.prepare(`UPDATE drive_backup_settings SET enabled = 0, next_run_at = NULL`).run();
  drive.calls = [];
  await runDueDriveBackupCheck(db);
  assert.equal(drive.calls.length, 0, 'tat thi khong tu chay');
  db.prepare(`UPDATE drive_backup_settings SET enabled = 1`).run();
});

test('ngat ket noi: xoa token, thu hoi phia Google, giu thu muc de noi lai', async () => {
  await signInAdmin();
  const before = await config();
  drive.calls = [];
  const res = await call('POST', '/api/drive-backup/disconnect');
  assert.equal(res.status, 200);
  assert.equal(res.data.connected, false);
  assert.equal(res.data.enabled, false);
  assert.equal(res.data.folder_url, before.folder_url, 'giu thu muc');
  assert.ok(drive.calls.some((c) => c.includes('/revoke')));

  await connect();
  const again = await config();
  assert.equal(again.tracked_files, before.tracked_files, 'cung tai khoan: khong tai lai tu dau');
});

test('doi Client ID thi mat quyen voi tep cu: bo thu muc va theo doi', async () => {
  await signInAdmin();
  assert.ok((await config()).tracked_files > 0);
  const res = await call('PUT', '/api/drive-backup/config', { google_client_id: 'client-moi' });
  assert.equal(res.data.connected, false);
  assert.equal(res.data.folder_url, null);
  assert.equal(res.data.tracked_files, 0);
});

test('chi nguoi co quyen xuat du lieu moi cau hinh duoc sao luu Drive', async () => {
  await signInAdmin();
  const contactId = Number(
    db.prepare(`INSERT INTO customers (name, org_kind) VALUES ('Cty', 'own')`).run().lastInsertRowid
  );
  const contact = Number(
    db
      .prepare(`INSERT INTO contacts (customer_id, full_name, is_active) VALUES (?, 'NV', 1)`)
      .run(contactId).lastInsertRowid
  );
  const userId = Number(
    db
      .prepare(
        `INSERT INTO users (username, password_hash, password_salt, email, full_name, contact_id)
         VALUES ('nv@congty.vn', '', '', 'nv@congty.vn', 'NV', ?)`
      )
      .run(contact).lastInsertRowid
  );
  db.prepare(
    `INSERT INTO user_positions (user_id, position_id, is_primary)
     VALUES (?, (SELECT id FROM positions WHERE code = 'staff'), 1)`
  ).run(userId);
  await setPassword(userId, 'mat-khau-test-1');
  await signIn('nv@congty.vn', 'mat-khau-test-1');

  for (const [method, url] of [
    ['GET', '/api/drive-backup/config'],
    ['PUT', '/api/drive-backup/config'],
    ['POST', '/api/drive-backup/run'],
    ['GET', '/api/drive-backup/oauth/start'],
  ] as const) {
    assert.equal((await call(method, url, method === 'PUT' ? {} : undefined)).status, 403, url);
  }
});
