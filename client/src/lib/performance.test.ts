import { describe, expect, it } from 'vitest';
import {
  buildUnitTree,
  collapseSingleChains,
  emptyTotals,
  onTimeRate,
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
