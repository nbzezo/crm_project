import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * Bang tin 1.35.0 (v70): Telegram rieng cua tung nguoi, trao doi noi bo theo khach
 * hang / co hoi, bai nhap - hen gio dang - mau bai. Cung bo du lieu voi feed.test.ts.
 *
 * Bang tin nhom (v68).
 *
 * Tap trung vao ranh gioi du lieu: ai thuoc nhom nao (tu so do to chuc / du an),
 * tep CA NHAN chia se qua bai chi mo duoc qua bai va thu hoi duoc, tep / ban ghi
 * CRM gan vao bai van theo quyen cua chinh no, nhom kin, duyet bai.
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-feed-v70-'));
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
const { updateTelegramConfig } = await import('../services/telegram/telegramService.ts');
const { runDueTelegramChecks } = await import('../services/telegram/telegramNotifier.ts');
const { publishDueScheduledPosts } = await import('../services/feedPublish.ts');

/* ---------- Telegram gia: ghi lai moi tin gui di, tra lenh /start khi duoc yeu cau ---------- */
const realFetch = globalThis.fetch;
const telegram = {
  sent: [] as { chat_id: string; text: string }[],
  updates: [] as unknown[],
};
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes('api.telegram.org')) return realFetch(input, init);
  const json = (data: unknown) =>
    new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  if (url.includes('/getMe')) return json({ ok: true, result: { username: 'workflow_test_bot' } });
  if (url.includes('/getUpdates')) {
    const result = telegram.updates;
    telegram.updates = [];
    return json({ ok: true, result });
  }
  if (url.includes('/sendMessage')) {
    const body = JSON.parse(String(init?.body)) as { chat_id: string | number; text: string };
    telegram.sent.push({ chat_id: String(body.chat_id), text: body.text });
    return json({ ok: true, result: {} });
  }
  return json({ ok: false, description: 'unexpected' });
}) as typeof fetch;

await ensureAdminUser();

let server: Server;
let baseUrl = '';
let cookie = '';

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
  globalThis.fetch = realFetch;
  closeDatabase();
  if (fixtureRoot.startsWith(os.tmpdir())) fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

/** Doi cac lenh gui Telegram chay nen (fire-and-forget) xong. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

async function call(method: string, pathname: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.getSetCookie();
  if (setCookie.length > 0) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  const text = await res.text();
  let data: Json = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function signIn(login: string) {
  cookie = '';
  const password = login === 'admin@congty.vn' ? 'admin-password-1' : `${login}-password`;
  const res = await call('POST', '/api/auth/login', { username: login, password });
  assert.equal(res.status, 200, `dang nhap ${login}`);
}

/* ---------- Du lieu: Cong ty > Khoi KD > (Phong IT, Phong KD); ba nhan vien ---------- */

const ownOrg = Number(
  db
    .prepare(
      `INSERT INTO customers (name, org_kind, search_text) VALUES ('Công ty mình', 'own', '')`
    )
    .run().lastInsertRowid
);
const rootUnit = (
  db.prepare(`SELECT id FROM org_units WHERE parent_id IS NULL`).get() as { id: number }
).id;
const unit = (name: string, parent: number) =>
  Number(
    db
      .prepare(`INSERT INTO org_units (parent_id, name, position) VALUES (?, ?, 1)`)
      .run(parent, name).lastInsertRowid
  );
const itUnit = unit('Phòng IT', rootUnit);
const salesUnit = unit('Phòng Kinh doanh', rootUnit);

const contact = (name: string, unitId: number) =>
  Number(
    db
      .prepare(
        `INSERT INTO contacts (customer_id, full_name, org_unit_id, is_active) VALUES (?, ?, ?, 1)`
      )
      .run(ownOrg, name, unitId).lastInsertRowid
  );
const staffPosition = (
  db.prepare(`SELECT id FROM positions WHERE code = 'staff'`).get() as { id: number }
).id;

async function staff(login: string, name: string, unitId: number) {
  const contactId = contact(name, unitId);
  const userId = await createUser({
    username: login,
    email: `${login}@congty.vn`,
    password: `${login}@congty.vn-password`,
    contactId,
  });
  db.prepare(`INSERT INTO user_positions (user_id, position_id, is_primary) VALUES (?, ?, 1)`).run(
    userId,
    staffPosition
  );
  return contactId;
}

