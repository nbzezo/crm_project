/**
 * v24 — checklist ban giao va nguoi thuc hien.
 *
 * Bat bien trong tam: `deals.handover_ready` va checklist khong bao gio lech
 * nhau. Moi bo loc trong he thong doc cot do chu khong doc checklist, nen neu
 * hai ben lech thi cai lech se khong lo ra o bat ky man hinh nao.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { type Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-v24-'));
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

interface HandoverItem {
  id: number;
  content: string;
  is_required: number;
  is_done: number;
  done_at: string | null;
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

/* ---------- Hinh dang schema ---------- */

test('v24 tao bang checklist, cot nguoi thuc hien va nap cau hinh mac dinh', () => {
  const itemColumns = (
    db.prepare(`PRAGMA table_info(deal_handover_items)`).all() as { name: string }[]
  ).map((c) => c.name);
  assert.deepEqual(itemColumns, [
    'id',
    'deal_id',
    'content',
    'is_required',
    'is_done',
    'done_at',
    'note',
    'position',
  ]);

  const logColumns = (
    db.prepare(`PRAGMA table_info(entity_change_log)`).all() as { name: string }[]
  ).map((c) => c.name);
  assert.ok(logColumns.includes('actor_contact_id'));

  /* Bo mau nam trong app_settings — dung co che cau hinh DA CO, khong dung bang
     template rieng. Kiem ca so muc de mau khong bi cat mat khi noi chuoi SQL. */
  const raw = db
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get('handover.templates') as { value: string } | undefined;
  assert.ok(raw, 'phai co khoa handover.templates');
  const templates = JSON.parse(raw.value) as Record<string, { content: string }[]>;
  assert.equal(templates.default.length, 10, 'dung 10 muc cua dac ta 7.2');
  assert.match(templates.default[0].content, /Hợp đồng\/PO/);
  assert.match(templates.default[9].content, /phiên bản/);

  const sla = db
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get('handover.sla_days') as {
    value: string;
  };
  assert.equal(sla.value, '7');
});

/* ---------- Vong doi checklist ---------- */

test('do mau tao du 10 muc va co hoi chua san sang ban giao', async () => {
  const dealId = await newDeal('Co hoi co checklist');
  const applied = await json('POST', `/api/deals/${dealId}/handover/template`, {});
  assert.equal(applied.status, 201);

  const items = applied.data.items as HandoverItem[];
  assert.equal(items.length, 10);
  assert.ok(items.every((i) => i.is_required === 1 && i.is_done === 0));
  assert.equal(applied.data.handover_ready, 0);
  assert.equal(applied.data.sla_days, 7);
});

test('do mau lan hai bi tu choi, khong tao checklist nhan doi', async () => {
  const dealId = await newDeal('Co hoi do mau hai lan');
  assert.equal((await json('POST', `/api/deals/${dealId}/handover/template`, {})).status, 201);

  const again = await json('POST', `/api/deals/${dealId}/handover/template`, {});
  assert.equal(again.status, 409);
  assert.equal(again.data.code, 'HANDOVER_ALREADY_EXISTS');

  const current = await json('GET', `/api/deals/${dealId}/handover`);
  assert.equal((current.data.items as HandoverItem[]).length, 10, 'van dung 10 muc');
});

test('tick het muc bat buoc thi co ban giao tu bat, bo tick thi tu tat', async () => {
  const dealId = await newDeal('Co hoi tick du');
  const applied = await json('POST', `/api/deals/${dealId}/handover/template`, {});
  const items = applied.data.items as HandoverItem[];

  let latest: Record<string, unknown> = applied.data;
  for (const item of items) {
    latest = (await json('PATCH', `/api/deals/${dealId}/handover/${item.id}`, { is_done: true }))
      .data;
  }
  assert.equal(latest.handover_ready, 1, 'du muc bat buoc thi san sang ban giao');
  const done = (latest.items as HandoverItem[]).every((i) => i.is_done === 1 && i.done_at !== null);
  assert.ok(done, 'moi muc da tick phai co moc thoi gian');

  // Cot tren bang deals phai khop, khong chi khop trong phan hoi API.
  const stored = db.prepare(`SELECT handover_ready FROM deals WHERE id = ?`).get(dealId) as {
    handover_ready: number;
  };
  assert.equal(stored.handover_ready, 1);

  const reopened = await json('PATCH', `/api/deals/${dealId}/handover/${items[0].id}`, {
    is_done: false,
  });
  assert.equal(reopened.data.handover_ready, 0, 'bo tick mot muc thi khong con san sang');
  assert.equal((reopened.data.items as HandoverItem[])[0].done_at, null);
});

