/**
 * v26 — lop Delivery: giai doan, phan loai A/B, so rui ro, nghiem thu.
 *
 * Trong tam la cac quy tac NGHIEP VU de bi lam sai khi sua ve sau: vuot bat ky
 * nguong nao la Mo hinh A (khong phai trung binh cong), chot khac de xuat thi
 * bat buoc co ly do, va do bo mau khong bao gio duoc xoa viec dang co.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { type Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-v26-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';

const { createApp } = await import('../app.ts');
const { closeDatabase } = await import('../db/connection.ts');
const { migrate, LATEST_VERSION } = await import('../db/migrate.ts');
const { milestoneStateOf } = await import('../services/deliveryService.ts');

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

async function newProject(name: string, extra: Record<string, unknown> = {}): Promise<number> {
  const res = await json('POST', '/api/projects', { name, ...extra });
  assert.equal(res.status, 201);
  return Number(res.data.id);
}

interface Signal {
  key: string;
  value: number;
  threshold: number;
  crossed: boolean;
}

/* ---------- R-11: phan loai mo hinh ---------- */

test('du an nho khong vuot nguong nao thi de xuat Mo hinh B', async () => {
  const id = await newProject('Cap tai khoan le');
  const res = await json('GET', `/api/projects/${id}/classification`);

  assert.equal(res.status, 200);
  assert.equal(res.data.suggested, 'B');
  assert.equal(res.data.chosen, null, 'chua ai chot thi phai la null, khong tu dien');
  assert.ok((res.data.signals as Signal[]).every((s) => !s.crossed));
});

test('vuot DUNG MOT nguong da du de de xuat Mo hinh A', async () => {
  /* Gia tri hop dong bang 0 nhung keo dai 200 ngay: neu cham diem bang trung binh
     cong thi du an nay se chim xuong B, va do la loi ma test nay chan. */
  const id = await newProject('Dich vu van hanh dai han', {
    plan_start: '2026-01-01',
    plan_end: '2026-07-20',
  });
  const res = await json('GET', `/api/projects/${id}/classification`);

  assert.equal(res.data.suggested, 'A');
  const crossed = (res.data.signals as Signal[]).filter((s) => s.crossed);
  assert.equal(crossed.length, 1);
  assert.equal(crossed[0].key, 'duration_days');
});

test('gia tri phan loai lay tu hop dong, thieu hop dong thi lay tu co hoi nguon', async () => {
  const customer = await json('POST', '/api/customers', { name: 'Cong ty lon' });
  const customerId = Number(customer.data.id);
  const projectId = await newProject('Trien khai lon', { customer_id: customerId });

  const deal = await json('POST', '/api/deals', {
    customer_id: customerId,
    title: 'Co hoi lon',
    value_vnd: 800_000_000,
    project_id: projectId,
  });
  assert.equal(deal.status, 201);

  const fromDeal = await json('GET', `/api/projects/${projectId}/classification`);
  assert.equal(fromDeal.data.suggested, 'A');
  const value = (fromDeal.data.signals as Signal[]).find((s) => s.key === 'contract_value_vnd');
  assert.equal(value?.value, 800_000_000);
});

test('chot dung de xuat thi khong hoi ly do; chot khac de xuat thi bat buoc', async () => {
  const id = await newProject('Du an nho chot tay');

  // Dung de xuat (B) — khong ly do van duoc.
  const agreed = await json('PUT', `/api/projects/${id}/model`, { model: 'B' });
  assert.equal(agreed.status, 200);
  assert.equal(agreed.data.chosen, 'B');
  assert.equal(agreed.data.overridden, false);

  // Khac de xuat ma khong ly do -> chan.
  const bare = await json('PUT', `/api/projects/${id}/model`, { model: 'A' });
  assert.equal(bare.status, 422);
  assert.equal(bare.data.code, 'MODEL_REASON_REQUIRED');
  assert.equal(bare.data.suggested, 'B');

  // Ly do qua ngan cung bi chan.
  const terse = await json('PUT', `/api/projects/${id}/model`, { model: 'A', reason: 'vi the' });
  assert.equal(terse.status, 422);

  const justified = await json('PUT', `/api/projects/${id}/model`, {
    model: 'A',
    reason: 'Khach hang yeu cau UAT rieng va co tich hop ben thu ba',
  });
  assert.equal(justified.status, 200);
  assert.equal(justified.data.chosen, 'A');
  assert.equal(justified.data.overridden, true, 'phai danh dau la chot khac de xuat');

  // Quyet dinh nay phai de lai dau vet.
  const detail = await json('GET', `/api/projects/${id}`);
  const changes = detail.data.changes as { field: string; new_value: string }[];
  assert.ok(changes.some((c) => c.field === 'delivery_model' && c.new_value === 'A'));
});

