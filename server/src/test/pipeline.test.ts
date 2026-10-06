/**
 * v64 — giai doan co hoi la du lieu cau hinh.
 *
 * Ban 1.25.1 KHONG doi hanh vi: cac test o day khoa lai dieu do (cot phi chuan hoa
 * luon khop, cong diem doc tu pipeline_stages cho cung ket qua) cung voi duong
 * quay lui.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { type Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-v64-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';

const { createApp } = await import('../app.ts');
const { db, closeDatabase } = await import('../db/connection.ts');
const { migrate } = await import('../db/migrate.ts');

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
  const text = await response.text();
  return {
    status: response.status,
    data: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

async function newDeal(title: string, extra: Record<string, unknown> = {}): Promise<number> {
  const customer = await json('POST', '/api/customers', { name: `KH ${title}` });
  const deal = await json('POST', '/api/deals', {
    customer_id: Number(customer.data.id),
    title,
    ...extra,
  });
  assert.equal(deal.status, 201, JSON.stringify(deal.data));
  return Number(deal.data.id);
}

function category(id: number): string {
  return (
    db.prepare(`SELECT stage_category FROM deals WHERE id = ?`).get(id) as {
      stage_category: string;
    }
  ).stage_category;
}

test('tam giai doan goc nam trong pipeline mac dinh voi dung khoa, loai, xac suat', () => {
  const rows = db
    .prepare(`SELECT key, category, probability FROM pipeline_stages ORDER BY position`)
    .all() as { key: string; category: string; probability: number }[];
  assert.deepEqual(
    rows.map((row) => `${row.key}:${row.category}:${row.probability}`),
    [
      'lead:open:10',
      'approaching:open:20',
      'discussing:open:40',
      'poc:open:50',
      'quoted:open:60',
      'negotiating:open:80',
      'won:won:100',
      'lost:lost:0',
    ]
  );
});

test('stage_category luon khop giai doan qua tao, sua, keo tha', async () => {
  const id = await newDeal('Khớp loại');
  assert.equal(category(id), 'open');
  assert.equal(
    (db.prepare(`SELECT stage FROM deals WHERE id = ?`).get(id) as { stage: string }).stage,
    'lead'
  );

  await json('PATCH', `/api/deals/${id}/move`, { stage: 'won' });
  assert.equal(category(id), 'won');

  await json('PATCH', `/api/deals/${id}`, { stage: 'lost', lost_reason: 'price' });
  assert.equal(category(id), 'lost');

  await json('PATCH', `/api/deals/${id}`, { stage: 'discussing' });
  assert.equal(category(id), 'open');

  const mismatched = db
    .prepare(
      `SELECT COUNT(*) AS n FROM deals d JOIN pipeline_stages s ON s.key = d.stage
        WHERE s.category <> d.stage_category`
    )
    .get() as { n: number };
  assert.equal(mismatched.n, 0);
});

test('giai doan la bi tu choi o API va o CSDL', async () => {
  const customer = await json('POST', '/api/customers', { name: 'KH Giai đoạn lạ' });
  const bad = await json('POST', '/api/deals', {
    customer_id: Number(customer.data.id),
    title: 'X',
    stage: 'khong_co',
  });
  assert.equal(bad.status, 422);
  assert.throws(() =>
    db
      .prepare(`INSERT INTO deals (customer_id, title, stage) VALUES (?, 'Y', 'khong_co')`)
      .run(customer.data.id)
  );
});

test('cong diem doc tu pipeline_stages va man Cham diem ghi nguoc vao do', async () => {
  const settings = await json('GET', '/api/settings/scoring');
  assert.deepEqual(settings.data.stageGate, { quoted: 7, negotiating: 9 });

  const saved = await json('PUT', '/api/settings/scoring', { stage_gate: { quoted: 5 } });
  assert.equal(saved.status, 200);
  const gates = db
    .prepare(`SELECT key, gate_bant_min FROM pipeline_stages WHERE gate_bant_min IS NOT NULL`)
    .all() as { key: string; gate_bant_min: number }[];
  assert.deepEqual(
    gates.map((row) => ({ ...row })),
    [{ key: 'quoted', gate_bant_min: 5 }]
  );

  // Cong van chan theo gia tri moi
  const id = await newDeal('Bị cổng chặn');
  const blocked = await json('PATCH', `/api/deals/${id}/move`, { stage: 'quoted' });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.required, 5);

  await json('PUT', '/api/settings/scoring', { stage_gate: { quoted: 7, negotiating: 9 } });
});

test('v64: quay lui chep cong diem ve app_settings, keo co hoi o giai doan tu them ve giai doan goc', () => {
  const scratch = new Database(':memory:');
  scratch.pragma('foreign_keys = ON');
  migrate(scratch, 63);
  scratch.exec(`
    INSERT OR REPLACE INTO app_settings (key, value) VALUES ('scoring.stage_gate', '{"quoted":6}');
    INSERT INTO customers (id, name) VALUES (1, 'KH');
    INSERT INTO deals (id, customer_id, title, stage) VALUES (1, 1, 'A', 'quoted'), (2, 1, 'B', 'won');
  `);
  migrate(scratch, 64);
  assert.equal(
    (
      scratch.prepare(`SELECT gate_bant_min FROM pipeline_stages WHERE key = 'quoted'`).get() as {
        gate_bant_min: number;
      }
    ).gate_bant_min,
    6
  );
  // Giai doan tu them (nhu ban 1.26.0 cho phep) giua Gui bao gia va Dam phan
  scratch.exec(`
    INSERT INTO pipeline_stages (pipeline_id, key, label, category, position, probability)
      VALUES (1, 'legal_review', 'Rà soát pháp lý', 'open', 5.5, 70);
    UPDATE deals SET stage = 'legal_review' WHERE id = 1;
  `);

  scratch.pragma('foreign_keys = OFF');
  scratch.exec(fs.readFileSync(new URL('../db/migrate-v64-rollback.sql', import.meta.url), 'utf8'));
  scratch.pragma('foreign_keys = ON');
  assert.deepEqual(
    scratch
      .prepare(`SELECT id, stage FROM deals ORDER BY id`)
      .all()
      .map((row) => ({ ...(row as { id: number; stage: string }) })),
    [
      { id: 1, stage: 'quoted' },
      { id: 2, stage: 'won' },
    ]
  );
  assert.equal(
    (
      scratch.prepare(`SELECT value FROM app_settings WHERE key = 'scoring.stage_gate'`).get() as {
        value: string;
      }
    ).value,
    '{"quoted":6}'
  );
  const columns = (scratch.prepare(`PRAGMA table_info(deals)`).all() as { name: string }[]).map(
    (column) => column.name
  );
  assert.ok(!columns.includes('stage_category'));
  assert.deepEqual(scratch.pragma('foreign_key_check'), []);
  scratch.close();
});

/* ---------- 1.26.0: cau hinh pipeline tren giao dien ---------- */

