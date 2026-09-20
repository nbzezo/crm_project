import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-ai-chats-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';

const { createApp } = await import('../app.ts');
const { db, closeDatabase } = await import('../db/connection.ts');
const { appendTurn, listSessions, MAX_SESSIONS, pruneSessions } =
  await import('../services/ai/chatSessions.ts');

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
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDatabase();
  if (fixtureRoot.startsWith(os.tmpdir())) fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

function reset(): void {
  db.exec('DELETE FROM ai_chat_messages; DELETE FROM ai_chat_sessions;');
}

test('tao, doi ten va xoa phien qua HTTP', async () => {
  reset();
  const created = await fetch(`${baseUrl}/api/ai/chats`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope: 'crm' }),
  });
  assert.equal(created.status, 201);
  const session = (await created.json()) as { id: number; title: string; scope: string };
  assert.equal(session.scope, 'crm');
  assert.equal(session.title, '', 'phien moi chua co ten cho toi luot hoi dau tien');

  const renamed = await fetch(`${baseUrl}/api/ai/chats/${session.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Ra soat pipeline Q4' }),
  });
  assert.equal(renamed.status, 200);
  assert.equal(((await renamed.json()) as { title: string }).title, 'Ra soat pipeline Q4');

  const removed = await fetch(`${baseUrl}/api/ai/chats/${session.id}`, { method: 'DELETE' });
  assert.equal(removed.status, 204);

  const missing = await fetch(`${baseUrl}/api/ai/chats/${session.id}`);
  assert.equal(missing.status, 404);
});

test('xoa phien keo theo toan bo tin nhan', async () => {
  reset();
  const id = db.prepare(`INSERT INTO ai_chat_sessions (scope) VALUES ('all')`).run()
    .lastInsertRowid as number;
  appendTurn(db, id, 'Deal nao sap het han?', 'Co 2 deal.', { sources: [] });
  assert.equal(
    (db.prepare(`SELECT COUNT(*) n FROM ai_chat_messages`).get() as { n: number }).n,
    2,
    'mot luot = mot cau hoi + mot cau tra loi'
  );

  await fetch(`${baseUrl}/api/ai/chats/${id}`, { method: 'DELETE' });
  assert.equal(
    (db.prepare(`SELECT COUNT(*) n FROM ai_chat_messages`).get() as { n: number }).n,
    0,
    'ON DELETE CASCADE phai don sach tin nhan'
  );
});

test('tieu de lay tu cau hoi DAU TIEN va khong bi ghi de sau do', async () => {
  reset();
  const id = db.prepare(`INSERT INTO ai_chat_sessions (scope) VALUES ('all')`).run()
    .lastInsertRowid as number;
  appendTurn(db, id, 'Cau hoi thu nhat', 'Tra loi 1', null);
  appendTurn(db, id, 'Cau hoi thu hai', 'Tra loi 2', null);
  const title = (
    db.prepare(`SELECT title FROM ai_chat_sessions WHERE id = ?`).get(id) as {
      title: string;
    }
  ).title;
  assert.equal(title, 'Cau hoi thu nhat');
});

test(`chi giu ${20} phien gan nhat, cat theo lan dung gan nhat`, async () => {
  reset();
  assert.equal(MAX_SESSIONS, 20);

  // 25 phien, `updated_at` tang dan de thu tu xac dinh.
  const ids: number[] = [];
  for (let i = 0; i < 25; i++) {
    const id = db.prepare(`INSERT INTO ai_chat_sessions (scope) VALUES ('all')`).run()
      .lastInsertRowid as number;
    db.prepare(`UPDATE ai_chat_sessions SET updated_at = ? WHERE id = ?`).run(
      `2026-01-01 00:${String(i).padStart(2, '0')}:00`,
      id
    );
    ids.push(id);
  }

  /* Phien cu NHAT duoc dung lai: no phai song sot, con phien ke tren no thi khong.
     Cat theo `updated_at` chu khong phai `created_at` chinh la de the nay. */
  const revived = ids[0];
  db.prepare(`UPDATE ai_chat_sessions SET updated_at = ? WHERE id = ?`).run(
    '2026-01-02 00:00:00',
    revived
  );

  /* `null` = khong loc theo nguoi dung, dung voi `createApp({ auth: false })`
     ma file test nay dang chay. Phan loc theo nguoi dung co test rieng o
     aiScope.test.ts, noi co phien dang nhap that. */
  pruneSessions(db, null);
  const kept = listSessions(db, null);
  assert.equal(kept.length, 20);
  assert.ok(
    kept.some((s) => s.id === revived),
    'phien vua duoc dung lai phai duoc giu'
  );
  assert.ok(!kept.some((s) => s.id === ids[1]), 'phien cu nhat CON LAI phai bi cat');
});
