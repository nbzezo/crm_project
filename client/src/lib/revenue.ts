import type { RevenueTotals } from '../types';

const EMPTY_TOTALS: RevenueTotals = {
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

/**
 * Công nợ: tiền ĐÃ XUẤT HOÁ ĐƠN mà khách chưa trả.
 *
 * Khác với "còn phải thu" trên dải phễu (`amount − paid`), vốn gộp cả phần chưa
 * xuất hoá đơn — tức là tiền mình còn chưa có quyền đòi. Chỉ phần đã xuất hoá
 * đơn mới là khoản khách đang nợ, và đó mới là con số kế toán làm việc cùng.
 *
 * Đây là số suy ra từ dữ liệu sẵn có. Tuổi nợ (quá hạn bao nhiêu ngày) cần
 * hạn thanh toán trên từng hoá đơn — xem docs/TECH-DEBT-CONG-NO.md.
 */
export function receivable(totals: RevenueTotals | undefined | null): number {
  const t = totals ?? EMPTY_TOTALS;
  /* `stage_invoiced_vnd` là phần ĐANG dừng ở bước xuất hoá đơn; tiền đã thu đã
     chuyển sang `stage_paid_vnd` nên không còn nằm ở đây. Vì vậy chính nó đã là
     khoản chưa thu, không phải trừ thêm lần nữa. */
  return t.stage_invoiced_vnd;
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
