/**
 * v23 — cau noi Sales -> Delivery.
 *
 * Trong tam la cac bat bien khong the kiem bang mat: mot du an khong bi hai co
 * hoi cung nhan, du lieu lich su khong boc len canh bao gia sau khi migrate, va
 * kich ban quay lui khong cuon theo cac lien ket nguoi dung da tao.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { type Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-v23-'));
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

async function newCustomer(name: string): Promise<number> {
  const res = await json('POST', '/api/customers', { name });
  assert.equal(res.status, 201);
  return Number(res.data.id);
}

async function newProject(name: string, customerId?: number): Promise<number> {
  const res = await json('POST', '/api/projects', { name, customer_id: customerId ?? null });
  assert.equal(res.status, 201);
  return Number(res.data.id);
}

async function newDeal(customerId: number, title: string): Promise<number> {
  const res = await json('POST', '/api/deals', { customer_id: customerId, title });
  assert.equal(res.status, 201);
  return Number(res.data.id);
}

/* ---------- Hinh dang schema sau khi migrate ---------- */

test('v23 them cot ban giao va bang nhat ky, khong dong cot lien ket nao moi', () => {
  const dealColumns = (db.prepare(`PRAGMA table_info(deals)`).all() as { name: string }[]).map(
    (c) => c.name
  );
  assert.ok(dealColumns.includes('handover_ready'));
  // `project_id` phai la cot CO SAN tu v17, khong phai cot v23 vua them.
  assert.ok(dealColumns.includes('project_id'));
  // Khong tao cot doi xung: mot quan he, mot nguon su that.
  const projectColumns = (
    db.prepare(`PRAGMA table_info(projects)`).all() as { name: string }[]
  ).map((c) => c.name);
  assert.ok(!projectColumns.includes('source_deal_id'));

  /* Kiem CHUA DU cac cot cua v23 chu khong so bang danh sach: cac ban sau con
     them cot vao bang nay (v24 them `actor_contact_id`), va mot phep so bang se
     hong moi lan do — bao dong khong lien quan gi den dieu test nay bao ve. */
  const logColumns = (
    db.prepare(`PRAGMA table_info(entity_change_log)`).all() as { name: string }[]
  ).map((c) => c.name);
  for (const column of [
    'id',
    'entity_type',
    'entity_id',
    'field',
    'old_value',
    'new_value',
    'note',
    'changed_at',
  ]) {
    assert.ok(logColumns.includes(column), `thieu cot ${column}`);
  }
});

test('co hoi da dong truoc khi migrate khong bi coi la dang cho ban giao', () => {
  /* Mo phong du lieu lich su: len v22 roi chen mot co hoi da Won, sau do migrate
     tiep len v23. Neu backfill sai, moi co hoi Won cu se boc len canh bao "chua
     ban giao" vao sang hom sau ma khong ai lam gi. */
  const legacy = new Database(':memory:');
  try {
    migrate(legacy, 22);
    const customerId = Number(
      legacy
        .prepare(`INSERT INTO customers (name, search_text) VALUES (?, ?)`)
        .run('Khach cu', 'khach cu').lastInsertRowid
    );
    legacy
      .prepare(
        `INSERT INTO deals (customer_id, title, stage, position, search_text, closed_at)
         VALUES (?, ?, 'won', 1024, '', '2024-01-01 09:00:00')`
      )
      .run(customerId, 'Co hoi da thang tu lau');
    legacy
      .prepare(
        `INSERT INTO deals (customer_id, title, stage, position, search_text)
         VALUES (?, ?, 'negotiating', 2048, '')`
      )
      .run(customerId, 'Co hoi dang dam phan');

    migrate(legacy);
    assert.equal(legacy.pragma('user_version', { simple: true }), LATEST_VERSION);

    const rows = legacy
      .prepare(`SELECT title, stage, handover_ready FROM deals ORDER BY id`)
      .all() as { title: string; stage: string; handover_ready: number }[];
    assert.equal(rows[0].handover_ready, 1, 'co hoi Won cu phai duoc coi la da ban giao xong');
    assert.equal(rows[1].handover_ready, 0, 'co hoi dang mo chua ban giao gi ca');
  } finally {
    legacy.close();
  }
});

/* ---------- Rang buoc mot co hoi <-> mot du an ---------- */

