/**
 * v66 — quy trinh theo trang thai cua cong viec.
 *
 * Bat bien trong tam:
 *  - tinh nang TAT thi moi duong doi trang thai chay y nhu truoc;
 *  - roi mot trang thai co quy trinh dang do bi chan (409) TRUOC moi lenh ghi,
 *    tru khi nguoi dung xac nhan `skip_flow`;
 *  - buoc lam lan luot, xong buoc cuoi thi tu chuyen trang thai ke tiep;
 *  - bao cao van doc `status`/`is_done` nhu cu — quy trinh khong dong vao.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { type Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-v66-'));
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

interface Step {
  id: number;
  content: string;
  done_at: string | null;
}
interface Flow {
  id: number;
  status: string;
  completed_at: string | null;
  skipped_at: string | null;
  steps: Step[];
}

async function setEnabled(enabled: boolean, templates?: Record<string, unknown>) {
  const res = await json('PUT', '/api/task-flows/settings', { enabled, templates });
  assert.equal(res.status, 200, JSON.stringify(res.data));
}

async function newCard(title: string, extra: Record<string, unknown> = {}) {
  const res = await json('POST', '/api/cards', { title, ...extra });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  return res.data as { id: number; list_id: number; status: string };
}

function card(id: number) {
  return db.prepare(`SELECT * FROM cards WHERE id = ?`).get(id) as {
    id: number;
    status: string;
    is_done: number;
    list_id: number;
    due_date: string | null;
  };
}

function listOf(cardId: number, status: string): number {
  const row = db
    .prepare(
      `SELECT l.id FROM lists l
        WHERE l.board_id = (SELECT cur.board_id FROM cards k JOIN lists cur ON cur.id = k.list_id
                             WHERE k.id = ?)
          AND l.status_mapping = ?`
    )
    .get(cardId, status) as { id: number } | undefined;
  assert.ok(row, `bang phai co cot ${status}`);
  return row.id;
}

async function addFlow(cardId: number, status: string, steps?: string[]): Promise<Flow> {
  const res = await json('POST', `/api/task-flows/cards/${cardId}`, { status, steps });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  return res.data.flow as Flow;
}

async function tick(stepId: number, done = true) {
  return json('PATCH', `/api/task-flows/steps/${stepId}`, { done });
}

const DOING_REVIEW = {
  doing: { steps: [], next_status: 'review', ask: 'always' },
  review: { steps: [], next_status: 'done', ask: 'always' },
};

/* ---------- Schema ---------- */

test('v66 tao hai bang quy trinh va LATEST_VERSION = 66', () => {
  assert.equal(LATEST_VERSION, 66);
  const tables = (
    db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]
  ).map((t) => t.name);
  assert.ok(tables.includes('card_flows'));
  assert.ok(tables.includes('card_flow_steps'));
});

test('rollback v66 xoa bang va khoa cau hinh, migrate lai duoc', () => {
  const target = new Database(':memory:');
  try {
    migrate(target, 66);
    target.prepare(`INSERT INTO app_settings (key, value) VALUES ('task_flow.enabled', '1')`).run();
    target.exec(fs.readFileSync(path.join(dbDir, 'migrate-v66-rollback.sql'), 'utf8'));
    target.pragma('user_version = 65');
    const tables = (
      target.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as {
        name: string;
      }[]
    ).map((t) => t.name);
    assert.ok(!tables.includes('card_flows'));
    assert.ok(!tables.includes('card_flow_steps'));
    const key = target
      .prepare(`SELECT COUNT(*) AS n FROM app_settings WHERE key LIKE 'task_flow.%'`)
      .get() as { n: number };
    assert.equal(key.n, 0);
    migrate(target);
    assert.equal(target.pragma('user_version', { simple: true }), LATEST_VERSION);
  } finally {
    target.close();
  }
});

/* ---------- Cong tac ---------- */

