import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * Bang tin nhom (v68).
 *
 * Tap trung vao ranh gioi du lieu: ai thuoc nhom nao (tu so do to chuc / du an),
 * tep CA NHAN chia se qua bai chi mo duoc qua bai va thu hoi duoc, tep / ban ghi
 * CRM gan vao bai van theo quyen cua chinh no, nhom kin, duyet bai.
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-feed-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';
process.env.WORKFLOW_SESSION_SECRET = 'test-secret-value-at-least-32-characters-long';
process.env.WORKFLOW_ADMIN_USER = 'admin';
process.env.WORKFLOW_ADMIN_PASSWORD = 'admin-password-1';
process.env.WORKFLOW_ADMIN_EMAIL = 'admin@congty.vn';

const { createApp } = await import('../app.ts');
const { db, closeDatabase } = await import('../db/connection.ts');
const { ensureAdminUser } = await import('../services/auth/bootstrapAdmin.ts');
const { createUser } = await import('../services/auth/users.ts');

await ensureAdminUser();

let server: Server;
let baseUrl = '';
let cookie = '';

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

async function call(method: string, pathname: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.getSetCookie();
  if (setCookie.length > 0) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  const text = await res.text();
  let data: Json = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function upload(pathname: string, filename: string, content: string) {
  const form = new FormData();
  form.append('file', new Blob([content], { type: 'text/plain' }), filename);
  const res = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: cookie ? { cookie } : {},
    body: form,
  });
  return { status: res.status, data: (await res.json()) as Json };
}

async function signIn(login: string) {
  cookie = '';
  const password = login === 'admin@congty.vn' ? 'admin-password-1' : `${login}-password`;
  const res = await call('POST', '/api/auth/login', { username: login, password });
  assert.equal(res.status, 200, `dang nhap ${login}`);
}

/* ---------- Du lieu: Cong ty > Khoi KD > (Phong IT, Phong KD); ba nhan vien ---------- */

const ownOrg = Number(
  db
    .prepare(
      `INSERT INTO customers (name, org_kind, search_text) VALUES ('Công ty mình', 'own', '')`
    )
    .run().lastInsertRowid
);
const rootUnit = (
  db.prepare(`SELECT id FROM org_units WHERE parent_id IS NULL`).get() as { id: number }
).id;
const unit = (name: string, parent: number) =>
  Number(
    db
      .prepare(`INSERT INTO org_units (parent_id, name, position) VALUES (?, ?, 1)`)
      .run(parent, name).lastInsertRowid
  );
const itUnit = unit('Phòng IT', rootUnit);
const salesUnit = unit('Phòng Kinh doanh', rootUnit);

const contact = (name: string, unitId: number) =>
  Number(
    db
      .prepare(
        `INSERT INTO contacts (customer_id, full_name, org_unit_id, is_active) VALUES (?, ?, ?, 1)`
      )
      .run(ownOrg, name, unitId).lastInsertRowid
  );
const staffPosition = (
  db.prepare(`SELECT id FROM positions WHERE code = 'staff'`).get() as { id: number }
).id;

async function staff(login: string, name: string, unitId: number) {
  const contactId = contact(name, unitId);
  const userId = await createUser({
    username: login,
    email: `${login}@congty.vn`,
    password: `${login}@congty.vn-password`,
    contactId,
  });
  db.prepare(`INSERT INTO user_positions (user_id, position_id, is_primary) VALUES (?, ?, 1)`).run(
    userId,
    staffPosition
  );
  return contactId;
}

const an = await staff('an', 'Nguyễn Văn An', itUnit);
const binh = await staff('binh', 'Trần Thị Bình', itUnit);
const chi = await staff('chi', 'Lê Minh Chi', salesUnit);
const adminContact = contact('Quản trị', rootUnit);
db.prepare(`UPDATE users SET contact_id = ? WHERE email = 'admin@congty.vn'`).run(adminContact);

const AN = 'an@congty.vn';
const BINH = 'binh@congty.vn';
const CHI = 'chi@congty.vn';
const ADMIN = 'admin@congty.vn';