test('mot du an chi nhan duoc mot co hoi nguon, loi noi ro co hoi nao dang giu', async () => {
  const customerId = await newCustomer('Cong ty Alpha');
  const projectId = await newProject('Trien khai Alpha', customerId);
  const firstDeal = await newDeal(customerId, 'Co hoi Alpha 2026');
  const secondDeal = await newDeal(customerId, 'Co hoi Alpha mo rong');

  const linked = await json('PATCH', `/api/deals/${firstDeal}`, { project_id: projectId });
  assert.equal(linked.status, 200);
  assert.equal(linked.data.project_id, projectId);
  assert.equal(linked.data.project_name, 'Trien khai Alpha');

  const clash = await json('PATCH', `/api/deals/${secondDeal}`, { project_id: projectId });
  assert.equal(clash.status, 409);
  assert.equal(clash.data.code, 'PROJECT_ALREADY_LINKED');
  assert.equal(clash.data.deal_id, firstDeal);
  // Thong bao phai goi TEN co hoi dang giu, khong phai ten rang buoc CSDL.
  assert.match(String(clash.data.error), /Co hoi Alpha 2026/);

  // Go lien ket roi gan lai cho co hoi khac thi phai duoc.
  assert.equal((await json('PATCH', `/api/deals/${firstDeal}`, { project_id: null })).status, 200);
  assert.equal(
    (await json('PATCH', `/api/deals/${secondDeal}`, { project_id: projectId })).status,
    200
  );
});

test('khong gan duoc du an cua khach hang khac', async () => {
  const alpha = await newCustomer('Cong ty Beta');
  const beta = await newCustomer('Cong ty Gamma');
  const projectId = await newProject('Trien khai Gamma', beta);
  const dealId = await newDeal(alpha, 'Co hoi Beta');

  const res = await json('PATCH', `/api/deals/${dealId}`, { project_id: projectId });
  assert.equal(res.status, 422);
  assert.equal(res.data.code, 'CROSS_CUSTOMER_LINK');
});

test('du an noi bo khong co khach hang van gan duoc vao co hoi bat ky', async () => {
  const customerId = await newCustomer('Cong ty Delta');
  const projectId = await newProject('Nang cap ha tang noi bo');
  const dealId = await newDeal(customerId, 'Co hoi Delta');

  assert.equal(
    (await json('PATCH', `/api/deals/${dealId}`, { project_id: projectId })).status,
    200
  );
});

test('lien ket hai chieu: co hoi thay du an, du an thay co hoi nguon', async () => {
  const customerId = await newCustomer('Cong ty Epsilon');
  const projectId = await newProject('Trien khai Epsilon', customerId);
  const dealId = await newDeal(customerId, 'Co hoi Epsilon');
  await json('PATCH', `/api/deals/${dealId}`, { project_id: projectId, value_vnd: 500_000_000 });

  /* Chieu Sales -> Delivery: chi thong tin TONG QUAN, khong sao chep noi dung. */
  const deal = await json('GET', `/api/deals/${dealId}`);
  const project = deal.data.project as Record<string, unknown>;
  assert.equal(project.id, projectId);
  assert.equal(project.name, 'Trien khai Epsilon');
  assert.ok('progress_pct' in project && 'health' in project);

  /* Chieu Delivery -> Sales. */
  const detail = await json('GET', `/api/projects/${projectId}`);
  const deals = detail.data.deals as { id: number; title: string }[];
  assert.equal(deals.length, 1);
  assert.equal(deals[0].id, dealId);
  assert.equal(deals[0].title, 'Co hoi Epsilon');
});

/* ---------- Nhat ky thay doi ---------- */

test('nhat ky ghi lai gia tri truoc/sau va bo qua truong khong theo doi', async () => {
  const customerId = await newCustomer('Cong ty Zeta');
  const dealId = await newDeal(customerId, 'Co hoi Zeta');

  await json('PATCH', `/api/deals/${dealId}`, { value_vnd: 200_000_000 });
  await json('PATCH', `/api/deals/${dealId}`, { value_vnd: 350_000_000, notes: 'ghi chu moi' });

  const detail = await json('GET', `/api/deals/${dealId}`);
  const changes = detail.data.changes as {
    field: string;
    old_value: string | null;
    new_value: string | null;
  }[];

  const values = changes.filter((c) => c.field === 'value_vnd');
  assert.equal(values.length, 2);
  assert.equal(values[0].old_value, '200000000');
  assert.equal(values[0].new_value, '350000000');
  // `notes` khong nam trong danh sach theo doi — nhat ky phai doc duoc, khong phai day du.
  assert.ok(!changes.some((c) => c.field === 'notes'));
});

