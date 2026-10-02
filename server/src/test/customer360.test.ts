import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * Ho so khach hang 360° (v54): nhip cham soc, nguy co mat khach, goi y co hoi
 * (gia han, ban cheo, mo lai bao gia/co hoi thua, sau ban), dong thoi gian gop,
 * sinh nhat / ky niem hop dong va tab Trong tam.
 *
 * Ngay thang tinh tuong doi voi "hom nay" cua SQLite de test khong hong theo lich.
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-customer360-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';
process.env.WORKFLOW_SESSION_SECRET = 'test-secret-value-at-least-32-characters-long';
process.env.WORKFLOW_ADMIN_USER = 'admin';
process.env.WORKFLOW_ADMIN_PASSWORD = 'admin-password-1';
process.env.WORKFLOW_ADMIN_EMAIL = 'admin@congty.vn';

const { createApp } = await import('../app.ts');
const { db, closeDatabase } = await import('../db/connection.ts');
const { ensureAdminUser } = await import('../services/auth/bootstrapAdmin.ts');
const care = await import('../services/customerCare.ts');
const { buildFocus, ownerScope } = await import('../services/focusService.ts');
const teamScope = { ...ownerScope(null), mode: 'team' as const };

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
  cookie = '';
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
  return {
    status: res.status,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- du lieu test, kiem tung truong
    data: (text ? JSON.parse(text) : {}) as Record<string, any>,
  };
}

const today = care.todayOf(db);
const day = (offset: number) => care.addDaysStr(today, offset);