test('mac dinh tinh nang tat: khong tao quy trinh, doi trang thai khong bi chan', async () => {
  const settings = await json('GET', '/api/task-flows/settings');
  assert.equal(settings.data.enabled, false);
  const templates = settings.data.templates as Record<string, { ask: string; next_status: string }>;
  assert.equal(templates.doing.ask, 'always');
  assert.equal(templates.doing.next_status, 'review');
  assert.equal(templates.todo.ask, 'never');

  const created = await newCard('Viec khi tat');
  const refused = await json('POST', `/api/task-flows/cards/${created.id}`, {
    status: 'todo',
    steps: ['A'],
  });
  assert.equal(refused.status, 409);
  assert.equal(refused.data.code, 'FLOW_DISABLED');

  /* Du lieu cu con trong CSDL (bat roi tat) cung khong duoc chan. */
  const flowId = Number(
    db.prepare(`INSERT INTO card_flows (card_id, status) VALUES (?, 'todo')`).run(created.id)
      .lastInsertRowid
  );
  db.prepare(`INSERT INTO card_flow_steps (flow_id, content, position) VALUES (?, 'A', 1024)`).run(
    flowId
  );
  const moved = await json('PATCH', `/api/cards/${created.id}`, { status: 'done' });
  assert.equal(moved.status, 200);
  assert.equal(card(created.id).is_done, 1);
});

/* ---------- Chan khi roi trang thai ---------- */

test('roi trang thai khi quy trinh do: 409 truoc moi lenh ghi, skip_flow thi cho qua', async () => {
  await setEnabled(true, DOING_REVIEW);
  const created = await newCard('Viec chan');
  assert.equal((await json('PATCH', `/api/cards/${created.id}`, { status: 'doing' })).status, 200);
  const flow = await addFlow(created.id, 'doing', ['Khao sat', 'Cau hinh']);
  assert.equal(flow.steps.length, 2);

  const blocked = await json('PATCH', `/api/cards/${created.id}`, {
    status: 'review',
    due_date: '2030-01-01',
  });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.code, 'FLOW_INCOMPLETE');
  assert.equal(blocked.data.status, 'doing');
  assert.deepEqual(blocked.data.remaining, ['Khao sat', 'Cau hinh']);
  // Khong ghi gi ca — ke ca han dat cung yeu cau.
  assert.equal(card(created.id).status, 'doing');
  assert.equal(card(created.id).due_date, null);

  /* is_done cung la mot loi doi trang thai. */
  const viaDone = await json('PATCH', `/api/cards/${created.id}`, { is_done: true });
  assert.equal(viaDone.status, 409);

  const skipped = await json('PATCH', `/api/cards/${created.id}`, {
    status: 'review',
    skip_flow: true,
  });
  assert.equal(skipped.status, 200);
  assert.equal(card(created.id).status, 'review');
  const row = db.prepare(`SELECT skipped_at FROM card_flows WHERE id = ?`).get(flow.id) as {
    skipped_at: string | null;
  };
  assert.ok(row.skipped_at, 'phai ghi lai lan bo qua');
  const log = db
    .prepare(`SELECT COUNT(*) AS n FROM task_activity WHERE card_id = ? AND field = 'flow_skipped'`)
    .get(created.id) as { n: number };
  assert.equal(log.n, 1);

  /* Vao lai trang thai cu: giu quy trinh, go dau bo qua. */
  assert.equal((await json('PATCH', `/api/cards/${created.id}`, { status: 'doing' })).status, 200);
  const again = db.prepare(`SELECT skipped_at FROM card_flows WHERE id = ?`).get(flow.id) as {
    skipped_at: string | null;
  };
  assert.equal(again.skipped_at, null);
});