test('muc tham khao khong chan co ban giao', async () => {
  const dealId = await newDeal('Co hoi co muc tham khao');
  const added = await json('POST', `/api/deals/${dealId}/handover`, {
    content: 'Gui thu cam on khach hang',
    is_required: false,
  });
  assert.equal(added.status, 201);
  assert.equal(
    added.data.handover_ready,
    1,
    'khong con muc bat buoc nao chua xong thi da san sang'
  );

  const required = await json('POST', `/api/deals/${dealId}/handover`, {
    content: 'Bien ban ban giao co chu ky',
  });
  assert.equal(required.data.handover_ready, 0, 'them mot muc bat buoc thi lai chua san sang');
});

test('xoa muc bat buoc con lai lam co ban giao bat lai', async () => {
  const dealId = await newDeal('Co hoi xoa muc');
  const added = await json('POST', `/api/deals/${dealId}/handover`, { content: 'Muc se bi xoa' });
  const item = (added.data.items as HandoverItem[])[0];
  assert.equal(added.data.handover_ready, 0);

  const removed = await json('DELETE', `/api/deals/${dealId}/handover/${item.id}`);
  assert.equal((removed.data.items as HandoverItem[]).length, 0);
  assert.equal(
    removed.data.handover_ready,
    0,
    'khong con muc nao thi checklist khong con la nguon su that, giu nguyen gia tri cu'
  );
});

test('co hoi khong dung checklist van dat co ban giao bang tay duoc', async () => {
  const dealId = await newDeal('Co hoi khong checklist');
  const patched = await json('PATCH', `/api/deals/${dealId}`, { handover_ready: true });
  assert.equal(patched.status, 200);
  assert.equal(patched.data.handover_ready, 1);

  // Doc lai qua endpoint checklist khong duoc phep ghi de lua chon tay do.
  const view = await json('GET', `/api/deals/${dealId}/handover`);
  assert.equal((view.data.items as HandoverItem[]).length, 0);
  assert.equal(view.data.handover_ready, 1);
});

test('co checklist thi khong duoc ghi de co ban giao bang tay', async () => {
  const dealId = await newDeal('Co hoi checklist la nguon su that');
  assert.equal((await json('POST', `/api/deals/${dealId}/handover/template`, {})).status, 201);

  const forced = await json('PATCH', `/api/deals/${dealId}`, { handover_ready: true });
  assert.equal(forced.status, 409);
  assert.equal(forced.data.code, 'HANDOVER_MANAGED_BY_CHECKLIST');
  assert.equal(
    (
      db.prepare(`SELECT handover_ready FROM deals WHERE id = ?`).get(dealId) as {
        handover_ready: number;
      }
    ).handover_ready,
    0
  );
});

/* ---------- Nhat ky + nguoi thuc hien ---------- */

test('co ban giao doi vi checklist duoc ghi vao nhat ky kem nguoi thuc hien', async () => {
  /* Danh dau mot nguoi la "toi" — cung khai niem ma cho giao viec dang dung. */
  const customer = await json('POST', '/api/customers', { name: 'Cong ty cua toi' });
  const contactId = Number(
    db
      .prepare(`INSERT INTO contacts (customer_id, full_name, is_me) VALUES (?, ?, 1)`)
      .run(Number(customer.data.id), 'Nguyen Van Toi').lastInsertRowid
  );

  const dealId = await newDeal('Co hoi ghi nhat ky');
  const applied = await json('POST', `/api/deals/${dealId}/handover/template`, {});
  for (const item of applied.data.items as HandoverItem[]) {
    await json('PATCH', `/api/deals/${dealId}/handover/${item.id}`, { is_done: true });
  }

  const detail = await json('GET', `/api/deals/${dealId}`);
  const changes = detail.data.changes as {
    field: string;
    old_value: string | null;
    new_value: string | null;
    actor_contact_id: number | null;
    actor_name: string | null;
  }[];

  const flip = changes.find((c) => c.field === 'handover_ready');
  assert.ok(flip, 'phai co dong nhat ky cho lan bat co ban giao');
  assert.equal(flip.old_value, '0');
  assert.equal(flip.new_value, '1');
  assert.equal(flip.actor_contact_id, contactId, 'mac dinh lay nguoi duoc danh dau la "toi"');
  assert.equal(flip.actor_name, 'Nguyen Van Toi');

  // Tick tung muc mot khong duoc sinh 10 dong nhat ky — chi lan CO doi moi ghi.
  assert.equal(changes.filter((c) => c.field === 'handover_ready').length, 1);
});