function customer(name: string, extra: Record<string, unknown> = {}): number {
  const cols = ['name', 'org_kind', 'status', ...Object.keys(extra)];
  const values = [name, 'customer', 'customer', ...Object.values(extra)];
  return Number(
    db
      .prepare(
        `INSERT INTO customers (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
      )
      .run(...values).lastInsertRowid
  );
}
const service = (name: string, price = 0) =>
  Number(
    db.prepare(`INSERT INTO services (name, default_price_vnd) VALUES (?, ?)`).run(name, price)
      .lastInsertRowid
  );
const useService = (customerId: number, serviceId: number, extra: Record<string, unknown> = {}) => {
  const cols = ['customer_id', 'service_id', ...Object.keys(extra)];
  return Number(
    db
      .prepare(
        `INSERT INTO customer_services (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
      )
      .run(customerId, serviceId, ...Object.values(extra)).lastInsertRowid
  );
};

/* ---------- Ham thuan ---------- */

test('nhip theo hang, ngay lap lai hang nam qua nam moi va 29/02', () => {
  assert.deepEqual(care.cadenceOf('vip', null), { days: 14, source: 'tier' });
  assert.deepEqual(care.cadenceOf('low', 45), { days: 45, source: 'custom' });
  assert.deepEqual(care.cadenceOf('la', null), { days: 30, source: 'tier' });
  assert.deepEqual(care.monthDayOf('1990-02-29'), [2, 29]);
  assert.equal(care.monthDayOf('13-01'), null);
  assert.deepEqual(care.occurrencesIn([1, 2], '2026-12-28', '2027-01-03'), ['2027-01-02']);
  assert.deepEqual(care.occurrencesIn([2, 29], '2027-02-01', '2027-03-01'), ['2027-02-28']);
});

/* ---------- Tong quan + nguy co ---------- */

test('tong quan: qua nhip lien he, hop dong sap het han, nguy co va dong thoi gian', async () => {
  const id = customer('Công Ty Nhịp', { care_tier: 'vip' });
  db.prepare(
    `INSERT INTO interactions (customer_id, type, occurred_at, summary) VALUES (?, 'call', ?, 'Gọi chào')`
  ).run(id, `${day(-20)} 10:00`);
  db.prepare(
    `INSERT INTO contracts (customer_id, name, status, value_vnd, start_date, end_date)
     VALUES (?, 'HĐ 2025', 'active', 100000000, ?, ?)`
  ).run(id, day(-300), day(40));

  const res = await call('GET', `/api/customers/${id}/overview`);
  assert.equal(res.status, 200);
  const o = res.data;
  assert.equal(o.care.tier, 'vip');
  assert.equal(o.care.cadence_days, 14);
  assert.equal(o.care.state, 'overdue');
  assert.equal(o.care.days_overdue, 6);
  assert.equal(o.churn.level, 'medium');
  assert.ok(o.churn.factors.some((f: string) => /hợp đồng hết hạn/.test(f)));
  assert.equal(o.expiring[0].kind, 'contract');
  assert.equal(o.expiring[0].days_left, 40);
  assert.deepEqual(
    o.timeline.map((e: { kind: string }) => e.kind),
    ['interaction', 'contract']
  );
  assert.ok(o.suggestions.some((s: { kind: string }) => s.kind === 'renewal'));

  /* Doi hang qua PATCH: nhip tu dat 60 ngay -> het qua nhip. */
  const patched = await call('PATCH', `/api/customers/${id}`, {
    care_tier: 'standard',
    care_cadence_days: 60,
  });
  assert.equal(patched.status, 200);
  const after = (await call('GET', `/api/customers/${id}/overview`)).data;
  assert.equal(after.care.cadence_source, 'custom');
  assert.equal(after.care.state, 'ok');
  assert.equal(
    (await call('PATCH', `/api/customers/${id}`, { care_tier: 'gold' })).status,
    400,
    'hang khong hop le bi chan'
  );
});

/* ---------- Goi y ---------- */

test('goi y: gia han -> tao co hoi -> nhan; bo qua thi khong hien lai; het dieu kien thi tu xoa', async () => {
  const id = customer('Công Ty Gia Hạn');
  const contract = Number(
    db
      .prepare(
        `INSERT INTO contracts (customer_id, name, status, value_vnd, end_date)
         VALUES (?, 'HĐ bảo trì', 'active', 50000000, ?)`
      )
      .run(id, day(30)).lastInsertRowid
  );
  const quote = Number(
    db
      .prepare(
        `INSERT INTO quotations (customer_id, code, status, value_vnd, valid_until)
         VALUES (?, 'BG-01', 'sent', 20000000, ?)`
      )
      .run(id, day(-10)).lastInsertRowid
  );

  const first = (await call('GET', `/api/customers/${id}/overview`)).data.suggestions as {
    id: number;
    kind: string;
    key: string;
    contract_id: number | null;
    value_vnd: number;
  }[];
  const renewal = first.find((s) => s.kind === 'renewal')!;
  assert.equal(renewal.contract_id, contract);
  assert.equal(renewal.value_vnd, 50000000);
  const reopen = first.find((s) => s.kind === 'reopen_quote')!;
  assert.ok(reopen, 'bao gia het hieu luc chua chot');

  /* Nhan ma chua co co hoi -> 400; co hoi cua khach khac -> 400. */
  assert.equal(
    (await call('POST', `/api/customers/${id}/suggestions/${renewal.id}/accept`, {})).status,
    400
  );
  const other = customer('Khác');
  const otherDeal = (await call('POST', '/api/deals', { customer_id: other, title: 'X' })).data;
  assert.equal(
    (
      await call('POST', `/api/customers/${id}/suggestions/${renewal.id}/accept`, {
        deal_id: otherDeal.id,
      })
    ).status,
    400
  );

  const deal = (
    await call('POST', '/api/deals', {
      customer_id: id,
      title: 'Gia hạn HĐ bảo trì',
      value_vnd: 50000000,
      is_renewal: true,
    })
  ).data;
  /* Dich vu gan voi hop dong nay cung sap het han: chi MOT goi y (theo hop dong). */
  const crmLine = useService(id, service('Bảo trì hệ thống'), {
    contract_id: contract,
    end_date: day(30),
  });
  assert.ok(crmLine);
  const accepted = await call('POST', `/api/customers/${id}/suggestions/${renewal.id}/accept`, {
    deal_id: deal.id,
  });
  assert.equal(accepted.status, 200);
  assert.equal(
    (
      await call('POST', `/api/customers/${id}/suggestions/${renewal.id}/accept`, {
        deal_id: deal.id,
      })
    ).status,
    409,
    'da xu ly roi'
  );

  const dismissed = await call('POST', `/api/customers/${id}/suggestions/${reopen.id}/dismiss`, {
    reason: 'Khách đã chọn nhà cung cấp khác',
  });
  assert.equal(dismissed.status, 200);

  const again = (await call('GET', `/api/customers/${id}/overview`)).data;
  assert.deepEqual(again.suggestions, [], 'da nhan/da bo qua thi khong hien lai');
  assert.equal(again.suggestion_stats.accepted, 1);
  assert.equal(again.suggestion_stats.dismissed, 1);
  assert.equal(again.suggestion_stats.acceptance_rate, 50);

  /* Goi y 'open' het dieu kien thi bi xoa: bao gia moi duoc chap nhan. */
  const id2 = customer('Công Ty Báo Giá');
  const q2 = Number(
    db
      .prepare(
        `INSERT INTO quotations (customer_id, code, status, valid_until) VALUES (?, 'BG-9', 'sent', ?)`
      )
      .run(id2, day(-5)).lastInsertRowid
  );
  assert.equal((await call('GET', `/api/customers/${id2}/overview`)).data.suggestions.length, 1);
  db.prepare(`UPDATE quotations SET status = 'accepted' WHERE id = ?`).run(q2);
  assert.equal((await call('GET', `/api/customers/${id2}/overview`)).data.suggestions.length, 0);
  assert.ok(quote);

  const global = (await call('GET', '/api/customers/suggestions/stats')).data;
  assert.ok(global.accepted >= 1);
});

test('ban cheo theo khach cung nganh; co hoi thua lau thi goi y mo lai', async () => {
  const crm = service('CRM Cloud', 30000000);
  const mail = service('Email doanh nghiệp', 5000000);
  for (const name of ['Bán lẻ 1', 'Bán lẻ 2', 'Bán lẻ 3']) {
    const peer = customer(name, { industry: 'Bán lẻ' });
    useService(peer, crm);
  }
  const unrelated = customer('Ngành khác', { industry: 'Xây dựng' });
  useService(unrelated, mail);
  useService(customer('Ngành khác 2', { industry: 'Xây dựng' }), mail);

  const id = customer('Bán lẻ Mới', { industry: 'bán lẻ' });
  db.prepare(
    `INSERT INTO deals (customer_id, title, stage, value_vnd, lost_reason, closed_at)
     VALUES (?, 'Triển khai POS', 'lost', 80000000, 'price', ?)`
  ).run(id, `${day(-200)} 09:00`);

  const list = (await call('GET', `/api/customers/${id}/overview`)).data.suggestions as {
    kind: string;
    service_id: number | null;
    reason: string;
  }[];
  const cross = list.filter((s) => s.kind === 'cross_sell');
  assert.deepEqual(
    cross.map((s) => s.service_id),
    [crm],
    'chi goi y dich vu cua khach cung nganh'
  );
  assert.match(cross[0].reason, /3\/3 khách cùng ngành/);
  assert.ok(list.some((s) => s.kind === 'reopen_lost'));

  /* Da dung roi thi thoi goi y. */
  useService(id, crm);
  const next = (await call('GET', `/api/customers/${id}/overview`)).data.suggestions as {
    kind: string;
  }[];
  assert.equal(next.filter((s) => s.kind === 'cross_sell').length, 0);
});

test('kich ban sau ban: nhan goi y tao 3 nhac hen ngay 7/30/90, buoc da qua dat vao hom nay', async () => {
  const id = customer('Công Ty Sau Bán');
  db.prepare(
    `INSERT INTO deals (customer_id, title, stage, value_vnd, closed_at) VALUES (?, 'Gói A', 'won', 1, ?)`
  ).run(id, `${day(-10)} 09:00`);
  const suggestion = (
    (await call('GET', `/api/customers/${id}/overview`)).data.suggestions as {
      id: number;
      kind: string;
    }[]
  ).find((s) => s.kind === 'aftercare')!;
  const res = await call('POST', `/api/customers/${id}/suggestions/${suggestion.id}/accept`, {});
  assert.equal(res.status, 200);
  const reminders = db
    .prepare(
      `SELECT title, substr(due_at,1,10) AS due FROM reminders WHERE customer_id = ? ORDER BY due_at`
    )
    .all(id) as { title: string; due: string }[];
  assert.deepEqual(
    reminders.map((r) => r.due),
    [today, day(20), day(80)]
  );
  assert.match(reminders[0].title, /^Sau bán ngày 7/);
});

/* ---------- Sinh nhat + Trong tam ---------- */

test('sinh nhat nguoi lien he va ky niem hop dong hien o ho so va tab Trong tam', async () => {
  const id = customer('Công Ty Sự Kiện');
  const created = await call('POST', `/api/customers/${id}/contacts`, {
    full_name: 'Chị Lan',
    birthday: day(5).slice(5),
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.birthday, day(5).slice(5));
  assert.equal(
    (await call('POST', `/api/customers/${id}/contacts`, { full_name: 'X', birthday: '31/12' }))
      .status,
    400
  );
  /* Xoa ngay sinh bang chuoi rong. */
  const cleared = await call('PATCH', `/api/contacts/${created.data.id}`, { birthday: '' });
  assert.equal(cleared.data.birthday, null);
  await call('PATCH', `/api/contacts/${created.data.id}`, { birthday: `1985-${day(5).slice(5)}` });

  const signed = `${Number(today.slice(0, 4)) - 2}-${day(3).slice(5)}`;
  db.prepare(
    `INSERT INTO contracts (customer_id, name, status, sign_date, end_date) VALUES (?, 'HĐ khung', 'active', ?, NULL)`
  ).run(id, signed);

  const upcoming = (await call('GET', `/api/customers/${id}/overview`)).data.upcoming as {
    kind: string;
    date: string;
    title: string;
  }[];
  assert.deepEqual(
    upcoming.map((u) => [u.kind, u.date]),
    [
      ['contract_anniversary', day(3)],
      ['birthday', day(5)],
    ]
  );
  assert.match(upcoming[0].title, /Kỷ niệm 2 năm/);

  const focus = buildFocus(db, {
    from: today,
    to: day(6),
    scope: teamScope,
  });
  const kinds = focus.items
    .filter((i: { customer_id: number | null }) => i.customer_id === id)
    .map((i: { kind: string }) => i.kind);
  assert.deepEqual(kinds, ['contract_anniversary', 'birthday']);
});

test('Trong tam: khach VIP qua nhip 14 ngay bi canh bao du khong co co hoi mo', () => {
  const id = customer('Khách VIP Lặng', { care_tier: 'vip' });
  db.prepare(
    `INSERT INTO interactions (customer_id, type, occurred_at, summary) VALUES (?, 'email', ?, 'Gửi tài liệu')`
  ).run(id, `${day(-16)} 08:00`);
  const quiet = customer('Khách thường lặng');
  db.prepare(
    `INSERT INTO interactions (customer_id, type, occurred_at, summary) VALUES (?, 'email', ?, 'x')`
  ).run(quiet, `${day(-16)} 08:00`);
  const focus = buildFocus(db, {
    from: today,
    to: today,
    scope: teamScope,
  });
  const cold = focus.attention.filter((a: { kind: string }) => a.kind === 'cold_customer');
  const vip = cold.find((a: { customer_id: number | null }) => a.customer_id === id);
  assert.ok(vip, 'VIP qua nhip');
  assert.equal(vip.severity, 'warning');
  assert.match(vip.meta, /nhịp 14 ngày/);
  assert.equal(
    cold.some((a: { customer_id: number | null }) => a.customer_id === quiet),
    false,
    'khach thuong khong co co hoi/hop dong thi khong canh bao'
  );
});
