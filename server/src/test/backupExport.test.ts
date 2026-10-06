import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

/*
 * Sao luu va xuat du lieu voi CSDL TEP THAT (1.24.0) — nhanh doc tu ket noi chi doc
 * rieng cua /api/export chi chay khi CSDL nam tren dia.
 */
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-backup-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = path.join(fixtureRoot, 'app.db');
process.env.WORKFLOW_BACKUP_KEEP = '3';

const { createApp } = await import('../app.ts');
const { db, closeDatabase, BACKUP_DIR } = await import('../db/connection.ts');
const { createBackupFile, gzipFile, pruneBackups } = await import('../lib/backup.ts');

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

test('xuat du lieu theo luong: JSON hop le, du dong, anh chup nhat quan', async () => {
  const insert = db.prepare(
    `INSERT INTO customers (name, org_kind, search_text) VALUES (?, 'customer', ?)`
  );
  db.transaction(() => {
    for (let i = 0; i < 3000; i++) insert.run(`Khach xuat ${i}`, `khach xuat ${i}`);
  })();
  const expected = (db.prepare(`SELECT COUNT(*) AS n FROM customers`).get() as { n: number }).n;

  const response = await fetch(`${baseUrl}/api/export`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition') ?? '', /workflow-export-\d{8}\.json/);
  const body = JSON.parse(await response.text()) as {
    exported_at: string;
    data: Record<string, unknown[]>;
  };
  assert.equal(typeof body.exported_at, 'string');
  assert.equal(body.data.customers.length, expected);
  assert.ok(Array.isArray(body.data.card_labels), 'VIEW card_labels van duoc xuat');

  /* Trong luc xuat, ket noi chinh van phuc vu request khac. */
  const [exported, health] = await Promise.all([
    fetch(`${baseUrl}/api/export`).then((r) => r.text()),
    fetch(`${baseUrl}/api/health`).then((r) => r.status),
  ]);
  assert.equal(health, 200);
  assert.ok(exported.endsWith('}}\n'));
});

test('sao luu chi giu WORKFLOW_BACKUP_KEEP ban moi nhat', async () => {
  for (const name of fs.readdirSync(BACKUP_DIR)) fs.rmSync(path.join(BACKUP_DIR, name));
  /* Ba ban cu gia lap, mtime tang dan. */
  for (let i = 0; i < 3; i++) {
    const file = path.join(BACKUP_DIR, `app-2000010${i + 1}-000000.db`);
    fs.writeFileSync(file, 'x');
    const at = new Date(2000, 0, i + 1);
    fs.utimesSync(file, at, at);
  }
  fs.writeFileSync(path.join(BACKUP_DIR, 'ghi-chu.txt'), 'khong phai ban sao luu');

  const created = await createBackupFile(db);
  const left = fs.readdirSync(BACKUP_DIR).sort();
  assert.ok(left.includes(created.name), 'ban vua tao phai con');
  assert.ok(!left.includes('app-20000101-000000.db'), 'ban cu nhat bi xoa');
  assert.equal(left.filter((name) => /^app-.*\.db$/.test(name)).length, 3);
  assert.ok(left.includes('ghi-chu.txt'), 'khong dung toi tep khac');
  assert.deepEqual(pruneBackups(), []);
});

test('gzipFile nen theo luong, giai nen ra dung ban CSDL', async () => {
  const snapshot = await createBackupFile(db);
  const compressed = await gzipFile(snapshot.path);
  const original = fs.readFileSync(snapshot.path);
  assert.ok(fs.statSync(compressed).size < original.length);
  assert.deepEqual(zlib.gunzipSync(fs.readFileSync(compressed)), original);
  fs.rmSync(compressed);
});
