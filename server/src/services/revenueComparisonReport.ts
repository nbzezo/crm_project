import type { RevenueCell } from './revenueService.ts';
import { compareLine, yearPeriods, type RevenueGroup } from './revenueSegments.ts';
import type { ServiceStatus } from '@workflow/contracts';

export interface RevenueComparisonLine extends Record<string, unknown> {
  groups: Record<string, RevenueGroup>;
  months: Record<string, RevenueCell>;
}

export function buildRevenueComparisonReport(
  year: number,
  current: string,
  only: Set<RevenueGroup> | null,
  lines: RevenueComparisonLine[],
  prevByLine: Map<number, Record<string, number>>,
  includeLines: boolean
) {
  const rows = [];
  for (const line of lines) {
    const id = Number(line.id);
    const periods = yearPeriods(year).filter((period) => !only || only.has(line.groups[period]));
    if (periods.length === 0) continue;
    const months = Object.fromEntries(
      Object.entries(line.months).map(([period, cell]) => [period, cell.amount_vnd])
    );
    const comparison = compareLine({
      year,
      current,
      months,
      prevMonths: prevByLine.get(id) ?? {},
      status: line.status as ServiceStatus,
      start_date: (line.start_date as string | null) ?? null,
      end_date: (line.end_date as string | null) ?? null,
      periods,
      baselineAvg: line.baseline_avg_vnd as number | null,
    });
    rows.push({
      line_id: line.id,
      customer_id: line.customer_id,
      customer_name: line.customer_name,
      service_name: line.service_name,
      contract_name: line.contract_name,
      contract_kind: line.contract_kind,
      status: line.status,
      anchor: line.anchor,
      groups: line.groups,
      periods,
      months,
      prev_months: prevByLine.get(id) ?? {},
      baseline_avg_vnd: line.baseline_avg_vnd,
      ...comparison,
    });
  }

  const totals = {
    projected_by_group: { new: 0, expansion: 0, base: 0 } as Record<RevenueGroup, number>,
    projected_total_vnd: 0,
    prev_total_vnd: 0,
    prev_total_approx: false,
  };
  for (const row of rows) {
    for (const [period, value] of Object.entries(row.projection)) {
      totals.projected_by_group[row.groups[period]] += value.value;
    }
    totals.projected_total_vnd += row.projected_total_vnd;
    totals.prev_total_vnd += row.prev_total_vnd;
    if (row.prev_total_approx) totals.prev_total_approx = true;
  }

  return { year, current_period: current, totals, lines: includeLines ? rows : [] };
}
