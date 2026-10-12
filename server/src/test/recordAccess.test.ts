import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * Phan quyen THEO TUNG BAN GHI (1.37.0): moi route co tham so id, goi bang tai
 * khoan phong khac, phai tra 404.
 *
 * dataScope.test.ts dem dong o man DANH SACH; no khong bat duoc route chi tiet /
 * sua / xoa theo id quen kiem pham vi — dung loai lo da de nhan vien phong nay doc,
 * sua, xoa the, bang, lich, bao gia, dong doanh thu cua phong khac (ban ra soat
 * 2026-10-12). Test nay co hai tang:
 *
 *  1. Moi route trong bang PROBES phai tra 404 cho N2 (phong P2) khi dung id du
 *     lieu cua N1 (phong P1).
 *  2. Quet ma nguon routes/*.ts: route co tham so ma khong nam trong PROBES va
 *     cung khong nam trong EXEMPT (kem ly do) thi test do — route them sau nay
 *     khong the lot luoi am tham.
 */

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-record-access-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';
process.env.WORKFLOW_SESSION_SECRET = 'test-secret-value-at-least-32-characters-long';
process.env.WORKFLOW_ADMIN_USER = 'admin';
process.env.WORKFLOW_ADMIN_PASSWORD = 'admin-password-1';
process.env.WORKFLOW_ADMIN_EMAIL = 'admin@congty.vn';

const { createApp } = await import('../app.ts');
const { db, closeDatabase } = await import('../db/connection.ts');
const { ensureAdminUser } = await import('../services/auth/bootstrapAdmin.ts');
const { setPassword } = await import('../services/auth/users.ts');

await ensureAdminUser();

let server: Server;
let baseUrl = '';
let cookie = '';

/* ---------- Cay don vi: hai nhan vien o hai phong ---------- */

const ownOrgId = Number(
  db.prepare(`INSERT INTO customers (name, org_kind) VALUES ('Công ty tôi', 'own')`).run()
    .lastInsertRowid
);

function unitId(name: string): number {
  return (db.prepare('SELECT id FROM org_units WHERE name = ?').get(name) as { id: number }).id;
}

function addUnit(name: string, parent: string): void {
  db.prepare(`INSERT INTO org_units (name, parent_id, position) VALUES (?, ?, 1024)`).run(
    name,
    unitId(parent)
  );
}

interface Person {
  contactId: number;
  userId: number;
  email: string;
}

