/*
 * Phan tich CSDL thu (tao bang `BENCH_KEEP=1 node --import tsx scripts/bench-large.mjs`):
 * tung API nong ton bao nhieu cau SQL, cau nao ton thoi gian, ke hoach co SCAN / TEMP B-TREE
 * khong; chi muc trung lap; dung luong bang/chi muc; chi phi ghi (trigger); so sanh truoc/sau ANALYZE.
 *
 *   cd server && WORKFLOW_DB_PATH=<app.db> WORKFLOW_RESPONSE_CACHE=off node --import tsx scripts/db-profile.mjs
 *   them ANALYZE=1 de chay PRAGMA optimize truoc khi do.
 */
const { db, closeDatabase } = await import('../src/db/connection.ts');
const { createApp } = await import('../src/app.ts');

const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const year = new Date().getFullYear();

if (process.env.SCHEMA) {
  const indexes = db
    .prepare(
      `SELECT m.tbl_name AS tbl, m.name, group_concat(ii.name, ',') AS cols
         FROM sqlite_master m, pragma_index_info(m.name) ii
        WHERE m.type = 'index' GROUP BY m.name ORDER BY m.tbl_name, m.name`
    )
    .all();
  const byTable = new Map();
  for (const ix of indexes) {
    if (!byTable.has(ix.tbl)) byTable.set(ix.tbl, []);
    byTable.get(ix.tbl).push(ix);
  }
  console.log('== Chi muc la tien to cua chi muc khac (thua):');
  for (const [, list] of byTable)
    for (const a of list)
      for (const b of list)
        if (
          a !== b &&
          a.cols &&
          b.cols &&
          (b.cols + ',').startsWith(a.cols + ',') &&
          a.cols !== b.cols
        )
          if (!a.name.startsWith('sqlite_autoindex'))
            console.log(`  ${a.tbl}: ${a.name}(${a.cols}) ⊂ ${b.name}(${b.cols})`);
  console.log('== Chi muc trung hoan toan:');
  for (const [, list] of byTable)
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++)
        if (list[i].cols === list[j].cols)
          console.log(`  ${list[i].tbl}: ${list[i].name} = ${list[j].name} (${list[i].cols})`);
  console.log('== So chi muc / trigger theo bang (top):');
  const trig = db
    .prepare(
      `SELECT tbl_name AS tbl, COUNT(*) AS n FROM sqlite_master WHERE type='trigger' GROUP BY tbl_name`
    )
    .all();
  const trigMap = new Map(trig.map((t) => [t.tbl, t.n]));
  const rows = [...byTable].map(([tbl, list]) => [tbl, list.length, trigMap.get(tbl) ?? 0]);
  rows.sort((a, b) => b[1] + b[2] - a[1] - a[2]);
  for (const [tbl, n, t] of rows.slice(0, 15))
    console.log(`  ${tbl.padEnd(28)} chi muc ${n}  trigger ${t}`);
  try {
    console.log('== Dung luong (MB) top 20:');
    const sizes = db
      .prepare(
        `SELECT name, SUM(pgsize)/1e6 AS mb FROM dbstat GROUP BY name ORDER BY mb DESC LIMIT 20`
      )
      .all();
    for (const s of sizes) console.log(`  ${s.name.padEnd(40)} ${s.mb.toFixed(1)}`);
  } catch (e) {
    console.log('  (khong co dbstat)', e.message);
  }
  console.log(
    '== Tong:',
    db.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index'`).get().n,
    'chi muc,',
    db.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger'`).get().n,
    'trigger,',
    db.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'`).get().n,
    'bang'
  );
  console.log(
    'sqlite_stat1:',
    db.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE name='sqlite_stat1'`).get().n
  );
}

if (process.env.ANALYZE) {
  const t = performance.now();
  db.pragma('analysis_limit = 1000');
  db.exec('PRAGMA optimize = 0x10002');
  console.log(`PRAGMA optimize: ${(performance.now() - t).toFixed(0)} ms`);
}

let current = null;
const prepare = db.prepare.bind(db);
db.prepare = (sql) => {
  const statement = prepare(sql);
  for (const method of ['all', 'get', 'run', 'iterate']) {
    if (!statement[method]) continue;
    const original = statement[method].bind(statement);
    statement[method] = (...args) => {
      const t = performance.now();
      const result = original(...args);
      const ms = performance.now() - t;
      if (current) {
        const key = sql.replace(/\s+/g, ' ').trim();
        const entry = current.get(key) ?? { ms: 0, n: 0, args };
        entry.ms += ms;
        entry.n++;
        current.set(key, entry);
      }
      return result;
    };
  }
  return statement;
};

const server = createApp({ auth: false }).listen(0);
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
const endpoints = (process.env.ONLY ?? '').split(',').filter(Boolean).length
  ? process.env.ONLY.split(',')
  : [
      '/notifications',
      '/views/dashboard',
      '/views/tasks/counts',
      '/views/tasks?done=0&recent_days=30&fields=list',
      '/deals?per_stage=100',
      '/customers',
      `/views/calendar?from=${day(-3)}&to=${day(38)}`,
      '/search?q=khach',
      '/views/reports',
      '/views/pipeline-health',
      `/revenues/summary?year=${year}`,
      `/revenues/kpi?year=${year}`,
      '/boards/1/full',
      '/customers/1/full',
    ];

const plan = (sql, args) => {
  try {
    return prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all(...args)
      .map((r) => r.detail)
      .filter((d) => /SCAN|AUTOMATIC|TEMP B-TREE/.test(d));
  } catch {
    return ['(khong lap duoc ke hoach)'];
  }
};

const dumps = {};
for (const endpoint of endpoints) {
  if (process.env.DUMP) dumps[endpoint] = await fetch(base + endpoint).then((r) => r.json());
  await fetch(base + endpoint).then((r) => r.arrayBuffer()); // lam nong trang
  current = new Map();
  const t = performance.now();
  const response = await fetch(base + endpoint);
  const bytes = (await response.arrayBuffer()).byteLength;
  const total = performance.now() - t;
  const stmts = [...current.entries()].sort((a, b) => b[1].ms - a[1].ms);
  const sqlMs = stmts.reduce((s, [, e]) => s + e.ms, 0);
  const calls = stmts.reduce((s, [, e]) => s + e.n, 0);
  current = null;
  console.log(
    `\n## ${endpoint}  ${response.status}  tong ${total.toFixed(0)} ms, SQL ${sqlMs.toFixed(0)} ms (${calls} lan / ${stmts.length} cau), ${(bytes / 1e6).toFixed(2)} MB`
  );
  for (const [sql, e] of stmts.slice(0, Number(process.env.TOP ?? 4))) {
    if (e.ms < 5) continue;
    console.log(`  ${e.ms.toFixed(0).padStart(5)} ms x${e.n}  ${sql.slice(0, 220)}`);
    const p = plan(sql, e.args);
    if (p.length) console.log(`        ke hoach: ${p.join(' | ').slice(0, 400)}`);
  }
}

