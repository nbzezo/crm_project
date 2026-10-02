/*
 * Gom so lieu hieu suat ca nhan len cay don vi.
 *
 * May chu tra ve TU SO va MAU SO cho tung nguoi (khong tra phan tram) de o day
 * cong duoc len cap tren: ty le dung han cua mot phong la tong viec dung han chia
 * tong viec co han — KHONG phai trung binh ty le cua tung nguoi, vi trung binh
 * ty le cho nguoi lam 1 viec nang ngang nguoi lam 50 viec.
 */

export const PERF_METRICS = [
  'completed',
  'completed_with_due',
  'on_time',
  'cycle_days_sum',
  'spent_hours',
  'prev_completed',
  'received',
  'open_count',
  'overdue_count',
  'blocked_count',
  'slips',
] as const;

export type PerfMetric = (typeof PERF_METRICS)[number];
export type PerfTotals = Record<PerfMetric, number>;

export interface PersonPerf extends PerfTotals {
  contact_id: number;
  name: string;
  org_unit_id: number | null;
}

export interface PerfUnit {
  id: number;
  parent_id: number | null;
  name: string;
  kind_name: string | null;
  head_name: string | null;
}

export interface PerformanceData {
  from: string;
  to: string;
  prev_from: string;
  prev_to: string;
  scope: 'none' | 'own' | 'unit' | 'subtree' | 'all';
  people: PersonPerf[];
  units: PerfUnit[];
}

export interface UnitNode {
  /** `null` cho nhom "Chưa xếp đơn vị". */
  unit: PerfUnit | null;
  children: UnitNode[];
  members: PersonPerf[];
  totals: PerfTotals;
  headcount: number;
}

export function emptyTotals(): PerfTotals {
  return Object.fromEntries(PERF_METRICS.map((key) => [key, 0])) as PerfTotals;
}

export function sumTotals(rows: PerfTotals[]): PerfTotals {
  const total = emptyTotals();
  for (const row of rows) for (const key of PERF_METRICS) total[key] += row[key];
  return total;
}

/** Ty le dung han; `null` khi chua co viec nao co han de cham. */
export function onTimeRate(t: PerfTotals): number | null {
  return t.completed_with_due > 0 ? t.on_time / t.completed_with_due : null;
}

/** So ngay trung binh tu luc tao den luc xong. */
export function avgCycleDays(t: PerfTotals): number | null {
  return t.completed > 0 ? t.cycle_days_sum / t.completed : null;
}

/** Bien dong so viec hoan thanh so voi ky truoc cung do dai; `null` khi ky truoc bang 0. */
export function completedChange(t: PerfTotals): number | null {
  return t.prev_completed > 0 ? (t.completed - t.prev_completed) / t.prev_completed : null;
}

/**
 * Dung cay don vi kem tong cong don cua ca nhanh.
 *
 * Don vi khong co nguoi nao trong pham vi (ke ca o nhanh con) bi cat — may chu
 * da chi gui to tien cua don vi co nguoi, nhung loc lai o day cho chac. Nguoi
 * chua xep don vi (hoac don vi khong nam trong danh sach) vao mot nut rieng o
 * cuoi, de khong ai bien mat khoi bao cao.
 */
export function buildUnitTree(units: PerfUnit[], people: PersonPerf[]): UnitNode[] {
  const known = new Set(units.map((u) => u.id));
  const membersOf = new Map<number, PersonPerf[]>();
  const unplaced: PersonPerf[] = [];
  for (const person of people) {
    if (person.org_unit_id != null && known.has(person.org_unit_id)) {
      membersOf.set(person.org_unit_id, [...(membersOf.get(person.org_unit_id) ?? []), person]);
    } else {
      unplaced.push(person);
    }
  }

  const childrenOf = new Map<number | null, PerfUnit[]>();
  for (const unit of units) {
    const parent = unit.parent_id != null && known.has(unit.parent_id) ? unit.parent_id : null;
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), unit]);
  }

  const build = (unit: PerfUnit): UnitNode | null => {
    const children = (childrenOf.get(unit.id) ?? [])
      .map(build)
      .filter((node): node is UnitNode => node !== null);
    const members = membersOf.get(unit.id) ?? [];
    const headcount = members.length + children.reduce((sum, c) => sum + c.headcount, 0);
    if (headcount === 0) return null;
    return {
      unit,
      children,
      members,
      headcount,
      totals: sumTotals([...members, ...children.map((c) => c.totals)]),
    };
  };

  const roots = (childrenOf.get(null) ?? [])
    .map(build)
    .filter((node): node is UnitNode => node !== null);
  if (unplaced.length > 0) {
    roots.push({
      unit: null,
      children: [],
      members: unplaced,
      headcount: unplaced.length,
      totals: sumTotals(unplaced),
    });
  }
  return roots;
}

/**
 * Bo cac nut goc chi co MOT con va khong co thanh vien truc tiep (vd. "Công ty"
 * phia tren mot truong phong) — mot dong tong y het dong ben duoi chi la nhieu.
 */
export function collapseSingleChains(roots: UnitNode[]): UnitNode[] {
  let current = roots;
  while (
    current.length === 1 &&
    current[0].members.length === 0 &&
    current[0].children.length === 1
  )
    current = current[0].children;
  return current;
}