/* ---------- R-12: bo List mau ---------- */

test('do bo mau P01-P09 thay cot mac dinh va gan dung anh xa trang thai', async () => {
  const board = await json('POST', '/api/boards', { name: 'Trien khai OmiCX' });
  const boardId = Number(board.data.id);

  const lists = (await json('POST', `/api/boards/${boardId}/template`, { key: 'large' }))
    .data as unknown as { name: string; status_mapping: string | null }[];

  assert.equal(lists.length, 9, 'chin buoc P01-P09 cua dac ta 6.4');
  assert.match(lists[0].name, /^P01/);
  assert.match(lists[8].name, /^P09/);
  assert.equal(lists[8].status_mapping, 'done');
  // UAT la buoc CHO KHACH HANG, khong phai 'doing' — phan biet duoc moi biet nen nhac ai.
  const uat = lists.find((l) => /UAT/.test(l.name));
  assert.equal(uat?.status_mapping, 'waiting_customer');
  // Hypercare khong mang nghia vong doi nao.
  const hypercare = lists.find((l) => /Hypercare/.test(l.name));
  assert.equal(hypercare?.status_mapping, null);
});

test('bo mau nho co dung nam buoc cua dac ta 6.5', async () => {
  const board = await json('POST', '/api/boards', { name: 'Cap tai khoan' });
  const lists = (
    await json('POST', `/api/boards/${Number(board.data.id)}/template`, {
      key: 'small',
    })
  ).data as unknown as { name: string }[];
  assert.equal(lists.length, 5);
});

test('bang da co cong viec thi khong do mau duoc — khong xoa viec dang co', async () => {
  const board = await json('POST', '/api/boards', { name: 'Bang dang dung' });
  const boardId = Number(board.data.id);
  const full = (await json('GET', `/api/boards/${boardId}/full`)).data as unknown as {
    lists: { id: number }[];
  };
  await json('POST', '/api/cards', { list_id: full.lists[0].id, title: 'Viec dang lam' });

  const blocked = await json('POST', `/api/boards/${boardId}/template`, { key: 'large' });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.code, 'BOARD_NOT_EMPTY');

  // Cac cot cu phai con nguyen ven.
  const after = (await json('GET', `/api/boards/${boardId}/full`)).data as unknown as {
    lists: unknown[];
  };
  assert.equal(after.lists.length, 4);
});

test('bo mau khong ton tai bi tu choi thay vi tao bang rong', async () => {
  const board = await json('POST', '/api/boards', { name: 'Bang thu' });
  const res = await json('POST', `/api/boards/${Number(board.data.id)}/template`, {
    key: 'khong-co-that',
  });
  assert.equal(res.status, 422);
  assert.equal(res.data.code, 'BOARD_TEMPLATE_EMPTY');
});

/* ---------- R-03: giai doan va moc ---------- */