async function groupIdOf(kind: string, name?: string): Promise<number> {
  const nav = await call('GET', '/api/feed/nav');
  assert.equal(nav.status, 200);
  const found = nav.data.groups.find(
    (g: Json) => g.kind === kind && (name === undefined || g.name === name)
  );
  assert.ok(found, `khong thay nhom ${kind} ${name ?? ''}`);
  return found.id;
}

/* ---------- Test ---------- */

test('nhom tu dong: moi nguoi thay Toan cong ty va dung phong cua minh', async () => {
  await signIn(AN);
  const nav = await call('GET', '/api/feed/nav');
  assert.equal(nav.status, 200);
  const names = nav.data.groups.map((g: Json) => g.name);
  assert.ok(names.includes('Toàn công ty'));
  assert.ok(names.includes('Phòng IT'));
  assert.ok(!names.includes('Phòng Kinh doanh'), 'An khong thuoc phong KD');

  const salesGroup = (
    db.prepare(`SELECT id FROM feed_groups WHERE org_unit_id = ?`).get(salesUnit) as { id: number }
  ).id;
  assert.equal((await call('GET', `/api/feed/groups/${salesGroup}`)).status, 404);
  assert.equal((await call('GET', `/api/feed/posts?group_id=${salesGroup}`)).status, 404);

  /* Chuyen phong la doi nhom ngay — khong ai sua tay. */
  db.prepare(`UPDATE contacts SET org_unit_id = ? WHERE id = ?`).run(salesUnit, an);
  assert.equal((await call('GET', `/api/feed/groups/${salesGroup}`)).status, 200);
  db.prepare(`UPDATE contacts SET org_unit_id = ? WHERE id = ?`).run(itUnit, an);
  assert.equal((await call('GET', `/api/feed/groups/${salesGroup}`)).status, 404);
});

test('tep ca nhan dinh kem "chi xem qua bai": dong nghiep mo duoc qua bai, khong qua kho, go la thu hoi', async () => {
  await signIn(AN);
  const it = await groupIdOf('unit', 'Phòng IT');
  const doc = await upload('/api/documents', 'bao-gia-nhap.txt', 'noi dung bao gia');
  assert.equal(doc.status, 201);

  const post = await call('POST', '/api/feed/posts', {
    group_id: it,
    body: 'Nhờ @Bình xem giúp báo giá',
    attachments: [{ document_id: doc.data.id, mode: 'view' }],
    mention_ids: [binh, chi],
  });
  assert.equal(post.status, 201);
  const attachment = post.data.attachments[0];
  assert.equal(attachment.source, 'personal');
  assert.equal(attachment.accessible, true);

  await signIn(BINH);
  const feed = await call('GET', `/api/feed/posts?group_id=${it}`);
  assert.equal(feed.data.items.length, 1);
  assert.equal(feed.data.items[0].mentioned_me, true);
  const dl = await fetch(`${baseUrl}/api/feed/attachments/${attachment.id}/download`, {
    headers: { cookie },
  });
  assert.equal(dl.status, 200);
  assert.equal(await dl.text(), 'noi dung bao gia');
  /* Tep van la cua An: khong hien trong kho, khong tai thang duoc. */
  assert.equal((await call('GET', `/api/documents/${doc.data.id}/download`)).status, 404);
  const mentions = await call('GET', '/api/feed/posts?filter=mentions');
  assert.equal(mentions.data.items.length, 1);

  /* Chi o phong khac: khong thay bai, khong tai duoc tep, va khong bi "nhac" (khong phai thanh vien). */
  await signIn(CHI);
  assert.equal((await call('GET', `/api/feed/posts/${post.data.id}`)).status, 404);
  assert.equal(
    (
      await fetch(`${baseUrl}/api/feed/attachments/${attachment.id}/download`, {
        headers: { cookie },
      })
    ).status,
    404
  );
  assert.equal((await call('GET', '/api/feed/posts?filter=mentions')).data.items.length, 0);

  /* An go tep => Binh mat quyen. */
  await signIn(AN);
  const removed = await call(
    'DELETE',
    `/api/feed/posts/${post.data.id}/attachments/${attachment.id}`
  );
  assert.equal(removed.status, 200);
  assert.equal(removed.data.attachments.length, 0);
  await signIn(BINH);
  assert.equal(
    (
      await fetch(`${baseUrl}/api/feed/attachments/${attachment.id}/download`, {
        headers: { cookie },
      })
    ).status,
    404
  );
});

