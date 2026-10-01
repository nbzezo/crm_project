import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * Gui email bang tai khoan Google dang nhap qua trinh duyet (v48).
 *
 * Google duoc thay bang mot `fetch` gia chi chan cac URL cua Google; moi request
 * khac (chinh test goi vao server) di qua fetch that. Kiem: luong start ->
 * callback, chong CSRF bang `state`, thu that su di qua Gmail API voi dung noi
 * dung, va loi thu hoi token / thieu quyen duoc noi ra bang tieng Viet.
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-google-mail-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';
process.env.WORKFLOW_SESSION_SECRET = 'test-secret-value-at-least-32-characters-long';
process.env.WORKFLOW_ADMIN_USER = 'admin';
process.env.WORKFLOW_ADMIN_PASSWORD = 'admin-password-1';
process.env.WORKFLOW_ADMIN_EMAIL = 'admin@congty.vn';

const { createApp } = await import('../app.ts');
const { db, closeDatabase } = await import('../db/connection.ts');
const { ensureAdminUser } = await import('../services/auth/bootstrapAdmin.ts');
const { sendMail } = await import('../services/email/emailService.ts');
const { GMAIL_SEND_SCOPE, forgetGoogleAccessToken } =
  await import('../services/email/googleMail.ts');

await ensureAdminUser();

let server: Server;
let baseUrl = '';
let cookie = '';

/* ---------- Google gia ---------- */

const realFetch = globalThis.fetch;
const google = {
  calls: [] as { url: string; body: string; auth: string | null }[],
  grantedScope: `openid email ${GMAIL_SEND_SCOPE}`,
  refreshError: null as string | null,
  sendStatus: 200,
};

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!/googleapis\.com|accounts\.google\.com/.test(url)) return realFetch(input, init);

  const body = typeof init?.body === 'string' ? init.body : '';
  const headers = new Headers(init?.headers);
  google.calls.push({ url, body, auth: headers.get('authorization') });
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

  if (url === 'https://oauth2.googleapis.com/token') {
    const form = new URLSearchParams(body);
    if (form.get('grant_type') === 'authorization_code') {
      if (form.get('code') !== 'ma-tu-google') return json({ error: 'invalid_grant' }, 400);
      return json({
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        expires_in: 3600,
        scope: google.grantedScope,
      });
    }
    if (google.refreshError) return json({ error: google.refreshError }, 400);
    return json({ access_token: 'access-2', expires_in: 3600 });
  }
  if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
    return json({ email: 'anhtuan@gmail.com', email_verified: true });
  }
  if (url === 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send') {
    if (google.sendStatus !== 200) {
      return json({ error: { message: 'Gmail API has not been used in project 123' } }, 403);
    }
    return json({ id: 'msg-1' });
  }
  if (url === 'https://oauth2.googleapis.com/revoke') return new Response('', { status: 200 });
  return json({ error: 'unexpected' }, 404);
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

async function signInAdmin() {
  cookie = '';
  const res = await call('POST', '/api/auth/login', {
    username: 'admin@congty.vn',
    password: 'admin-password-1',
  });
  assert.equal(res.status, 200);
}

async function startLogin(): Promise<string> {
  const start = await call('GET', '/api/email/oauth/google/start');
  assert.equal(start.status, 302);
  const url = new URL(start.location);
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  return url.searchParams.get('state') ?? '';
}

/* ---------- Test ---------- */

test('chua nhap Client ID / Secret thi nut dang nhap quay ve man Cai dat kem loi', async () => {
  await signInAdmin();
  const start = await call('GET', '/api/email/oauth/google/start');
  assert.equal(start.status, 302);
  const back = new URL(start.location);
  assert.equal(back.pathname, '/settings');
  assert.equal(back.searchParams.get('tab'), 'email');
  assert.match(back.searchParams.get('google_error') ?? '', /Client ID/);
});

test('Dia chi web cua CRM khong nhan dia chi hop thu', async () => {
  await signInAdmin();
  const res = await call('PUT', '/api/email/config', { app_base_url: 'https://mail.google.com/' });
  assert.equal(res.status, 400);
  assert.match(String(res.data.error), /địa chỉ hộp thư/);

  const ok = await call('PUT', '/api/email/config', { app_base_url: 'https://crm.congty.vn/' });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.app_base_url, 'https://crm.congty.vn');
  assert.equal(
    ok.data.google_redirect_uri,
    'https://crm.congty.vn/api/email/oauth/google/callback'
  );
});

