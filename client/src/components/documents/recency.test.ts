import { describe, expect, it } from 'vitest';
import { groupByRecency } from './recency';

describe('groupByRecency', () => {
  const now = new Date(2026, 9, 6, 9, 0, 0);

  it('chia Hôm nay / 7 ngày qua / Cũ hơn theo phần ngày', () => {
    const rows = [
      '2026-10-06 08:59:00',
      '2026-10-06 00:01:00',
      '2026-10-05 23:00:00',
      '2026-09-30 10:00:00',
      '2026-09-29 10:00:00',
    ];
    const groups = groupByRecency(rows, (r) => r, now);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ['Hôm nay', 2],
      ['7 ngày qua', 2],
      ['Cũ hơn', 1],
    ]);
  });

  it('bỏ nhóm rỗng', () => {
    const groups = groupByRecency(['2026-01-01 00:00:00'], (r) => r, now);
    expect(groups.map((g) => g.key)).toEqual(['older']);
  });
});