function addPerson(name: string, unit: string, positionCode = 'staff'): Person {
  const contactId = Number(
    db
      .prepare(
        `INSERT INTO contacts (customer_id, full_name, org_unit_id, is_active) VALUES (?, ?, ?, 1)`
      )
      .run(ownOrgId, name, unitId(unit)).lastInsertRowid
  );
  const email = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}@congty.vn`;
  const userId = Number(
    db
      .prepare(
        `INSERT INTO users (username, password_hash, password_salt, email, full_name, contact_id)
         VALUES (?, '', '', ?, ?, ?)`
      )
      .run(email, email, name, contactId).lastInsertRowid
  );
  db.prepare(
    `INSERT INTO user_positions (user_id, position_id, is_primary)
     VALUES (?, (SELECT id FROM positions WHERE code = ?), 1)`
  ).run(userId, positionCode);
  return { contactId, userId, email };
}

addUnit('Khối A', 'Công ty');
addUnit('Phòng P1', 'Khối A');
addUnit('Phòng P2', 'Khối A');
const n1 = addPerson('Nhan Vien Mot', 'Phòng P1');
const n2 = addPerson('Nhan Vien Hai', 'Phòng P2');
const revenueAdmin = addPerson('Admin Doanh Thu', 'Công ty', 'revenue_admin');

/* ---------- Du lieu cua N1 (chen thang, chu so huu = N1) ---------- */

function insert(sql: string, ...params: unknown[]): number {
  return Number(db.prepare(sql).run(...params).lastInsertRowid);
}

const owner = n1.contactId;
const customerId = insert(
  `INSERT INTO customers (name, org_kind, status, owner_contact_id) VALUES ('Khách N1', 'customer', 'customer', ?)`,
  owner
);
const contactId = insert(
  `INSERT INTO contacts (customer_id, full_name, is_active) VALUES (?, 'Người liên hệ N1', 1)`,
  customerId
);
const dealId = insert(
  `INSERT INTO deals (customer_id, title, stage, position, value_vnd, owner_contact_id)
   VALUES (?, 'Cơ hội N1', 'lead', 1024, 1000, ?)`,
  customerId,
  owner
);
const projectId = insert(
  `INSERT INTO projects (name, customer_id, owner_contact_id) VALUES ('Dự án N1', ?, ?)`,
  customerId,
  owner
);
const riskId = insert(
  `INSERT INTO project_risks (project_id, title) VALUES (?, 'Rủi ro N1')`,
  projectId
);
const boardId = insert(`INSERT INTO boards (name, owner_contact_id) VALUES ('Bảng N1', ?)`, owner);
const listId = insert(
  `INSERT INTO lists (board_id, name, position) VALUES (?, 'Cột N1', 1024)`,
  boardId
);
const cardId = insert(
  `INSERT INTO cards (list_id, title, position, assignee_contact_id) VALUES (?, 'Việc N1', 1024, ?)`,
  listId,
  owner
);
const card2Id = insert(
  `INSERT INTO cards (list_id, title, position, assignee_contact_id) VALUES (?, 'Việc N1 thứ hai', 2048, ?)`,
  listId,
  owner
);
db.prepare(`INSERT INTO card_dependencies (predecessor_id, successor_id) VALUES (?, ?)`).run(
  card2Id,
  cardId
);
const checklistId = insert(
  `INSERT INTO checklist_items (card_id, content, position) VALUES (?, 'Bước N1', 1024)`,
  cardId
);
const commentId = insert(
  `INSERT INTO card_comments (card_id, body) VALUES (?, 'Nhận xét N1')`,
  cardId
);
const flowId = insert(`INSERT INTO card_flows (card_id, status) VALUES (?, 'todo')`, cardId);
const stepId = insert(
  `INSERT INTO card_flow_steps (flow_id, content, position) VALUES (?, 'Bước quy trình', 1024)`,
  flowId
);
const nudgeId = insert(
  `INSERT INTO task_nudges (card_id, contact_id, channel, message) VALUES (?, ?, 'zalo', 'Nhắc N1')`,
  cardId,
  owner
);
const fieldId = insert(
  `INSERT INTO card_fields (board_id, name, field_type, position) VALUES (?, 'Trường N1', 'text', 1024)`,
  boardId
);
const eventId = insert(
  `INSERT INTO calendar_events (title, start_at, end_at, owner_contact_id)
   VALUES ('Lịch N1', '2030-01-02T09:00', '2030-01-02T10:00', ?)`,
  owner
);
const reminderId = insert(
  `INSERT INTO reminders (title, due_at, owner_contact_id) VALUES ('Nhắc hẹn N1', '2030-01-02T09:00', ?)`,
  owner
);
const quotationId = insert(
  `INSERT INTO quotations (customer_id, deal_id, code) VALUES (?, ?, 'BG-N1')`,
  customerId,
  dealId
);
const contractId = insert(
  `INSERT INTO contracts (customer_id, deal_id, name, status, end_date)
   VALUES (?, ?, 'HĐ N1', 'active', '2030-01-01')`,
  customerId,
  dealId
);
const lineId = insert(
  `INSERT INTO customer_services (customer_id, owner_contact_id) VALUES (?, ?)`,
  customerId,
  owner
);
const documentId = insert(
  `INSERT INTO documents (name, file_name, stored_name, owner_contact_id, customer_id)
   VALUES ('Tệp N1', 'n1.txt', 'n1.txt', ?, ?)`,
  owner,
  customerId
);
fs.mkdirSync(path.join(fixtureRoot, 'files'), { recursive: true });
const interactionId = insert(
  `INSERT INTO interactions (customer_id, deal_id, type, occurred_at, summary)
   VALUES (?, ?, 'call', '2026-01-01 09:00', 'Gọi N1')`,
  customerId,
  dealId
);
const meetingNoteId = insert(
  `INSERT INTO meeting_notes (title, deal_id, owner_contact_id) VALUES ('Biên bản N1', ?, ?)`,
  dealId,
  owner
);
const quickNoteId = insert(
  `INSERT INTO quick_notes (title, owner_contact_id) VALUES ('Ghi chú N1', ?)`,
  owner
);
const handoverItemId = insert(
  `INSERT INTO deal_handover_items (deal_id, content) VALUES (?, 'Mục bàn giao N1')`,
  dealId
);
const decisionId = insert(
  `INSERT INTO deal_decisions (deal_id, decision) VALUES (?, 'pursue')`,
  dealId
);
db.prepare(`INSERT INTO deal_committee (deal_id, contact_id) VALUES (?, ?)`).run(dealId, contactId);
const dealEventId = insert(
  `INSERT INTO deal_events (deal_id, event_type, description) VALUES (?, 'other', 'Sự kiện N1')`,
  dealId
);
const competitorId = insert(
  `INSERT INTO deal_competitors (deal_id, name) VALUES (?, 'Đối thủ N1')`,
  dealId
);
const proposalId = insert(
  `INSERT INTO ai_action_proposals (action_type, title, payload_json, owner_contact_id)
   VALUES ('update_deal_next_action', 'Đề xuất N1', ?, ?)`,
  JSON.stringify({ deal_id: dealId, next_action: 'Gọi lại' }),
  owner
);
const labelGroupId = insert(
  `INSERT INTO labels (name, color, position) VALUES ('Nhóm nhãn', '#000000', 1024)`
);
const labelId = insert(
  `INSERT INTO labels (name, color, parent_id, position) VALUES ('Nhãn N1', '#ff0000', ?, 1024)`,
  labelGroupId
);
db.prepare(`INSERT INTO label_links (label_id, entity_type, entity_id) VALUES (?, 'deal', ?)`).run(
  labelId,
  dealId
);
const aiNotificationId = insert(
  `INSERT INTO ai_notifications (title, body, link, fingerprint)
   VALUES ('Cảnh báo N1', 'Cơ hội của N1', ?, 'test-n1')`,
  `/deals/${dealId}`
);

/* Bat tinh nang Quy trinh de route quy trinh di toi buoc kiem quyen (tat thi 409 truoc). */
db.prepare(`INSERT INTO app_settings (key, value) VALUES ('task_flow.enabled', '1')`).run();

/* ---------- Bang route: N2 goi bang id cua N1, phai 404 ---------- */

interface Probe {
  /** Tep route va duong dan DUNG nhu trong ma nguon — de doi chieu o tang 2. */
  file: string;
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  route: string;
  /** Duong dan that da thay id (gom ca tien to mount). */
  url: string;
  body?: unknown;
}

const PROBES: Probe[] = [
  // Bang / danh sach
  {
    file: 'boards',
    method: 'get',
    route: '/:id/archived-cards',
    url: `/api/boards/${boardId}/archived-cards`,
  },
  { file: 'boards', method: 'get', route: '/:id/full', url: `/api/boards/${boardId}/full` },
  {
    file: 'boards',
    method: 'patch',
    route: '/:id',
    url: `/api/boards/${boardId}`,
    body: { name: 'N2' },
  },
  { file: 'boards', method: 'delete', route: '/:id', url: `/api/boards/${boardId}` },
  {
    file: 'boards',
    method: 'post',
    route: '/:id/template',
    url: `/api/boards/${boardId}/template`,
    body: { key: 'basic' },
  },
  {
    file: 'boards',
    method: 'post',
    route: '/:id/lists',
    url: `/api/boards/${boardId}/lists`,
    body: { name: 'N2' },
  },
  {
    file: 'lists',
    method: 'patch',
    route: '/:id',
    url: `/api/lists/${listId}`,
    body: { name: 'N2' },
  },
  {
    file: 'lists',
    method: 'patch',
    route: '/:id/sort',
    url: `/api/lists/${listId}/sort`,
    body: { by: 'title' },
  },
  { file: 'lists', method: 'post', route: '/:id/copy', url: `/api/lists/${listId}/copy`, body: {} },
  {
    file: 'lists',
    method: 'patch',
    route: '/:id/move',
    url: `/api/lists/${listId}/move`,
    body: {},
  },
  { file: 'lists', method: 'delete', route: '/:id', url: `/api/lists/${listId}` },
  {
    file: 'cardFields',
    method: 'patch',
    route: '/:id',
    url: `/api/card-fields/${fieldId}`,
    body: { name: 'N2' },
  },
  { file: 'cardFields', method: 'delete', route: '/:id', url: `/api/card-fields/${fieldId}` },
  // Cong viec
  { file: 'cards', method: 'get', route: '/:id', url: `/api/cards/${cardId}` },
  {
    file: 'cards',
    method: 'post',
    route: '/:id/dependencies',
    url: `/api/cards/${cardId}/dependencies`,
    body: { predecessor_id: card2Id },
  },
  {
    file: 'cards',
    method: 'delete',
    route: '/:id/dependencies/:predecessorId',
    url: `/api/cards/${cardId}/dependencies/${card2Id}`,
  },
  {
    file: 'cards',
    method: 'put',
    route: '/:id/fields/:fieldId',
    url: `/api/cards/${cardId}/fields/${fieldId}`,
    body: { value: 'x' },
  },
  {
    file: 'cards',
    method: 'patch',
    route: '/:id',
    url: `/api/cards/${cardId}`,
    body: { title: 'N2' },
  },
  {
    file: 'cards',
    method: 'patch',
    route: '/:id/move',
    url: `/api/cards/${cardId}/move`,
    body: { list_id: listId },
  },
  { file: 'cards', method: 'delete', route: '/:id', url: `/api/cards/${cardId}` },
  { file: 'cards', method: 'get', route: '/:id/comments', url: `/api/cards/${cardId}/comments` },
  {
    file: 'cards',
    method: 'post',
    route: '/:id/comments',
    url: `/api/cards/${cardId}/comments`,
    body: { body: 'N2' },
  },
  {
    file: 'cards',
    method: 'put',
    route: '/:id/watch',
    url: `/api/cards/${cardId}/watch`,
    body: { watching: true },
  },
  { file: 'cards', method: 'post', route: '/:id/copy', url: `/api/cards/${cardId}/copy`, body: {} },
  {
    file: 'cards',
    method: 'post',
    route: '/:id/checklist',
    url: `/api/cards/${cardId}/checklist`,
    body: { content: 'N2' },
  },
  {
    file: 'cards',
    method: 'put',
    route: '/:id/labels',
    url: `/api/cards/${cardId}/labels`,
    body: { label_ids: [] },
  },
  {
    file: 'checklist',
    method: 'patch',
    route: '/:id',
    url: `/api/checklist/${checklistId}`,
    body: { content: 'N2' },
  },
  {
    file: 'checklist',
    method: 'post',
    route: '/:id/promote',
    url: `/api/checklist/${checklistId}/promote`,
  },
  { file: 'checklist', method: 'delete', route: '/:id', url: `/api/checklist/${checklistId}` },
  {
    file: 'comments',
    method: 'patch',
    route: '/:id',
    url: `/api/comments/${commentId}`,
    body: { body: 'N2' },
  },
  { file: 'comments', method: 'delete', route: '/:id', url: `/api/comments/${commentId}` },
  {
    file: 'taskFlows',
    method: 'post',
    route: '/cards/:cardId',
    url: `/api/task-flows/cards/${cardId}`,
    body: { status: 'todo', steps: ['N2'] },
  },
  { file: 'taskFlows', method: 'delete', route: '/:flowId', url: `/api/task-flows/${flowId}` },
  {
    file: 'taskFlows',
    method: 'post',
    route: '/:flowId/steps',
    url: `/api/task-flows/${flowId}/steps`,
    body: { content: 'N2' },
  },
  {
    file: 'taskFlows',
    method: 'patch',
    route: '/steps/:stepId',
    url: `/api/task-flows/steps/${stepId}`,
    body: { done: true },
  },
  {
    file: 'taskFlows',
    method: 'delete',
    route: '/steps/:stepId',
    url: `/api/task-flows/steps/${stepId}`,
  },
  {
    file: 'nudges',
    method: 'patch',
    route: '/:id',
    url: `/api/nudges/${nudgeId}`,
    body: { response: 'N2' },
  },
  { file: 'nudges', method: 'delete', route: '/:id', url: `/api/nudges/${nudgeId}` },
  {
    file: 'nudges',
    method: 'post',
    route: '/:cardId/draft',
    url: `/api/nudges/${cardId}/draft`,
    body: {},
  },
  {
    file: 'calendarEvents',
    method: 'get',
    route: '/events/:id',
    url: `/api/calendar/events/${eventId}`,
  },
  {
    file: 'calendarEvents',
    method: 'patch',
    route: '/events/:id',
    url: `/api/calendar/events/${eventId}`,
    body: { title: 'N2' },
  },
  {
    file: 'calendarEvents',
    method: 'delete',
    route: '/events/:id',
    url: `/api/calendar/events/${eventId}`,
  },
  {
    file: 'reminders',
    method: 'patch',
    route: '/:id',
    url: `/api/reminders/${reminderId}`,
    body: { title: 'N2' },
  },
  { file: 'reminders', method: 'delete', route: '/:id', url: `/api/reminders/${reminderId}` },
  {
    file: 'notifications',
    method: 'patch',
    route: '/:key/state',
    url: `/api/notifications/reminder-${reminderId}/state`,
    body: { is_read: true },
  },
  {
    file: 'notifications',
    method: 'post',
    route: '/:key/complete',
    url: `/api/notifications/task-${cardId}/complete`,
    body: { done: true },
  },
  // CRM
  {
    file: 'customers',
    method: 'get',
    route: '/:id/full',
    url: `/api/customers/${customerId}/full`,
  },
  {
    file: 'customers',
    method: 'get',
    route: '/:id/overview',
    url: `/api/customers/${customerId}/overview`,
  },
  {
    file: 'customers',
    method: 'post',
    route: '/:id/suggestions/:sid/accept',
    url: `/api/customers/${customerId}/suggestions/1/accept`,
    body: {},
  },
  {
    file: 'customers',
    method: 'post',
    route: '/:id/suggestions/:sid/dismiss',
    url: `/api/customers/${customerId}/suggestions/1/dismiss`,
    body: {},
  },
  {
    file: 'customers',
    method: 'patch',
    route: '/:id',
    url: `/api/customers/${customerId}`,
    body: { name: 'N2' },
  },
  {
    file: 'customers',
    method: 'get',
    route: '/:id/impact',
    url: `/api/customers/${customerId}/impact`,
  },
  { file: 'customers', method: 'delete', route: '/:id', url: `/api/customers/${customerId}` },
  {
    file: 'customers',
    method: 'post',
    route: '/:id/contacts',
    url: `/api/customers/${customerId}/contacts`,
    body: { full_name: 'N2' },
  },
  {
    file: 'customers',
    method: 'get',
    route: '/:id/interactions',
    url: `/api/customers/${customerId}/interactions`,
  },
  { file: 'contacts', method: 'get', route: '/:id/full', url: `/api/contacts/${contactId}/full` },
  {
    file: 'contacts',
    method: 'patch',
    route: '/:id',
    url: `/api/contacts/${contactId}`,
    body: { full_name: 'N2' },
  },
  { file: 'contacts', method: 'delete', route: '/:id', url: `/api/contacts/${contactId}` },
  { file: 'deals', method: 'get', route: '/:id', url: `/api/deals/${dealId}` },
  {
    file: 'deals',
    method: 'patch',
    route: '/:id',
    url: `/api/deals/${dealId}`,
    body: { title: 'N2' },
  },
  {
    file: 'deals',
    method: 'patch',
    route: '/:id/move',
    url: `/api/deals/${dealId}/move`,
    body: { stage: 'lead' },
  },
  { file: 'deals', method: 'get', route: '/:id/handover', url: `/api/deals/${dealId}/handover` },
  {
    file: 'deals',
    method: 'post',
    route: '/:id/handover/template',
    url: `/api/deals/${dealId}/handover/template`,
    body: {},
  },
  {
    file: 'deals',
    method: 'post',
    route: '/:id/handover',
    url: `/api/deals/${dealId}/handover`,
    body: { content: 'N2' },
  },
  {
    file: 'deals',
    method: 'patch',
    route: '/:id/handover/:itemId',
    url: `/api/deals/${dealId}/handover/${handoverItemId}`,
    body: { is_done: true },
  },
  {
    file: 'deals',
    method: 'delete',
    route: '/:id/handover/:itemId',
    url: `/api/deals/${dealId}/handover/${handoverItemId}`,
  },
  {
    file: 'deals',
    method: 'get',
    route: '/:id/delete-preview',
    url: `/api/deals/${dealId}/delete-preview`,
  },
  { file: 'deals', method: 'delete', route: '/:id', url: `/api/deals/${dealId}` },
  {
    file: 'quotations',
    method: 'patch',
    route: '/:id',
    url: `/api/quotations/${quotationId}`,
    body: { notes: 'N2' },
  },
  { file: 'quotations', method: 'delete', route: '/:id', url: `/api/quotations/${quotationId}` },
  { file: 'contracts', method: 'get', route: '/:id', url: `/api/contracts/${contractId}` },
  {
    file: 'contracts',
    method: 'patch',
    route: '/:id',
    url: `/api/contracts/${contractId}`,
    body: { notes: 'N2' },
  },
  {
    file: 'contracts',
    method: 'post',
    route: '/:id/renew',
    url: `/api/contracts/${contractId}/renew`,
  },
  { file: 'contracts', method: 'delete', route: '/:id', url: `/api/contracts/${contractId}` },
  { file: 'revenues', method: 'get', route: '/lines/:id', url: `/api/revenues/lines/${lineId}` },
  {
    file: 'revenues',
    method: 'patch',
    route: '/lines/:id',
    url: `/api/revenues/lines/${lineId}`,
    body: { notes: 'N2' },
  },
  { file: 'revenues', method: 'delete', route: '/lines/:id', url: `/api/revenues/lines/${lineId}` },
  {
    file: 'revenues',
    method: 'put',
    route: '/lines/:id/revenue',
    url: `/api/revenues/lines/${lineId}/revenue`,
    body: { period: '2026-01', amount_vnd: 1 },
  },
  {
    file: 'revenues',
    method: 'put',
    route: '/lines/:id/revenue-bulk',
    url: `/api/revenues/lines/${lineId}/revenue-bulk`,
    body: { cells: [] },
  },
  {
    file: 'revenues',
    method: 'post',
    route: '/lines/:id/anchor-preview',
    url: `/api/revenues/lines/${lineId}/anchor-preview`,
    body: { mode: 'auto' },
  },
  {
    file: 'revenues',
    method: 'put',
    route: '/lines/:id/anchor',
    url: `/api/revenues/lines/${lineId}/anchor`,
    body: { mode: 'auto' },
  },
  {
    file: 'revenues',
    method: 'put',
    route: '/lines/:id/baseline',
    url: `/api/revenues/lines/${lineId}/baseline`,
    body: { year: 2026, avg_monthly_vnd: 1 },
  },
  {
    file: 'documents',
    method: 'get',
    route: '/:id/download',
    url: `/api/documents/${documentId}/download`,
  },
  {
    file: 'documents',
    method: 'patch',
    route: '/:id',
    url: `/api/documents/${documentId}`,
    body: { name: 'N2' },
  },
  {
    file: 'documents',
    method: 'post',
    route: '/:id/restore',
    url: `/api/documents/${documentId}/restore`,
  },
  {
    file: 'documents',
    method: 'delete',
    route: '/:id/permanent',
    url: `/api/documents/${documentId}/permanent`,
  },
  { file: 'documents', method: 'delete', route: '/:id', url: `/api/documents/${documentId}` },
  {
    file: 'interactions',
    method: 'patch',
    route: '/:id',
    url: `/api/interactions/${interactionId}`,
    body: { summary: 'N2' },
  },
  {
    file: 'interactions',
    method: 'delete',
    route: '/:id',
    url: `/api/interactions/${interactionId}`,
  },
  {
    file: 'meetingNotes',
    method: 'get',
    route: '/:id',
    url: `/api/meeting-notes/${meetingNoteId}`,
  },
  {
    file: 'meetingNotes',
    method: 'patch',
    route: '/:id',
    url: `/api/meeting-notes/${meetingNoteId}`,
    body: { title: 'N2' },
  },
  {
    file: 'meetingNotes',
    method: 'post',
    route: '/:id/restore',
    url: `/api/meeting-notes/${meetingNoteId}/restore`,
  },
  {
    file: 'meetingNotes',
    method: 'delete',
    route: '/:id/permanent',
    url: `/api/meeting-notes/${meetingNoteId}/permanent`,
  },
  {
    file: 'meetingNotes',
    method: 'delete',
    route: '/:id',
    url: `/api/meeting-notes/${meetingNoteId}`,
  },
  { file: 'quickNotes', method: 'get', route: '/:id', url: `/api/quick-notes/${quickNoteId}` },
  {
    file: 'quickNotes',
    method: 'patch',
    route: '/:id',
    url: `/api/quick-notes/${quickNoteId}`,
    body: { title: 'N2' },
  },
  { file: 'quickNotes', method: 'delete', route: '/:id', url: `/api/quick-notes/${quickNoteId}` },
  {
    file: 'quickNotes',
    method: 'delete',
    route: '/:id/permanent',
    url: `/api/quick-notes/${quickNoteId}/permanent`,
  },
  {
    file: 'quickNotes',
    method: 'post',
    route: '/:id/discard-if-empty',
    url: `/api/quick-notes/${quickNoteId}/discard-if-empty`,
  },
  {
    file: 'quickNotes',
    method: 'post',
    route: '/:id/restore',
    url: `/api/quick-notes/${quickNoteId}/restore`,
  },
  {
    file: 'quickNotes',
    method: 'post',
    route: '/:id/pin',
    url: `/api/quick-notes/${quickNoteId}/pin`,
    body: { pinned: true },
  },
  {
    file: 'quickNotes',
    method: 'post',
    route: '/:id/archive',
    url: `/api/quick-notes/${quickNoteId}/archive`,
    body: { archived: true },
  },
  {
    file: 'quickNotes',
    method: 'post',
    route: '/:id/move',
    url: `/api/quick-notes/${quickNoteId}/move`,
    body: {},
  },
  {
    file: 'quickNotes',
    method: 'put',
    route: '/:id/relations',
    url: `/api/quick-notes/${quickNoteId}/relations`,
    body: { relations: [] },
  },
  {
    file: 'quickNotes',
    method: 'post',
    route: '/:id/convert/task',
    url: `/api/quick-notes/${quickNoteId}/convert/task`,
    body: { card_id: cardId },
  },
  {
    file: 'quickNotes',
    method: 'post',
    route: '/:id/convert/crm-note',
    url: `/api/quick-notes/${quickNoteId}/convert/crm-note`,
    body: {},
  },
  { file: 'projects', method: 'get', route: '/:id', url: `/api/projects/${projectId}` },
  {
    file: 'projects',
    method: 'patch',
    route: '/:id',
    url: `/api/projects/${projectId}`,
    body: { name: 'N2' },
  },
  {
    file: 'projects',
    method: 'get',
    route: '/:id/classification',
    url: `/api/projects/${projectId}/classification`,
  },
  {
    file: 'projects',
    method: 'put',
    route: '/:id/model',
    url: `/api/projects/${projectId}/model`,
    body: { model: 'A' },
  },
  { file: 'projects', method: 'get', route: '/:id/risks', url: `/api/projects/${projectId}/risks` },
  {
    file: 'projects',
    method: 'post',
    route: '/:id/risks',
    url: `/api/projects/${projectId}/risks`,
    body: { title: 'N2' },
  },
  {
    file: 'projects',
    method: 'patch',
    route: '/:id/risks/:riskId',
    url: `/api/projects/${projectId}/risks/${riskId}`,
    body: { title: 'N2' },
  },
  {
    file: 'projects',
    method: 'delete',
    route: '/:id/risks/:riskId',
    url: `/api/projects/${projectId}/risks/${riskId}`,
  },
  { file: 'projects', method: 'delete', route: '/:id', url: `/api/projects/${projectId}` },
  // Cham diem co hoi (mount o /api)
  {
    file: 'scoring',
    method: 'get',
    route: '/deals/:id/scorecard',
    url: `/api/deals/${dealId}/scorecard`,
  },
  {
    file: 'scoring',
    method: 'put',
    route: '/deals/:id/scores/:factor',
    url: `/api/deals/${dealId}/scores/budget`,
    body: { score: 0 },
  },
  {
    file: 'scoring',
    method: 'post',
    route: '/deals/:id/scores/:factor/confirm',
    url: `/api/deals/${dealId}/scores/budget/confirm`,
    body: {},
  },
  {
    file: 'scoring',
    method: 'get',
    route: '/deals/:id/score-history',
    url: `/api/deals/${dealId}/score-history`,
  },
  {
    file: 'scoring',
    method: 'get',
    route: '/deals/:id/evidence-sources',
    url: `/api/deals/${dealId}/evidence-sources`,
  },
  {
    file: 'scoring',
    method: 'get',
    route: '/deals/:id/assessment',
    url: `/api/deals/${dealId}/assessment`,
  },
  {
    file: 'scoring',
    method: 'put',
    route: '/deals/:id/assessment/:criterion',
    url: `/api/deals/${dealId}/assessment/need`,
    body: { score: 0 },
  },
  {
    file: 'scoring',
    method: 'post',
    route: '/deals/:id/assessment/:criterion/confirm',
    url: `/api/deals/${dealId}/assessment/need/confirm`,
    body: {},
  },
  {
    file: 'scoring',
    method: 'post',
    route: '/deals/:id/decisions',
    url: `/api/deals/${dealId}/decisions`,
    body: { decision: 'pursue' },
  },
  {
    file: 'scoring',
    method: 'delete',
    route: '/deals/:id/decisions/:decisionId',
    url: `/api/deals/${dealId}/decisions/${decisionId}`,
  },
  {
    file: 'scoring',
    method: 'get',
    route: '/deals/:id/quick-assessment',
    url: `/api/deals/${dealId}/quick-assessment`,
  },
  {
    file: 'scoring',
    method: 'put',
    route: '/deals/:id/quick-assessment',
    url: `/api/deals/${dealId}/quick-assessment`,
    body: { answers: {} },
  },
  {
    file: 'scoring',
    method: 'get',
    route: '/deals/:id/committee',
    url: `/api/deals/${dealId}/committee`,
  },
  {
    file: 'scoring',
    method: 'post',
    route: '/deals/:id/committee',
    url: `/api/deals/${dealId}/committee`,
    body: { contact_id: contactId },
  },
  {
    file: 'scoring',
    method: 'patch',
    route: '/deals/:id/committee/:contactId',
    url: `/api/deals/${dealId}/committee/${contactId}`,
    body: { note: 'N2' },
  },
  {
    file: 'scoring',
    method: 'delete',
    route: '/deals/:id/committee/:contactId',
    url: `/api/deals/${dealId}/committee/${contactId}`,
  },
  {
    file: 'scoring',
    method: 'get',
    route: '/deals/:id/events',
    url: `/api/deals/${dealId}/events`,
  },
  {
    file: 'scoring',
    method: 'post',
    route: '/deals/:id/events',
    url: `/api/deals/${dealId}/events`,
    body: { event_type: 'other', description: 'N2' },
  },
  {
    file: 'scoring',
    method: 'patch',
    route: '/deals/:id/events/:eventId',
    url: `/api/deals/${dealId}/events/${dealEventId}`,
    body: { description: 'N2' },
  },
  {
    file: 'scoring',
    method: 'delete',
    route: '/deals/:id/events/:eventId',
    url: `/api/deals/${dealId}/events/${dealEventId}`,
  },
  {
    file: 'scoring',
    method: 'get',
    route: '/deals/:id/backward-plan',
    url: `/api/deals/${dealId}/backward-plan`,
  },
  {
    file: 'scoring',
    method: 'post',
    route: '/deals/:id/backward-plan',
    url: `/api/deals/${dealId}/backward-plan`,
    body: { steps: [] },
  },
  {
    file: 'scoring',
    method: 'get',
    route: '/deals/:id/competitors',
    url: `/api/deals/${dealId}/competitors`,
  },
  {
    file: 'scoring',
    method: 'post',
    route: '/deals/:id/competitors',
    url: `/api/deals/${dealId}/competitors`,
    body: { name: 'N2' },
  },
  {
    file: 'scoring',
    method: 'patch',
    route: '/deals/:id/competitors/:competitorId',
    url: `/api/deals/${dealId}/competitors/${competitorId}`,
    body: { note: 'N2' },
  },
  {
    file: 'scoring',
    method: 'delete',
    route: '/deals/:id/competitors/:competitorId',
    url: `/api/deals/${dealId}/competitors/${competitorId}`,
  },
  // Nhan gan tren ban ghi
  {
    file: 'labels',
    method: 'get',
    route: '/links/:entityType/:entityId',
    url: `/api/labels/links/deal/${dealId}`,
  },
  {
    file: 'labels',
    method: 'put',
    route: '/links/:entityType/:entityId',
    url: `/api/labels/links/deal/${dealId}`,
    body: { label_ids: [] },
  },
  // Tro ly AI
  {
    file: 'ai',
    method: 'post',
    route: '/assist/deal/:id/assessment',
    url: `/api/ai/assist/deal/${dealId}/assessment`,
    body: {},
  },
  {
    file: 'ai',
    method: 'post',
    route: '/assist/deal/:id/quick-assessment',
    url: `/api/ai/assist/deal/${dealId}/quick-assessment`,
    body: {},
  },
  {
    file: 'ai',
    method: 'post',
    route: '/assist/document/:id',
    url: `/api/ai/assist/document/${documentId}`,
    body: {},
  },
  {
    file: 'ai',
    method: 'post',
    route: '/assist/meeting-note/:id/summarize',
    url: `/api/ai/assist/meeting-note/${meetingNoteId}/summarize`,
    body: {},
  },
  {
    file: 'ai',
    method: 'post',
    route: '/assist/meeting-note/:id/inline',
    url: `/api/ai/assist/meeting-note/${meetingNoteId}/inline`,
    body: { action: 'shorten', text: 'x' },
  },
  {
    file: 'ai',
    method: 'post',
    route: '/actions/:id/approve',
    url: `/api/ai/actions/${proposalId}/approve`,
  },
  {
    file: 'ai',
    method: 'post',
    route: '/actions/:id/reject',
    url: `/api/ai/actions/${proposalId}/reject`,
  },
  {
    file: 'ai',
    method: 'post',
    route: '/documents/:id/index',
    url: `/api/ai/documents/${documentId}/index`,
  },
  {
    file: 'ai',
    method: 'patch',
    route: '/notifications/:id/read',
    url: `/api/ai/notifications/${aiNotificationId}/read`,
  },
];

/**
 * Route co tham so nhung KHONG phai ban ghi co chu so huu — moi muc phai co ly do.
 * Khoa: `<tep>:<method> <route>`.
 */
const EXEMPT: Record<string, string> = {
  'ai:put /providers/:provider': 'cau hinh nha cung cap AI, chan bang quyen settings.ai',
  'ai:post /providers/:provider/sync': 'cau hinh nha cung cap AI',
  'ai:patch /automations/:id': 'cau hinh chung, doi settings.ai',
  'ai:post /automations/:id/run':
    'quet toan he thong; ket qua loc theo nguoi xem o chuong thong bao',
  'ai:get /chats/:id': 'phien chat ca nhan — da co test rieng (aiScope.test.ts)',
  'ai:patch /chats/:id': 'phien chat ca nhan — da co test rieng',
  'ai:delete /chats/:id': 'phien chat ca nhan — da co test rieng',
  'auth:get /reset-token/:token': 'token mot lan, khong dang nhap',
  'crmConfig:post /pipelines/:pid/stages': 'danh muc cau hinh chung (settings.app)',
  'crmConfig:put /pipelines/:pid/stages/order': 'danh muc cau hinh chung',
  'crmConfig:patch /pipelines/:pid/stages/:sid': 'danh muc cau hinh chung',
  'crmConfig:post /pipelines/:pid/stages/:sid/archive': 'danh muc cau hinh chung',
  'crmConfig:post /pipelines/:pid/stages/:sid/restore': 'danh muc cau hinh chung',
  'crmConfig:delete /pipelines/:pid/stages/:sid': 'danh muc cau hinh chung',
  'crmConfig:get /picklists/:list/usage': 'danh muc cau hinh chung',
  'crmConfig:post /picklists/:list': 'danh muc cau hinh chung',
  'crmConfig:put /picklists/:list/order': 'danh muc cau hinh chung',
  'crmConfig:patch /picklists/:list/:id': 'danh muc cau hinh chung',
  'crmConfig:post /picklists/:list/:id/merge': 'danh muc cau hinh chung',
  'crmConfig:delete /picklists/:list/:id': 'danh muc cau hinh chung',
  'labels:get /:id/records':
    'nhan la danh muc chung; danh sach ban ghi loc theo pham vi (test rieng ben duoi)',
  'labels:patch /:id': 'nhan la danh muc chung',
  'labels:delete /:id': 'nhan la danh muc chung',
  'labels:post /:id/merge': 'nhan la danh muc chung',
  'labels:get /links/:entityType': 'nhan la danh muc chung',
  'services:patch /:id': 'danh muc dich vu dung chung',
  'services:delete /:id': 'danh muc dich vu dung chung',
  'taskStatuses:patch /:key': 'danh muc trang thai dung chung',
  'views:delete /tasks/saved-views/:id': 'bo loc theo tai khoan (owner_user_id), kiem ben trong',
};

/* Tep duoc quet o tang 2. Cac tep con lai tu kiem bang co che rieng (nhom Bang tin,
   quan tri nguoi dung / so do, chia se, danh ba ca nhan) va co test rieng. */
const SCANNED_FILES = [
  'ai',
  'auth',
  'boards',
  'calendarEvents',
  'cardFields',
  'cards',
  'checklist',
  'comments',
  'contacts',
  'contracts',
  'crmConfig',
  'customers',
  'deals',
  'documents',
  'interactions',
  'labels',
  'lists',
  'meetingNotes',
  'notifications',
  'nudges',
  'projects',
  'quickNotes',
  'quotations',
  'reminders',
  'revenues',
  'scoring',
  'services',
  'taskFlows',
  'taskStatuses',
  'views',
];

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

async function call(method: string, pathname: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method: method.toUpperCase(),
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.getSetCookie();
  if (setCookie.length > 0) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    /* tep tai ve */
  }
  return { status: res.status, data };
}

async function signInAs(person: Person) {
  await setPassword(person.userId, 'mat-khau-test-1');
  cookie = '';
  const res = await call('post', '/api/auth/login', {
    username: person.email,
    password: 'mat-khau-test-1',
  });
  assert.equal(res.status, 200, `dang nhap that bai cho ${person.email}`);
}

test('moi route theo id: nguoi phong khac nhan 404, du lieu khong doi', async () => {
  await signInAs(n2);
  const leaks: string[] = [];
  for (const probe of PROBES) {
    const res = await call(probe.method, probe.url, probe.body);
    if (res.status !== 404) {
      leaks.push(
        `${probe.method.toUpperCase()} ${probe.url} -> ${res.status} ${JSON.stringify(res.data).slice(0, 160)}`
      );
    }
  }
  assert.deepEqual(leaks, [], `Route khong tra 404 cho nguoi ngoai pham vi:\n${leaks.join('\n')}`);

  /* Khong route nao lo tay sua / xoa duoc gi. */
  assert.equal(
    (db.prepare(`SELECT title FROM cards WHERE id = ?`).get(cardId) as { title: string }).title,
    'Việc N1'
  );
  assert.ok(db.prepare(`SELECT 1 FROM boards WHERE id = ?`).get(boardId));
  assert.ok(db.prepare(`SELECT 1 FROM deals WHERE id = ?`).get(dealId));
  assert.ok(db.prepare(`SELECT 1 FROM customer_services WHERE id = ?`).get(lineId));
  assert.ok(db.prepare(`SELECT 1 FROM calendar_events WHERE id = ?`).get(eventId));
});

test('chu so huu van dung duoc chinh cac route do', async () => {
  await signInAs(n1);
  for (const url of [
    `/api/cards/${cardId}`,
    `/api/boards/${boardId}/full`,
    `/api/calendar/events/${eventId}`,
    `/api/contracts/${contractId}`,
    `/api/revenues/lines/${lineId}`,
    `/api/deals/${dealId}`,
  ]) {
    assert.equal((await call('get', url)).status, 200, url);
  }
  assert.equal(
    (await call('patch', `/api/quotations/${quotationId}`, { notes: 'N1 sửa' })).status,
    200
  );
  assert.equal(
    (await call('patch', `/api/reminders/${reminderId}`, { title: 'N1 sửa' })).status,
    200
  );
});

test('danh sach va tim kiem khong lo du lieu phong khac', async () => {
  await signInAs(n2);
  const events = (await call('get', '/api/calendar/events')).data as unknown[];
  assert.equal(events.length, 0, 'lich rieng cua N1 khong hien voi N2');
  const reminders = (await call('get', '/api/reminders')).data as unknown[];
  assert.equal(reminders.length, 0);
  const nudges = (await call('get', '/api/nudges')).data as unknown[];
  assert.equal(nudges.length, 0);
  const expiring = (await call('get', '/api/contracts/expiring?within=100000')).data as unknown[];
  assert.equal(expiring.length, 0);
  const proposals = (await call('get', '/api/ai/actions')).data as unknown[];
  assert.equal(proposals.length, 0);
  const aiNotes = (await call('get', '/api/ai/notifications')).data as unknown[];
  assert.equal(aiNotes.length, 0);

  const bell = (await call('get', '/api/notifications')).data as { items: { key: string }[] };
  assert.deepEqual(
    bell.items.filter((item) => /^(reminder|event|task|ai)-/.test(item.key)),
    [],
    'chuong thong bao cua N2 khong chua nhac hen / lich / viec / canh bao cua N1'
  );

  const labelled = (await call('get', `/api/labels/${labelId}/records`)).data as unknown[];
  assert.equal(labelled.length, 0, 'danh sach ban ghi gan nhan khong lo ten co hoi cua N1');

  const search = (await call('get', '/api/search?q=n1')).data as Record<string, unknown[]>;
  for (const [group, rows] of Object.entries(search)) {
    if (group === 'contacts' || group === 'posts') continue;
    assert.equal(rows.length, 0, `tim kiem nhom ${group} lo du lieu cua N1`);
  }
});

test('trang thai doc cua thong bao la cua tung nguoi (v72)', async () => {
  const key = `task-${card2Id}`;
  db.prepare(`UPDATE cards SET due_date = date('now','localtime') WHERE id = ?`).run(card2Id);
  await signInAs(n1);
  assert.equal(
    (await call('patch', `/api/notifications/${key}/state`, { is_read: true })).status,
    200
  );
  const rows = db
    .prepare(`SELECT contact_id FROM notification_states WHERE notification_key = ?`)
    .all(key) as { contact_id: number }[];
  assert.deepEqual(rows, [{ contact_id: n1.contactId }], 'chi N1 bi danh dau da doc');
});

test('vi tri khong co quyen co hoi van tim kiem va sao luu duoc (thu tu mount)', async () => {
  /* Router cham diem tung mount o `/api` tran kem requireResource('deals'), chan
     nham moi route xep sau no — Admin doanh thu bi 403 o tim kiem va sao luu. */
  await signInAs(revenueAdmin);
  assert.equal((await call('get', '/api/search?q=abc')).status, 200);
  assert.equal((await call('get', '/api/backups')).status, 200);
  assert.equal((await call('get', '/api/deals')).status, 403, 'van khong thay pipeline');
});

test('sao luu toan bo CSDL can pham vi toan cong ty', async () => {
  /* Nhan vien duoc cap data.export o muc "cua minh" van khong tai duoc ca CSDL. */
  db.prepare(
    `INSERT INTO position_permissions (position_id, resource, action, scope)
     VALUES ((SELECT id FROM positions WHERE code = 'staff'), 'data.export', 'export', 'own')`
  ).run();
  try {
    await signInAs(n2);
    assert.equal((await call('get', '/api/backups')).status, 403);
    assert.equal((await call('post', '/api/backup')).status, 403);
  } finally {
    db.prepare(
      `DELETE FROM position_permissions
        WHERE position_id = (SELECT id FROM positions WHERE code = 'staff') AND resource = 'data.export'`
    ).run();
  }
});

test('lien ket dat lai mat khau chi dung duoc mot lan, ke ca gui dong thoi', async () => {
  const { issueToken } = await import('../services/auth/tokens.ts');
  const { token } = issueToken(n2.userId, 'reset');
  cookie = '';
  const [first, second] = await Promise.all([
    call('post', '/api/auth/reset-password', { token, new_password: 'mat-khau-moi-1' }),
    call('post', '/api/auth/reset-password', { token, new_password: 'mat-khau-moi-2' }),
  ]);
  assert.deepEqual(
    [first.status, second.status].sort(),
    [200, 400],
    'dung mot request duoc doi mat khau'
  );
});

test('gan tai lieu / bao gia vao khach hang phong khac bi tu choi', async () => {
  await signInAs(n2);
  const res = await call('post', '/api/quotations', { customer_id: customerId, code: 'BG-N2' });
  assert.equal(res.status, 422);
  assert.equal((res.data as { code: string }).code, 'LINK_OUT_OF_SCOPE');
});

test('nguoi duoc giao viec tren bang nguoi khac: doc, sua, chuyen duoc — khong xoa duoc', async () => {
  const assigned = insert(
    `INSERT INTO cards (list_id, title, position, assignee_contact_id) VALUES (?, 'Giao cho N2', 4096, ?)`,
    listId,
    n2.contactId
  );
  await signInAs(n2);
  assert.equal((await call('get', `/api/cards/${assigned}`)).status, 200);
  assert.equal(
    (await call('patch', `/api/cards/${assigned}`, { title: 'N2 cập nhật' })).status,
    200
  );
  assert.equal(
    (await call('patch', `/api/cards/${assigned}/move`, { list_id: listId })).status,
    200
  );
  assert.equal(
    (await call('post', `/api/cards/${assigned}/comments`, { body: 'xong' })).status,
    201
  );
  assert.equal((await call('delete', `/api/cards/${assigned}`)).status, 404);
  /* Mo bang qua ngoai le "co viec giao cho minh": chi thay viec cua minh tren bang do. */
  const full = (await call('get', `/api/boards/${boardId}/full`)).data as {
    lists: { cards: { id: number }[] }[];
  };
  assert.deepEqual(
    full.lists.flatMap((list) => list.cards.map((card) => card.id)),
    [assigned]
  );
});

test('ban ghi vo chu (truoc v40): danh sach thay thi mo duoc, nhung chi quan tri sua', async () => {
  const legacy = insert(
    `INSERT INTO customers (name, org_kind, status) VALUES ('Khách cũ vô chủ', 'customer', 'customer')`
  );
  await signInAs(n2);
  assert.equal((await call('get', `/api/customers/${legacy}/full`)).status, 200);
  assert.equal((await call('get', `/api/customers/${legacy}/impact`)).status, 200);
  assert.equal((await call('patch', `/api/customers/${legacy}`, { name: 'N2' })).status, 404);
});

test('lich va nhac hen tu choi ngay gio khong co that', async () => {
  await signInAs(n2);
  const bad = await call('post', '/api/calendar/events', {
    title: 'Sai ngày',
    start_at: '2026-02-30T09:00',
  });
  assert.equal(bad.status, 400);
  const badHour = await call('post', '/api/reminders', { title: 'x', due_at: '2026-03-01T25:00' });
  assert.equal(badHour.status, 400);
});

/* ---------- Tang 2: route moi phai duoc khai bao ---------- */

test('moi route co tham so trong cac tep da quet deu co trong PROBES hoac EXEMPT', () => {
  const routesDir = path.resolve(import.meta.dirname, '../routes');
  const covered = new Set(PROBES.map((p) => `${p.file}:${p.method} ${p.route}`));
  const missing: string[] = [];
  for (const file of SCANNED_FILES) {
    const source = fs.readFileSync(path.join(routesDir, `${file}.ts`), 'utf8');
    for (const match of source.matchAll(
      /router\.(get|post|put|patch|delete)\(\s*'([^']*:[^']*)'/g
    )) {
      const key = `${file}:${match[1]} ${match[2]}`;
      if (!covered.has(key) && !(key in EXEMPT)) missing.push(key);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `Route co tham so chua duoc kiem pham vi trong test nay (them vao PROBES, hoac EXEMPT kem ly do):\n${missing.join('\n')}`
  );
});
