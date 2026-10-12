import { describe, expect, it } from 'vitest';
import type { TaskRow } from '../types';
import { compareTasks, mergeTaskDelta } from './taskDelta';

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
