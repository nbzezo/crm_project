import { describe, expect, it } from 'vitest';
import type { TaskStatusDef } from '@workflow/contracts';
import { LABEL_PALETTE } from '../theme/palettes';
import { buildStatusIndex, statusKeyOf } from './taskStatuses';

const list: TaskStatusDef[] = [
  {
    key: 'todo',
    label: 'Chưa bắt đầu',
    color: null,
    kind: 'todo',
    position: 1,
    is_active: 1,
    is_builtin: 1,
  },
  {
    key: 'khao_sat',
    label: 'Khảo sát',
    color: LABEL_PALETTE[0],
    kind: 'doing',
    position: 2,
    is_active: 1,
    is_builtin: 0,
  },
  {
    key: 'cu',
    label: 'Trạng thái cũ',
    color: null,
    kind: 'review',
    position: 3,
    is_active: 0,
    is_builtin: 0,
  },
  {
    key: 'done',
    label: 'Hoàn thành',
    color: null,
    kind: 'done',
    position: 4,
    is_active: 1,
    is_builtin: 1,
  },
];

describe('trạng thái công việc cấu hình được', () => {
  it('thẻ cũ không có status_key dùng trạng thái dựng sẵn cùng khoá', () => {
    expect(statusKeyOf({ status: 'doing' })).toBe('doing');
    expect(statusKeyOf({ status: 'doing', status_key: null })).toBe('doing');
    expect(statusKeyOf({ status: 'doing', status_key: 'khao_sat' })).toBe('khao_sat');
    expect(statusKeyOf({})).toBe('todo');
  });

  it('ô chọn chỉ có trạng thái đang dùng; nhãn vẫn đọc được trạng thái đã ẩn', () => {
    const index = buildStatusIndex(list);
    expect(index.active.map((s) => s.key)).toEqual(['todo', 'khao_sat', 'done']);
    expect(index.label('cu')).toBe('Trạng thái cũ');
    expect(index.kind('khao_sat')).toBe('doing');
  });

  it('khoá lạ: nhãn rơi về tên dựng sẵn hoặc chính khoá, ý nghĩa rơi về Chưa bắt đầu', () => {
    const index = buildStatusIndex(list);
    expect(index.label('blocked')).toBe('Bị chặn');
    expect(index.label('khong_co')).toBe('khong_co');
    expect(index.kind('blocked')).toBe('blocked');
    expect(index.kind('khong_co')).toBe('todo');
  });
});