test('khong chia se duoc tep ca nhan cua nguoi khac; ban sao vao nhom tach khoi ban goc', async () => {
  await signIn(AN);
  const it = await groupIdOf('unit', 'Phòng IT');
  const anDoc = await upload('/api/documents', 'ke-hoach.txt', 'ke hoach Q4');

  await signIn(BINH);
  const stolen = await call('POST', '/api/feed/posts', {
    group_id: it,
    body: 'thử',
    attachments: [{ document_id: anDoc.data.id, mode: 'view' }],
  });
  assert.equal(stolen.status, 403);

  await signIn(AN);
  const copied = await call('POST', '/api/feed/posts', {
    group_id: it,
    body: 'Kế hoạch Q4 cho cả phòng',
    attachments: [{ document_id: anDoc.data.id, mode: 'copy' }],
  });
  assert.equal(copied.status, 201);
  const copy = copied.data.attachments[0];
  assert.equal(copy.source, 'group');
  assert.notEqual(copy.document_id, anDoc.data.id);
  const row = db.prepare(`SELECT group_id FROM documents WHERE id = ?`).get(copy.document_id) as {
    group_id: number;
  };
  assert.equal(row.group_id, it);

  /* Ban sao cua nhom: thanh vien thay trong kho tai lieu, nguoi ngoai thi khong. */
  await signIn(BINH);
  assert.equal((await call('GET', `/api/documents/${copy.document_id}/download`)).status, 200);
  assert.equal((await call('GET', `/api/documents/${anDoc.data.id}/download`)).status, 404);
  /* ...nhung chi DOC: khong sua / xoa duoc tep cua nguoi khac. */
  assert.equal((await call('DELETE', `/api/documents/${copy.document_id}`)).status, 404);
  await signIn(CHI);
  assert.equal((await call('GET', `/api/documents/${copy.document_id}/download`)).status, 404);
});

test('tep tai len nhom va tab Tai lieu cua nhom', async () => {
  await signIn(AN);
  const it = await groupIdOf('unit', 'Phòng IT');
  const file = await upload(`/api/feed/groups/${it}/files`, 'so-do-mang.txt', 'VLAN');
  assert.equal(file.status, 201);
  assert.equal(file.data.group_id, it);
  await call('POST', '/api/feed/posts', {
    group_id: it,
    body: 'Sơ đồ mạng mới',
    attachments: [{ document_id: file.data.id, mode: 'library' }],
  });

  await signIn(BINH);
  const files = await call('GET', `/api/feed/groups/${it}/files`);
  assert.equal(files.status, 200);
  const sources = files.data.map((f: Json) => f.source).sort();
  assert.deepEqual(sources, ['group', 'group']);
  const picker = await call('GET', '/api/feed/doc-picker?source=shared');
  assert.ok(
    picker.data.some((d: Json) => d.id === file.data.id),
    'tep nhom hien o "Tai lieu chung"'
  );

  await signIn(CHI);
  assert.equal((await upload(`/api/feed/groups/${it}/files`, 'x.txt', 'x')).status, 404);
});

