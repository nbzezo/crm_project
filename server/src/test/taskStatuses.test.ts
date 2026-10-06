/**
 * v67 — trang thai cong viec cau hinh duoc.
 *
 * Bat bien trong tam:
 *  - `cards.status` luon mang Y NGHIA (kind) cua trang thai, nen is_done/bao cao
 *    dung voi moi trang thai tu tao;
 *  - the cu (status_key trong) van co trang thai hieu luc dung;
 *  - doi y nghia / an trang thai dang dung khong lam viec "troi" im lang;
 *  - luon con it nhat mot trang thai Chua bat dau va mot Hoan thanh;
 *  - quay lui v67 dua du lieu ve dang v66 doc duoc.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { type Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-v67-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';

const { createApp } = await import('../app.ts');
const { db, closeDatabase } = await import('../db/connection.ts');
const { migrate, LATEST_VERSION } = await import('../db/migrate.ts');

const dbDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'db');

let server: Server;
let baseUrl = '';

before(async () => {
  server = createApp({ auth: false }).listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Khong khoi dong duoc test server');
  baseUrl = `http://127.0.0.1:${address.port}`;
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

async function newStatus(label: string, kind: string): Promise<string> {
  const res = await json('POST', '/api/task-statuses', { label, kind });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  return String(res.data.key);
}

async function newCard(title: string): Promise<number> {
  const res = await json('POST', '/api/cards', { title });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  return Number(res.data.id);
}

function card(id: number) {
  return db
    .prepare(`SELECT status, status_key, is_done, completed_at, list_id FROM cards WHERE id = ?`)
    .get(id) as {
    status: string;
    status_key: string | null;
    is_done: number;
    completed_at: string | null;
    list_id: number;
  };
}

/* ---------- Schema va quay lui ---------- */

test('v67 chen san sau trang thai dung san, khoa trung gia tri cu', async () => {
  assert.equal(LATEST_VERSION, 67);
  const res = await json('GET', '/api/task-statuses');
  const list = res.data as unknown as { key: string; kind: string; is_builtin: number }[];
  assert.deepEqual(
    list.map((s) => s.key),
    ['todo', 'doing', 'waiting_customer', 'blocked', 'review', 'done']
  );
  assert.ok(list.every((s) => s.key === s.kind && s.is_builtin === 1));
});

test('the cu khong co status_key van co trang thai hieu luc dung', async () => {
  const id = await newCard('The cu');
  db.prepare(`UPDATE cards SET status = 'review', status_key = NULL WHERE id = ?`).run(id);
  const detail = await json('GET', `/api/cards/${id}`);
  assert.equal(detail.data.status_key, 'review');
  assert.equal(detail.data.status, 'review');
});

test('quay lui v67: trang thai tu tao quy ve trang thai dung san cung y nghia', () => {
  const target = new Database(':memory:');
  try {
    migrate(target, 67);
    target.exec(`
      INSERT INTO task_statuses (key, label, kind, position) VALUES ('khao_sat', 'Khảo sát', 'doing', 1500);
      INSERT INTO boards (name) VALUES ('B');
      INSERT INTO lists (board_id, name, position, status_mapping) VALUES (1, 'Khảo sát', 1, 'khao_sat');
      INSERT INTO cards (list_id, title, position, status, status_key) VALUES (1, 'c', 1, 'doing', 'khao_sat');
      INSERT INTO card_flows (card_id, status) VALUES (1, 'khao_sat');
      INSERT INTO card_flow_steps (flow_id, content, position) VALUES (1, 'x', 1);
      INSERT INTO card_flows (card_id, status) VALUES (1, 'doing');
    `);
    target.pragma('foreign_keys = OFF');
    target.exec(fs.readFileSync(path.join(dbDir, 'migrate-v67-rollback.sql'), 'utf8'));
    target.pragma('user_version = 66');
    target.pragma('foreign_keys = ON');

    assert.deepEqual(target.pragma('foreign_key_check'), []);
    const cols = (target.prepare(`PRAGMA table_info(cards)`).all() as { name: string }[]).map(
      (c) => c.name
    );
    assert.ok(!cols.includes('status_key'));
    assert.equal(
      (target.prepare(`SELECT status_mapping FROM lists`).get() as { status_mapping: string })
        .status_mapping,
      'doing'
    );
    assert.deepEqual(
      (target.prepare(`SELECT status FROM card_flows`).all() as { status: string }[]).map(
        (f) => f.status
      ),
      ['doing']
    );
    assert.equal(
      (target.prepare(`SELECT COUNT(*) AS n FROM card_flow_steps`).get() as { n: number }).n,
      0
    );
    // CHECK cua v66 tro lai.
    assert.throws(() =>
      target.prepare(`INSERT INTO card_flows (card_id, status) VALUES (1, 'khac')`).run()
    );
    migrate(target);
    assert.equal(target.pragma('user_version', { simple: true }), LATEST_VERSION);
  } finally {
    target.close();
  }
});

