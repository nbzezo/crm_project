import {
  addDays as addDaysFn,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

/** Gioi han cua may chu (focusService.MAX_RANGE_DAYS). */
export const MAX_RANGE_DAYS = 92;

/** Ky xem cua man hinh Trong tam. Ngay dang 'YYYY-MM-DD', ca hai dau deu tinh. */
export type PeriodKind = 'day' | 'week' | 'month' | 'custom';

export interface Period {
  kind: PeriodKind;
  from: string;
  to: string;
}

const fmt = (date: Date) => format(date, 'yyyy-MM-dd');

export function periodFor(kind: Exclude<PeriodKind, 'custom'>, anchor: string): Period {
  const date = parseISO(anchor);
  if (kind === 'day') return { kind, from: anchor, to: anchor };
  if (kind === 'week') {
    const start = startOfWeek(date, { weekStartsOn: 1 });
    return { kind, from: fmt(start), to: fmt(addDaysFn(start, 6)) };
  }
  return { kind, from: fmt(startOfMonth(date)), to: fmt(endOfMonth(date)) };
}

/** Lui / tien mot ky. Ky tu chon dich dung bang do dai cua chinh no. */
export function shiftPeriod(period: Period, direction: -1 | 1): Period {
  if (period.kind === 'month') {
    return periodFor('month', fmt(addMonths(parseISO(period.from), direction)));
  }
  const length = periodLength(period);
  return {
    kind: period.kind,
    from: fmt(addDaysFn(parseISO(period.from), direction * length)),
    to: fmt(addDaysFn(parseISO(period.to), direction * length)),
  };
}

export function periodLength(period: Pick<Period, 'from' | 'to'>): number {
  return differenceInCalendarDays(parseISO(period.to), parseISO(period.from)) + 1;
}

export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = parseISO(from); fmt(d) <= to; d = addDaysFn(d, 1)) days.push(fmt(d));
  return days;
}

export function containsToday(period: Pick<Period, 'from' | 'to'>, today: string): boolean {
  return period.from <= today && today <= period.to;
}

const dm = (value: string) => format(parseISO(value), 'dd/MM');

/** Phan sau chu "Trọng tâm": "hôm nay", "tuần này", "tháng 11/2026", "05/10 – 20/10". */
export function periodTitle(period: Period, today: string): string {
  if (period.kind === 'day') {
    if (period.from === today) return 'hôm nay';
    if (period.from === fmt(addDaysFn(parseISO(today), 1))) return 'ngày mai';
    if (period.from === fmt(addDaysFn(parseISO(today), -1))) return 'hôm qua';
    return `ngày ${dm(period.from)}`;
  }
  if (period.kind === 'week') {
    const current = periodFor('week', today);
    if (current.from === period.from) return 'tuần này';
    if (shiftPeriod(current, 1).from === period.from) return 'tuần sau';
    if (shiftPeriod(current, -1).from === period.from) return 'tuần trước';
    return `tuần ${dm(period.from)} – ${dm(period.to)}`;
  }
  if (period.kind === 'month') {
    if (period.from === periodFor('month', today).from) return 'tháng này';
    return `tháng ${format(parseISO(period.from), 'M/yyyy')}`;
  }
  return `${dm(period.from)} – ${dm(period.to)}`;
}

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const WEEKDAYS_LONG = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

export function weekdayShort(date: string): string {
  return WEEKDAYS[parseISO(date).getDay()];
}

export function weekdayLong(date: string): string {
  return WEEKDAYS_LONG[parseISO(date).getDay()];
}

export function dayMonth(date: string): string {
  return dm(date);
}

/** Thu Hai tuan sau so voi `today` — dich "Tuần sau" cua nut doi han. */
export function nextMonday(today: string): string {
  return fmt(addDaysFn(startOfWeek(parseISO(today), { weekStartsOn: 1 }), 7));
}