test('trang thai moc tinh tu ngay va tu viec ben trong, xong thi thang moi dieu kien', () => {
  const today = new Date('2026-06-15T00:00:00');

  assert.equal(
    milestoneStateOf({ milestone_date: null, card_total: 0, card_done: 0 }, today),
    'none'
  );
  assert.equal(
    milestoneStateOf({ milestone_date: '2026-06-01', card_total: 5, card_done: 2 }, today),
    'overdue'
  );
  assert.equal(
    milestoneStateOf({ milestone_date: '2026-06-18', card_total: 5, card_done: 2 }, today),
    'due_soon'
  );
  assert.equal(
    milestoneStateOf({ milestone_date: '2026-08-01', card_total: 5, card_done: 2 }, today),
    'on_track'
  );
  /* Da xong het viec thi ngay thang qua di khong con lam no tre — bao do mot thu
     da hoan tat chi tao bao dong gia. */
  assert.equal(
    milestoneStateOf({ milestone_date: '2026-06-01', card_total: 5, card_done: 5 }, today),
    'done'
  );
});

test('moi bang cua du an la mot giai doan, sap theo han', async () => {
  const projectId = await newProject('Du an nhieu giai doan');
  for (const [name, date] of [
    ['Giai doan 3', '2026-12-01'],
    ['Giai doan 1', '2026-06-01'],
    ['Giai doan 2', '2026-09-01'],
  ] as const) {
    const board = await json('POST', '/api/boards', { name, project_id: projectId });
    await json('PATCH', `/api/boards/${Number(board.data.id)}`, { milestone_date: date });
  }

  const detail = await json('GET', `/api/projects/${projectId}`);
  const phases = detail.data.phases as { name: string; milestone_date: string; state: string }[];
  assert.deepEqual(
    phases.map((p) => p.name),
    ['Giai doan 1', 'Giai doan 2', 'Giai doan 3']
  );
  assert.ok(phases.every((p) => p.state !== 'none'));
});

/* ---------- R-13: so rui ro va nghiem thu ---------- */

test('so rui ro gom bon loai va sap theo muc do can xu ly', async () => {
  const projectId = await newProject('Du an co rui ro');

  await json('POST', `/api/projects/${projectId}/risks`, {
    kind: 'risk',
    title: 'Rui ro nhe',
    severity: 'low',
  });
  await json('POST', `/api/projects/${projectId}/risks`, {
    kind: 'change',
    title: 'Change Request mo rong pham vi',
    severity: 'high',
  });
  const closed = await json('POST', `/api/projects/${projectId}/risks`, {
    kind: 'issue',
    title: 'Van de da xu ly',
    severity: 'high',
  });
  await json('PATCH', `/api/projects/${projectId}/risks/${Number(closed.data.id)}`, {
    status: 'closed',
    resolution: 'Da vá cấu hình',
  });

  const risks = (await json('GET', `/api/projects/${projectId}/risks`)).data as unknown as {
    title: string;
    status: string;
    closed_at: string | null;
  }[];

  assert.equal(risks.length, 3);
  assert.equal(risks[0].title, 'Change Request mo rong pham vi', 'nghiem trong va con mo len dau');
  assert.equal(risks[2].status, 'closed', 'muc da dong xuong cuoi');
  assert.ok(risks[2].closed_at, 'dong thi phai co moc thoi gian');
});

test('mo lai mot muc da dong thi xoa moc thoi gian dong', async () => {
  const projectId = await newProject('Du an mo lai rui ro');
  const created = await json('POST', `/api/projects/${projectId}/risks`, { title: 'Van de' });
  const riskId = Number(created.data.id);

  await json('PATCH', `/api/projects/${projectId}/risks/${riskId}`, { status: 'closed' });
  const reopened = await json('PATCH', `/api/projects/${projectId}/risks/${riskId}`, {
    status: 'open',
  });
  assert.equal(reopened.data.closed_at, null);
});

