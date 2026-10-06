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
  /** Hoàn thành trong kỳ nhưng đã xác nhận bỏ qua một quy trình đang dở (v66). */
  'flow_skipped',
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
  /** Contact cua nguoi dang xem; `null` khi tai khoan chua gan voi nhan su nao. */
  me: number | null;
  people: PersonPerf[];
  units: PerfUnit[];
  weekly: WeeklyRow[];
}

export interface WeeklyRow {
  contact_id: number;
  /** Thu Hai dau tuan, YYYY-MM-DD. */
  week_start: string;
  completed: number;
  on_time: number;
  late: number;
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

/* ---------- Doi tuong dang xem: ca pham vi, chinh minh, mot don vi, mot nguoi ---------- */

export type Subject = 'all' | 'me' | `unit:${number}` | 'unit:none' | `person:${number}`;

export interface SubjectOption {
  value: Subject;
  label: string;
  depth: number;
}

function unitKey(node: UnitNode): Subject {
  return node.unit ? `unit:${node.unit.id}` : 'unit:none';
}

/** Danh sach lua chon cho o "Xem của": Toàn phạm vi, Của tôi, cac don vi (thut le theo cap). */
export function subjectOptions(roots: UnitNode[], data: PerformanceData): SubjectOption[] {
  const options: SubjectOption[] = [];
  if (data.people.length > 1) options.push({ value: 'all', label: 'Toàn phạm vi', depth: 0 });
  if (data.me != null && data.people.some((p) => p.contact_id === data.me))
    options.push({ value: 'me', label: 'Của tôi', depth: 0 });
  if (data.people.length <= 1) return options;
  const walk = (node: UnitNode, depth: number) => {
    options.push({
      value: unitKey(node),
      label: `${node.unit?.name ?? 'Chưa xếp đơn vị'} (${node.headcount})`,
      depth,
    });
    for (const child of node.children) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);
  return options;
}

function findNode(roots: UnitNode[], subject: Subject): UnitNode | null {
  for (const node of roots) {
    if (unitKey(node) === subject) return node;
    const found = findNode(node.children, subject);
    if (found) return found;
  }
  return null;
}

function membersDeep(node: UnitNode): PersonPerf[] {
  return [...node.members, ...node.children.flatMap(membersDeep)];
}

/** Nhung nguoi thuoc doi tuong dang xem. */
export function peopleOf(subject: Subject, roots: UnitNode[], data: PerformanceData): PersonPerf[] {
  if (subject === 'all') return data.people;
  const personId =
    subject === 'me' ? data.me : subject.startsWith('person:') ? Number(subject.slice(7)) : null;
  if (personId != null) return data.people.filter((p) => p.contact_id === personId);
  const node = findNode(roots, subject);
  return node ? membersDeep(node) : [];
}

/** Mot cot cua bieu do so sanh: mot don vi con hoac mot nguoi. */
export interface CompareRow {
  key: string;
  name: string;
  totals: PerfTotals;
}

/**
 * Ai dem ra so sanh voi ai: cac don vi con cua doi tuong dang xem va nhung nguoi
 * ngoi truc tiep o do. Xem mot nguoi thi khong co gi de so sanh — tra mang rong.
 */
export function compareRows(subject: Subject, roots: UnitNode[]): CompareRow[] {
  let children: UnitNode[];
  let members: PersonPerf[];
  if (subject === 'all') {
    /* Mot goc that (Cong ty) thi so sanh cac don vi ngay duoi no — mot cot
       "Công ty" dai bang tong khong cho ai so sanh duoc gi. Nhom "Chưa xếp đơn
       vị" giu nguyen thanh mot cot rieng. */
    const real = roots.filter((root) => root.unit);
    const loose = roots.filter((root) => !root.unit);
    const single = real.length === 1 ? real[0] : null;
    children = single ? [...single.children, ...loose] : roots;
    members = single ? single.members : [];
  } else {
    const node = findNode(roots, subject);
    if (!node) return [];
    children = node.children;
    members = node.members;
  }
  return [
    ...children.map((child) => ({
      key: unitKey(child),
      name: child.unit?.name ?? 'Chưa xếp đơn vị',
      totals: child.totals,
    })),
    ...members.map((person) => ({
      key: `person:${person.contact_id}`,
      name: person.name,
      totals: person,
    })),
  ];
}

/* ---------- Chuoi theo tuan ---------- */

export interface WeekPoint {
  week_start: string;
  on_time: number;
  late: number;
  no_due: number;
}

function mondayOf(iso: string): Date {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

/**
 * Cong chuoi tuan cua nhung nguoi da chon va dien du MOI tuan trong khoang —
 * tuan khong hoan thanh viec nao van la mot cot 0, khong duoc bien mat khoi truc
 * (bo di thi hai tuan cach nhau mot thang nhin nhu lien nhau).
 */
export function weeklySeries(
  weekly: WeeklyRow[],
  contactIds: Set<number>,
  from: string,
  to: string
): WeekPoint[] {
  const byWeek = new Map<string, WeekPoint>();
  for (let d = mondayOf(from); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 7)) {
    const key = d.toISOString().slice(0, 10);
    byWeek.set(key, { week_start: key, on_time: 0, late: 0, no_due: 0 });
  }
  for (const row of weekly) {
    if (!contactIds.has(row.contact_id)) continue;
    const point = byWeek.get(row.week_start);
    if (!point) continue;
    point.on_time += row.on_time;
    point.late += row.late;
    point.no_due += row.completed - row.on_time - row.late;
  }
  return [...byWeek.values()];
}
