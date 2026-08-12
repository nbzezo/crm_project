import type { Database } from 'better-sqlite3';
import { z } from 'zod';
import { buildSearchText } from '../../lib/viSearch.ts';
import { nextPosition } from '../../lib/position.ts';
import { HttpError, required } from '../../lib/validate.ts';

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(5000).optional(),
  list_id: z.number().int().positive().nullable().optional(),
  due_date: dateOnly,
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  customer_id: z.number().int().positive().nullable().optional(),
  contact_id: z.number().int().positive().nullable().optional(),
  deal_id: z.number().int().positive().nullable().optional(),
});
const createReminderSchema = z.object({
  title: z.string().trim().min(1).max(300),
  note: z.string().max(5000).optional(),
  due_at: localDateTime,
  card_id: z.number().int().positive().nullable().optional(),
  customer_id: z.number().int().positive().nullable().optional(),
  deal_id: z.number().int().positive().nullable().optional(),
});
const updateNextActionSchema = z.object({
  deal_id: z.number().int().positive(),
  next_action: z.string().trim().min(1).max(500),
  next_action_date: dateOnly,
});
const createInteractionSchema = z.object({
  customer_id: z.number().int().positive(),
  contact_id: z.number().int().positive().nullable().optional(),
  deal_id: z.number().int().positive().nullable().optional(),
  type: z.enum([
    'call',
    'email',
    'meeting',
    'demo',
    'proposal',
    'followup',
    'note',
    'zalo',
    'other',
  ]),
  occurred_at: z.string().min(10).max(30),
  summary: z.string().trim().min(1).max(10_000),
  result: z.string().max(5000).nullable().optional(),
});

export const proposedActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('create_task'),
    title: z.string().trim().min(1).max(300),
    explanation: z.string().max(2000).optional(),
    payload: createTaskSchema,
  }),
  z.object({
    type: z.literal('create_reminder'),
    title: z.string().trim().min(1).max(300),
    explanation: z.string().max(2000).optional(),
    payload: createReminderSchema,
  }),
  z.object({
    type: z.literal('update_deal_next_action'),
    title: z.string().trim().min(1).max(300),
    explanation: z.string().max(2000).optional(),
    payload: updateNextActionSchema,
  }),
  z.object({
    type: z.literal('create_interaction'),
    title: z.string().trim().min(1).max(300),
    explanation: z.string().max(2000).optional(),
    payload: createInteractionSchema,
  }),
]);
export type ProposedAction = z.infer<typeof proposedActionSchema>;