test('tep trong kho cua quan tri: thanh vien khong co quyen thay "Tep bi gioi han"; tep cong khai thi mo duoc', async () => {
  await signIn(ADMIN);
  const company = await groupIdOf('company');
  const secret = await upload('/api/documents', 'luong-thuong.txt', 'mat');
  const open = await upload('/api/documents', 'noi-quy.txt', 'noi quy');
  await call('PATCH', `/api/documents/${open.data.id}`, { confidentiality: 'public' });
  const post = await call('POST', '/api/feed/posts', {
    group_id: company,
    kind: 'announcement',
    requires_ack: true,
    body: 'Nội quy mới',
    attachments: [
      { document_id: secret.data.id, mode: 'library' },
      { document_id: open.data.id, mode: 'library' },
    ],
  });
  assert.equal(post.status, 201);
  assert.equal(post.data.is_pinned, true, 'thong bao tu ghim');

  await signIn(BINH);
  const seen = (await call('GET', `/api/feed/posts/${post.data.id}`)).data;
  const [hidden, visible] = seen.attachments;
  assert.equal(hidden.accessible, false);
  assert.equal(hidden.name, 'Tệp bị giới hạn');
  assert.equal(visible.accessible, true);
  assert.equal(visible.source, 'shared');
  assert.equal(
    (await fetch(`${baseUrl}/api/feed/attachments/${hidden.id}/download`, { headers: { cookie } }))
      .status,
    404
  );
  assert.equal(
    (await fetch(`${baseUrl}/api/feed/attachments/${visible.id}/download`, { headers: { cookie } }))
      .status,
    200
  );

  /* Xac nhan da doc. */
  const nav = await call('GET', '/api/feed/nav');
  assert.ok(nav.data.counts.ack_pending >= 1);
  const acked = await call('POST', `/api/feed/posts/${post.data.id}/ack`);
  assert.equal(acked.data.ack.mine, true);
  assert.equal((await call('GET', `/api/feed/posts/${post.data.id}/acks`)).status, 403);

  /* Nhan vien khong dang duoc thong bao. */
  const notAllowed = await call('POST', '/api/feed/posts', {
    group_id: company,
    kind: 'announcement',
    body: 'x',
  });
  assert.equal(notAllowed.status, 403);

  await signIn(ADMIN);
  const acks = await call('GET', `/api/feed/posts/${post.data.id}/acks`);
  assert.equal(acks.data.find((a: Json) => a.contact_id === binh).acked_at !== null, true);
  assert.equal(acks.data.find((a: Json) => a.contact_id === chi).acked_at, null);
});

test('ban ghi CRM gan vao bai: nguoi khong co quyen chi thay "Noi dung bi gioi han"', async () => {
  await signIn(AN);
  const it = await groupIdOf('unit', 'Phòng IT');
  const customer = await call('POST', '/api/customers', { name: 'ABC Logistics' });
  assert.equal(customer.status, 201);
  const post = await call('POST', '/api/feed/posts', {
    group_id: it,
    body: 'Khách mới',
    links: [{ entity_type: 'customer', entity_id: customer.data.id }],
  });
  assert.equal(post.status, 201);
  assert.equal(post.data.links[0].label, 'ABC Logistics');

  await signIn(BINH);
  const seen = (await call('GET', `/api/feed/posts/${post.data.id}`)).data;
  assert.equal(seen.links[0].accessible, false);
  assert.equal(seen.links[0].label, 'Nội dung bị giới hạn');
  /* Va khong gan duoc ban ghi minh khong thay. */
  const sneaky = await call('POST', '/api/feed/posts', {
    group_id: it,
    body: 'x',
    links: [{ entity_type: 'customer', entity_id: customer.data.id }],
  });
  assert.equal(sneaky.status, 404);
});