test('keo the: sang cot khac trang thai bi chan, giua hai cot cung trang thai thi khong', async () => {
  await setEnabled(true, DOING_REVIEW);
  const created = await newCard('Viec keo');
  await json('PATCH', `/api/cards/${created.id}`, { status: 'doing' });
  await addFlow(created.id, 'doing', ['Mot buoc']);

  const doingList = listOf(created.id, 'doing');
  const boardId = (
    db.prepare(`SELECT board_id FROM lists WHERE id = ?`).get(doingList) as {
      board_id: number;
    }
  ).board_id;
  const extraDoing = Number(
    db
      .prepare(
        `INSERT INTO lists (board_id, name, position, status_mapping) VALUES (?, 'Dang lam 2', 2500, 'doing')`
      )
      .run(boardId).lastInsertRowid
  );
  const sameStatus = await json('PATCH', `/api/cards/${created.id}/move`, { list_id: extraDoing });
  assert.equal(sameStatus.status, 200);
  assert.equal(sameStatus.data.flow_prompt, null);

  const reviewList = listOf(created.id, 'review');
  const refused = await json('PATCH', `/api/cards/${created.id}/move`, { list_id: reviewList });
  assert.equal(refused.status, 409);
  assert.equal(card(created.id).list_id, extraDoing, 'khong duoc doi cot khi bi chan');

  const forced = await json('PATCH', `/api/cards/${created.id}/move`, {
    list_id: reviewList,
    skip_flow: true,
  });
  assert.equal(forced.status, 200);
  assert.equal(card(created.id).status, 'review');
  db.prepare(`DELETE FROM lists WHERE id = ?`).run(extraDoing);
});

test('hoan thanh tu chuong thong bao cung qua cung chan', async () => {
  await setEnabled(true, DOING_REVIEW);
  const created = await newCard('Viec chuong');
  await json('PATCH', `/api/cards/${created.id}`, { status: 'doing' });
  await addFlow(created.id, 'doing', ['Buoc']);
  const refused = await json('POST', `/api/notifications/task-${created.id}/complete`, {
    done: true,
  });
  assert.equal(refused.status, 409);
  const ok = await json('POST', `/api/notifications/task-${created.id}/complete`, {
    done: true,
    skip_flow: true,
  });
  assert.equal(ok.status, 200);
  assert.equal(card(created.id).is_done, 1);
});

/* ---------- Lam lan luot va tu chuyen ---------- */

test('buoc lam lan luot; xong buoc cuoi thi tu chuyen sang trang thai ke tiep', async () => {
  await setEnabled(true, DOING_REVIEW);
  const created = await newCard('Viec tuan tu');
  await json('PATCH', `/api/cards/${created.id}`, { status: 'doing' });
  const flow = await addFlow(created.id, 'doing', ['B1', 'B2', 'B3']);
  const [s1, s2, s3] = flow.steps;

  const outOfOrder = await tick(s2.id);
  assert.equal(outOfOrder.status, 409);
  assert.equal(outOfOrder.data.code, 'FLOW_STEP_ORDER');

  assert.equal((await tick(s1.id)).status, 200);
  assert.equal((await tick(s2.id)).status, 200);
  // Chi bo duoc buoc xong sau cung.
  assert.equal((await tick(s1.id, false)).status, 409);
  assert.equal((await tick(s2.id, false)).status, 200);
  assert.equal((await tick(s2.id)).status, 200);

  const last = await tick(s3.id);
  assert.equal(last.status, 200);
  assert.equal(last.data.advanced_to, 'review');
  // Cho duyet dat ask=always va chua co quy trinh: giao dien phai hoi tiep.
  assert.deepEqual(last.data.flow_prompt, { card_id: created.id, status: 'review' });
  const after = card(created.id);
  assert.equal(after.status, 'review');
  assert.equal(after.list_id, listOf(created.id, 'review'), 'the phai sang cot Cho duyet');
  const done = db.prepare(`SELECT completed_at FROM card_flows WHERE id = ?`).get(flow.id) as {
    completed_at: string | null;
  };
  assert.ok(done.completed_at);
});