/* DUMP=<tep.json>: luu phan hoi tung API de doi chieu truoc/sau khi viet lai truy van
   (scripts/db-compare.mjs). */
if (process.env.DUMP)
  (await import('node:fs')).writeFileSync(process.env.DUMP, JSON.stringify(dumps));

if (process.env.WRITES) {
  /* Chi phi ghi: cap nhat/tao the qua API, do rieng thoi gian SQL. */
  const card = db
    .prepare(`SELECT id, list_id FROM cards WHERE is_archived = 0 LIMIT 1 OFFSET 500`)
    .get();
  const deal = db.prepare(`SELECT id FROM deals LIMIT 1 OFFSET 500`).get();
  const ops = [
    ['PATCH', `/cards/${card.id}`, { title: 'Doi ten thu' }],
    ['PATCH', `/cards/${card.id}`, { is_done: true }],
    ['POST', `/cards`, { list_id: card.list_id, title: 'The moi do ghi' }],
    ['PATCH', `/deals/${deal.id}`, { value_vnd: 12345 }],
  ];
  for (const [method, path, body] of ops) {
    current = new Map();
    const t = performance.now();
    const r = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    await r.arrayBuffer();
    const total = performance.now() - t;
    const stmts = [...current.entries()].sort((a, b) => b[1].ms - a[1].ms);
    const sqlMs = stmts.reduce((s, [, e]) => s + e.ms, 0);
    current = null;
    console.log(
      `\n## GHI ${method} ${path} ${JSON.stringify(body)} -> ${r.status}  tong ${total.toFixed(0)} ms, SQL ${sqlMs.toFixed(0)} ms, ${stmts.length} cau`
    );
    for (const [sql, e] of stmts.slice(0, 4))
      if (e.ms >= 2)
        console.log(`  ${e.ms.toFixed(0).padStart(5)} ms x${e.n}  ${sql.slice(0, 200)}`);
  }
}

server.close();
closeDatabase();
