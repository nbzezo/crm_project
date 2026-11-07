import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * GET /api/reminders/due — nguon cua popup nhac giua man hinh (1.15.0).
 * Chi nhac cua chinh minh (hoac chua co chu), da toi gio, chua xong, lui toi da mot ngay.
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-due-reminders-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';
process.env.WORKFLOW_SESSION_SECRET = 'test-secret-value-at-least-32-characters-long';
process.env.WORKFLOW_ADMIN_USER = 'admin';
process.env.WORKFLOW_ADMIN_PASSWORD = 'admin-password-1';
process.env.WORKFLOW_ADMIN_EMAIL = 'admin@congty.vn';

const { createApp } = await import('../app.ts');
const { db, closeDatabase } = await import('../db/connection.ts');
const { ensureAdminUser } = await import('../services/auth/bootstrapAdmin.ts');

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
  const login = await call('POST', '/api/auth/login', {
    username: 'admin@congty.vn',
    password: 'admin-password-1',
  });
  assert.equal(login.status, 200);
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  closeDatabase();
  if (fixtureRoot.startsWith(os.tmpdir())) fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

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
  return { status: res.status, data: text ? (JSON.parse(text) as unknown) : {} };
}

function localAt(modifier: string): string {
  return (
    db.prepare(`SELECT strftime('%Y-%m-%dT%H:%M', 'now', 'localtime', ?) AS v`).get(modifier) as {
      v: string;
    }
  ).v;
}

test('chi tra nhac da toi gio, chua xong, cua minh, trong mot ngay qua', async () => {
  const create = async (title: string, due_at: string, extra: Record<string, unknown> = {}) => {
    const res = await call('POST', '/api/reminders', { title, due_at, ...extra });
    assert.equal(res.status, 201);
    return Number((res.data as { id: number }).id);
  };

  const list = Number(
    db
      .prepare(`INSERT INTO lists (board_id, name, position) VALUES (?, 'Việc', 1)`)
      .run(db.prepare(`INSERT INTO boards (name) VALUES ('Bảng nhắc')`).run().lastInsertRowid)
      .lastInsertRowid
  );
  const cardId = Number(
    db
      .prepare(`INSERT INTO cards (list_id, title, position) VALUES (?, 'Gọi anh Nam', 1)`)
      .run(list).lastInsertRowid
  );

  const due = await create('Đã tới giờ', localAt('-5 minutes'), { card_id: cardId });
  await create('Chưa tới giờ', localAt('+30 minutes'));
  await create('Quá cũ', localAt('-2 days'));
  const done = await create('Đã xong', localAt('-10 minutes'));
  assert.equal((await call('PATCH', `/api/reminders/${done}`, { is_done: true })).status, 200);

  const other = await create('Của người khác', localAt('-3 minutes'));
  const otherContact = Number(
    db
      .prepare(
        `INSERT INTO contacts (customer_id, full_name, is_active) VALUES (?, 'Người khác', 1)`
      )
      .run(db.prepare(`INSERT INTO customers (name) VALUES ('Công ty khác')`).run().lastInsertRowid)
      .lastInsertRowid
  );
  db.prepare(`UPDATE reminders SET owner_contact_id = ? WHERE id = ?`).run(otherContact, other);

  const legacy = await create('Chưa có chủ', localAt('-1 minutes'));
  db.prepare(`UPDATE reminders SET owner_contact_id = NULL WHERE id = ?`).run(legacy);

  const res = await call('GET', '/api/reminders/due');
  assert.equal(res.status, 200);
  const rows = res.data as { id: number; title: string; card_title: string | null }[];
  assert.deepEqual(
    rows.map((r) => r.title),
    ['Đã tới giờ', 'Chưa có chủ']
  );
  assert.equal(rows.find((r) => r.id === due)?.card_title, 'Gọi anh Nam');

  // Viec da hoan thanh: nhac cua no thoi bat len.
  db.prepare(`UPDATE cards SET is_done = 1 WHERE id = ?`).run(cardId);
  const afterDone = (await call('GET', '/api/reminders/due')).data as { id: number }[];
  assert.deepEqual(
    afterDone.map((r) => r.id),
    [legacy]
  );
  db.prepare(`UPDATE cards SET is_done = 0 WHERE id = ?`).run(cardId);

  // Hoan = doi gio: nhac roi khoi danh sach cho toi gio moi.
  await call('PATCH', `/api/reminders/${due}`, { due_at: localAt('+10 minutes') });
  const after = (await call('GET', '/api/reminders/due')).data as { id: number }[];
  assert.deepEqual(
    after.map((r) => r.id),
    [legacy]
  );
});