const an = await staff('an', 'Nguyễn Văn An', itUnit);
const binh = await staff('binh', 'Trần Thị Bình', itUnit);
await staff('chi', 'Lê Minh Chi', salesUnit);
const adminContact = contact('Quản trị', rootUnit);
db.prepare(`UPDATE users SET contact_id = ? WHERE email = 'admin@congty.vn'`).run(adminContact);

const AN = 'an@congty.vn';
const BINH = 'binh@congty.vn';
const CHI = 'chi@congty.vn';
const ADMIN = 'admin@congty.vn';

async function groupIdOf(kind: string, name?: string): Promise<number> {
  const nav = await call('GET', '/api/feed/nav');
  assert.equal(nav.status, 200);
  const found = nav.data.groups.find(
    (g: Json) => g.kind === kind && (name === undefined || g.name === name)
  );
  assert.ok(found, `khong thay nhom ${kind} ${name ?? ''}`);
  return found.id;
}

/* ---------- Test ---------- */

test('Telegram rieng: tu noi bang /start, chi nhan thong bao cua chinh minh', async () => {
  updateTelegramConfig(db, { enabled: true, botToken: '123:ABC', chatId: '' });

  await signIn(BINH);
  const before = await call('GET', '/api/me/telegram');
  assert.equal(before.data.bot_ready, true);
  assert.equal(before.data.linked, false);
  const link = await call('POST', '/api/me/telegram/link');
  assert.equal(link.status, 200);
  const url = link.data.pending_link.url as string;
  assert.match(url, /^https:\/\/t\.me\/workflow_test_bot\?start=/);
  const code = url.split('start=')[1];

  /* Ma sai bi bo qua; ma dung gan chat 777 vao tai khoan Binh. */
  telegram.updates = [
    {
      update_id: 10,
      message: { text: '/start saima1234', chat: { id: 666 }, from: { username: 'ke_gian' } },
    },
    {
      update_id: 11,
      message: { text: `/start ${code}`, chat: { id: 777 }, from: { username: 'binh_tg' } },
    },
  ];
  const linked = await call('GET', '/api/me/telegram');
  assert.equal(linked.data.linked, true);
  assert.equal(linked.data.tg_name, '@binh_tg');
  assert.equal(linked.data.pending_link, null);
  assert.ok(telegram.sent.some((m) => m.chat_id === '777' && /Đã kết nối/.test(m.text)));
  assert.ok(!telegram.sent.some((m) => m.chat_id === '666'));

  /* Ma da dung khong dung lai duoc. */
  telegram.updates = [
    {
      update_id: 12,
      message: { text: `/start ${code}`, chat: { id: 999 }, from: { username: 'x' } },
    },
  ];
  await call('POST', '/api/me/telegram/link'); // tao ma moi de bo nghe chay
  await call('GET', '/api/me/telegram');
  assert.equal((await call('GET', '/api/me/telegram')).data.tg_name, '@binh_tg');

  /* An nhac ten Binh => tin den chat 777; Chi (chua noi) khong co gi. */
  await signIn(AN);
  const it = await groupIdOf('unit', 'Phòng IT');
  telegram.sent = [];
  await call('POST', '/api/feed/posts', {
    group_id: it,
    body: 'Nhờ chị Bình',
    mention_ids: [binh],
  });
  await flush();
  assert.equal(telegram.sent.length, 1);
  assert.equal(telegram.sent[0].chat_id, '777');
  assert.match(telegram.sent[0].text, /nhắc đến bạn/);

  /* Viec den han giao cho Binh => chat 777; viec cua An thi khong. */
  const board = await call('POST', '/api/boards', { name: 'Việc' });
  const list = db.prepare(`SELECT id FROM lists WHERE board_id = ? LIMIT 1`).get(board.data.id) as {
    id: number;
  };
  db.prepare(
    `INSERT INTO cards (list_id, title, position, assignee_contact_id, due_date, search_text)
     VALUES (?, 'Việc của Bình', 1, ?, date('now','localtime'), ''), (?, 'Việc của An', 2, ?, date('now','localtime'), '')`
  ).run(list.id, binh, list.id, an);
  telegram.sent = [];
  await runDueTelegramChecks(db);
  assert.deepEqual(
    telegram.sent.map((m) => [m.chat_id, m.text.split('\n')[0]]),
    [['777', '⏰ Việc đến hạn: Việc của Bình']]
  );
  /* Chay lai khong gui trung. */
  await runDueTelegramChecks(db);
  assert.equal(telegram.sent.length, 1);

  /* Tat "Bang tin" thi khong nhan nhac ten nua; go ket noi thi het. */
  await signIn(BINH);
  await call('PUT', '/api/me/telegram', { notify_feed: false });
  await signIn(AN);
  telegram.sent = [];
  await call('POST', '/api/feed/posts', { group_id: it, body: 'Lần nữa', mention_ids: [binh] });
  await flush();
  assert.equal(telegram.sent.length, 0);
  await signIn(BINH);
  const off = await call('DELETE', '/api/me/telegram');
  assert.equal(off.data.linked, false);
});