interface StageRow {
  id: number;
  key: string;
  label: string;
  category: string;
  is_active: number;
  probability: number;
}

async function stages(): Promise<StageRow[]> {
  const config = await json('GET', '/api/crm-config');
  return (config.data.pipelines as { stages: StageRow[] }[])[0].stages;
}

test('them giai doan sau Gui bao gia: khoa tu sinh, dung vi tri, keo tha va cong hoat dong', async () => {
  const quoted = (await stages()).find((stage) => stage.key === 'quoted')!;
  const created = await json('POST', '/api/crm-config/pipelines/1/stages', {
    label: 'Rà soát pháp lý',
    after_stage_id: quoted.id,
    probability: 70,
    gate_bant_min: 8,
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.key, 'ra_soat_phap_ly');
  assert.equal(created.data.gate_bant_min, 8);

  const keys = (await stages()).map((stage) => stage.key);
  assert.deepEqual(keys.slice(4, 7), ['quoted', 'ra_soat_phap_ly', 'negotiating']);
  assert.deepEqual(keys.slice(-2), ['won', 'lost']);

  // Co hoi tao thang vao giai doan moi; deals/ tra cot cho no
  const id = await newDeal('Pháp lý', { stage: 'ra_soat_phap_ly' });
  assert.equal(category(id), 'open');
  const board = await json('GET', '/api/deals');
  assert.ok(Array.isArray((board.data.stages as Record<string, unknown>).ra_soat_phap_ly));

  // Cong cua giai doan moi chan nhu giai doan goc
  const other = await newDeal('Bị chặn pháp lý');
  const blocked = await json('PATCH', `/api/deals/${other}/move`, { stage: 'ra_soat_phap_ly' });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.required, 8);
});

test('giai doan he thong: xac suat co dinh, khong an, khong xoa; Thua khong co cong', async () => {
  const all = await stages();
  const won = all.find((stage) => stage.category === 'won')!;
  const lost = all.find((stage) => stage.category === 'lost')!;
  assert.equal(
    (await json('PATCH', `/api/crm-config/pipelines/1/stages/${won.id}`, { probability: 90 }))
      .status,
    422
  );
  assert.equal(
    (await json('POST', `/api/crm-config/pipelines/1/stages/${won.id}/archive`, {})).status,
    422
  );
  assert.equal((await json('DELETE', `/api/crm-config/pipelines/1/stages/${lost.id}`)).status, 422);
  assert.equal(
    (await json('PATCH', `/api/crm-config/pipelines/1/stages/${lost.id}`, { gate_bant_min: 3 }))
      .status,
    422
  );
  // Doi ten thi duoc
  const renamed = await json('PATCH', `/api/crm-config/pipelines/1/stages/${won.id}`, {
    label: 'Đã ký',
  });
  assert.equal(renamed.data.label, 'Đã ký');
  await json('PATCH', `/api/crm-config/pipelines/1/stages/${won.id}`, { label: 'Thành công' });
});