test('luu lai ma khong doi gi thi khong sinh dong nhat ky rong', async () => {
  const customerId = await newCustomer('Cong ty Eta');
  const dealId = await newDeal(customerId, 'Co hoi Eta');
  await json('PATCH', `/api/deals/${dealId}`, { value_vnd: 100_000_000 });

  const before = ((await json('GET', `/api/deals/${dealId}`)).data.changes as unknown[]).length;
  await json('PATCH', `/api/deals/${dealId}`, { value_vnd: 100_000_000 });
  const after = ((await json('GET', `/api/deals/${dealId}`)).data.changes as unknown[]).length;

  assert.equal(after, before, 'ghi lai cung mot gia tri khong phai la mot thay doi');
});

test('doi baseline cua du an duoc ghi nhat ky kem ly do', async () => {
  const projectId = await newProject('Trien khai Theta');
  const res = await json(
    'PATCH',
    `/api/projects/${projectId}?reason=Khach hang doi mo rong pham vi`,
    {
      plan_end: '2026-12-31',
      budget_vnd: 900_000_000,
    }
  );
  assert.equal(res.status, 200);

  const detail = await json('GET', `/api/projects/${projectId}`);
  const changes = detail.data.changes as { field: string; note: string | null }[];
  const fields = changes.map((c) => c.field).sort();
  assert.deepEqual(fields, ['budget_vnd', 'plan_end']);
  assert.equal(changes[0].note, 'Khach hang doi mo rong pham vi');
});

/* ---------- Quay lui ---------- */

test('kich ban quay lui v23 tra schema ve v22 nhung giu nguyen lien ket da tao', () => {
  const target = new Database(':memory:');
  try {
    /* Dung o DUNG v23: day la test cua BUOC quay lui v23 -> v22, khong phai cua
       ca chang duong. Migrate len ban moi nhat roi chi chay mot kich ban quay lui
       la dang thu mot thu khac han. */
    migrate(target, 23);
    const customerId = Number(
      target
        .prepare(`INSERT INTO customers (name, search_text) VALUES (?, ?)`)
        .run('Khach hang', 'khach hang').lastInsertRowid
    );
    const projectId = Number(
      target.prepare(`INSERT INTO projects (name, search_text) VALUES (?, ?)`).run('Du an', 'du an')
        .lastInsertRowid
    );
    const dealId = Number(
      target
        .prepare(
          `INSERT INTO deals (customer_id, title, stage, position, search_text, project_id, handover_ready)
           VALUES (?, ?, 'won', 1024, '', ?, 1)`
        )
        .run(customerId, 'Co hoi', projectId).lastInsertRowid
    );
    target
      .prepare(
        `INSERT INTO entity_change_log (entity_type, entity_id, field, old_value, new_value)
         VALUES ('deal', ?, 'stage', 'negotiating', 'won')`
      )
      .run(dealId);

    target.exec(fs.readFileSync(path.join(dbDir, 'migrate-v23-rollback.sql'), 'utf8'));
    target.pragma('user_version = 22');

    const dealColumns = (
      target.prepare(`PRAGMA table_info(deals)`).all() as { name: string }[]
    ).map((c) => c.name);
    assert.ok(!dealColumns.includes('handover_ready'), 'cot ban giao phai bi bo');
    assert.ok(
      dealColumns.includes('project_id'),
      'project_id thuoc ve v17 — quay lui v23 khong duoc dung toi'
    );

    const tables = (
      target.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as {
        name: string;
      }[]
    ).map((t) => t.name);
    assert.ok(!tables.includes('entity_change_log'));

    /* Bat bien quan trong nhat cua kich ban quay lui: lien ket nguoi dung da tao
       van con, nen tien lai v23 lan nua khong mat gi. */
    const kept = target.prepare(`SELECT project_id FROM deals WHERE id = ?`).get(dealId) as {
      project_id: number | null;
    };
    assert.equal(kept.project_id, projectId);

    const indexes = (target.prepare(`PRAGMA index_list(deals)`).all() as { name: string }[]).map(
      (i) => i.name
    );
    assert.ok(!indexes.includes('idx_deals_project_unique'));

    assert.deepEqual(target.pragma('foreign_key_check'), []);
    assert.equal(
      (target.pragma('integrity_check', { simple: true }) as string).toLowerCase(),
      'ok'
    );

    // Tien lai duoc ngay sau khi quay lui, khong can don dep tay.
    migrate(target);
    assert.equal(target.pragma('user_version', { simple: true }), LATEST_VERSION);
    const relinked = target.prepare(`SELECT project_id FROM deals WHERE id = ?`).get(dealId) as {
      project_id: number | null;
    };
    assert.equal(relinked.project_id, projectId);
  } finally {
    target.close();
  }
});
