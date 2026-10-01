import type { ContractKind, ServiceStatus } from '@workflow/contracts';

/**
 * Phan nhom doanh thu: Moi / Mo rong / Nen.
 *
 * Nhom gan voi TUNG THANG cua mot dong chu khong gan voi ca dong. "Moc" cua dong
 * la thang dau tien co doanh thu > 0 (tinh ca so du kien). 12 thang dau tinh tu
 * moc thuoc Moi hoac Mo rong (theo loai hop dong cua dong), tu thang thu 13 tro di
 * la Nen. Vi vay cung mot dong co the co thang o Moi va thang o Nen trong mot nam.
 *
 * Nguoi dung co the ghi de moc: chon tay thang moc ('manual') hoac coi ca dong la
 * Nen ('base') — danh cho hop dong cu ma lich su doanh thu chua nhap vao he thong.
 */

export type RevenueGroup = 'new' | 'expansion' | 'base';
export type AnchorMode = 'auto' | 'manual' | 'base';

/** So thang cua giai doan Moi / Mo rong, tinh tu thang moc. */
export const NEW_REVENUE_MONTHS = 12;

export interface LineAnchor {
  mode: AnchorMode;
  /** Thang moc nguoi dung chon — chi co nghia khi mode = 'manual'. */
  manual_period: string | null;
  /** Thang dau tien co doanh thu > 0 trong he thong — moc tu dong. */
  first_period: string | null;
}

/** 'YYYY-MM' -> so thang tuyet doi, de cong tru thang khong lo qua nam. */
export function periodIndex(period: string): number {
  return Number(period.slice(0, 4)) * 12 + Number(period.slice(5, 7)) - 1;
}