test('so voi gio trinh duyet khi may chu lech mui gio (container UTC)', async () => {
  // Trinh duyet o Viet Nam di truoc may chu UTC 7 tieng.
  const clientNow = localAt('+7 hours');
  const res = await call('POST', '/api/reminders', {
    title: 'Nhắc theo giờ trình duyệt',
    due_at: localAt('+3 hours'),
  });
  assert.equal(res.status, 201);
  const id = Number((res.data as { id: number }).id);

  const serverClock = (await call('GET', '/api/reminders/due')).data as { id: number }[];
  assert.ok(!serverClock.some((r) => r.id === id), 'theo gio may chu thi chua toi gio');

  const browserClock = (
    await call('GET', `/api/reminders/due?now=${encodeURIComponent(clientNow)}`)
  ).data as { id: number }[];
  assert.ok(
    browserClock.some((r) => r.id === id),
    'theo gio trinh duyet thi da toi gio'
  );

  // `now` sai dinh dang thi bo qua, dung gio may chu.
  const bad = (await call('GET', '/api/reminders/due?now=abc')).data as { id: number }[];
  assert.ok(!bad.some((r) => r.id === id));
});

/* 1.42.0: popup gom ca nhac cua su kien lich va cua Ghi chu nhanh. */
/** Tai khoan admin cua test chua gan nhan su — gan mot lan (trang thai popup luu theo nguoi). */
let linkedContact: number | null = null;
function myContactId(): number {
  if (linkedContact !== null) return linkedContact;
  const ownOrg = Number(
    db.prepare(`INSERT INTO customers (name, org_kind) VALUES ('Công ty mình', 'own')`).run()
      .lastInsertRowid
  );
  linkedContact = Number(
    db
      .prepare(`INSERT INTO contacts (customer_id, full_name, is_active) VALUES (?, 'Admin', 1)`)
      .run(ownOrg).lastInsertRowid
  );
  db.prepare(`UPDATE users SET contact_id = ? WHERE email = 'admin@congty.vn'`).run(linkedContact);
  return linkedContact;
}

type DueItem = { source: string; id: number; title: string; due_at: string };
const dueItems = async (now?: string) =>
  (await call('GET', `/api/reminders/due${now ? `?now=${encodeURIComponent(now)}` : ''}`))
    .data as DueItem[];
const has = (rows: DueItem[], source: string, id: number) =>
  rows.some((r) => r.source === source && r.id === id);

test('nhac cua su kien lich: hien khi toi moc, tat / hoan theo tung moc', async () => {
  const me = myContactId();
  const event = (startInMinutes: number, owner: number | null) =>
    Number(
      db
        .prepare(
          `INSERT INTO calendar_events (title, start_at, end_at, reminder_minutes, owner_contact_id)
           VALUES ('Họp khách', ?, ?, 15, ?)`
        )
        .run(localAt(`${startInMinutes} minutes`), localAt(`${startInMinutes + 60} minutes`), owner)
        .lastInsertRowid
    );
  const mine = event(10, me); // moc nhac = -5 phut
  const later = event(40, me); // moc nhac = +25 phut
  const otherOwner = Number(
    db
      .prepare(`INSERT INTO contacts (customer_id, full_name, is_active) VALUES (?, 'Người B', 1)`)
      .run(db.prepare(`INSERT INTO customers (name) VALUES ('Công ty B')`).run().lastInsertRowid)
      .lastInsertRowid
  );
  const others = event(10, otherOwner);

  let rows = await dueItems();
  assert.ok(has(rows, 'event', mine), 'su kien cua minh da toi moc');
  assert.ok(!has(rows, 'event', later), 'chua toi moc');
  assert.ok(!has(rows, 'event', others), 'su kien cua nguoi khac');
  assert.equal(
    rows.find((r) => r.source === 'event' && r.id === mine)?.due_at,
    localAt('-5 minutes')
  );

  // Hoan: roi khoi popup cho toi gio hoan, roi bat lai voi due_at = gio hoan.
  const until = localAt('+20 minutes');
  assert.equal(
    (await call('POST', `/api/reminders/due/event-${mine}`, { action: 'snooze', until })).status,
    200
  );
  assert.ok(!has(await dueItems(), 'event', mine));
  const atSnooze = (await dueItems(localAt('+21 minutes'))).find(
    (r) => r.source === 'event' && r.id === mine
  );
  assert.equal(atSnooze?.due_at, until);

  // Tat: het nhac cho moc nay.
  assert.equal(
    (await call('POST', `/api/reminders/due/event-${mine}`, { action: 'dismiss' })).status,
    200
  );
  assert.ok(!has(await dueItems(localAt('+21 minutes')), 'event', mine));

  // Doi gio su kien = moc nhac moi: bat lai.
  db.prepare(`UPDATE calendar_events SET start_at = ?, end_at = ? WHERE id = ?`).run(
    localAt('+5 minutes'),
    localAt('+65 minutes'),
    mine
  );
  rows = await dueItems();
  assert.ok(has(rows, 'event', mine), 'doi gio thi nhac bat lai');

  // Khong thao tac duoc tren su kien cua nguoi khac.
  assert.equal(
    (await call('POST', `/api/reminders/due/event-${others}`, { action: 'dismiss' })).status,
    404
  );
  db.prepare(`DELETE FROM calendar_events WHERE id IN (?, ?, ?)`).run(mine, later, others);
});