test('ho so nghiem thu luu duoc va moc nghiem thu di vao nhat ky', async () => {
  const projectId = await newProject('Du an nghiem thu');
  const saved = await json('PATCH', `/api/projects/${projectId}`, {
    acceptance_criteria: 'UAT dat 100% ca kiem thu bat buoc, khong con loi muc cao',
    accepted_at: '2026-08-01',
    accepted_note: 'Bien ban so 12',
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.accepted_at, '2026-08-01');

  const detail = await json('GET', `/api/projects/${projectId}`);
  const changes = detail.data.changes as { field: string }[];
  assert.ok(changes.some((c) => c.field === 'accepted_at'));
});

/* ---------- Cau hinh ---------- */

test('cau hinh delivery doc/ghi duoc, hai bo mau large va small la bat buoc', async () => {
  const before = await json('GET', '/api/settings/delivery');
  assert.equal(before.status, 200);
  const thresholds = before.data.classification as Record<string, number>;
  assert.equal(thresholds.contract_value_vnd, 500_000_000);

  const missing = await json('PUT', '/api/settings/delivery', {
    board_templates: { large: [{ name: 'Chi co large', status: null }] },
  });
  assert.equal(missing.status, 422);
  assert.equal(missing.data.code, 'BOARD_TEMPLATE_REQUIRED');

  const saved = await json('PUT', '/api/settings/delivery', {
    classification: {
      contract_value_vnd: 200_000_000,
      duration_days: 30,
      phase_count: 2,
      team_count: 2,
    },
  });
  assert.equal(saved.status, 200);
  assert.equal((saved.data.classification as Record<string, number>).duration_days, 30);

  /* Nguong da ha xuong thi mot du an truoc do la B co the thanh A — day chinh la
     ly do nguong phai cau hinh duoc thay vi ma hoa cung. */
  const id = await newProject('Du an sat nguong moi', {
    plan_start: '2026-01-01',
    plan_end: '2026-03-01',
  });
  const res = await json('GET', `/api/projects/${id}/classification`);
  assert.equal(res.data.suggested, 'A');
});

/* ---------- Quay lui ---------- */

test('quay lui v26 bo lop Delivery nhung giu lai bang va danh sach da tao', () => {
  const target = new Database(':memory:');
  try {
    migrate(target, 26);
    const projectId = Number(
      target
        .prepare(`INSERT INTO projects (name, search_text, delivery_model) VALUES (?, ?, 'A')`)
        .run('Du an', 'du an').lastInsertRowid
    );
    const boardId = Number(
      target
        .prepare(
          `INSERT INTO boards (name, project_id, milestone_date) VALUES (?, ?, '2026-09-01')`
        )
        .run('Giai doan 1', projectId).lastInsertRowid
    );
    target
      .prepare(`INSERT INTO lists (board_id, name, position, status_mapping) VALUES (?, ?, ?, ?)`)
      .run(boardId, 'P05 UAT', 1024, 'waiting_customer');
    target
      .prepare(`INSERT INTO project_risks (project_id, title) VALUES (?, ?)`)
      .run(projectId, 'Mot rui ro');

    target.exec(fs.readFileSync(path.join(dbDir, 'migrate-v26-rollback.sql'), 'utf8'));
    target.pragma('user_version = 25');

    const tables = (
      target.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as {
        name: string;
      }[]
    ).map((t) => t.name);
    assert.ok(!tables.includes('project_risks'));

    const boardCols = (target.prepare(`PRAGMA table_info(boards)`).all() as { name: string }[]).map(
      (c) => c.name
    );
    assert.ok(!boardCols.includes('milestone_date'));

    const projectCols = (
      target.prepare(`PRAGMA table_info(projects)`).all() as { name: string }[]
    ).map((c) => c.name);
    for (const col of ['delivery_model', 'model_reason', 'acceptance_criteria', 'accepted_at']) {
      assert.ok(!projectCols.includes(col), `${col} phai bi bo`);
    }

    /* Bang va danh sach sinh ra tu bo mau la du lieu binh thuong cua v17/v19 —
       quay lui v26 khong duoc dung toi chung. */
    const list = target
      .prepare(`SELECT name, status_mapping FROM lists WHERE board_id = ?`)
      .get(boardId) as { name: string; status_mapping: string };
    assert.equal(list.name, 'P05 UAT');
    assert.equal(list.status_mapping, 'waiting_customer');

    assert.deepEqual(target.pragma('foreign_key_check'), []);
    migrate(target);
    assert.equal(target.pragma('user_version', { simple: true }), LATEST_VERSION);
  } finally {
    target.close();
  }
});
