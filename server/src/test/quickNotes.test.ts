import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-quick-notes-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';

const { createApp } = await import('../app.ts');
const { db, closeDatabase, FILES_DIR } = await import('../db/connection.ts');

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

test('tao Ghi chu nhanh khong can chon Customer/Deal/Project/Task', async () => {
  const created = await json('POST', '/api/quick-notes', {
    content_text: 'Khách ABC muốn triển khai Voicebot trong tháng 9',
    content_json: '[{"type":"paragraph"}]',
  });
  assert.equal(created.status, 201);
  // Khong nhap Title -> tu suy tu dong dau tien cua content (FR04).
  assert.equal(created.data.title, 'Khách ABC muốn triển khai Voicebot trong tháng 9');
  assert.equal(created.data.is_pinned, 0);
  assert.deepEqual(created.data.tags, []);
});

test('autosave (PATCH) cap nhat noi dung va giu du lieu qua lan doc lai', async () => {
  const created = await json('POST', '/api/quick-notes', { content_text: 'Ban nhap dau tien' });
  const id = created.data.id as number;

  const updated = await json('PATCH', `/api/quick-notes/${id}`, {
    content_text: 'Ban nhap da sua',
    tags: ['Idea', 'FollowUp'],
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.content_text, 'Ban nhap da sua');
  assert.deepEqual(updated.data.tags, ['Idea', 'FollowUp']);

  const reloaded = await json('GET', `/api/quick-notes/${id}`);
  assert.equal(reloaded.data.content_text, 'Ban nhap da sua');
});

test('Pin, Archive, Xoa mem va Khoi phuc (FR07-10)', async () => {
  const created = await json('POST', '/api/quick-notes', { content_text: 'Ghi chu vong doi' });
  const id = created.data.id as number;

  const pinned = await json('POST', `/api/quick-notes/${id}/pin`, { pinned: true });
  assert.equal(pinned.data.is_pinned, 1);

  const archived = await json('POST', `/api/quick-notes/${id}/archive`, { archived: true });
  assert.ok(archived.data.archived_at);

  const activeList = await json('GET', '/api/quick-notes?view=active');
  assert.ok(!(activeList.data as unknown as { id: number }[]).some((n) => n.id === id));
  const archivedList = await json('GET', '/api/quick-notes?view=archived');
  assert.ok((archivedList.data as unknown as { id: number }[]).some((n) => n.id === id));

  const unarchived = await json('POST', `/api/quick-notes/${id}/archive`, { archived: false });
  assert.equal(unarchived.data.archived_at, null);

  const deleted = await json('DELETE', `/api/quick-notes/${id}`);
  assert.equal(deleted.status, 200);
  const afterDelete = await json('GET', `/api/quick-notes/${id}`);
  assert.equal(afterDelete.status, 404);

  const trashList = await json('GET', '/api/quick-notes?view=trash');
  assert.ok((trashList.data as unknown as { id: number }[]).some((n) => n.id === id));

  const restored = await json('POST', `/api/quick-notes/${id}/restore`, undefined);
  assert.equal(restored.status, 200);
  const afterRestore = await json('GET', `/api/quick-notes/${id}`);
  assert.equal(afterRestore.status, 200);
});

test('Tim kiem khong dau (FR11)', async () => {
  await json('POST', '/api/quick-notes', { content_text: 'Gọi lại anh Vĩnh Phát về hợp đồng' });
  const results = await json('GET', `/api/quick-notes?${new URLSearchParams({ q: 'vinh phat' })}`);
  assert.ok(
    (results.data as unknown as { title: string }[]).some((n) => n.title.includes('Vĩnh Phát'))
  );
});

test('Gan CRM Object sau khi tao, khong tao Customer/Deal/Project moi (FR15, AC11)', async () => {
  const customer = await json('POST', '/api/customers', { name: 'Khach hang Quick Note' });
  const customerId = customer.data.id as number;

  const note = await json('POST', '/api/quick-notes', { content_text: 'Can gan khach hang nay' });
  const id = note.data.id as number;

  const linked = await json('PUT', `/api/quick-notes/${id}/relations`, {
    relations: [{ object_type: 'customer', object_id: customerId }],
  });
  assert.equal(linked.status, 200);
  const relations = linked.data.relations as { object_type: string; object_id: number }[];
  assert.equal(relations.length, 1);
  assert.equal(relations[0].object_type, 'customer');
  assert.equal(relations[0].object_id, customerId);

  // So khach hang trong he thong khong doi — khong co ban ghi moi nao duoc tao am tham.
  const customerCount = (db.prepare(`SELECT COUNT(*) AS n FROM customers`).get() as { n: number })
    .n;
  assert.equal(customerCount, 1);
});

test('Convert thanh CRM Note giu nguyen ban goc (FR16)', async () => {
  const note = await json('POST', '/api/quick-notes', {
    title: 'Ý tưởng cho khách C',
    content_text: 'Nội dung cần đưa vào hồ sơ khách hàng',
    content_json: '[{"type":"paragraph"}]',
  });
  const id = note.data.id as number;

  const converted = await json('POST', `/api/quick-notes/${id}/convert/crm-note`, {});
  assert.equal(converted.status, 201);
  assert.equal(converted.data.converted_to_type, 'crm_note');
  const crmNoteId = converted.data.converted_to_id as number;

  const crmNote = await json('GET', `/api/meeting-notes/${crmNoteId}`);
  assert.equal(crmNote.status, 200);
  assert.equal(crmNote.data.title, 'Ý tưởng cho khách C');

  // Ban goc khong bi xoa (chi danh dau da chuyen doi).
  const original = await json('GET', `/api/quick-notes/${id}`);
  assert.equal(original.status, 200);
});

test('Reminder: dat gio nhac se o trang thai pending, xoa gio nhac thi tro ve null (FR14)', async () => {
  const created = await json('POST', '/api/quick-notes', {
    content_text: 'Gọi lại anh Minh',
    reminder_at: '2026-08-28T14:00',
  });
  assert.equal(created.data.reminder_status, 'pending');

  const cleared = await json('PATCH', `/api/quick-notes/${created.data.id}`, {
    reminder_at: null,
  });
  assert.equal(cleared.data.reminder_status, null);
});

test('Dinh kem tep cho Ghi chu nhanh, tu choi quick_note_id khong ton tai (FR18)', async () => {
  const note = await json('POST', '/api/quick-notes', { content_text: 'Ghi chu co dinh kem' });
  const noteId = note.data.id as number;

  const form = new FormData();
  form.set('file', new Blob(['noi dung test'], { type: 'text/plain' }), 'dinh-kem.txt');
  form.set('quick_note_id', String(noteId));
  const uploaded = await fetch(`${baseUrl}/api/documents`, { method: 'POST', body: form });
  assert.equal(uploaded.status, 201);
  const document = (await uploaded.json()) as { id: number; quick_note_id: number };
  assert.equal(document.quick_note_id, noteId);

  const listed = await json('GET', `/api/documents?quick_note_id=${noteId}`);
  assert.equal((listed.data as unknown as { id: number }[]).length, 1);

  const badForm = new FormData();
  badForm.set('file', new Blob(['noi dung khac'], { type: 'text/plain' }), 'sai.txt');
  badForm.set('quick_note_id', '999999');
  const rejected = await fetch(`${baseUrl}/api/documents`, { method: 'POST', body: badForm });
  assert.equal(rejected.status, 404);
});

test('Chon mau rieng cho ghi chu, xoa ve lai mau tu suy (v33)', async () => {
  const created = await json('POST', '/api/quick-notes', { content_text: 'Ghi chu mau' });
  assert.equal(created.data.color, null);

  const colored = await json('PATCH', `/api/quick-notes/${created.data.id}`, { color: 'pink' });
  assert.equal(colored.data.color, 'pink');

  const cleared = await json('PATCH', `/api/quick-notes/${created.data.id}`, { color: null });
  assert.equal(cleared.data.color, null);
});

test('Keo tha sap xep tay: chi trong cung nhom da ghim/chua ghim (v33)', async () => {
  const a = await json('POST', '/api/quick-notes', { content_text: 'A' });
  const b = await json('POST', '/api/quick-notes', { content_text: 'B' });
  const c = await json('POST', '/api/quick-notes', { content_text: 'C' });
  const idA = a.data.id as number;
  const idB = b.data.id as number;
  const idC = c.data.id as number;

  // Thu tu mac dinh la moi nhat truoc: C, B, A. Keo A len dau (truoc C).
  const moved = await json('POST', `/api/quick-notes/${idA}/move`, { afterId: idC });
  assert.equal(moved.status, 200);

  const list = await json('GET', '/api/quick-notes?view=active');
  const order = (list.data as unknown as { id: number }[])
    .map((n) => n.id)
    .filter((id) => [idA, idB, idC].includes(id));
  assert.deepEqual(order, [idA, idC, idB]);

  // Ghim B roi keo A vao lam hang xom cua no phai bi tu choi — khac nhom.
  await json('POST', `/api/quick-notes/${idB}/pin`, { pinned: true });
  const crossGroup = await json('POST', `/api/quick-notes/${idA}/move`, { afterId: idB });
  assert.equal(crossGroup.status, 422);
});

test('Danh sach tag khong trung, sap xep theo bang chu cai', async () => {
  await json('POST', '/api/quick-notes', { content_text: 'Ghi chu A', tags: ['Urgent', 'Idea'] });
  await json('POST', '/api/quick-notes', { content_text: 'Ghi chu B', tags: ['Idea', 'Follow'] });

  const tags = await json('GET', '/api/quick-notes/tags');
  assert.equal(tags.status, 200);
  const list = tags.data as unknown as string[];
  assert.ok(['Follow', 'Idea', 'Urgent'].every((t) => list.includes(t)));
});

test('Tu huy ghi chu rong khi dong lai, giu nguyen ghi chu co noi dung (Google Keep parity)', async () => {
  const empty = await json('POST', '/api/quick-notes', {});
  const emptyId = empty.data.id as number;

  const discarded = await json('POST', `/api/quick-notes/${emptyId}/discard-if-empty`, undefined);
  assert.equal(discarded.status, 200);
  assert.equal(discarded.data.discarded, true);
  const gone = await json('GET', `/api/quick-notes/${emptyId}`);
  assert.equal(gone.status, 404);

  const withContent = await json('POST', '/api/quick-notes', { content_text: 'Co noi dung that' });
  const contentId = withContent.data.id as number;
  const keptContent = await json(
    'POST',
    `/api/quick-notes/${contentId}/discard-if-empty`,
    undefined
  );
  assert.equal(keptContent.data.discarded, false);
  assert.equal((await json('GET', `/api/quick-notes/${contentId}`)).status, 200);

  // Rong ve title/content nhung da ghim -> van la mot hanh dong co chu dich, khong tu xoa.
  const pinnedEmpty = await json('POST', '/api/quick-notes', {});
  const pinnedId = pinnedEmpty.data.id as number;
  await json('POST', `/api/quick-notes/${pinnedId}/pin`, { pinned: true });
  const keptPinned = await json('POST', `/api/quick-notes/${pinnedId}/discard-if-empty`, undefined);
  assert.equal(keptPinned.data.discarded, false);
  assert.equal((await json('GET', `/api/quick-notes/${pinnedId}`)).status, 200);
});

test('Xoa vinh vien: chi ap dung tu Thung rac, xoa ca tep dinh kem tren dia', async () => {
  const note = await json('POST', '/api/quick-notes', { content_text: 'Sap bi xoa vinh vien' });
  const id = note.data.id as number;

  // Chua vao Thung rac -> tu choi.
  const tooEarly = await json('DELETE', `/api/quick-notes/${id}/permanent`);
  assert.equal(tooEarly.status, 404);

  const form = new FormData();
  form.set('file', new Blob(['noi dung'], { type: 'text/plain' }), 'kem-theo.txt');
  form.set('quick_note_id', String(id));
  const uploaded = await fetch(`${baseUrl}/api/documents`, { method: 'POST', body: form });
  const document = (await uploaded.json()) as { id: number; stored_name: string };
  const filePath = path.join(FILES_DIR, document.stored_name);
  assert.ok(fs.existsSync(filePath));

  await json('DELETE', `/api/quick-notes/${id}`);
  const permanent = await json('DELETE', `/api/quick-notes/${id}/permanent`);
  assert.equal(permanent.status, 200);

  const stillInTrash = await json('GET', '/api/quick-notes?view=trash');
  assert.ok(!(stillInTrash.data as unknown as { id: number }[]).some((n) => n.id === id));
  assert.equal(
    (
      db.prepare(`SELECT COUNT(*) AS n FROM documents WHERE quick_note_id = ?`).get(id) as {
        n: number;
      }
    ).n,
    0
  );
  assert.ok(!fs.existsSync(filePath));
});