/* ---------- Dung trang thai tu tao ---------- */

test('trang thai tu tao: status mang y nghia, status_key mang khoa', async () => {
  const survey = await newStatus('Khảo sát', 'doing');
  assert.equal(survey, 'khao_sat');
  const id = await newCard('Viec khao sat');
  const res = await json('PATCH', `/api/cards/${id}`, { status: survey });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.status_key, survey);
  assert.deepEqual(
    { status: card(id).status, key: card(id).status_key, done: card(id).is_done },
    { status: 'doing', key: survey, done: 0 }
  );

  const accepted = await newStatus('Nghiệm thu xong', 'done');
  await json('PATCH', `/api/cards/${id}`, { status: accepted });
  assert.equal(card(id).is_done, 1);
  assert.equal(card(id).status, 'done');
  assert.ok(card(id).completed_at);
});

test('doi giua hai trang thai cung y nghia duoc ghi vao nhat ky', async () => {
  const deploy = await newStatus('Triển khai', 'doing');
  const id = await newCard('Viec trien khai');
  await json('PATCH', `/api/cards/${id}`, { status: 'doing' });
  await json('PATCH', `/api/cards/${id}`, { status: deploy });
  const log = db
    .prepare(
      `SELECT old_value, new_value FROM task_activity WHERE card_id = ? AND field = 'status_key'`
    )
    .all(id) as { old_value: string; new_value: string }[];
  assert.deepEqual(log, [{ old_value: 'doing', new_value: deploy }]);
});

test('trang thai khong ton tai hoac da an bi tu choi', async () => {
  const id = await newCard('Viec sai');
  const res = await json('PATCH', `/api/cards/${id}`, { status: 'khong_co' });
  assert.equal(res.status, 422);
  assert.equal(res.data.code, 'STATUS_UNKNOWN');
});

test('trung ten bi tu choi, khong phan biet dau va hoa thuong', async () => {
  const res = await json('POST', '/api/task-statuses', { label: 'KHAO SAT', kind: 'doing' });
  assert.equal(res.status, 409);
  assert.equal(res.data.code, 'STATUS_DUPLICATE');
});

test('hoan thanh nhanh (is_done) vao trang thai Hoan thanh dau tien theo thu tu', async () => {
  const closed = await newStatus('Đóng hồ sơ', 'done');
  const all = (await json('GET', '/api/task-statuses?all=1')).data as unknown as { key: string }[];
  const order = [closed, ...all.map((s) => s.key).filter((k) => k !== closed)];
  assert.equal((await json('PUT', '/api/task-statuses/order', { keys: order })).status, 200);

  const id = await newCard('Viec dong nhanh');
  await json('PATCH', `/api/cards/${id}`, { is_done: true });
  assert.equal(card(id).status_key, closed);
  assert.equal(card(id).is_done, 1);
  // Mo lai: ve trang thai Chua bat dau dau tien.
  await json('PATCH', `/api/cards/${id}`, { is_done: false });
  assert.equal(card(id).status, 'todo');
  assert.equal(card(id).is_done, 0);
});

test('cot kanban gan trang thai tu tao: keo the vao thi doi trang thai', async () => {
  const waiting = await newStatus('Chờ khách ký', 'waiting_customer');
  const id = await newCard('Viec keo');
  const boardId = (
    db.prepare(`SELECT board_id FROM lists WHERE id = ?`).get(card(id).list_id) as {
      board_id: number;
    }
  ).board_id;
  const list = await json('POST', '/api/lists', {
    board_id: boardId,
    name: 'Chờ khách ký',
    status_mapping: waiting,
  });
  assert.equal(list.status, 201, JSON.stringify(list.data));
  const moved = await json('PATCH', `/api/cards/${id}/move`, { list_id: Number(list.data.id) });
  assert.equal(moved.status, 200);
  assert.equal(card(id).status_key, waiting);
  assert.equal(card(id).status, 'waiting_customer');
  const unknown = await json('POST', '/api/lists', {
    board_id: boardId,
    name: 'Sai',
    status_mapping: 'khong_co',
  });
  assert.equal(unknown.status, 422);
});

/* ---------- Doi y nghia, an ---------- */

