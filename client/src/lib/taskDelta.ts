import type { TaskRow } from '../types';

export function compareTasks(a: TaskRow, b: TaskRow): number {
  if (a.is_done !== b.is_done) return a.is_done - b.is_done;
  if (a.due_date === null && b.due_date !== null) return 1;
  if (a.due_date !== null && b.due_date === null) return -1;
  if (a.due_date !== b.due_date) return (a.due_date ?? '').localeCompare(b.due_date ?? '');
  return b.id - a.id;
}

export function mergeTaskDelta(
  previous: TaskRow[],
  delta: { items: TaskRow[]; ids: number[] }
): TaskRow[] {
  const ids = new Set(delta.ids);
  const byId = new Map(previous.filter((row) => ids.has(row.id)).map((row) => [row.id, row]));
  for (const row of delta.items) {
    if (ids.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()].sort(compareTasks);
}
