import { addDays, addMonths, format, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { vi } from 'date-fns/locale';
import { todayStr } from '../../lib/format';

export type CalendarViewMode = 'month' | 'week' | 'day' | 'list';

export const CALENDAR_VIEWS: CalendarViewMode[] = ['month', 'week', 'day', 'list'];

/** Ten view tuong ung ben FullCalendar. `list` do ung dung tu dung nen khong co o day. */
export const FC_VIEW: Record<Exclude<CalendarViewMode, 'list'>, string> = {
  month: 'dayGridMonth',
  week: 'timeGridWeek',
  day: 'timeGridDay',
};

const STORAGE_KEY = 'workflow-calendar-view';

/** So ngay hien trong che do Danh sach (muc 15) — cung la tran hieu nang cua no. */
export const LIST_DAYS = 30;

export function isViewMode(value: string | null): value is CalendarViewMode {
  return value !== null && (CALENDAR_VIEWS as string[]).includes(value);
}

/**
 * View dung khi URL chua chi dinh: lua chon lan truoc (muc 7), neu chua co thi
 * mac dinh. Man hinh hep mac dinh la Ngay — luoi thang 7 cot khong dung duoc
 * tren dien thoai (muc 54).
 */
export function defaultView(): CalendarViewMode {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (isViewMode(saved)) return saved;
  return typeof window !== 'undefined' && window.innerWidth < 640 ? 'day' : 'month';
}

export function rememberView(view: CalendarViewMode): void {
  localStorage.setItem(STORAGE_KEY, view);
}

/** Ngay hop le dang 'YYYY-MM-DD', nguoc lai tra ve hom nay. */
export function normalizeDate(value: string | null): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayStr();
}

/**
 * Khoang ngay can tai cho tung che do xem — ca hai dau deu BAO GOM.
 *
 * Tu tinh thay vi cho `datesSet` cua FullCalendar bao lai vi ba ly do:
 * lan ve dau tien da biet khoang nen khong con nhay luoi rong; che do Danh sach
 * khong di qua FullCalendar nen khong co `datesSet` nao de bam vao; va luoi thang
 * cua FullCalendar luon co 6 hang (`fixedWeekCount`) nen tinh lai duoc chinh xac.
 */
export function rangeFor(view: CalendarViewMode, dateStr: string): { from: string; to: string } {
  const date = parseISO(dateStr);
  const iso = (d: Date) => format(d, 'yyyy-MM-dd');

  if (view === 'month') {
    const first = startOfWeek(startOfMonth(date), { weekStartsOn: 1 });
    return { from: iso(first), to: iso(addDays(first, 41)) };
  }
  if (view === 'week') {
    const first = startOfWeek(date, { weekStartsOn: 1 });
    return { from: iso(first), to: iso(addDays(first, 6)) };
  }
  if (view === 'day') {
    return { from: dateStr, to: dateStr };
  }
  return { from: dateStr, to: iso(addDays(date, LIST_DAYS - 1)) };
}

/** Buoc nhay cua nut lui/toi, theo dung che do dang xem. */
export function step(view: CalendarViewMode, dateStr: string, direction: 1 | -1): string {
  const date = parseISO(dateStr);
  if (view === 'month') return format(addMonths(date, direction), 'yyyy-MM-dd');
  if (view === 'week') return format(addDays(date, 7 * direction), 'yyyy-MM-dd');
  if (view === 'day') return format(addDays(date, direction), 'yyyy-MM-dd');
  return format(addDays(date, LIST_DAYS * direction), 'yyyy-MM-dd');
}

/** Tieu de thanh cong cu — doc duoc va khong phu thuoc locale cua trinh duyet. */
export function rangeTitle(view: CalendarViewMode, dateStr: string): string {
  const date = parseISO(dateStr);
  if (view === 'month') return format(date, "'Tháng' M 'năm' yyyy", { locale: vi });
  if (view === 'day') return format(date, "EEEE, d 'tháng' M 'năm' yyyy", { locale: vi });
  if (view === 'week') {
    const first = startOfWeek(date, { weekStartsOn: 1 });
    const last = addDays(first, 6);
    const sameMonth = format(first, 'yyyy-MM') === format(last, 'yyyy-MM');
    return sameMonth
      ? `${format(first, 'd')} – ${format(last, "d 'tháng' M 'năm' yyyy", { locale: vi })}`
      : `${format(first, "d 'tháng' M", { locale: vi })} – ${format(last, "d 'tháng' M 'năm' yyyy", { locale: vi })}`;
  }
  return `${LIST_DAYS} ngày tới · từ ${format(date, 'dd/MM/yyyy')}`;
}
