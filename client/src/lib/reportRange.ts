import { format, startOfMonth, startOfQuarter, subMonths } from 'date-fns';

/** Khoang thoi gian dung chung cho cac trang bao cao (Báo cáo, Hiệu suất). */
export type RangeKey = 'month' | 'quarter' | 'six' | 'custom';

export function resolveRange(key: RangeKey, customFrom: string, customTo: string) {
  const today = new Date();
  if (key === 'month')
    return { from: format(startOfMonth(today), 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };
  if (key === 'quarter')
    return { from: format(startOfQuarter(today), 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };
  if (key === 'six')
    return { from: format(subMonths(today, 6), 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };
  return { from: customFrom || format(subMonths(today, 6), 'yyyy-MM-dd'), to: customTo };
}
