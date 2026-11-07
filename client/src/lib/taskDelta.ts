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

export interface TaskChunk {
  items: TaskRow[];
  next_before_id: number | null;
  /** Chi co o khuc dau. */
  total: number | null;
  server_time: string;
}

export interface ChunkedTasks {
  rows: TaskRow[];
  /** `server_time` cua KHUC DAU — moc `since` an toan cho lan hoi phan thay doi ke tiep. */
  serverTime: string;
}

/** Khuc dau nho de man hinh ve ngay; cac khuc sau lon de it lan hoi. */
export const FIRST_TASK_CHUNK = 500;
export const NEXT_TASK_CHUNK = 4000;

/**
 * Tai DAY DU viec theo tung khuc (1.41.0). Moi khuc xong goi `onProgress` voi cac dong da
 * co (da sap xep) de man hinh hien dan. Dung lai ngay khi `signal` bi huy (doi bo loc,
 * bam lam moi) — khong bao tien do cu cho query moi.
 */
export async function loadTasksInChunks(
  fetchChunk: (limit: number, beforeId: number | null) => Promise<TaskChunk>,
  onProgress: (rows: TaskRow[], total: number) => void,
  signal?: AbortSignal
): Promise<ChunkedTasks> {
  const first = await fetchChunk(FIRST_TASK_CHUNK, null);
  const byId = new Map<number, TaskRow>();
  const add = (items: TaskRow[]) => {
    for (const row of items) byId.set(row.id, row);
  };
  add(first.items);
  const total = first.total ?? first.items.length;
  let next = first.next_before_id;
  while (next !== null) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    onProgress([...byId.values()].sort(compareTasks), total);
    const chunk = await fetchChunk(NEXT_TASK_CHUNK, next);
    add(chunk.items);
    next = chunk.next_before_id;
  }
  return { rows: [...byId.values()].sort(compareTasks), serverTime: first.server_time };
}
