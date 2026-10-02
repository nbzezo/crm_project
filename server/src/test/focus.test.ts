import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * Man hinh Trong tam: gom dung viec cua dung nguoi trong dung ky.
 *
 * Goi thang service (khong qua HTTP) de co dinh "hom nay" — cac nhom "ton tu
 * truoc", "qua tai", "khung gio trong" deu phu thuoc vao ngay hien tai.
 *
 * Hai nguoi: A (toi) va B (dong nghiep). Ky xem: tuan 05–11/10/2026, hom nay
 * la thu Tu 07/10.
 */

process.env.WORKFLOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-focus-'));
process.env.WORKFLOW_DB_PATH = ':memory:';

const { db } = await import('../db/connection.ts');
const { migrate } = await import('../db/migrate.ts');
const { buildFocus, ownerScope, previousRange, weekStart } =
  await import('../services/focusService.ts');
const { buildDigestText, digestRange, dueDigests } =
  await import('../services/telegram/focusDigest.ts');
type FocusScope = import('../services/focusService.ts').FocusScope;

migrate(db);

const TODAY = '2026-10-07';
const NOW = '09:00';
const FROM = '2026-10-05';
const TO = '2026-10-11';

const ownOrg = Number(
  db.prepare(`INSERT INTO customers (name, org_kind) VALUES ('Công ty tôi', 'own')`).run()
    .lastInsertRowid
);
const contact = (name: string) =>
  Number(
    db
      .prepare(`INSERT INTO contacts (customer_id, full_name, is_active) VALUES (?, ?, 1)`)
      .run(ownOrg, name).lastInsertRowid
  );
const A = contact('An');
const B = contact('Bình');

const customer = (name: string, owner: number) =>
  Number(
    db
      .prepare(`INSERT INTO customers (name, org_kind, owner_contact_id) VALUES (?, 'customer', ?)`)
      .run(name, owner).lastInsertRowid
  );
const custA = customer('Khách A', A);
const custB = customer('Khách B', B);

function boardWithList(name: string, owner: number): number {
  const board = Number(
    db.prepare(`INSERT INTO boards (name, owner_contact_id) VALUES (?, ?)`).run(name, owner)
      .lastInsertRowid
  );
  return Number(
    db.prepare(`INSERT INTO lists (board_id, name, position) VALUES (?, 'Việc', 1)`).run(board)
      .lastInsertRowid
  );
}
const listA = boardWithList('Bảng của An', A);
const listB = boardWithList('Bảng của Bình', B);