test('sap xep chi nhan cac giai doan mo; Thang/Thua luon o cuoi', async () => {
  const open = (await stages()).filter((stage) => stage.category === 'open');
  const reversed = open.map((stage) => stage.id).reverse();
  const ok = await json('PUT', '/api/crm-config/pipelines/1/stages/order', { ids: reversed });
  assert.equal(ok.status, 200);
  const after = await stages();
  assert.deepEqual(
    after.slice(0, open.length).map((stage) => stage.id),
    reversed
  );
  assert.deepEqual(
    after.slice(-2).map((stage) => stage.category),
    ['won', 'lost']
  );
  const withWon = await json('PUT', '/api/crm-config/pipelines/1/stages/order', {
    ids: [...reversed, after.at(-2)!.id],
  });
  assert.equal(withWon.status, 422);
  await json('PUT', '/api/crm-config/pipelines/1/stages/order', {
    ids: open.map((stage) => stage.id),
  });
});

test('an giai doan con co hoi: bat buoc chon dich, chuyen het, ghi nhat ky, an khoi tao moi', async () => {
  const all = await stages();
  const poc = all.find((stage) => stage.key === 'poc')!;
  const discussing = all.find((stage) => stage.key === 'discussing')!;
  const id = await newDeal('Đang PoC', { stage: 'poc' });

  const missing = await json('POST', `/api/crm-config/pipelines/1/stages/${poc.id}/archive`, {});
  assert.equal(missing.status, 422);
  assert.equal(missing.data.code, 'STAGE_HAS_DEALS');

  const archived = await json('POST', `/api/crm-config/pipelines/1/stages/${poc.id}/archive`, {
    move_to_stage_id: discussing.id,
  });
  assert.equal(archived.status, 200, JSON.stringify(archived.data));
  assert.ok(Number(archived.data.moved) >= 1);
  assert.equal(
    (db.prepare(`SELECT stage FROM deals WHERE id = ?`).get(id) as { stage: string }).stage,
    'discussing'
  );
  const log = db
    .prepare(
      `SELECT old_value, new_value, note FROM entity_change_log
        WHERE entity_type = 'deal' AND entity_id = ? AND field = 'stage' ORDER BY id DESC LIMIT 1`
    )
    .get(id) as { old_value: string; new_value: string; note: string };
  assert.equal(log.old_value, 'poc');
  assert.equal(log.new_value, 'discussing');
  assert.match(log.note, /ẩn giai đoạn/);

  // Giai doan an: khong tao moi vao duoc; co hoi cu dang o do (neu co) van sua duoc
  const customer = await json('POST', '/api/customers', { name: 'KH Ẩn giai đoạn' });
  const rejected = await json('POST', '/api/deals', {
    customer_id: Number(customer.data.id),
    title: 'Vào PoC',
    stage: 'poc',
  });
  assert.equal(rejected.status, 422);
  assert.equal(rejected.data.code, 'STAGE_INACTIVE');

  // Da tung dung thi khong xoa han duoc, chi dung lai
  assert.equal((await json('DELETE', `/api/crm-config/pipelines/1/stages/${poc.id}`)).status, 409);
  const restored = await json('POST', `/api/crm-config/pipelines/1/stages/${poc.id}/restore`);
  assert.equal(restored.data.is_active, 1);
});

test('giai doan chua tung dung thi xoa han duoc; khong bao gio xoa het giai doan mo', async () => {
  const created = await json('POST', '/api/crm-config/pipelines/1/stages', { label: 'Nháp' });
  assert.equal(created.status, 201);
  assert.equal(
    (await json('DELETE', `/api/crm-config/pipelines/1/stages/${created.data.id}`)).status,
    204
  );
  assert.ok(!(await stages()).some((stage) => stage.id === created.data.id));
});

test('phu quyet V2 theo co "phai gap nguoi duyet ngan sach" thay vi ten Dam phan', async () => {
  const all = await stages();
  const discussing = all.find((stage) => stage.key === 'discussing')!;
  await json('PATCH', `/api/crm-config/pipelines/1/stages/${discussing.id}`, {
    gate_bant_min: 0,
    require_economic_buyer: true,
  });
  const id = await newDeal('Chưa gặp người duyệt');
  const blocked = await json('PATCH', `/api/deals/${id}/move`, { stage: 'discussing' });
  assert.equal(blocked.status, 409);
  assert.ok((blocked.data.blocked_by as string[]).includes('veto:V2_NO_ECONOMIC_BUYER'));
  await json('PATCH', `/api/crm-config/pipelines/1/stages/${discussing.id}`, {
    gate_bant_min: null,
    require_economic_buyer: false,
  });
});
