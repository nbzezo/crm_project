import { db } from '../db/connection.ts';

export type TaskActivityAction =
  'created' | 'updated' | 'moved' | 'completed' | 'reopened' | 'watched' | 'commented';

function textValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** Ghi mot thay doi nho, co cau truc, de Activity feed khong phai suy tu comments. */
export function logTaskActivity(input: {
  cardId: number;
  actorContactId?: number | null;
  action: TaskActivityAction;
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
}): void {
  db.prepare(
    `INSERT INTO task_activity
       (card_id, actor_contact_id, action, field, old_value, new_value)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    input.cardId,
    input.actorContactId ?? null,
    input.action,
    input.field ?? null,
    textValue(input.oldValue),
    textValue(input.newValue)
  );
}