test('nguoi thuc hien chi dinh tuong minh thang mac dinh, id sai bi tu choi', async () => {
  const customer = await json('POST', '/api/customers', { name: 'Doi tac X' });
  const otherId = Number(
    db
      .prepare(`INSERT INTO contacts (customer_id, full_name) VALUES (?, ?)`)
      .run(Number(customer.data.id), 'Tran Thi Khac').lastInsertRowid
  );

  const dealId = await newDeal('Co hoi chi dinh nguoi');
  await json('PATCH', `/api/deals/${dealId}?actor_contact_id=${otherId}`, {
    value_vnd: 123_000_000,
  });

  const detail = await json('GET', `/api/deals/${dealId}`);
  const changes = detail.data.changes as { field: string; actor_name: string | null }[];
  const entry = changes.find((c) => c.field === 'value_vnd');
  assert.equal(entry?.actor_name, 'Tran Thi Khac');

  const bad = await json('PATCH', `/api/deals/${dealId}?actor_contact_id=999999`, {
    value_vnd: 1_000_000,
  });
  assert.equal(bad.status, 404);
});

/* ---------- Automation canh bao qua han SLA ---------- */

test('automation chi canh bao co hoi Won qua han ma ho so chua du', async () => {
  const automation = db
    .prepare(`SELECT id FROM ai_automations WHERE automation_type = 'handover_sla'`)
    .get() as { id: number } | undefined;
  assert.ok(automation, 'v25 phai tao san automation handover_sla');

  /* Mac dinh phai TAT — bat mot canh bao ma nguoi dung chua cau hinh SLA cho
     minh la tu quyet dinh thay ho. */
  const enabled = db
    .prepare(`SELECT enabled FROM ai_automations WHERE id = ?`)
    .get(automation.id) as { enabled: number };
  assert.equal(enabled.enabled, 0);

  const overdue = await newDeal('Won qua han ban giao');
  const fresh = await newDeal('Won vua moi hom nay');
  const settled = await newDeal('Won da ban giao xong');

  /* Lui `closed_at` ve qua khu: SLA dem tu thoi diem chot thuong mai. */
  db.prepare(
    `UPDATE deals SET stage = 'won', closed_at = datetime('now','localtime','-30 days') WHERE id = ?`
  ).run(overdue);
  db.prepare(
    `UPDATE deals SET stage = 'won', closed_at = datetime('now','localtime') WHERE id = ?`
  ).run(fresh);
  db.prepare(
    `UPDATE deals SET stage = 'won', handover_ready = 1,
            closed_at = datetime('now','localtime','-30 days') WHERE id = ?`
  ).run(settled);

  const run = await json('POST', `/api/ai/automations/${automation.id}/run`);
  assert.equal(run.status, 200);

  const notes = db
    .prepare(`SELECT title, body, link, severity FROM ai_notifications WHERE automation_id = ?`)
    .all(automation.id) as { title: string; body: string; link: string; severity: string }[];

  assert.ok(
    notes.some((n) => n.link === `/deals/${overdue}`),
    'co hoi qua han va thieu ho so phai duoc canh bao'
  );
  assert.ok(!notes.some((n) => n.link === `/deals/${fresh}`), 'vua thang hom nay thi chua qua SLA');
  assert.ok(
    !notes.some((n) => n.link === `/deals/${settled}`),
    'ho so da du thi khong con gi de nhac'
  );

  // Qua gap doi SLA (30 ngay so voi 7) thi khong con la nhac viec nua.
  const alert = notes.find((n) => n.link === `/deals/${overdue}`);
  assert.equal(alert?.severity, 'critical');
  assert.match(alert!.body, /SLA 7 ngày/);
});