test('chuoi tu chuyen: mau tu ap cua trang thai moi, xong thi sang Hoan thanh', async () => {
  await setEnabled(true, {
    doing: { steps: [], next_status: 'review', ask: 'always' },
    review: { steps: ['Gui duyet', 'Sua theo gop y'], next_status: 'done', ask: 'auto' },
  });
  const created = await newCard('Viec chuoi');
  await json('PATCH', `/api/cards/${created.id}`, { status: 'doing' });
  const flow = await addFlow(created.id, 'doing', ['Lam']);
  assert.equal((await tick(flow.steps[0].id)).data.advanced_to, 'review');

  const detail = await json('GET', `/api/cards/${created.id}`);
  const flows = detail.data.flows as Flow[];
  const review = flows.find((f) => f.status === 'review');
  assert.ok(review, 'mau ask=auto phai tu tao quy trinh cho Cho duyet');
  assert.deepEqual(
    review.steps.map((s) => s.content),
    ['Gui duyet', 'Sua theo gop y']
  );
  assert.equal(detail.data.flow_total, 2);
  assert.equal(detail.data.flow_done, 0);

  await tick(review.steps[0].id);
  const final = await tick(review.steps[1].id);
  assert.equal(final.data.advanced_to, 'done');
  assert.equal(card(created.id).is_done, 1);
});

test('luong viec khong co cot cho trang thai dich thi chuyen thang sang Hoan thanh', async () => {
  await setEnabled(true, DOING_REVIEW);
  const created = await newCard('Viec thieu cot');
  await json('PATCH', `/api/cards/${created.id}`, { status: 'doing' });
  const reviewList = listOf(created.id, 'review');
  db.prepare(`UPDATE lists SET status_mapping = NULL WHERE id = ?`).run(reviewList);
  try {
    const flow = await addFlow(created.id, 'doing', ['Lam']);
    assert.equal((await tick(flow.steps[0].id)).data.advanced_to, 'done');
    assert.equal(card(created.id).is_done, 1);
  } finally {
    db.prepare(`UPDATE lists SET status_mapping = 'review' WHERE id = ?`).run(reviewList);
  }
});

test('quy trinh chuan bi truoc cho trang thai khac khong keo cong viec di', async () => {
  await setEnabled(true, DOING_REVIEW);
  const created = await newCard('Viec chuan bi');
  const flow = await addFlow(created.id, 'review', ['Chuan bi']);
  const res = await tick(flow.steps[0].id);
  assert.equal(res.data.advanced_to, null);
  assert.equal(card(created.id).status, 'todo');
});

/* ---------- Tao, chep ---------- */

test('tao viec kem flow_steps tao quy trinh cho trang thai ban dau', async () => {
  await setEnabled(true, DOING_REVIEW);
  const created = await newCard('Viec co buoc', { flow_steps: ['Nhan yeu cau', 'Phan loai'] });
  const detail = await json('GET', `/api/cards/${created.id}`);
  const flows = detail.data.flows as Flow[];
  assert.equal(flows.length, 1);
  assert.equal(flows[0].status, created.status);
  assert.equal(flows[0].steps.length, 2);
});

test('mau ask=always khong tu tao — giao dien hoi nguoi dung', async () => {
  await setEnabled(true, {
    doing: { steps: ['Mau 1'], next_status: 'review', ask: 'always' },
  });
  const created = await newCard('Viec hoi');
  const entered = await json('PATCH', `/api/cards/${created.id}`, { status: 'doing' });
  assert.deepEqual(entered.data.flow_prompt, { card_id: created.id, status: 'doing' });
  // Sua truong khac, trang thai khong doi: khong hoi lai.
  const edited = await json('PATCH', `/api/cards/${created.id}`, { title: 'Viec hoi 2' });
  assert.equal(edited.data.flow_prompt, null);
  const count = db
    .prepare(`SELECT COUNT(*) AS n FROM card_flows WHERE card_id = ?`)
    .get(created.id) as { n: number };
  assert.equal(count.n, 0);
  // Nguoi dung chon "Dung mau": bo trong `steps`.
  const flow = await addFlow(created.id, 'doing');
  assert.deepEqual(
    flow.steps.map((s) => s.content),
    ['Mau 1']
  );
});

