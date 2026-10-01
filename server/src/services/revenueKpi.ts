import type { RevenueStage } from '@workflow/contracts';
import { periodIndex, yearPeriods, type RevenueGroup } from './revenueSegments.ts';

/**
 * KPI doanh thu: doanh thu nao duoc ghi nhan vao chi tieu cua thang.
 *
 * Tinh rieng TUNG dong, khong bu tru giua cac dong:
 *  - thang thuoc Moi / Mo rong: ghi nhan toan bo doanh thu;
 *  - thang thuoc Nen: chi ghi nhan phan vuot TB thang nam truoc ("mo rong tu Nen");
 *    phan thieu hut ghi la Lost — de theo doi, KHONG tru vao KPI.
 *
 * Chi doanh thu da doi soat tro len moi duoc tinh. O da co so nhung con o "Du
 * kien" la "cho doi soat": chua ghi nhan, cung chua coi la Lost.
 */

export const KPI_STAGES: ReadonlySet<RevenueStage> = new Set(['reconciled', 'invoiced', 'paid']);

export type KpiStatus =
  /** Moi / Mo rong da doi soat. */
  | 'counted'
  /** Nen vuot TB nam truoc — phan vuot duoc ghi nhan. */
  | 'base_growth'
  /** Nen khong vuot TB nam truoc — ghi Lost (co the bang 0 khi bang dung TB). */
  | 'lost'
  /** Co so nhung chua doi soat. */
  | 'pending'
  /** Nen nhung chua co TB thang nam truoc de so. */
  | 'missing_baseline';

export interface KpiLineInput {
  line_id: number;
  /** Nguoi dung lam AM; 0 = chua gan AM. */
  am_user_id: number;
  groups: Record<string, RevenueGroup>;
  cells: Record<string, { amount_vnd: number; stage: RevenueStage }>;
  /** TB thang nam truoc (nhap tay, hoac tu tinh); null = khong co. */
  prev_avg_vnd: number | null;
}

export interface KpiEntry {
  line_id: number;
  am_user_id: number;
  period: string;
  group: RevenueGroup;
  status: KpiStatus;
  /** Doanh thu da doi soat cua thang (0 neu chua co). */
  revenue_vnd: number;
  prev_avg_vnd: number | null;
  /** So ghi nhan vao KPI. */
  kpi_vnd: number;
  lost_vnd: number;
}

/**
 * Cac o KPI cua mot nam. Bo qua thang khong co gi de noi: Moi / Mo rong chua
 * co doanh thu, va thang chua qua ma dong Nen chua co so lieu.
 */
export function computeKpi(lines: KpiLineInput[], year: number, current: string): KpiEntry[] {
  const currentIndex = periodIndex(current);
  const out: KpiEntry[] = [];
  for (const line of lines) {
    for (const period of yearPeriods(year)) {
      const group = line.groups[period];
      const cell = line.cells[period];
      const amount = cell?.amount_vnd ?? 0;
      const reconciled = amount > 0 && cell !== undefined && KPI_STAGES.has(cell.stage);
      const elapsed = periodIndex(period) < currentIndex;
      const base = {
        line_id: line.line_id,
        am_user_id: line.am_user_id,
        period,
        group,
        prev_avg_vnd: group === 'base' ? line.prev_avg_vnd : null,
      };

      if (amount > 0 && !reconciled) {
        out.push({ ...base, status: 'pending', revenue_vnd: 0, kpi_vnd: 0, lost_vnd: 0 });
        continue;
      }
      if (group !== 'base') {
        if (reconciled)
          out.push({
            ...base,
            status: 'counted',
            revenue_vnd: amount,
            kpi_vnd: amount,
            lost_vnd: 0,
          });
        continue;
      }
      /* Nen: thang chua qua ma chua co so thi chua noi duoc gi. */
      if (!reconciled && !elapsed) continue;
      const revenue = reconciled ? amount : 0;
      if (line.prev_avg_vnd === null || line.prev_avg_vnd <= 0) {
        out.push({
          ...base,
          status: 'missing_baseline',
          revenue_vnd: revenue,
          kpi_vnd: 0,
          lost_vnd: 0,
        });
        continue;
      }
      const diff = revenue - line.prev_avg_vnd;
      out.push(
        diff > 0
          ? { ...base, status: 'base_growth', revenue_vnd: revenue, kpi_vnd: diff, lost_vnd: 0 }
          : { ...base, status: 'lost', revenue_vnd: revenue, kpi_vnd: 0, lost_vnd: -diff }
      );
    }
  }
  return out;
}

export interface KpiMonth {
  period: string;
  target_vnd: number;
  new_vnd: number;
  expansion_vnd: number;
  base_growth_vnd: number;
  total_vnd: number;
  lost_vnd: number;
  pending_count: number;
  missing_baseline_count: number;
}

/** Cong cac o KPI thanh 12 thang, kem chi tieu. */
export function summarizeKpi(
  entries: KpiEntry[],
  year: number,
  targets: Record<string, number>
): KpiMonth[] {
  const months = new Map<string, KpiMonth>(
    yearPeriods(year).map((period) => [
      period,
      {
        period,
        target_vnd: targets[period] ?? 0,
        new_vnd: 0,
        expansion_vnd: 0,
        base_growth_vnd: 0,
        total_vnd: 0,
        lost_vnd: 0,
        pending_count: 0,
        missing_baseline_count: 0,
      },
    ])
  );
  for (const e of entries) {
    const m = months.get(e.period)!;
    if (e.status === 'pending') m.pending_count += 1;
    else if (e.status === 'missing_baseline') m.missing_baseline_count += 1;
    else if (e.status === 'counted') {
      if (e.group === 'expansion') m.expansion_vnd += e.kpi_vnd;
      else m.new_vnd += e.kpi_vnd;
    } else if (e.status === 'base_growth') m.base_growth_vnd += e.kpi_vnd;
    m.lost_vnd += e.lost_vnd;
    m.total_vnd += e.kpi_vnd;
  }
  return [...months.values()];
}