/* ---------- Man hinh cau hinh ----------
   Dat SAU test automation: cac test nay doi cau hinh dung chung, chay truoc se
   keo SLA ra khoi gia tri 7 ma test automation dang dua vao. */

test('cau hinh ban giao doc va ghi duoc qua API', async () => {
  const before = await json('GET', '/api/settings/handover');
  assert.equal(before.status, 200);
  assert.equal(before.data.slaDays, 7);
  assert.equal((before.data.templates as Record<string, unknown[]>).default.length, 10);

  const saved = await json('PUT', '/api/settings/handover', {
    sla_days: 14,
    templates: {
      default: [
        { content: 'Hop dong da ky', required: true },
        { content: 'Bien ban khao sat', required: false },
      ],
      'SIP Trunk': [{ content: 'Danh sach dau so', required: true }],
    },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.slaDays, 14);
  assert.deepEqual(Object.keys(saved.data.templates as object).sort(), ['SIP Trunk', 'default']);
});

test('bo mau default la bat buoc — khong luu duoc cau hinh thieu no', async () => {
  const missing = await json('PUT', '/api/settings/handover', {
    templates: { 'Chi rieng SIP': [{ content: 'Mot muc', required: true }] },
  });
  assert.equal(missing.status, 422);
  assert.equal(missing.data.code, 'HANDOVER_DEFAULT_REQUIRED');

  const emptied = await json('PUT', '/api/settings/handover', { templates: { default: [] } });
  assert.equal(emptied.status, 422);

  // Cau hinh cu phai con nguyen sau hai lan bi tu choi.
  const current = await json('GET', '/api/settings/handover');
  assert.equal((current.data.templates as Record<string, unknown[]>).default.length, 2);
});

test('doi bo mau chi anh huong checklist tao MOI, khong viet lai cai da co', async () => {
  const older = await newDeal('Co hoi lap checklist truoc');
  const applied = await json('POST', `/api/deals/${older}/handover/template`, {});
  assert.equal((applied.data.items as HandoverItem[]).length, 2);

  await json('PUT', '/api/settings/handover', {
    templates: {
      default: [
        { content: 'Mau da doi hoan toan', required: true },
        { content: 'Muc thu hai', required: true },
        { content: 'Muc thu ba', required: true },
      ],
    },
  });

  const untouched = await json('GET', `/api/deals/${older}/handover`);
  const items = untouched.data.items as HandoverItem[];
  assert.equal(items.length, 2, 'checklist da tao khong bi mau moi ghi de');
  assert.equal(items[0].content, 'Hop dong da ky');

  const newer = await newDeal('Co hoi lap checklist sau');
  const fresh = await json('POST', `/api/deals/${newer}/handover/template`, {});
  assert.equal((fresh.data.items as HandoverItem[]).length, 3, 'checklist moi dung mau moi');
});

test('chon dung bo mau theo loai giai phap, khong khop thi roi ve default', async () => {
  await json('PUT', '/api/settings/handover', {
    templates: {
      default: [{ content: 'Muc chung', required: true }],
      'SIP Trunk': [
        { content: 'Danh sach dau so', required: true },
        { content: 'Cau hinh tuyen', required: true },
      ],
    },
  });

  const sip = await newDeal('Co hoi SIP');
  const bySolution = await json('POST', `/api/deals/${sip}/handover/template`, {
    key: 'SIP Trunk',
  });
  assert.equal((bySolution.data.items as HandoverItem[]).length, 2);

  const other = await newDeal('Co hoi loai la');
  const fallback = await json('POST', `/api/deals/${other}/handover/template`, {
    key: 'Loai chua khai bao',
  });
  assert.equal(
    (fallback.data.items as HandoverItem[]).length,
    1,
    'loai chua khai bao phai roi ve default thay vi bao loi'
  );
});

/* ---------- Quay lui ---------- */

test('quay lui v25 bo automation moi va tra rang buoc CHECK ve bon loai', () => {
  const target = new Database(':memory:');
  try {
    migrate(target, 25);
    const before = target
      .prepare(`SELECT COUNT(*) AS n FROM ai_automations WHERE automation_type = 'handover_sla'`)
      .get() as { n: number };
    assert.equal(before.n, 1);

    /* Giong migrate.ts: buoc nay dung lai bang nen phai tat khoa ngoai. */
    target.pragma('foreign_keys = OFF');
    target.exec(fs.readFileSync(path.join(dbDir, 'migrate-v25-rollback.sql'), 'utf8'));
    target.pragma('user_version = 24');
    target.pragma('foreign_keys = ON');

    const after = target
      .prepare(`SELECT COUNT(*) AS n FROM ai_automations WHERE automation_type = 'handover_sla'`)
      .get() as { n: number };
    assert.equal(after.n, 0);

    // Bon automation goc phai con nguyen ca id lan cau hinh.
    const kept = target
      .prepare(`SELECT id, automation_type FROM ai_automations ORDER BY id`)
      .all() as { id: number; automation_type: string }[];
    assert.deepEqual(
      kept.map((a) => a.automation_type),
      ['pipeline_risk', 'overdue_followup', 'contract_expiry', 'daily_brief']
    );
    assert.deepEqual(
      kept.map((a) => a.id),
      [1, 2, 3, 4]
    );

    // CHECK cu phai co hieu luc tro lai.
    assert.throws(() =>
      target
        .prepare(`INSERT INTO ai_automations (name, automation_type) VALUES ('x', 'handover_sla')`)
        .run()
    );

    assert.deepEqual(target.pragma('foreign_key_check'), []);
    migrate(target);
    assert.equal(target.pragma('user_version', { simple: true }), LATEST_VERSION);
  } finally {
    target.close();
  }
});

test('quay lui v24 giu nguyen gia tri co ban giao ma checklist da tinh ra', () => {
  const target = new Database(':memory:');
  try {
    /* Dung o DUNG v24 — day la test cua BUOC v24 -> v23, khong phai ca chang. */
    migrate(target, 24);
    const customerId = Number(
      target
        .prepare(`INSERT INTO customers (name, search_text) VALUES (?, ?)`)
        .run('Khach hang', 'khach hang').lastInsertRowid
    );
    const dealId = Number(
      target
        .prepare(
          `INSERT INTO deals (customer_id, title, stage, position, search_text, handover_ready)
           VALUES (?, ?, 'won', 1024, '', 1)`
        )
        .run(customerId, 'Co hoi da ban giao').lastInsertRowid
    );
    target
      .prepare(
        `INSERT INTO deal_handover_items (deal_id, content, is_required, is_done)
         VALUES (?, 'Hop dong da ky', 1, 1)`
      )
      .run(dealId);

    target.exec(fs.readFileSync(path.join(dbDir, 'migrate-v24-rollback.sql'), 'utf8'));
    target.pragma('user_version = 23');

    const tables = (
      target.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as {
        name: string;
      }[]
    ).map((t) => t.name);
    assert.ok(!tables.includes('deal_handover_items'));

    const logColumns = (
      target.prepare(`PRAGMA table_info(entity_change_log)`).all() as { name: string }[]
    ).map((c) => c.name);
    assert.ok(!logColumns.includes('actor_contact_id'));
    assert.ok(tables.includes('entity_change_log'), 'ban than nhat ky thuoc v23, phai con lai');

    /* Gia tri cuoi cung ma checklist tinh ra van nam tren co hoi: sau khi quay
       lui he thong van phan biet duoc Won da ban giao voi Won dang cho. */
    const kept = target.prepare(`SELECT handover_ready FROM deals WHERE id = ?`).get(dealId) as {
      handover_ready: number;
    };
    assert.equal(kept.handover_ready, 1);

    const settings = target
      .prepare(`SELECT COUNT(*) AS n FROM app_settings WHERE key LIKE 'handover.%'`)
      .get() as { n: number };
    assert.equal(settings.n, 0);

    assert.deepEqual(target.pragma('foreign_key_check'), []);

    migrate(target);
    assert.equal(target.pragma('user_version', { simple: true }), LATEST_VERSION);
  } finally {
    target.close();
  }
});
