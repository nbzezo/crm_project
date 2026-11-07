import { describe, expect, it, vi } from 'vitest';
import type { TaskRow } from '../types';
import {
  FIRST_TASK_CHUNK,
  NEXT_TASK_CHUNK,
  compareTasks,
  loadTasksInChunks,
  mergeTaskDelta,
} from './taskDelta';

const task = (id: number, overrides: Partial<TaskRow> = {}): TaskRow =>
  ({ id, title: `Việc ${id}`, is_done: 0, due_date: null, ...overrides }) as TaskRow;

describe('mergeTaskDelta', () => {
  it('bỏ dòng không còn trong ids', () => {
    expect(
      mergeTaskDelta([task(1), task(2)], { items: [], ids: [2] }).map((row) => row.id)
    ).toEqual([2]);
  });

  it('thay dòng cũ và sắp lại theo thứ tự máy chủ', () => {
    const result = mergeTaskDelta([task(1, { due_date: '2026-01-02' }), task(2)], {
      items: [task(1, { title: 'Đã đổi', due_date: '2026-01-01' })],
      ids: [1, 2],
    });
    expect(result.map((row) => [row.id, row.title])).toEqual([
      [1, 'Đã đổi'],
      [2, 'Việc 2'],
    ]);
  });

  it('thêm dòng mới chỉ khi id nằm trong ids', () => {
    expect(
      mergeTaskDelta([task(1)], { items: [task(2), task(3)], ids: [1, 2] }).map((row) => row.id)
    ).toEqual([2, 1]);
  });

  it('xếp chưa xong trước, hạn null sau, cùng hạn id lớn trước', () => {
    const rows = [
      task(1, { is_done: 1, due_date: '2026-01-01' }),
      task(2, { due_date: null }),
      task(3, { due_date: '2026-01-02' }),
      task(4, { due_date: '2026-01-02' }),
    ].sort(compareTasks);
    expect(rows.map((row) => row.id)).toEqual([4, 3, 2, 1]);
  });

  it('không thay đổi mảng previous', () => {
    const previous = [task(1), task(2)];
    const snapshot = [...previous];
    mergeTaskDelta(previous, { items: [task(3)], ids: [1, 2, 3] });
    expect(previous).toEqual(snapshot);
  });
});

describe('loadTasksInChunks', () => {
  const chunk = (ids: number[], next: number | null, total: number | null = null) => ({
    items: ids.map((id) => task(id)),
    next_before_id: next,
    total,
    server_time: total === null ? '2026-01-01 00:00:09' : '2026-01-01 00:00:00',
  });

  it('gộp mọi khúc, bỏ trùng, giữ server_time của khúc đầu và báo tiến độ', async () => {
    const calls: [number, number | null][] = [];
    const progress: [number, number][] = [];
    const pages = [chunk([9, 8], 8, 5), chunk([8, 7, 6], 6), chunk([5], null)];
    const result = await loadTasksInChunks(
      async (limit, beforeId) => {
        calls.push([limit, beforeId]);
        return pages[calls.length - 1];
      },
      (rows, total) => progress.push([rows.length, total])
    );
    expect(calls).toEqual([
      [FIRST_TASK_CHUNK, null],
      [NEXT_TASK_CHUNK, 8],
      [NEXT_TASK_CHUNK, 6],
    ]);
    expect(result.rows.map((row) => row.id)).toEqual([9, 8, 7, 6, 5]);
    expect(result.serverTime).toBe('2026-01-01 00:00:00');
    expect(progress).toEqual([
      [2, 5],
      [4, 5],
    ]);
  });

  it('một khúc là xong thì không báo tiến độ', async () => {
    const onProgress = vi.fn();
    const result = await loadTasksInChunks(async () => chunk([1], null, 1), onProgress);
    expect(result.rows).toHaveLength(1);
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('dừng khi bị huỷ', async () => {
    const controller = new AbortController();
    let calls = 0;
    await expect(
      loadTasksInChunks(
        async () => {
          calls += 1;
          controller.abort();
          return chunk([3], 3, 10);
        },
        () => undefined,
        controller.signal
      )
    ).rejects.toBeDefined();
    expect(calls).toBe(1);
  });
});