function card(
  title: string,
  list: number,
  due: string,
  assignee: number | null,
  creator: number | null,
  extra: { done?: string; estimate?: number } = {}
): number {
  return Number(
    db
      .prepare(
        `INSERT INTO cards (list_id, title, position, due_date, assignee_contact_id, creator_contact_id,
                            is_done, completed_at, estimate_hours)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        list,
        title,
        due,
        assignee,
        creator,
        extra.done ? 1 : 0,
        extra.done ?? null,
        extra.estimate ?? null
      ).lastInsertRowid
  );
}

const today = card('Gửi đề xuất', listA, TODAY, A, A);
const delegated = card('Bình chuẩn bị số liệu', listA, '2026-10-08', B, A);
const carried = card('Việc trễ tuần trước', listA, '2026-10-01', A, A);
const givenToMe = card('Việc Bình nhờ', listB, '2026-10-09', A, B);
const finished = card('Đã xong đúng hạn', listA, '2026-10-06', A, A, {
  done: '2026-10-06 10:00:00',
});
const slipping = card('Hay bị lùi hạn', listA, '2026-10-09', A, A);
const othersOnly = card('Việc riêng của Bình', listB, '2026-10-08', B, B);

db.prepare(
  `INSERT INTO task_nudges (card_id, contact_id, channel, message) VALUES (?, ?, 'zalo', 'Nhắc')`
).run(givenToMe, A);
for (const [oldDue, newDue] of [
  ['2026-10-02', '2026-10-06'],
  ['2026-10-06', '2026-10-09'],
])
  db.prepare(`INSERT INTO card_due_changes (card_id, old_due, new_due) VALUES (?, ?, ?)`).run(
    slipping,
    oldDue,
    newDue
  );

const deal = (title: string, cust: number, owner: number, close: string, next: string | null) =>
  Number(
    db
      .prepare(
        `INSERT INTO deals (customer_id, title, stage, value_vnd, probability, expected_close_date,
                            next_action, next_action_date, owner_contact_id)
         VALUES (?, ?, 'quoted', 500000000, 50, ?, ?, ?, ?)`
      )
      .run(cust, title, close, next ? 'Gọi khách' : null, next, owner).lastInsertRowid
  );
const dealA = deal('Cơ hội A', custA, A, '2026-10-09', '2026-10-08');
deal('Cơ hội B', custB, B, '2026-10-10', null);

const event = (title: string, start: string, end: string, owner: number) =>
  db
    .prepare(
      `INSERT INTO calendar_events (title, event_type, start_at, end_at, owner_contact_id)
       VALUES (?, 'meeting', ?, ?, ?)`
    )
    .run(title, start, end, owner);
event('Họp khách A', '2026-10-08T10:00', '2026-10-08T11:00', A);
event('Họp nội bộ', '2026-10-08T10:30', '2026-10-08T11:30', A);
event('Họp của Bình', '2026-10-08T14:00', '2026-10-08T15:00', B);

db.prepare(
  `INSERT INTO contracts (customer_id, name, status, end_date, value_vnd) VALUES (?, 'HĐ bảo trì', 'active', '2026-10-10', 100000000)`
).run(custA);

function scope(mode: 'me' | 'team', visible: 'all' | number[] = 'all'): FocusScope {
  return {
    mode,
    me: A,
    tasks: visible,
    deals: visible,
    contracts: visible,
    quotations: visible,
    services: visible,
    customers: visible,
    boards: visible,
    projects: visible,
    notes: visible,
  };
}

const build = (s: FocusScope) =>
  buildFocus(db, { from: FROM, to: TO, scope: s, today: TODAY, now: NOW });

const cardIds = (data: ReturnType<typeof build>) =>
  data.items.filter((i) => i.kind === 'card').map((i) => i.id);

test('che do ca nhan chi lay viec giao cho toi, ke ca tren bang cua nguoi khac', () => {
  const data = build(scope('me'));
  assert.deepEqual(new Set(cardIds(data)), new Set([today, givenToMe, finished, slipping]));
  assert.equal(data.summary.done_due_count, 1);
  assert.equal(data.items.filter((i) => i.kind === 'deal_close').length, 1);
  assert.equal(data.items.filter((i) => i.kind === 'contract_end').length, 1);
  // Lich cua Binh khong lot vao lich cua toi
  assert.equal(data.items.filter((i) => i.kind === 'event').length, 2);
});

test('xem ca nhom ton trong pham vi quyen', () => {
  const all = build(scope('team'));
  assert.ok(cardIds(all).includes(othersOnly));
  assert.ok(cardIds(all).includes(delegated));
  assert.equal(all.items.filter((i) => i.kind === 'deal_close').length, 2);

  // Chi duoc nhin du lieu cua A: viec tren bang cua B ma khong giao cho A thi an
  const limited = build(scope('team', [A]));
  assert.ok(!cardIds(limited).includes(othersOnly));
  assert.ok(cardIds(limited).includes(givenToMe), 'viec giao cho toi luon thay');
  assert.ok(cardIds(limited).includes(delegated), 'viec tren bang cua toi');
  assert.equal(limited.items.filter((i) => i.kind === 'deal_close').length, 1);

  // Khong co quyen nao: chi con viec cua chinh minh / chua giao
  const none = build(scope('team', []));
  assert.equal(none.items.filter((i) => i.kind === 'deal_close').length, 0);
  assert.equal(none.items.filter((i) => i.kind === 'contract_end').length, 0);
});

test('ton tu truoc, hanh dong tiep theo va viec dang cho', () => {
  const data = build(scope('me'));
  assert.deepEqual(
    data.carry_over.filter((i) => i.kind === 'card').map((i) => i.id),
    [carried]
  );
  assert.equal(data.summary.carry_over_count, 1);
  assert.ok(data.items.some((i) => i.kind === 'next_action' && i.deal_id === dealA));
  assert.deepEqual(
    data.waiting.on_me.map((w) => [w.card_id, w.reason]),
    [[givenToMe, 'nudged']]
  );
  assert.deepEqual(
    data.waiting.on_others.map((w) => [w.card_id, w.reason, w.person_name]),
    [[delegated, 'delegated', 'Bình']]
  );
});

test('canh bao: lui han nhieu lan va trung lich', () => {
  const data = build(scope('me'));
  assert.ok(data.attention.some((a) => a.kind === 'slipping' && a.card_id === slipping));
  const conflicts = data.attention.filter((a) => a.kind === 'conflict');
  assert.equal(conflicts.length, 1);
  assert.match(conflicts[0].title, /Họp khách A/);
});

test('khung gio trong tranh lich hop va gio nghi trua', () => {
  const data = build(scope('me'));
  const slots = data.free_slots.filter((s) => s.date === '2026-10-08');
  assert.deepEqual(
    slots.map((s) => [s.start, s.end]),
    [
      ['08:00', '10:00'],
      ['11:30', '12:00'],
      ['13:30', '17:30'],
    ]
  );
  // Hom nay chi tinh tu gio hien tai
  assert.equal(data.free_slots.find((s) => s.date === TODAY)?.start, NOW);
  // Khong goi y cuoi tuan
  assert.ok(!data.free_slots.some((s) => s.date === '2026-10-10'));
});

test('nhin lai ky: dung han / con mo, so voi ky truoc', () => {
  const data = build(scope('me'));
  assert.ok(data.retro);
  // Den hom nay (07/10): viec 06/10 xong dung han, viec 07/10 con mo
  assert.equal(data.retro.current.to, TODAY);
  assert.equal(data.retro.current.done_on_time, 1);
  assert.equal(data.retro.current.still_open, 1);
  assert.equal(data.retro.previous.from, '2026-09-28');
  assert.equal(data.retro.previous.planned, 1);
});

test('ky trong tuong lai khong co phan nhin lai', () => {
  const data = buildFocus(db, {
    from: '2026-11-01',
    to: '2026-11-30',
    scope: scope('me'),
    today: TODAY,
    now: NOW,
  });
  assert.equal(data.retro, null);
});

test('tu choi khoang ngay sai hoac qua dai', () => {
  assert.throws(() => buildFocus(db, { from: TO, to: FROM, scope: scope('me') }));
  assert.throws(() => buildFocus(db, { from: '2026-01-01', to: '2026-12-31', scope: scope('me') }));
});

test('ban tin Telegram: ky va lich gui', () => {
  assert.equal(weekStart('2026-10-11'), '2026-10-05');
  assert.deepEqual(digestRange('weekly', TODAY), { from: '2026-10-05', to: '2026-10-11' });
  assert.deepEqual(digestRange('monthly', TODAY), { from: '2026-10-01', to: '2026-10-31' });

  const settings = {
    enabled: true,
    daily: true,
    weekly: true,
    monthly: true,
    time: '07:00',
    ai: false,
  };
  assert.deepEqual(dueDigests(settings, '2026-10-07', '06:59'), []);
  assert.deepEqual(
    dueDigests(settings, '2026-10-07', '07:00').map((d) => d.kind),
    ['daily']
  );
  assert.deepEqual(
    dueDigests(settings, '2026-06-01', '08:00').map((d) => d.kind),
    ['daily', 'weekly', 'monthly']
  );
  assert.deepEqual(dueDigests({ ...settings, enabled: false }, '2026-06-01', '08:00'), []);

  const data = buildFocus(db, {
    from: TODAY,
    to: TODAY,
    scope: ownerScope(A),
    today: TODAY,
    now: NOW,
  });
  const text = buildDigestText('daily', data);
  assert.match(text, /Trọng tâm hôm nay — Thứ Tư 07\/10/);
  assert.match(text, /Gửi đề xuất/);
  assert.match(text, /Việc trễ tuần trước/);
  assert.ok(!text.includes('Việc riêng của Bình'));
});

test('ky truoc cua mot thang la tron thang truoc', () => {
  assert.deepEqual(previousRange('2026-10-01', '2026-10-31'), ['2026-09-01', '2026-09-30']);
  assert.deepEqual(previousRange('2026-03-01', '2026-03-31'), ['2026-02-01', '2026-02-28']);
  assert.deepEqual(previousRange(FROM, TO), ['2026-09-28', '2026-10-04']);
  assert.deepEqual(previousRange('2026-10-01', '2026-10-15'), ['2026-09-16', '2026-09-30']);
});

test('lich, nhac hen chua co chu (tao truoc ban 1.4.1) van hien o che do ca nhan', () => {
  db.prepare(
    `INSERT INTO calendar_events (title, event_type, start_at, end_at) VALUES ('Lịch cũ vô chủ', 'meeting', '2026-10-09T15:00', '2026-10-09T16:00')`
  ).run();
  db.prepare(
    `INSERT INTO reminders (title, due_at) VALUES ('Nhắc cũ vô chủ', '2026-10-09T08:00')`
  ).run();
  const data = build(scope('me'));
  assert.ok(data.items.some((i) => i.kind === 'event' && i.title === 'Lịch cũ vô chủ'));
  assert.ok(data.items.some((i) => i.kind === 'reminder' && i.title === 'Nhắc cũ vô chủ'));
  // Lich co chu la nguoi khac thi van khong lot vao
  assert.ok(!data.items.some((i) => i.title === 'Họp của Bình'));
});