test('sao chep the va viec lap lai chep quy trinh, dat lai chua xong', async () => {
  await setEnabled(true, DOING_REVIEW);
  const source = await newCard('Viec goc', { due_date: '2030-03-10' });
  await json('PATCH', `/api/cards/${source.id}`, {
    status: 'doing',
    recur_rule: JSON.stringify({ unit: 'week', interval: 1 }),
  });
  const flow = await addFlow(source.id, 'doing', ['X', 'Y']);
  await tick(flow.steps[0].id);

  const copy = await json('POST', `/api/cards/${source.id}/copy`, {});
  assert.equal(copy.status, 201);
  const copied = db
    .prepare(
      `SELECT f.status, s.done_at FROM card_flows f JOIN card_flow_steps s ON s.flow_id = f.id
        WHERE f.card_id = ?`
    )
    .all(Number(copy.data.id)) as { status: string; done_at: string | null }[];
  assert.equal(copied.length, 2);
  assert.ok(copied.every((s) => s.done_at === null));

  await tick(flow.steps[1].id); // xong -> review
  const done = await json('PATCH', `/api/cards/${source.id}`, { status: 'done' });
  assert.equal(done.status, 200);
  const next = db
    .prepare(`SELECT id FROM cards WHERE title = 'Viec goc' AND id <> ? ORDER BY id DESC LIMIT 1`)
    .get(source.id) as { id: number } | undefined;
  assert.ok(next, 'viec lap lai phai sinh ban ke tiep');
  const nextSteps = db
    .prepare(
      `SELECT s.done_at FROM card_flows f JOIN card_flow_steps s ON s.flow_id = f.id
        WHERE f.card_id = ?`
    )
    .all(next.id) as { done_at: string | null }[];
  assert.equal(nextSteps.length, 2);
  assert.ok(nextSteps.every((s) => s.done_at === null));
});

/* ---------- Cau hinh ---------- */

test('mau khong duoc tu chuyen ve chinh no', async () => {
  const res = await json('PUT', '/api/task-flows/settings', {
    templates: { doing: { steps: [], next_status: 'doing', ask: 'never' } },
  });
  assert.equal(res.status, 422);
  assert.equal(res.data.code, 'FLOW_NEXT_SAME');
});

test('bao cao hieu suat van dem viec hoan thanh bo qua quy trinh', async () => {
  await setEnabled(true, DOING_REVIEW);
  /* Tat xac thuc thi "toi" la contacts.is_me (xem middleware/currentUser.ts); CSDL
     test trong nen tu tao — bao cao luon co mat nguoi dang xem. */
  const company = await json('POST', '/api/customers', { name: 'Cong ty Minh' });
  const me = Number(
    db
      .prepare(
        `INSERT INTO contacts (customer_id, full_name, is_me, is_active) VALUES (?, 'Toi', 1, 1)`
      )
      .run(Number(company.data.id)).lastInsertRowid
  );
  const created = await newCard('Viec bao cao', { assignee_contact_id: me });
  await json('PATCH', `/api/cards/${created.id}`, { status: 'doing' });
  await addFlow(created.id, 'doing', ['Chua lam']);
  await json('PATCH', `/api/cards/${created.id}`, { status: 'done', skip_flow: true });

  const report = await json('GET', '/api/views/performance');
  assert.equal(report.status, 200);
  const row = (
    report.data.people as { contact_id: number; completed: number; flow_skipped: number }[]
  ).find((r) => r.contact_id === me);
  assert.ok(row);
  assert.ok(row.completed >= 1);
  assert.ok(row.flow_skipped >= 1, 'phai dem viec hoan thanh bo qua quy trinh');
});