test('trang dong y cua Google xin dung quyen gui thu, khong xin doc hop thu', async () => {
  await signInAdmin();
  const saved = await call('PUT', '/api/email/config', {
    auth_type: 'google',
    google_client_id: 'client-123.apps.googleusercontent.com',
    google_client_secret: 'bi-mat',
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.has_google_client_secret, true);
  assert.equal(JSON.stringify(saved.data).includes('bi-mat'), false, 'secret khong di ra ngoai');

  const start = await call('GET', '/api/email/oauth/google/start');
  const url = new URL(start.location);
  const scopes = (url.searchParams.get('scope') ?? '').split(' ');
  assert.ok(scopes.includes(GMAIL_SEND_SCOPE));
  assert.equal(scopes.includes('https://mail.google.com/'), false);
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(
    url.searchParams.get('redirect_uri'),
    'https://crm.congty.vn/api/email/oauth/google/callback'
  );
});

test('state sai hoac dung lai thi khong ket noi', async () => {
  await signInAdmin();
  await startLogin();
  const forged = await call(
    'GET',
    '/api/email/oauth/google/callback?code=ma-tu-google&state=gia-mao'
  );
  assert.match(new URL(forged.location).searchParams.get('google_error') ?? '', /không hợp lệ/);

  /* state dung, nhung chi dung duoc mot lan. */
  const state = await startLogin();
  await call('GET', `/api/email/oauth/google/callback?code=sai&state=${state}`);
  const replay = await call(
    'GET',
    `/api/email/oauth/google/callback?code=ma-tu-google&state=${state}`
  );
  assert.match(new URL(replay.location).searchParams.get('google_error') ?? '', /không hợp lệ/);

  const config = await call('GET', '/api/email/config');
  assert.equal(config.data.google_account, '');
});

test('bo tick quyen gui thu o man dong y thi bao ngay', async () => {
  await signInAdmin();
  google.grantedScope = 'openid email';
  try {
    const state = await startLogin();
    const res = await call(
      'GET',
      `/api/email/oauth/google/callback?code=ma-tu-google&state=${state}`
    );
    assert.match(new URL(res.location).searchParams.get('google_error') ?? '', /Gửi email/);
  } finally {
    google.grantedScope = `openid email ${GMAIL_SEND_SCOPE}`;
  }
});

test('huy o trang Google thi quay ve voi thong bao de hieu', async () => {
  await signInAdmin();
  const state = await startLogin();
  const res = await call(
    'GET',
    `/api/email/oauth/google/callback?error=access_denied&state=${state}`
  );
  assert.match(new URL(res.location).searchParams.get('google_error') ?? '', /huỷ/);
});

test('dang nhap thanh cong: luu tai khoan, thu di qua Gmail API', async () => {
  await signInAdmin();
  const state = await startLogin();
  const res = await call(
    'GET',
    `/api/email/oauth/google/callback?code=ma-tu-google&state=${state}`
  );
  assert.equal(new URL(res.location).searchParams.get('google'), 'connected');

  const config = await call('GET', '/api/email/config');
  assert.equal(config.data.google_account, 'anhtuan@gmail.com');
  assert.equal(config.data.from_email, 'anhtuan@gmail.com');
  assert.equal(config.data.auth_type, 'google');
  assert.equal(config.data.ready, true);
  assert.equal(JSON.stringify(config.data).includes('refresh-1'), false);

  google.calls = [];
  const { delivered } = await sendMail(db, {
    to: 'nhanvien@congty.vn',
    subject: 'Mời tham gia WorkFlow',
    text: 'Xin chào',
  });
  assert.equal(delivered, true);
  const send = google.calls.find((c) => c.url.endsWith('/messages/send'));
  assert.ok(send);
  assert.match(send.auth ?? '', /^Bearer access-/);
  const raw = Buffer.from((JSON.parse(send.body) as { raw: string }).raw, 'base64url').toString();
  assert.match(raw, /^To: nhanvien@congty\.vn$/m);
  assert.match(raw, /^From: .*anhtuan@gmail\.com/m);
  assert.match(raw, /Xin chào|Xin ch=C3=A0o/);
});

test('token bi thu hoi thi Kiem tra ket noi noi ro phai dang nhap lai', async () => {
  await signInAdmin();
  google.refreshError = 'invalid_grant';
  try {
    const res = await call('POST', '/api/email/test', {});
    assert.equal(res.status, 502);
    assert.match(String(res.data.error), /đăng nhập Google lại/);
  } finally {
    google.refreshError = null;
  }
  const ok = await call('POST', '/api/email/test', {});
  assert.equal(ok.status, 200);
});

test('Gmail API chua bat thi bao cach sua', async () => {
  forgetGoogleAccessToken();
  google.sendStatus = 403;
  try {
    await assert.rejects(
      sendMail(db, { to: 'a@congty.vn', subject: 'x', text: 'x' }),
      /bật "Gmail API"/
    );
  } finally {
    google.sendStatus = 200;
  }
});

test('ngat ket noi xoa token va thu hoi phia Google', async () => {
  await signInAdmin();
  google.calls = [];
  const res = await call('POST', '/api/email/oauth/google/disconnect', {});
  assert.equal(res.status, 200);
  assert.equal(res.data.google_account, '');
  assert.equal(res.data.ready, false);
  assert.ok(google.calls.some((c) => c.url === 'https://oauth2.googleapis.com/revoke'));
});

test('doi Client ID thi ket noi cu bi ngat', async () => {
  await signInAdmin();
  const state = await startLogin();
  await call('GET', `/api/email/oauth/google/callback?code=ma-tu-google&state=${state}`);
  assert.equal((await call('GET', '/api/email/config')).data.google_account, 'anhtuan@gmail.com');

  const res = await call('PUT', '/api/email/config', { google_client_id: 'client-moi' });
  assert.equal(res.data.google_account, '');
});