test('nhac cua Ghi chu nhanh: hien ca khi Telegram da bao, tat / hoan ghi vao chinh ghi chu', async () => {
  const me = myContactId();
  const note = (title: string, at: string, status: string, owner = me) =>
    Number(
      db
        .prepare(
          `INSERT INTO quick_notes (title, content_text, reminder_at, reminder_status, owner_contact_id)
           VALUES (?, 'Nội dung', ?, ?, ?)`
        )
        .run(title, at, status, owner).lastInsertRowid
    );
  const triggered = note('Gọi lại chị Lan', localAt('-2 minutes'), 'triggered');
  const pending = note('', localAt('-1 minutes'), 'pending');
  const completed = note('Đã xong', localAt('-3 minutes'), 'completed');
  const future = note('Chưa tới', localAt('+30 minutes'), 'pending');

  const rows = await dueItems();
  assert.ok(has(rows, 'quick_note', triggered));
  assert.equal(
    rows.find((r) => r.source === 'quick_note' && r.id === pending)?.title,
    'Ghi chú không tiêu đề'
  );
  assert.ok(!has(rows, 'quick_note', completed));
  assert.ok(!has(rows, 'quick_note', future));

  await call('POST', `/api/reminders/due/quick_note-${triggered}`, { action: 'dismiss' });
  const until = localAt('+15 minutes');
  await call('POST', `/api/reminders/due/quick_note-${pending}`, { action: 'snooze', until });
  const state = db
    .prepare(
      `SELECT id, reminder_at, reminder_status FROM quick_notes WHERE id IN (?, ?) ORDER BY id`
    )
    .all(triggered, pending);
  assert.deepEqual(state, [
    { id: triggered, reminder_at: localAt('-2 minutes'), reminder_status: 'completed' },
    { id: pending, reminder_at: until, reminder_status: 'pending' },
  ]);
  const after = await dueItems();
  assert.ok(!has(after, 'quick_note', triggered) && !has(after, 'quick_note', pending));

  assert.equal(
    (await call('POST', `/api/reminders/due/quick_note-999999`, { action: 'dismiss' })).status,
    404
  );
  assert.equal((await call('POST', `/api/reminders/due/abc-1`, { action: 'dismiss' })).status, 400);
});

test('POST /due/reminder-<id> thay cho PATCH: tat va hoan nhac hen', async () => {
  const created = await call('POST', '/api/reminders', {
    title: 'Nhắc qua khóa chung',
    due_at: localAt('-1 minutes'),
  });
  const id = Number((created.data as { id: number }).id);
  assert.ok(has(await dueItems(), 'reminder', id));
  await call('POST', `/api/reminders/due/reminder-${id}`, {
    action: 'snooze',
    until: localAt('+10 minutes'),
  });
  assert.ok(!has(await dueItems(), 'reminder', id));
  await call('POST', `/api/reminders/due/reminder-${id}`, { action: 'dismiss' });
  assert.equal(
    (db.prepare(`SELECT is_done FROM reminders WHERE id = ?`).get(id) as { is_done: number })
      .is_done,
    1
  );
});
