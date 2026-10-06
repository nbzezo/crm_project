/*
 * Bo do hieu nang voi du lieu lon (1.21.0).
 *
 * Dung mot CSDL THU trong thu muc tam (khong cham app.db that), nap du lieu gia theo
 * he so quy mo, roi goi cac API nang nhat qua HTTP va in thoi gian + dung luong.
 *
 *   cd server && node --import tsx scripts/bench-large.mjs            # muc 1x
 *   cd server && node --import tsx scripts/bench-large.mjs 2          # muc 2x (~100 sale sau 12 thang)
 *   cd server && node --import tsx scripts/bench-large.mjs 1 /deals,/views/tasks   # chi vai API
 *
 * Muc 1x: 5.000 khach, 20.000 lien he, 15.000 co hoi, 120.000 viec, 80.000 tuong tac,
 * 10.000 dong dich vu x 24 thang doanh thu, 20.000 tai lieu. Production KHONG chay
 * ANALYZE, nen bo do cung khong chay — de bo lap ke hoach chon giong het that.
 *
 * Truy van nao lau hon 300 ms duoc in kem cau SQL va cac buoc SCAN cua no. Moi API goi
 * ba lan: "lan dau" la khi chua co dem, "nhanh nhat" cho thay lop dem 5 phut (1.22.0).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const factor = Number(process.argv[2] ?? 1);
const only = process.argv[3] ? process.argv[3].split(',') : null;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-bench-'));
process.env.WORKFLOW_DATA_DIR = dataDir;
process.env.WORKFLOW_DB_PATH = path.join(dataDir, 'app.db');

const { db, closeDatabase } = await import('../src/db/connection.ts');
const { createApp } = await import('../src/app.ts');

const N = {
  customers: 5000 * factor,
  contacts: 20000 * factor,
  deals: 15000 * factor,
  boards: 100 * factor,
  cards: 120000 * factor,
  interactions: 80000 * factor,
  reminders: 20000 * factor,
  contracts: 6000 * factor,
  lines: 10000 * factor,
  quotations: 10000 * factor,
  documents: 20000 * factor,
};
const rnd = (n) => 1 + Math.floor(Math.random() * n);
const pick = (items) => items[Math.floor(Math.random() * items.length)];
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const words = ['cong ty', 'giai phap', 'vien thong', 'ngan hang', 'so hoa', 'du lieu', 'ha tang'];
const text = (k = 4) => Array.from({ length: k }, () => pick(words)).join(' ');

const year = new Date().getFullYear();
const started = Date.now();
db.pragma('foreign_keys = OFF');
db.transaction(() => {
  let s = db.prepare(
    `INSERT INTO customers (name, status, org_kind, search_text, owner_contact_id) VALUES (?,?,'customer',?,?)`
  );
  for (let i = 1; i <= N.customers; i++)
    s.run(
      `Khach hang ${i}`,
      pick(['prospect', 'customer', 'inactive']),
      `khach hang ${i} ${text(2)}`,
      rnd(50)
    );
  s = db.prepare(
    `INSERT INTO contacts (customer_id, full_name, email, is_active) VALUES (?,?,?,1)`
  );
  for (let i = 1; i <= N.contacts; i++) s.run(rnd(N.customers), `Nguoi ${i}`, `n${i}@x.vn`);
  const stages = [
    'lead',
    'approaching',
    'discussing',
    'poc',
    'quoted',
    'negotiating',
    'won',
    'lost',
  ];
  s = db.prepare(
    `INSERT INTO deals (customer_id, title, stage, value_vnd, probability, position, next_action,
                        next_action_date, search_text, owner_contact_id, expected_close_date)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  );
  for (let i = 1; i <= N.deals; i++)
    s.run(
      rnd(N.customers),
      `Co hoi ${i}`,
      pick(stages),
      rnd(5e9),
      rnd(100),
      i,
      Math.random() < 0.6 ? 'goi lai' : '',
      day(rnd(60) - 30),
      `co hoi ${i}`,
      rnd(50),
      day(rnd(180) - 30)
    );
  s = db.prepare(`INSERT INTO boards (name) VALUES (?)`);
  for (let i = 1; i <= N.boards; i++) s.run(`Bang ${i}`);
  s = db.prepare(`INSERT INTO lists (board_id, name, position) VALUES (?,?,?)`);
  for (let b = 1; b <= N.boards; b++) for (let j = 0; j < 5; j++) s.run(b, `Cot ${j}`, j);
  s = db.prepare(
    `INSERT INTO cards (list_id, title, search_text, position, customer_id, deal_id, due_date, is_done,
                        assignee_contact_id, priority, completed_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  for (let i = 1; i <= N.cards; i++) {
    const done = Math.random() < 0.6;
    const at = `${day(-(done ? rnd(700) : rnd(20)))} 10:00:00`;
    s.run(
      rnd(N.boards * 5),
      `Viec ${i}`,
      `viec ${i} ${text(3)}`,
      i,
      Math.random() < 0.5 ? rnd(N.customers) : null,
      Math.random() < 0.3 ? rnd(N.deals) : null,
      Math.random() < 0.8 ? day(rnd(120) - 60) : null,
      done ? 1 : 0,
      rnd(50),
      pick(['low', 'medium', 'high', 'urgent']),
      done ? at : null,
      at
    );
  }
  s = db.prepare(
    `INSERT INTO interactions (customer_id, type, occurred_at, summary, deal_id, contact_id) VALUES (?,?,?,?,?,?)`
  );
  for (let i = 1; i <= N.interactions; i++)
    s.run(
      rnd(N.customers),
      pick(['call', 'email', 'meeting']),
      day(-rnd(700)),
      text(8),
      Math.random() < 0.3 ? rnd(N.deals) : null,
      rnd(N.contacts)
    );
  s = db.prepare(
    `INSERT INTO reminders (title, due_at, customer_id, is_done, owner_contact_id) VALUES (?,?,?,?,?)`
  );
  for (let i = 1; i <= N.reminders; i++)
    s.run(
      `Nhac ${i}`,
      `${day(rnd(60) - 30)} 09:00`,
      rnd(N.customers),
      Math.random() < 0.5 ? 1 : 0,
      rnd(50)
    );
  s = db.prepare(
    `INSERT INTO contracts (customer_id, name, status, end_date, value_vnd) VALUES (?,?,?,?,?)`
  );
  for (let i = 1; i <= N.contracts; i++)
    s.run(
      rnd(N.customers),
      `HD ${i}`,
      pick(['draft', 'active', 'expired']),
      day(rnd(700) - 350),
      rnd(2e9)
    );
  s = db.prepare(`INSERT INTO services (name) VALUES (?)`);
  for (let i = 1; i <= 30; i++) s.run(`Dich vu ${i}`);
  s = db.prepare(
    `INSERT INTO customer_services (customer_id, service_id, status) VALUES (?,?,'using')`
  );
  for (let i = 1; i <= N.lines; i++) s.run(rnd(N.customers), rnd(30));
  s = db.prepare(
    `INSERT INTO service_revenues (line_id, period, amount_vnd, stage) VALUES (?,?,?,?)`
  );
  for (let l = 1; l <= N.lines; l++)
    for (let m = 0; m < 24; m++)
      s.run(
        l,
        `${year - 1 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`,
        rnd(1e8),
        pick(['forecast', 'invoiced', 'paid'])
      );
  s = db.prepare(`INSERT INTO quotations (customer_id, deal_id, status) VALUES (?,?,'draft')`);
  for (let i = 1; i <= N.quotations; i++) s.run(rnd(N.customers), rnd(N.deals));
  s = db.prepare(
    `INSERT INTO documents (name, file_name, stored_name, customer_id) VALUES (?,?,?,?)`
  );
  for (let i = 1; i <= N.documents; i++)
    s.run(`Tai lieu ${i}`, `f${i}.pdf`, `s${i}.pdf`, rnd(N.customers));
})();
db.pragma('foreign_keys = ON');
const sizeMb = fs.statSync(process.env.WORKFLOW_DB_PATH).size / 1e6;
console.log(
  `He so ${factor}: nap du lieu ${((Date.now() - started) / 1000).toFixed(1)} s, CSDL ~${sizeMb.toFixed(0)} MB`
);

/* In cau SQL cham kem cac buoc quet ca bang. */
const prepare = db.prepare.bind(db);
db.prepare = (sql) => {
  const statement = prepare(sql);
  for (const method of ['all', 'get', 'run']) {
    const original = statement[method].bind(statement);
    statement[method] = (...args) => {
      const t = performance.now();
      const result = original(...args);
      const ms = performance.now() - t;
      if (ms > 300) {
        let scans = [];
        try {
          scans = prepare(`EXPLAIN QUERY PLAN ${sql}`)
            .all(...args)
            .map((row) => row.detail)
            .filter((d) => /SCAN|AUTOMATIC/.test(d));
        } catch {
          /* cau co tham so dat ten — bo qua ke hoach */
        }
        console.log(
          `\n    [cham ${ms.toFixed(0)} ms] ${sql.replace(/\s+/g, ' ').slice(0, 160)}` +
            (scans.length ? `\n      quet: ${scans.join(' | ')}` : '')
        );
      }
      return result;
    };
  }
  return statement;
};