export function periodFromIndex(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function yearPeriods(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}

/** Moc dang co hieu luc; null khi chua co doanh thu nao hoac ca dong la Nen. */
export function effectiveAnchor(anchor: LineAnchor): string | null {
  if (anchor.mode === 'base') return null;
  if (anchor.mode === 'manual') return anchor.manual_period ?? anchor.first_period;
  return anchor.first_period;
}

/** Thang dau tien dong chuyen sang Nen; null neu chua xac dinh duoc. */
export function baseFromPeriod(anchor: LineAnchor): string | null {
  const start = effectiveAnchor(anchor);
  return start ? periodFromIndex(periodIndex(start) + NEW_REVENUE_MONTHS) : null;
}

/**
 * Nhom cua mot thang. Dong chua co moc (chua nhap dong nao) duoc xem la Moi/Mo rong:
 * so dau tien nhap vao se tro thanh moc va nam trong 12 thang dau.
 */
export function groupOf(period: string, kind: ContractKind, anchor: LineAnchor): RevenueGroup {
  if (anchor.mode === 'base') return 'base';
  const start = effectiveAnchor(anchor);
  if (start && periodIndex(period) >= periodIndex(start) + NEW_REVENUE_MONTHS) return 'base';
  return kind === 'expansion' ? 'expansion' : 'new';
}

/** Tham so `group` tren API -> tap nhom duoc chon. */
export function parseGroupFilter(value: unknown): Set<RevenueGroup> | null {
  switch (value) {
    case 'new_expansion':
      return new Set(['new', 'expansion']);
    case 'new':
      return new Set(['new']);
    case 'expansion':
      return new Set(['expansion']);
    case 'base':
      return new Set(['base']);
    default:
      return null;
  }
}

/* ---------- Du kien ca nam ---------- */

export type ProjectionSource =
  /** Thang da qua, co so lieu. */
  | 'actual'
  /** Thang toi, nguoi dung da nhap so du kien. */
  | 'entered'
  /** Cung ky nam truoc x ty le (nam nay / nam truoc) cua cac thang truoc do. */
  | 'same_period_ratio'
  /** Trung binh cac thang truoc do cua nam nay (khong co cung ky). */
  | 'average'
  /** Dong ngung / tam dung / het han hop dong, hoac thang da qua ma khong co so. */
  | 'none';

export interface ProjectedMonth {
  value: number;
  source: ProjectionSource;
}

export interface ProjectionInput {
  year: number;
  /** Thang hien tai 'YYYY-MM' — moc phan biet thang da qua va thang toi. */
  current: string;
  /** So lieu nam nay theo ky 'YYYY-MM' (chi can o > 0). */
  months: Record<string, number>;
  /** So lieu nam truoc theo ky 'YYYY-MM' cua nam truoc. */
  prevMonths: Record<string, number>;
  status: ServiceStatus;
  start_date: string | null;
  end_date: string | null;
}

function samePeriodLastYear(period: string): string {
  return `${Number(period.slice(0, 4)) - 1}${period.slice(4)}`;
}

/** Dong con phat sinh doanh thu trong thang nay khong (theo tinh trang va thoi han HD). */
function isActiveIn(period: string, input: ProjectionInput): boolean {
  if (input.status === 'paused' || input.status === 'stopped') return false;
  const first = `${period}-01`;
  const last = `${period}-31`;
  if (input.end_date && input.end_date < first) return false;
  if (input.start_date && input.start_date > last) return false;
  return true;
}

/**
 * Du kien 12 thang cua mot dong.
 *
 * 1. Thang co so lieu (da qua hoac so du kien da nhap) -> lay chinh so do.
 * 2. Thang da qua ma khong co so -> 0 (khong phat sinh thi khong bia).
 * 3. Thang toi chua nhap, dong khong con hoat dong -> 0.
 * 4. Thang toi chua nhap, co cung ky nam truoc -> cung ky x ty le
 *    (tong cac thang truoc do nam nay / tong cac thang tuong ung nam truoc).
 *    Chua co thang nao de tinh ty le thi lay nguyen cung ky.
 * 5. Thang toi chua nhap, khong co cung ky -> trung binh cac thang truoc do nam nay.
 */
export function projectYear(input: ProjectionInput): Record<string, ProjectedMonth> {
  const currentIndex = periodIndex(input.current);
  const out: Record<string, ProjectedMonth> = {};
  const earlier: string[] = [];

  for (const period of yearPeriods(input.year)) {
    const amount = input.months[period] ?? 0;
    const index = periodIndex(period);
    if (amount > 0) {
      out[period] = { value: amount, source: index <= currentIndex ? 'actual' : 'entered' };
      earlier.push(period);
      continue;
    }
    if (index < currentIndex || !isActiveIn(period, input)) {
      out[period] = { value: 0, source: 'none' };
      continue;
    }

    const lastYear = input.prevMonths[samePeriodLastYear(period)] ?? 0;
    if (lastYear > 0) {
      let thisSum = 0;
      let prevSum = 0;
      for (const k of earlier) {
        const prev = input.prevMonths[samePeriodLastYear(k)] ?? 0;
        if (prev > 0) {
          thisSum += input.months[k];
          prevSum += prev;
        }
      }
      if (prevSum > 0) {
        out[period] = {
          value: Math.round((lastYear * thisSum) / prevSum),
          source: 'same_period_ratio',
        };
        continue;
      }
      if (earlier.length === 0) {
        out[period] = { value: lastYear, source: 'same_period_ratio' };
        continue;
      }
    }
    if (earlier.length > 0) {
      const sum = earlier.reduce((acc, k) => acc + input.months[k], 0);
      out[period] = { value: Math.round(sum / earlier.length), source: 'average' };
      continue;
    }
    out[period] = { value: 0, source: 'none' };
  }
  return out;
}

/* ---------- So sanh voi nam truoc ---------- */

export interface LineComparison {
  /** TB thang nam truoc dung de so sanh, null neu khong co gi de so. */
  prev_avg_vnd: number | null;
  prev_avg_source: 'manual' | 'computed' | null;
  /** Cung ky nam truoc cho tung thang trong nhom; `approx` = lay TB thay cho so that. */
  prev_same_period: Record<string, { value: number; approx: boolean } | null>;
  projection: Record<string, ProjectedMonth>;
  /** Thuc te den thang hien tai, chi trong cac thang thuoc nhom. */
  ytd_actual_vnd: number;
  projected_total_vnd: number;
  prev_total_vnd: number;
  /** Tong nam truoc co thang phai lay TB thay cho so that. */
  prev_total_approx: boolean;
}

/**
 * So sanh mot dong voi nam truoc, CHI tren cac thang `periods` (cac thang thuoc
 * nhom dang xem). Nho vay dong chuyen sang Nen giua nam chi so phan Nen voi
 * cung cac thang do cua nam truoc.
 */
export function compareLine(
  input: ProjectionInput & { periods: string[]; baselineAvg: number | null }
): LineComparison {
  const prevValues = Object.values(input.prevMonths).filter((v) => v > 0);
  const computedAvg =
    prevValues.length > 0
      ? Math.round(prevValues.reduce((a, b) => a + b, 0) / prevValues.length)
      : null;
  const prevAvg = input.baselineAvg ?? computedAvg;
  const prevAvgSource =
    input.baselineAvg !== null ? 'manual' : computedAvg !== null ? 'computed' : null;

  const projection = projectYear(input);
  const currentIndex = periodIndex(input.current);
  const prevSame: LineComparison['prev_same_period'] = {};
  let ytd = 0;
  let projected = 0;
  let prevTotal = 0;
  let approx = false;

  for (const period of input.periods) {
    const actual = input.prevMonths[samePeriodLastYear(period)] ?? 0;
    if (actual > 0) prevSame[period] = { value: actual, approx: false };
    else if (prevAvg !== null && prevAvg > 0) prevSame[period] = { value: prevAvg, approx: true };
    else prevSame[period] = null;

    const same = prevSame[period];
    if (same) {
      prevTotal += same.value;
      if (same.approx) approx = true;
    }
    if (periodIndex(period) <= currentIndex) ytd += input.months[period] ?? 0;
    projected += projection[period]?.value ?? 0;
  }

  return {
    prev_avg_vnd: prevAvg,
    prev_avg_source: prevAvgSource,
    prev_same_period: prevSame,
    projection,
    ytd_actual_vnd: ytd,
    projected_total_vnd: projected,
    prev_total_vnd: prevTotal,
    prev_total_approx: approx,
  };
}