test('nhom tu lap: kin thi nguoi ngoai khong thay, cong khai thi tham gia duoc; duyet bai', async () => {
  await signIn(CHI);
  const secret = await call('POST', '/api/feed/groups', {
    name: 'Nhóm bí mật',
    visibility: 'private',
    member_ids: [an],
  });
  assert.equal(secret.status, 201);
  const open = await call('POST', '/api/feed/groups', {
    name: 'Chia sẻ kiến thức IT',
    visibility: 'public',
    require_approval: true,
  });

  await signIn(BINH);
  assert.equal((await call('GET', `/api/feed/groups/${secret.data.id}`)).status, 404);
  const discover = await call('GET', '/api/feed/groups/discover');
  const ids = discover.data.map((g: Json) => g.id);
  assert.ok(ids.includes(open.data.id));
  assert.ok(!ids.includes(secret.data.id));
  assert.equal(
    (await call('POST', '/api/feed/posts', { group_id: open.data.id, body: 'chưa vào nhóm' }))
      .status,
    403
  );
  const joined = await call('POST', `/api/feed/groups/${open.data.id}/join`);
  assert.equal(joined.data.is_member, true);

  const pending = await call('POST', '/api/feed/posts', {
    group_id: open.data.id,
    body: 'Mẹo Proxmox',
  });
  assert.equal(pending.data.status, 'pending');

  await signIn(AN);
  await call('POST', `/api/feed/groups/${open.data.id}/join`);
  const feed = await call('GET', `/api/feed/posts?group_id=${open.data.id}`);
  assert.equal(feed.data.items.length, 0, 'bai cho duyet chua hien voi thanh vien');
  assert.equal(
    (await call('POST', `/api/feed/posts/${pending.data.id}/moderate`, { action: 'approve' }))
      .status,
    404
  );

  await signIn(CHI);
  const queue = await call('GET', `/api/feed/posts?group_id=${open.data.id}&filter=pending`);
  assert.equal(queue.data.items.length, 1);
  const approved = await call('POST', `/api/feed/posts/${pending.data.id}/moderate`, {
    action: 'approve',
  });
  assert.equal(approved.data.status, 'published');

  await signIn(AN);
  assert.equal(
    (await call('GET', `/api/feed/posts?group_id=${open.data.id}`)).data.items.length,
    1
  );
  assert.equal((await call('POST', `/api/feed/groups/${open.data.id}/leave`)).status, 200);
  /* Nhom phong ban: khong roi duoc. */
  const it = await groupIdOf('unit', 'Phòng IT');
  assert.equal((await call('POST', `/api/feed/groups/${it}/leave`)).status, 422);
});

test('khao sat, cam xuc, binh luan tra loi, hoi dap, luu bai', async () => {
  await signIn(AN);
  const it = await groupIdOf('unit', 'Phòng IT');
  const poll = await call('POST', '/api/feed/posts', {
    group_id: it,
    kind: 'poll',
    body: 'Họp vào hôm nào?',
    poll: { options: ['Thứ 3', 'Thứ 5'] },
  });
  assert.equal(poll.status, 201);
  const [tue, thu] = poll.data.poll.options;

  await signIn(BINH);
  assert.equal(
    (await call('PUT', `/api/feed/posts/${poll.data.id}/vote`, { option_ids: [tue.id, thu.id] }))
      .status,
    422
  );
  const voted = await call('PUT', `/api/feed/posts/${poll.data.id}/vote`, { option_ids: [thu.id] });
  assert.equal(voted.data.poll.voters, 1);
  assert.equal(voted.data.poll.options[1].mine, true);
  const reacted = await call('PUT', `/api/feed/posts/${poll.data.id}/reaction`, {
    reaction: 'love',
  });
  assert.equal(reacted.data.reactions.counts.love, 1);
  assert.equal(reacted.data.reactions.mine, 'love');
  const saved = await call('PUT', `/api/feed/posts/${poll.data.id}/save`, { saved: true });
  assert.equal(saved.data.saved, true);
  assert.equal((await call('GET', '/api/feed/posts?filter=saved')).data.items.length, 1);

  const question = await call('POST', '/api/feed/posts', {
    group_id: it,
    kind: 'question',
    body: 'Backup Proxmox để ở đâu?',
  });
  await signIn(AN);
  const answer = await call('POST', `/api/feed/posts/${question.data.id}/comments`, {
    body: 'Ổ NAS',
  });
  const reply = await call('POST', `/api/feed/posts/${question.data.id}/comments`, {
    body: 'thêm ý',
    parent_id: answer.data.id,
  });
  const nested = await call('POST', `/api/feed/posts/${question.data.id}/comments`, {
    body: 'trả lời vào trả lời',
    parent_id: reply.data.id,
  });
  const comments = await call('GET', `/api/feed/posts/${question.data.id}/comments`);
  assert.equal(comments.data.find((c: Json) => c.id === nested.data.id).parent_id, answer.data.id);
  /* Chi nguoi hoi chon cau tra loi. */
  assert.equal(
    (await call('POST', `/api/feed/comments/${answer.data.id}/answer`, { is_answer: true })).status,
    403
  );
  await signIn(BINH);
  await call('POST', `/api/feed/comments/${answer.data.id}/answer`, { is_answer: true });
  const q = await call('GET', `/api/feed/posts/${question.data.id}`);
  assert.equal(q.data.answer_comment_id, answer.data.id);
  assert.equal(q.data.comment_count, 3);
});