const server = createApp({ auth: false }).listen(0);
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
const endpoints = [
  '/customers',
  '/customers?fields=basic',
  '/customers?q=vien',
  '/customers/1/full',
  '/deals',
  '/contracts',
  '/quotations',
  '/projects',
  '/reminders',
  '/boards',
  '/boards/1/full',
  '/search?q=khach',
  '/documents/page',
  '/views/dashboard',
  '/views/reports',
  '/views/pipeline-health',
  '/views/tasks?done=0&recent_days=30',
  '/views/tasks?done=1&recent_days=30',
  '/views/tasks/older?days=30',
  '/views/tasks/counts',
  '/views/tasks?done=0&nudge=1',
  `/views/calendar?from=${day(-3)}&to=${day(38)}`,
  `/revenues/lines?year=${year}`,
  `/revenues/summary?year=${year}`,
  `/revenues/kpi?year=${year}`,
  `/revenues/kpi?year=${year}&entries=none`,
];
for (const endpoint of endpoints) {
  if (only && !only.some((prefix) => endpoint.startsWith(prefix))) continue;
  process.stdout.write(`${endpoint.padEnd(42)} `);
  const times = [];
  let bytes = 0;
  let status = 0;
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    const response = await fetch(base + endpoint);
    bytes = (await response.arrayBuffer()).byteLength;
    status = response.status;
    times.push(performance.now() - t);
    if (times.at(-1) > 5000) break;
  }
  const first = times[0];
  times.sort((a, b) => a - b);
  console.log(
    `${status}  lan dau ${first.toFixed(0).padStart(6)} ms  nhanh nhat ${times[0].toFixed(0).padStart(6)} ms  ${(bytes / 1e6).toFixed(2).padStart(7)} MB`
  );
}

server.close();
closeDatabase();
fs.rmSync(dataDir, { recursive: true, force: true });