test('Trao doi noi bo: bai gan khach hang / co hoi, chi nguoi thay ban ghi moi xem', async () => {
  await signIn(AN);
  const it = await groupIdOf('unit', 'Phòng IT');
  const customer = await call('POST', '/api/customers', { name: 'Khách Alpha' });
  const deal = await call('POST', '/api/deals', {
    customer_id: customer.data.id,
    title: 'Gói Alpha',
  });
  assert.equal(deal.status, 201);
  await call('POST', '/api/feed/posts', {
    group_id: it,
    body: 'Khách Alpha hỏi giá',
    links: [{ entity_type: 'customer', entity_id: customer.data.id }],
  });
  await call('POST', '/api/feed/posts', {
    group_id: it,
    body: 'Deal Alpha sắp chốt',
    links: [{ entity_type: 'deal', entity_id: deal.data.id }],
  });
  const onlyCustomer = await call(
    'GET',
    `/api/feed/posts?link_type=customer&link_id=${customer.data.id}`
  );
  assert.equal(onlyCustomer.data.items.length, 1);
  const withDeals = await call(
    'GET',
    `/api/feed/posts?link_type=customer&link_id=${customer.data.id}&include_related=1`
  );
  assert.equal(withDeals.data.items.length, 2);
  const byDeal = await call('GET', `/api/feed/posts?link_type=deal&link_id=${deal.data.id}`);
  assert.equal(byDeal.data.items.length, 1);

  /* Binh khong thay khach cua An => 404, khong do duoc. */
  await signIn(BINH);
  assert.equal(
    (await call('GET', `/api/feed/posts?link_type=customer&link_id=${customer.data.id}`)).status,
    404
  );
});

test('Bai nhap: chi tac gia thay, dang ngay thi hien voi nhom va bao thong bao', async () => {
  await signIn(AN);
  const it = await groupIdOf('unit', 'Phòng IT');
  const draft = await call('POST', '/api/feed/posts', {
    group_id: it,
    body: 'Bản nháp báo cáo',
    mode: 'draft',
  });
  assert.equal(draft.data.status, 'draft');
  assert.ok(
    !(await call('GET', `/api/feed/posts?group_id=${it}`)).data.items.some(
      (p: Json) => p.id === draft.data.id
    )
  );
  assert.equal(
    (await call('GET', '/api/feed/posts?filter=drafts')).data.items[0].id,
    draft.data.id
  );
  assert.equal(
    (await call('PUT', `/api/feed/posts/${draft.data.id}/reaction`, { reaction: 'like' })).status,
    409
  );

  for (const login of [BINH, ADMIN]) {
    await signIn(login);
    assert.equal((await call('GET', `/api/feed/posts/${draft.data.id}`)).status, 404, login);
    assert.ok(
      !(await call('GET', `/api/feed/posts?group_id=${it}`)).data.items.some(
        (p: Json) => p.id === draft.data.id
      )
    );
  }

  await signIn(AN);
  const published = await call('POST', `/api/feed/posts/${draft.data.id}/publish`);
  assert.equal(published.data.status, 'published');
  await signIn(BINH);
  assert.equal((await call('GET', `/api/feed/posts/${draft.data.id}`)).status, 200);
  const bell = (await call('GET', '/api/notifications')).data.items as Json[];
  assert.ok(bell.some((i) => i.link === `/feed/posts/${draft.data.id}`));
});

