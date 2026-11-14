import {
  addRevenueCellToTotals,
  type RevenueCellAmounts,
  type RevenueTotals,
} from '@workflow/contracts';
import type { RevenueGroup } from './revenueSegments.ts';

export function emptyRevenueTotals(): RevenueTotals {
  return {
    amount_vnd: 0,
    forecast_vnd: 0,
    stage_forecast_vnd: 0,
    stage_reconciled_vnd: 0,
    stage_invoiced_vnd: 0,
    stage_paid_vnd: 0,
  };
}

export interface RevenueSummaryLine extends Record<string, unknown> {
  months: Record<string, RevenueCellAmounts>;
  groups: Record<string, RevenueGroup>;
}

export function buildRevenueSummaryReport(
  year: number,
  only: Set<RevenueGroup> | null,
  lines: RevenueSummaryLine[]
) {
  const months = new Map<string, RevenueTotals>();
  const totals = emptyRevenueTotals();
  const byService = new Map<string, { name: string; line_count: number } & RevenueTotals>();
  const byCustomer = new Map<number, { id: number; name: string } & RevenueTotals>();
  const byGroup: Record<RevenueGroup, { totals: RevenueTotals; months: Record<string, number> }> = {
    new: { totals: emptyRevenueTotals(), months: {} },
    expansion: { totals: emptyRevenueTotals(), months: {} },
    base: { totals: emptyRevenueTotals(), months: {} },
  };

  for (const line of lines) {
    const serviceName = String(line.service_name ?? '') || 'Chưa gán dịch vụ';
    const service = byService.get(serviceName) ?? {
      name: serviceName,
      line_count: 0,
      ...emptyRevenueTotals(),
    };
    service.line_count += 1;
    byService.set(serviceName, service);
    const customerId = Number(line.customer_id);
    const customer = byCustomer.get(customerId) ?? {
      id: customerId,
      name: String(line.customer_name),
      ...emptyRevenueTotals(),
    };
    byCustomer.set(customerId, customer);

    for (const [period, cell] of Object.entries(line.months)) {
      const group = line.groups[period];
      /* groupsOf() phu du 12 thang cua nam nen nhanh nay khong xay ra luc chay. */
      if (group === undefined) continue;
      if (only && !only.has(group)) continue;
      if (!months.has(period)) months.set(period, emptyRevenueTotals());
      addRevenueCellToTotals(months.get(period)!, cell);
      addRevenueCellToTotals(totals, cell);
      addRevenueCellToTotals(service, cell);
      addRevenueCellToTotals(customer, cell);
      addRevenueCellToTotals(byGroup[group].totals, cell);
      byGroup[group].months[period] = (byGroup[group].months[period] ?? 0) + cell.amount_vnd;
    }
  }

  return {
    year,
    months: [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, value]) => ({ period, ...value })),
    totals,
    line_count: lines.length,
    by_service: [...byService.values()].sort((a, b) => b.amount_vnd - a.amount_vnd),
    by_customer: [...byCustomer.values()]
      .filter((customer) => customer.amount_vnd > 0)
      .sort((a, b) => b.amount_vnd - a.amount_vnd)
      .slice(0, 10),
    by_group: byGroup,
  };
}