export function saveActionProposal(db: Database, requestId: string | null, action: ProposedAction) {
  const info = db
    .prepare(
      `INSERT INTO ai_action_proposals
        (request_id, action_type, title, explanation, payload_json)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      requestId,
      action.type,
      action.title,
      action.explanation ?? '',
      JSON.stringify(action.payload)
    );
  return getActionProposal(db, Number(info.lastInsertRowid));
}

export function getActionProposal(db: Database, id: number) {
  const row = required(
    db.prepare(`SELECT * FROM ai_action_proposals WHERE id = ?`).get(id) as
      Record<string, unknown> | undefined,
    'Không tìm thấy đề xuất AI'
  );
  return {
    ...row,
    payload: JSON.parse(String(row.payload_json)) as unknown,
    execution_result: row.execution_result_json
      ? (JSON.parse(String(row.execution_result_json)) as unknown)
      : null,
    payload_json: undefined,
    execution_result_json: undefined,
  };
}

export function listActionProposals(db: Database, status?: string) {
  const sql = status
    ? `SELECT id FROM ai_action_proposals WHERE status = ? ORDER BY created_at DESC LIMIT 100`
    : `SELECT id FROM ai_action_proposals ORDER BY created_at DESC LIMIT 100`;
  const ids = (status ? db.prepare(sql).all(status) : db.prepare(sql).all()) as { id: number }[];
  return ids.map(({ id }) => getActionProposal(db, id));
}

function defaultListId(db: Database): number {
  const item = db
    .prepare(
      `SELECT l.id FROM lists l JOIN boards b ON b.id = l.board_id
        WHERE b.is_archived = 0 ORDER BY b.is_starred DESC, b.id, l.position LIMIT 1`
    )
    .get() as { id: number } | undefined;
  if (!item) throw new HttpError(409, 'Chưa có danh sách công việc để tạo task');
  return item.id;
}

function execute(db: Database, type: string, rawPayload: unknown) {
  if (type === 'create_task') {
    const payload = createTaskSchema.parse(rawPayload);
    const listId = payload.list_id ?? defaultListId(db);
    const info = db
      .prepare(
        `INSERT INTO cards
          (list_id, title, description, position, due_date, priority, customer_id, contact_id,
           deal_id, search_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        listId,
        payload.title,
        payload.description ?? '',
        nextPosition({ table: 'cards', scopeCol: 'list_id', scopeVal: listId }),
        payload.due_date ?? null,
        payload.priority ?? 'medium',
        payload.customer_id ?? null,
        payload.contact_id ?? null,
        payload.deal_id ?? null,
        buildSearchText(payload.title, payload.description)
      );
    return { entity: 'task', id: Number(info.lastInsertRowid) };
  }
  if (type === 'create_reminder') {
    const payload = createReminderSchema.parse(rawPayload);
    const info = db
      .prepare(
        `INSERT INTO reminders (title, note, due_at, card_id, customer_id, deal_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        payload.title,
        payload.note ?? '',
        payload.due_at,
        payload.card_id ?? null,
        payload.customer_id ?? null,
        payload.deal_id ?? null
      );
    return { entity: 'reminder', id: Number(info.lastInsertRowid) };
  }
  if (type === 'update_deal_next_action') {
    const payload = updateNextActionSchema.parse(rawPayload);
    const result = db
      .prepare(
        `UPDATE deals SET next_action = ?, next_action_date = ?,
                updated_at = datetime('now','localtime') WHERE id = ?`
      )
      .run(payload.next_action, payload.next_action_date ?? null, payload.deal_id);
    if (result.changes === 0) throw new HttpError(404, 'Không tìm thấy cơ hội');
    return { entity: 'deal', id: payload.deal_id };
  }
  if (type === 'create_interaction') {
    const payload = createInteractionSchema.parse(rawPayload);
    const info = db
      .prepare(
        `INSERT INTO interactions
          (customer_id, contact_id, deal_id, type, occurred_at, summary, result)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        payload.customer_id,
        payload.contact_id ?? null,
        payload.deal_id ?? null,
        payload.type,
        payload.occurred_at,
        payload.summary,
        payload.result ?? null
      );
    return { entity: 'interaction', id: Number(info.lastInsertRowid) };
  }
  throw new HttpError(400, 'Loại hành động AI không được hỗ trợ');
}

export function approveActionProposal(db: Database, id: number) {
  const proposal = required(
    db.prepare(`SELECT * FROM ai_action_proposals WHERE id = ?`).get(id) as
      Record<string, unknown> | undefined,
    'Không tìm thấy đề xuất AI'
  );
  if (proposal.status !== 'pending') throw new HttpError(409, 'Đề xuất này đã được xử lý');
  try {
    const result = db.transaction(() => {
      db.prepare(
        `UPDATE ai_action_proposals SET status = 'approved', decided_at = datetime('now','localtime')
          WHERE id = ? AND status = 'pending'`
      ).run(id);
      const executed = execute(
        db,
        String(proposal.action_type),
        JSON.parse(String(proposal.payload_json))
      );
      db.prepare(
        `UPDATE ai_action_proposals
            SET status = 'executed', execution_result_json = ?, executed_at = datetime('now','localtime')
          WHERE id = ?`
      ).run(JSON.stringify(executed), id);
      return executed;
    })();
    return { proposal: getActionProposal(db, id), result };
  } catch (error) {
    db.prepare(
      `UPDATE ai_action_proposals SET status = 'failed', execution_result_json = ?,
              decided_at = COALESCE(decided_at, datetime('now','localtime')) WHERE id = ?`
    ).run(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Lỗi không xác định' }),
      id
    );
    throw error;
  }
}

export function rejectActionProposal(db: Database, id: number) {
  const result = db
    .prepare(
      `UPDATE ai_action_proposals SET status = 'rejected', decided_at = datetime('now','localtime')
        WHERE id = ? AND status = 'pending'`
    )
    .run(id);
  if (result.changes === 0) throw new HttpError(409, 'Đề xuất không còn ở trạng thái chờ duyệt');
  return getActionProposal(db, id);
}