test('Hen gio dang: phai o tuong lai, toi gio thi tu dang; nhom duyet bai thi vao hang cho', async () => {
  await signIn(AN);
  const it = await groupIdOf('unit', 'Phòng IT');
  assert.equal(
    (
      await call('POST', '/api/feed/posts', {
        group_id: it,
        body: 'x',
        mode: 'schedule',
        publish_at: '2000-01-01T08:00',
      })
    ).status,
    422
  );
  const scheduled = await call('POST', '/api/feed/posts', {
    group_id: it,
    body: 'Báo cáo tuần — hẹn giờ',
    mode: 'schedule',
    publish_at: '2099-01-05T08:00',
  });
  assert.equal(scheduled.data.status, 'scheduled');
  assert.equal(scheduled.data.publish_at, '2099-01-05T08:00');
  assert.equal(publishDueScheduledPosts(), 0, 'chua toi gio');

  /* Doi ve nhap roi hen lai; gia lap toi gio. */
  const back = await call('POST', `/api/feed/posts/${scheduled.data.id}/schedule`, {
    publish_at: null,
  });
  assert.equal(back.data.status, 'draft');
  await call('POST', `/api/feed/posts/${scheduled.data.id}/schedule`, {
    publish_at: '2099-01-05T08:00',
  });
  db.prepare(`UPDATE feed_posts SET publish_at = '2000-01-01T08:00' WHERE id = ?`).run(
    scheduled.data.id
  );
  assert.equal(publishDueScheduledPosts(), 1);
  const row = db
    .prepare(`SELECT status, publish_at, created_at FROM feed_posts WHERE id = ?`)
    .get(scheduled.data.id) as {
    status: string;
    publish_at: string | null;
    created_at: string;
  };
  assert.equal(row.status, 'published');
  assert.equal(row.publish_at, null);
  assert.ok(row.created_at > '2026-01-01');

  /* Nhom bat duyet bai: bai hen gio cua thanh vien thuong vao hang cho duyet. */
  await signIn(CHI);
  const group = await call('POST', '/api/feed/groups', {
    name: 'Nhóm duyệt hẹn giờ',
    visibility: 'public',
    require_approval: true,
  });
  await signIn(BINH);
  await call('POST', `/api/feed/groups/${group.data.id}/join`);
  const later = await call('POST', '/api/feed/posts', {
    group_id: group.data.id,
    body: 'Đăng sau',
    mode: 'schedule',
    publish_at: '2099-01-05T08:00',
  });
  db.prepare(`UPDATE feed_posts SET publish_at = '2000-01-01T08:00' WHERE id = ?`).run(
    later.data.id
  );
  publishDueScheduledPosts();
  assert.equal(
    (
      db.prepare(`SELECT status FROM feed_posts WHERE id = ?`).get(later.data.id) as {
        status: string;
      }
    ).status,
    'pending'
  );
});

test('Mau bai: mau rieng va mau dung chung cua nhom (chi quan tri luu)', async () => {
  await signIn(AN);
  const it = await groupIdOf('unit', 'Phòng IT');
  const mine = await call('POST', '/api/feed/templates', {
    name: 'Báo cáo tuần của tôi',
    body: 'Tuần này:\n- ',
  });
  assert.equal(mine.status, 201);

  await signIn(BINH);
  assert.equal(
    (await call('POST', '/api/feed/templates', { name: 'Mẫu nhóm', body: 'x', group_id: it }))
      .status,
    403
  );
  assert.equal(
    (await call('GET', '/api/feed/templates')).data.length,
    0,
    'khong thay mau rieng cua An'
  );
  assert.equal((await call('DELETE', `/api/feed/templates/${mine.data.id}`)).status, 404);

  await signIn(ADMIN);
  const shared = await call('POST', '/api/feed/templates', {
    name: 'Biên bản họp phòng',
    kind: 'post',
    body: 'Thành phần:\nNội dung:\nViệc cần làm:',
    group_id: it,
  });
  assert.equal(shared.status, 201);

  await signIn(BINH);
  const list = await call('GET', `/api/feed/templates?group_id=${it}`);
  const found = list.data.find((t: Json) => t.id === shared.data.id);
  assert.equal(found.scope, 'group');
  assert.equal(found.can_edit, false);
});