test('nhom du an: chu du an va nguoi duoc giao viec la thanh vien; tao cong viec tu bai', async () => {
  await signIn(AN);
  const project = await call('POST', '/api/projects', { name: 'Dự án CRM' });
  assert.equal(project.status, 201);
  const board = await call('POST', '/api/boards', {
    name: 'Triển khai',
    project_id: project.data.id,
  });
  assert.equal(board.status, 201);
  const projectGroup = await groupIdOf('project', 'Dự án CRM');

  await signIn(BINH);
  assert.equal((await call('GET', `/api/feed/groups/${projectGroup}`)).status, 404);
  const list = db.prepare(`SELECT id FROM lists WHERE board_id = ? LIMIT 1`).get(board.data.id) as
    { id: number } | undefined;
  assert.ok(list, 'bang moi co danh sach mac dinh');
  db.prepare(
    `INSERT INTO cards (list_id, title, position, assignee_contact_id, search_text) VALUES (?, 'Cài server', 1, ?, '')`
  ).run(list.id, binh);
  assert.equal((await call('GET', `/api/feed/groups/${projectGroup}`)).status, 200);

  await signIn(AN);
  const post = await call('POST', '/api/feed/posts', {
    group_id: projectGroup,
    body: 'Cần dựng môi trường test',
  });
  const task = await call('POST', `/api/feed/posts/${post.data.id}/task`, {
    title: 'Dựng môi trường test',
    assignee_contact_id: binh,
  });
  assert.equal(task.status, 201);
  assert.equal(task.data.post.task_card_id, task.data.card.id);
  const tasks = await call('GET', `/api/feed/groups/${projectGroup}/tasks`);
  assert.equal(tasks.data.length, 1);
});

test('su kien: tra loi tham gia va them vao lich cua toi', async () => {
  await signIn(AN);
  const company = await groupIdOf('company');
  const event = await call('POST', '/api/feed/posts', {
    group_id: company,
    kind: 'event',
    body: 'Đào tạo sử dụng CRM',
    event: { start_at: '2099-10-15T14:00', end_at: '2099-10-15T16:00', location: 'Online' },
  });
  assert.equal(event.status, 201);
  await signIn(BINH);
  const rsvp = await call('PUT', `/api/feed/posts/${event.data.id}/rsvp`, { response: 'going' });
  assert.equal(rsvp.data.event.going, 1);
  const upcoming = await call('GET', '/api/feed/events');
  assert.ok(upcoming.data.some((e: Json) => e.id === event.data.id));
  const cal = await call('POST', `/api/feed/posts/${event.data.id}/calendar`);
  assert.equal(cal.status, 201);
  const row = db
    .prepare(`SELECT owner_contact_id, start_at FROM calendar_events WHERE id = ?`)
    .get(cal.data.id) as { owner_contact_id: number; start_at: string };
  assert.equal(row.owner_contact_id, binh);
  assert.equal(row.start_at, '2099-10-15T14:00');
});

