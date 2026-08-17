/**
 * v27 — PoC, tam dung, tuoi giai doan, hop dong gan du an.
 *
 * Trong tam la buoc DUNG LAI BANG `deals`: no phai giu nguyen moi cot, moi chi
 * muc, va view `deal_scorecard` phu thuoc vao no. Mot cot chep sot o day la mat
 * du lieu im lang tren bang trung tam nhat cua he thong.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { type Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-v27-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';

const { createApp } = await import('../app.ts');
const { db, closeDatabase } = await import('../db/connection.ts');
const { migrate, LATEST_VERSION } = await import('../db/migrate.ts');

const dbDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'db');

let server: Server;
let baseUrl = '';

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

async function newDeal(title: string): Promise<number> {
  const customer = await json('POST', '/api/customers', { name: `KH ${title}` });
  const deal = await json('POST', '/api/deals', {
    customer_id: Number(customer.data.id),
    title,
  });
  assert.equal(deal.status, 201);
  return Number(deal.data.id);
}

/* ---------- Dung lai bang deals ---------- */

test('bang deals sau khi dung lai giu nguyen cot, chi muc va view phu thuoc', () => {
  const columns = (db.prepare(`PRAGMA table_info(deals)`).all() as { name: string }[]).map(
    (c) => c.name
  );

  /* Cac cot tich tu qua nhieu phien ban — moi cai la mot lan bang duoc mo rong.
     Chep sot bat ky cai nao la mat du lieu ma khong co thong bao loi nao. */
  for (const column of [
    'id',
    'customer_id',
    'contact_id',
    'title',
    'product',
    'stage',
    'probability',
    'value_vnd',
    'won_value_vnd',
    'position',
    'expected_close_date',
    'closed_at',
    'lost_reason',
    'lost_note',
    'source',
    'need',
    'next_action',
    'next_action_date',
    'is_renewal',
    'notes',
    'search_text',
    'created_at',
    'updated_at',
    'bant_total',
    'p4_total',
    'score_updated_at',
    'score_snapshot',
    'project_id',
    'handover_ready',
    'poc_scope',
    'poc_start_date',
    'poc_end_date',
    'poc_criteria',
    'poc_result',
    'on_hold',
    'on_hold_reason',
    'on_hold_review_date',
    'stage_entered_at',
  ]) {
    assert.ok(columns.includes(column), `mat cot ${column} sau khi dung lai bang`);
  }

  /* View `deal_scorecard` la thu ca module cham diem doc qua — DEAL_SELECT join
     thang vao no, nen mat view la moi truy van co hoi deu hong. */
  const views = (
    db.prepare(`SELECT name FROM sqlite_master WHERE type = 'view'`).all() as { name: string }[]
  ).map((v) => v.name);
  assert.ok(views.includes('deal_scorecard'));

  const indexes = (
    db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'deals'`)
      .all() as { name: string }[]
  ).map((i) => i.name);
  assert.ok(indexes.includes('idx_deals_stage'), 'chi muc cua v1 phai duoc tao lai');
  assert.ok(
    indexes.includes('idx_deals_project_unique'),
    'chi muc duy nhat cua v23 phai duoc tao lai — mat no la mat ca rang buoc'
  );

  assert.deepEqual(db.pragma('foreign_key_check'), []);
  assert.equal((db.pragma('integrity_check', { simple: true }) as string).toLowerCase(), 'ok');
});

test('rang buoc duy nhat cua v23 van con hieu luc sau khi dung lai bang', async () => {
  const customer = await json('POST', '/api/customers', { name: 'KH kiem rang buoc' });
  const customerId = Number(customer.data.id);
  const project = await json('POST', '/api/projects', { name: 'Du an kiem rang buoc' });
  const projectId = Number(project.data.id);

  const first = await json('POST', '/api/deals', { customer_id: customerId, title: 'Co hoi 1' });
  const second = await json('POST', '/api/deals', { customer_id: customerId, title: 'Co hoi 2' });

  assert.equal(
    (await json('PATCH', `/api/deals/${Number(first.data.id)}`, { project_id: projectId })).status,
    200
  );
  const clash = await json('PATCH', `/api/deals/${Number(second.data.id)}`, {
    project_id: projectId,
  });
  assert.equal(clash.status, 409);
});

/* ---------- S03: PoC ---------- */

test('poc la mot giai doan that, keo duoc va mang ho so rieng', async () => {
  const dealId = await newDeal('Co hoi PoC');

  const moved = await json('PATCH', `/api/deals/${dealId}`, { stage: 'poc' });
  assert.equal(moved.status, 200);
  assert.equal(moved.data.stage, 'poc');
  assert.equal(moved.data.probability, 50, 'xac suat nam giua discussing va quoted');

  const filled = await json('PATCH', `/api/deals/${dealId}`, {
    poc_scope: 'Thu nghiem luong tong dai tren 20 may le',
    poc_start_date: '2026-09-01',
    poc_end_date: '2026-09-30',
    poc_criteria: 'Ty le rot cuoc duoi 1%',
  });
  assert.equal(filled.data.poc_scope, 'Thu nghiem luong tong dai tren 20 may le');
  assert.equal(filled.data.poc_criteria, 'Ty le rot cuoc duoi 1%');

  // Va no phai nam trong phan nhom theo giai doan cua danh sach pipeline.
  const board = await json('GET', '/api/deals');
  const stages = board.data.stages as Record<string, { id: number }[]>;
  assert.ok(stages.poc.some((d) => d.id === dealId));
});

/* ---------- S08: tam dung ---------- */

test('tam dung phai co ly do va ngay xem xet lai', async () => {
  const dealId = await newDeal('Co hoi tam dung');

  const bare = await json('PATCH', `/api/deals/${dealId}`, { on_hold: true });
  assert.equal(bare.status, 422);
  assert.equal(bare.data.code, 'ON_HOLD_NEEDS_REASON');

  const partial = await json('PATCH', `/api/deals/${dealId}`, {
    on_hold: true,
    on_hold_reason: 'Khach hoan ngan sach',
  });
  assert.equal(partial.status, 422, 'thieu ngay xem xet lai van bi chan');

  const done = await json('PATCH', `/api/deals/${dealId}`, {
    on_hold: true,
    on_hold_reason: 'Khach hoan ngan sach sang quy sau',
    on_hold_review_date: '2026-12-01',
  });
  assert.equal(done.status, 200);
  assert.equal(done.data.on_hold, 1);
});

test('tam dung giu nguyen giai doan; doi giai doan thi tu bo tam dung', async () => {
  const dealId = await newDeal('Co hoi dung giua chung');
  /* Dung 'discussing' va 'poc' — hai giai doan KHONG co cong diem BANT chan
     ('quoted' can 7, 'negotiating' can 9). Test nay noi ve tam dung, khong nen
     phu thuoc vao diem cham cua mot co hoi vua tao. */
  const staged = await json('PATCH', `/api/deals/${dealId}`, { stage: 'discussing' });
  assert.equal(staged.status, 200);

  await json('PATCH', `/api/deals/${dealId}`, {
    on_hold: true,
    on_hold_reason: 'Cho phe duyet noi bo cua khach',
    on_hold_review_date: '2026-11-15',
  });

  /* Day la ly do tam dung KHONG phai mot giai doan: co hoi van o 'discussing',
     nen khi mo lai thi biet ro phai tiep tuc tu dau. */
  const held = await json('GET', `/api/deals/${dealId}`);
  assert.equal(held.data.stage, 'discussing');
  assert.equal(held.data.on_hold, 1);

  const resumed = await json('PATCH', `/api/deals/${dealId}`, { stage: 'poc' });
  assert.equal(resumed.status, 200);
  assert.equal(resumed.data.on_hold, 0, 'chuyen giai doan la mot dong thai co y');
  assert.equal(resumed.data.on_hold_reason, null);
  assert.equal(resumed.data.on_hold_review_date, null);
});

test('bo tam dung thu cong thi don sach ly do cua lan truoc', async () => {
  const dealId = await newDeal('Co hoi bo tam dung');
  await json('PATCH', `/api/deals/${dealId}`, {
    on_hold: true,
    on_hold_reason: 'Ly do cu',
    on_hold_review_date: '2026-10-01',
  });

  const cleared = await json('PATCH', `/api/deals/${dealId}`, { on_hold: false });
  assert.equal(cleared.data.on_hold, 0);
  assert.equal(cleared.data.on_hold_reason, null, 'de lai se hien nham o lan tam dung sau');
  assert.equal(cleared.data.on_hold_review_date, null);
});

/* ---------- R-08: tuoi giai doan ---------- */

test('tuoi giai doan dat lai moi lan doi giai doan, khong doi khi sua truong khac', async () => {
  const dealId = await newDeal('Co hoi dem tuoi');

  /* Lui moc ve qua khu roi sua mot truong KHONG phai giai doan: `updated_at` se
     nhay nhung tuoi giai doan phai giu nguyen — do chinh la ly do khong dung
     `updated_at` lam nguon. */
  db.prepare(
    `UPDATE deals SET stage_entered_at = datetime('now','localtime','-40 days') WHERE id = ?`
  ).run(dealId);

  const noted = await json('PATCH', `/api/deals/${dealId}`, { notes: 'ghi chu moi' });
  assert.equal(noted.data.days_in_stage, 40, 'sua ghi chu khong lam tuoi giai doan chay lai');

  const moved = await json('PATCH', `/api/deals/${dealId}`, { stage: 'approaching' });
  assert.equal(moved.data.days_in_stage, 0, 'doi giai doan thi dem lai tu dau');
});

test('keo the qua endpoint move cung dat lai moc tuoi giai doan', async () => {
  const dealId = await newDeal('Co hoi keo the');
  db.prepare(
    `UPDATE deals SET stage_entered_at = datetime('now','localtime','-30 days') WHERE id = ?`
  ).run(dealId);

  const moved = await json('PATCH', `/api/deals/${dealId}/move`, {
    stage: 'discussing',
    beforeId: null,
    afterId: null,
  });
  assert.equal(moved.status, 200);
  assert.equal(moved.data.days_in_stage, 0);
});

/* ---------- Hop dong gan du an ---------- */

test('hop dong gan duoc du an, va gia tri chay vao chi so cua du an', async () => {
  const customer = await json('POST', '/api/customers', { name: 'KH co hop dong' });
  const customerId = Number(customer.data.id);
  const project = await json('POST', '/api/projects', {
    name: 'Du an co hop dong',
    customer_id: customerId,
  });
  const projectId = Number(project.data.id);

  const contract = await json('POST', '/api/contracts', {
    customer_id: customerId,
    name: 'Hop dong trien khai',
    value_vnd: 750_000_000,
    project_id: projectId,
  });
  assert.equal(contract.status, 201);
  assert.equal(contract.data.project_id, projectId);
  assert.equal(contract.data.project_name, 'Du an co hop dong');

  /* Truoc v27 o nay luon bang 0 vi khong duong nao ghi `contracts.project_id`. */
  const detail = await json('GET', `/api/projects/${projectId}`);
  assert.equal(detail.data.contract_value_vnd, 750_000_000);
  assert.equal(detail.data.contract_count, 1);

  /* Va gia tri do gio moi thuc su dung duoc lam tieu chi phan loai A/B. */
  const classification = detail.data.classification as {
    suggested: string;
    signals: { key: string; value: number; crossed: boolean }[];
  };
  const value = classification.signals.find((s) => s.key === 'contract_value_vnd');
  assert.equal(value?.value, 750_000_000);
  assert.equal(value?.crossed, true);
  assert.equal(classification.suggested, 'A');
});

/* ---------- Quay lui ---------- */

test('quay lui v27 keo co hoi PoC ve discussing thay vi de lai gia tri la', () => {
  const target = new Database(':memory:');
  try {
    migrate(target, 27);
    const customerId = Number(
      target
        .prepare(`INSERT INTO customers (name, search_text) VALUES (?, ?)`)
        .run('Khach hang', 'khach hang').lastInsertRowid
    );
    const pocId = Number(
      target
        .prepare(
          `INSERT INTO deals (customer_id, title, stage, position, search_text, poc_scope, on_hold)
           VALUES (?, ?, 'poc', 1024, '', 'pham vi thu nghiem', 1)`
        )
        .run(customerId, 'Co hoi PoC').lastInsertRowid
    );
    const otherId = Number(
      target
        .prepare(
          `INSERT INTO deals (customer_id, title, stage, position, search_text)
           VALUES (?, ?, 'negotiating', 2048, '')`
        )
        .run(customerId, 'Co hoi khac').lastInsertRowid
    );

    target.exec(fs.readFileSync(path.join(dbDir, 'migrate-v27-rollback.sql'), 'utf8'));
    target.pragma('user_version = 26');

    /* Khong con ban ghi nao mang gia tri ma ung dung v26 khong hieu. */
    const poc = target.prepare(`SELECT stage FROM deals WHERE id = ?`).get(pocId) as {
      stage: string;
    };
    assert.equal(poc.stage, 'discussing');
    const other = target.prepare(`SELECT stage FROM deals WHERE id = ?`).get(otherId) as {
      stage: string;
    };
    assert.equal(other.stage, 'negotiating', 'co hoi khac khong bi dung toi');

    const columns = (target.prepare(`PRAGMA table_info(deals)`).all() as { name: string }[]).map(
      (c) => c.name
    );
    for (const column of ['poc_scope', 'on_hold', 'stage_entered_at']) {
      assert.ok(!columns.includes(column), `${column} phai bi bo`);
    }

    assert.deepEqual(target.pragma('foreign_key_check'), []);
    migrate(target);
    assert.equal(target.pragma('user_version', { simple: true }), LATEST_VERSION);
  } finally {
    target.close();
  }
});
