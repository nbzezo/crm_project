import { describe, expect, it } from 'vitest';
import {
  buildUnitTree,
  collapseSingleChains,
  emptyTotals,
  onTimeRate,
  compareRows,
  peopleOf,
  subjectOptions,
  weeklySeries,
  type PersonPerf,
  type PerfUnit,
} from './performance';

const unit = (id: number, parent_id: number | null, name: string): PerfUnit => ({
  id,
  parent_id,
  name,
  kind_name: null,
  head_name: null,
});

const person = (contact_id: number, org_unit_id: number | null, extra: Partial<PersonPerf> = {}) =>
  ({
    ...emptyTotals(),
    contact_id,
    name: `P${contact_id}`,
    org_unit_id,
    ...extra,
  }) as PersonPerf;

describe('buildUnitTree', () => {
  const units = [
    unit(1, null, 'Công ty'),
    unit(2, 1, 'Khối A'),
    unit(3, 2, 'P1'),
    unit(4, 2, 'P2'),
  ];

  it('cong don len cap tren bang tu so/mau so, khong trung binh ty le', () => {
    const people = [
      person(10, 3, { completed: 1, completed_with_due: 1, on_time: 1 }),
      person(11, 4, { completed: 9, completed_with_due: 9, on_time: 0 }),
    ];
    const [root] = buildUnitTree(units, people);
    expect(root.headcount).toBe(2);
    expect(root.totals.completed).toBe(10);
    /* Trung binh ty le se ra 50% — sai: 1/10 viec dung han. */
    expect(onTimeRate(root.totals)).toBeCloseTo(0.1);
  });

  it('cat don vi khong co ai va dua nguoi chua xep don vi vao nut rieng', () => {
    const roots = buildUnitTree(units, [person(10, 3), person(12, null)]);
    expect(roots).toHaveLength(2);
    expect(roots[1].unit).toBeNull();
    const khoi = roots[0].children[0];
    expect(khoi.children.map((c) => c.unit?.name)).toEqual(['P1']);
  });

  it('bo chuoi mot nhanh phia tren de truong phong thay thang phong minh', () => {
    const roots = collapseSingleChains(buildUnitTree(units, [person(10, 3), person(11, 3)]));
    expect(roots.map((r) => r.unit?.name)).toEqual(['P1']);
  });
});

describe('doi tuong dang xem va chuoi tuan', () => {
  const units = [unit(1, null, 'Công ty'), unit(2, 1, 'P1'), unit(3, 1, 'P2')];
  const people = [person(10, 2, { completed: 3 }), person(11, 3, { completed: 1 }), person(12, 1)];
  const data = {
    from: '2026-09-01',
    to: '2026-09-20',
    prev_from: '2026-08-12',
    prev_to: '2026-08-31',
    scope: 'all' as const,
    me: 12,
    people,
    units,
    weekly: [
      { contact_id: 10, week_start: '2026-09-07', completed: 3, on_time: 1, late: 1 },
      { contact_id: 11, week_start: '2026-09-07', completed: 1, on_time: 1, late: 0 },
    ],
  };
  const roots = collapseSingleChains(buildUnitTree(units, people));

  it('lua chon co Của tôi va cac don vi; Của tôi chi gom chinh minh', () => {
    const values = subjectOptions(roots, data).map((o) => o.value);
    expect(values.slice(0, 2)).toEqual(['all', 'me']);
    expect(values).toContain('unit:2');
    expect(peopleOf('me', roots, data).map((p) => p.contact_id)).toEqual([12]);
    expect(peopleOf('unit:1', roots, data)).toHaveLength(3);
  });

  it('so sanh toan pham vi = cac phong con + nguoi ngoi o cap tren', () => {
    expect(compareRows('all', roots).map((r) => r.name)).toEqual(['P1', 'P2', 'P12']);
    expect(compareRows('person:10', roots)).toEqual([]);
  });

  it('dien du moi tuan va tach dung han / tre / khong han', () => {
    const series = weeklySeries(data.weekly, new Set([10]), data.from, data.to);
    expect(series.map((p) => p.week_start)).toEqual(['2026-08-31', '2026-09-07', '2026-09-14']);
    expect(series[1]).toEqual({ week_start: '2026-09-07', on_time: 1, late: 1, no_due: 1 });
    expect(series[0].on_time + series[2].on_time).toBe(0);
  });
});