test('doi y nghia trang thai dang co viec bi tu choi; chua co viec thi doi duoc', async () => {
  const free = await newStatus('Tạm dừng', 'doing');
  assert.equal(
    (await json('PATCH', `/api/task-statuses/${free}`, { kind: 'blocked' })).status,
    200
  );

  const used = await newStatus('Đang code', 'doing');
  const id = await newCard('Viec code');
  await json('PATCH', `/api/cards/${id}`, { status: used });
  const res = await json('PATCH', `/api/task-statuses/${used}`, { kind: 'done' });
  assert.equal(res.status, 409);
  assert.equal(res.data.code, 'STATUS_IN_USE');
  assert.equal(card(id).is_done, 0);
});

test('an trang thai dang dung: phai chon noi chuyen; viec va cot chuyen theo', async () => {
  const old = await newStatus('Kiểm tra cũ', 'review');
  const id = await newCard('Viec kiem tra');
  await json('PATCH', `/api/cards/${id}`, { status: old });
  db.prepare(`UPDATE lists SET status_mapping = ? WHERE id = ?`).run(old, card(id).list_id);

  const refused = await json('PATCH', `/api/task-statuses/${old}`, { is_active: false });
  assert.equal(refused.status, 409);
  assert.equal(refused.data.code, 'STATUS_NEED_MOVE');

  const ok = await json('PATCH', `/api/task-statuses/${old}`, {
    is_active: false,
    move_to: 'review',
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(card(id).status_key, 'review');
  const mapping = db
    .prepare(`SELECT COUNT(*) AS n FROM lists WHERE status_mapping = ?`)
    .get(old) as { n: number };
  assert.equal(mapping.n, 0);
  const visible = (await json('GET', '/api/task-statuses')).data as unknown as { key: string }[];
  assert.ok(!visible.some((s) => s.key === old));
});

test('luon con it nhat mot trang thai Chua bat dau va mot Hoan thanh', async () => {
  const doneKeys = (
    (await json('GET', '/api/task-statuses')).data as unknown as { key: string; kind: string }[]
  )
    .filter((s) => s.kind === 'done')
    .map((s) => s.key);
  // An het tru mot, roi an cai cuoi phai bi chan.
  for (const key of doneKeys.slice(1)) {
    const res = await json('PATCH', `/api/task-statuses/${key}`, {
      is_active: false,
      move_to: doneKeys[0],
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
  }
  const last = await json('PATCH', `/api/task-statuses/${doneKeys[0]}`, { is_active: false });
  assert.equal(last.status, 422);
  assert.equal(last.data.code, 'STATUS_NEED_DONE');
});

/* ---------- Quy trinh tren trang thai tu tao ---------- */

test('quy trinh gan voi trang thai tu tao va tu chuyen sang trang thai tu tao', async () => {
  const intake = await newStatus('Tiếp nhận hồ sơ', 'doing');
  const sign = await newStatus('Chờ ký hợp đồng', 'waiting_customer');
  const put = await json('PUT', '/api/task-flows/settings', {
    enabled: true,
    templates: { [intake]: { steps: ['Nhận', 'Phân loại'], next_status: sign, ask: 'auto' } },
  });
  assert.equal(put.status, 200, JSON.stringify(put.data));

  const id = await newCard('Viec ho so');
  await json('PATCH', `/api/cards/${id}`, { status: intake });
  const detail = await json('GET', `/api/cards/${id}`);
  const flow = (detail.data.flows as { status: string; steps: { id: number }[] }[]).find(
    (f) => f.status === intake
  );
  assert.ok(flow, 'mau ask=auto phai tao quy trinh cho trang thai tu tao');
  assert.equal(detail.data.flow_total, 2);

  const blocked = await json('PATCH', `/api/cards/${id}`, { status: 'doing' });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.status, intake);

  await json('PATCH', `/api/task-flows/steps/${flow.steps[0].id}`, { done: true });
  const last = await json('PATCH', `/api/task-flows/steps/${flow.steps[1].id}`, { done: true });
  assert.equal(last.data.advanced_to, sign);
  assert.equal(card(id).status_key, sign);
  assert.equal(card(id).status, 'waiting_customer');
});

/* ---------- Ho so cau hinh ---------- */

test('ho so cau hinh mang theo danh sach trang thai', async () => {
  const profile = await json('GET', '/api/crm-config/profile');
  assert.equal(profile.status, 200);
  const statuses = profile.data.task_statuses as { key: string; kind: string }[];
  assert.ok(statuses.some((s) => s.key === 'khao_sat' && s.kind === 'doing'));
});