test('so bai chua doc giam khi da xem nhom; tat thong bao thi khong dem', async () => {
  await signIn(BINH);
  const it = await groupIdOf('unit', 'Phòng IT');
  let nav = await call('GET', '/api/feed/nav');
  assert.ok(nav.data.groups.find((g: Json) => g.id === it).unread > 0);
  await call('PUT', `/api/feed/groups/${it}/visit`, {});
  nav = await call('GET', '/api/feed/nav');
  assert.equal(nav.data.groups.find((g: Json) => g.id === it).unread, 0);

  await signIn(AN);
  await call('POST', '/api/feed/posts', { group_id: it, body: 'Tin mới' });
  await signIn(BINH);
  await call('PUT', `/api/feed/groups/${it}/visit`, { notify: 'none' });
  db.prepare(`UPDATE feed_visits SET last_seen_at = '2000-01-01 00:00:00' WHERE group_id = ?`).run(
    it
  );
  nav = await call('GET', '/api/feed/nav');
  assert.equal(nav.data.groups.find((g: Json) => g.id === it).unread, 0);
});

/* ---------- 1.34.0: thong bao, tim kiem, thong ke ---------- */

async function bell() {
  const res = await call('GET', '/api/notifications');
  assert.equal(res.status, 200);
  return (res.data.items as Json[]).filter((item) => item.kind === 'feed');
}

test('thong bao: nhac ten, bai moi, binh luan, tra loi — dung nguoi, khong bao chinh minh', async () => {
  await signIn(BINH);
  const it = await groupIdOf('unit', 'Phòng IT');
  const before = (await bell()).length;

  await signIn(AN);
  const before_an = (await bell()).length;
  const post = await call('POST', '/api/feed/posts', {
    group_id: it,
    body: 'Nhờ @Trần Thị Bình xem giúp',
    mention_ids: [binh],
  });
  assert.equal((await bell()).length, before_an, 'tac gia khong tu nhan thong bao');

  await signIn(BINH);
  const items = await bell();
  assert.equal(items.length, before + 1, 'mot thong bao duy nhat (nhac ten thang bai moi)');
  const mention = items.find((i: Json) => i.link === `/feed/posts/${post.data.id}`);
  assert.match(mention.title, /Nguyễn Văn An nhắc đến bạn trong Phòng IT/);
  assert.equal(mention.is_read, false);
  const unreadMentions = (await call('GET', '/api/feed/nav')).data.counts.mentions;
  assert.ok(unreadMentions >= 1);

  /* Chi khong thuoc nhom: khong nhan, va khong doc/sua duoc thong bao cua Binh. */
  await signIn(CHI);
  assert.ok(!(await bell()).some((i: Json) => i.key === mention.key));
  assert.equal(
    (await call('PATCH', `/api/notifications/${mention.key}/state`, { is_read: true })).status,
    404
  );

  /* Binh mo bai => da doc. */
  await signIn(BINH);
  await call('POST', `/api/feed/posts/${post.data.id}/seen`);
  assert.equal((await bell()).find((i: Json) => i.key === mention.key).is_read, true);
  assert.equal((await call('GET', '/api/feed/nav')).data.counts.mentions, unreadMentions - 1);

  /* Binh binh luan => An (tac gia) nhan "binh luan"; An tra loi => Binh nhan "tra loi". */
  const comment = await call('POST', `/api/feed/posts/${post.data.id}/comments`, { body: 'Ok' });
  await signIn(AN);
  assert.ok(
    (await bell()).some((i: Json) => /Trần Thị Bình bình luận bài viết của bạn/.test(i.title))
  );
  await call('POST', `/api/feed/posts/${post.data.id}/comments`, {
    body: 'Cảm ơn',
    parent_id: comment.data.id,
  });
  await signIn(BINH);
  assert.ok(
    (await bell()).some((i: Json) => /Nguyễn Văn An trả lời bình luận của bạn/.test(i.title))
  );
});

