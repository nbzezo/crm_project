import type { RevenueTotals } from '../types';

export const EMPTY_TOTALS: RevenueTotals = {
  amount_vnd: 0,
  forecast_vnd: 0,
  stage_forecast_vnd: 0,
  stage_reconciled_vnd: 0,
  stage_invoiced_vnd: 0,
  stage_paid_vnd: 0,
};

/**
 * Quy doi tong theo tung giai doan (roi nhau) thanh phieu luy ke:
 * da thanh toan thi duong nhien da xuat hoa don va da doi soat.
 */
export function funnel(totals: RevenueTotals | undefined | null) {
  const t = totals ?? EMPTY_TOTALS;
  const paid = t.stage_paid_vnd;
  const invoiced = paid + t.stage_invoiced_vnd;
  const reconciled = invoiced + t.stage_reconciled_vnd;
  return { amount: t.amount_vnd, forecast: t.forecast_vnd, reconciled, invoiced, paid };
}

/** Cong don tong cua nhieu pham vi (vi du cong tat ca cac dong dang hien). */
export function sumTotals(list: (RevenueTotals | undefined)[]): RevenueTotals {
  const out = { ...EMPTY_TOTALS };
  for (const item of list) {
    if (!item) continue;
    out.amount_vnd += item.amount_vnd;
    out.forecast_vnd += item.forecast_vnd;
    out.stage_forecast_vnd += item.stage_forecast_vnd;
    out.stage_reconciled_vnd += item.stage_reconciled_vnd;
    out.stage_invoiced_vnd += item.stage_invoiced_vnd;
    out.stage_paid_vnd += item.stage_paid_vnd;
  }
  return out;
}