test('thong bao: nhom Toan cong ty mac dinh chi bao thong bao va nhac ten; tat thong bao thi im', async () => {
  await signIn(BINH);
  const company = await groupIdOf('company');
  const it = await groupIdOf('unit', 'Phòng IT');
  const before = (await bell()).length;

  await signIn(AN);
  await call('POST', '/api/feed/posts', { group_id: company, body: 'Chào cả công ty' });
  await signIn(BINH);
  assert.equal((await bell()).length, before, 'bai thuong o Toan cong ty khong bao');

  await signIn(ADMIN);
  await call('POST', '/api/feed/posts', {
    group_id: company,
    kind: 'announcement',
    requires_ack: true,
    body: 'Lịch nghỉ lễ',
  });
  await signIn(BINH);
  const after = await bell();
  assert.equal(after.length, before + 1);
  assert.equal(after[0].severity, 'warning', 'thong bao chua xac nhan noi bat');

  await call('PUT', `/api/feed/groups/${it}/visit`, { notify: 'none' });
  await signIn(AN);
  await call('POST', '/api/feed/posts', { group_id: it, body: 'Tin phòng' });
  await signIn(BINH);
  assert.equal((await bell()).length, before + 1, 'nhom da tat thong bao');
  await call('PUT', `/api/feed/groups/${it}/visit`, { notify: 'all' });
});

test('thong bao: bai cho duyet bao quan tri; duoc duyet bao tac gia', async () => {
  await signIn(CHI);
  const group = await call('POST', '/api/feed/groups', {
    name: 'Nhóm duyệt bài',
    visibility: 'public',
    require_approval: true,
  });
  await signIn(BINH);
  await call('POST', `/api/feed/groups/${group.data.id}/join`);
  const post = await call('POST', '/api/feed/posts', {
    group_id: group.data.id,
    body: 'Xin duyệt',
  });
  assert.equal(post.data.status, 'pending');

  await signIn(CHI);
  assert.ok((await bell()).some((i: Json) => /gửi bài chờ duyệt/.test(i.title)));
  await call('POST', `/api/feed/posts/${post.data.id}/moderate`, { action: 'approve' });
  await signIn(BINH);
  assert.ok((await bell()).some((i: Json) => /Lê Minh Chi đã duyệt bài của bạn/.test(i.title)));
});

test('Ctrl+K tim thay bai viet cua nhom minh, khong lo bai nhom khac', async () => {
  await signIn(CHI);
  const sales = await groupIdOf('unit', 'Phòng Kinh doanh');
  await call('POST', '/api/feed/posts', { group_id: sales, body: 'Báo giá Zebra mật' });

  const mine = await call('GET', '/api/search?q=zebra');
  assert.equal(mine.data.posts.length, 1);
  assert.equal(mine.data.posts[0].group_name, 'Phòng Kinh doanh');

  await signIn(BINH);
  assert.equal((await call('GET', '/api/search?q=zebra')).data.posts.length, 0);
});

test('thong ke tuong tac: quan tri nhom xem duoc, thanh vien thuong thi khong', async () => {
  await signIn(BINH);
  const it = await groupIdOf('unit', 'Phòng IT');
  assert.equal((await call('GET', `/api/feed/groups/${it}/stats`)).status, 403);
  assert.equal((await call('GET', '/api/feed/stats')).data.groups.length >= 0, true);

  await signIn(ADMIN);
  const stats = await call('GET', `/api/feed/groups/${it}/stats?days=30`);
  assert.equal(stats.status, 200);
  assert.equal(stats.data.series.length, 30);
  assert.ok(stats.data.current.posts > 0);
  assert.ok(stats.data.current.comments > 0);
  assert.ok(stats.data.current.active >= 2);
  assert.ok(stats.data.current.participation > 0 && stats.data.current.participation <= 1);
  assert.equal(stats.data.contributors[0].full_name, 'Nguyễn Văn An');
  const total = stats.data.series.reduce((n: number, d: Json) => n + d.posts, 0);
  assert.equal(total, stats.data.current.posts);

  const overview = await call('GET', '/api/feed/stats?days=7');
  assert.ok(overview.data.groups.some((g: Json) => g.group.id === it));
});
