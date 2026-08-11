import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, List, Plus } from 'lucide-react';
import { Button, Segmented, focusRing } from '../common/ui';
import { usePopover } from '../common/Popover';
import { MonthYearPicker } from './MonthYearPicker';
import { rangeTitle, step, type CalendarViewMode } from './calendarPrefs';
import { t } from '../../i18n/vi';
import { todayStr } from '../../lib/format';

const VIEW_OPTIONS: { value: CalendarViewMode; label: string }[] = [
  { value: 'month', label: t.calendar.month },
  { value: 'week', label: t.calendar.week },
  { value: 'day', label: t.calendar.day },
  { value: 'list', label: t.calendar.list },
];

/**
 * Thanh cong cu tu dung — `headerToolbar` cua FullCalendar bi tat.
 *
 * Phai tu dung vi che do Danh sach khong di qua FullCalendar, nen neu dung
 * thanh cong cu cua no thi hai nua giao dien se lech nhau.
 */
export function CalendarToolbar({
  view,
  date,
  onViewChange,
  onDateChange,
  onCreate,
}: {
  view: CalendarViewMode;
  date: string;
  onViewChange: (view: CalendarViewMode) => void;
  onDateChange: (date: string) => void;
  /** Bo trong khi khung nhin khong tao lich duoc (tab Lich trong Bang). */
  onCreate?: () => void;
}) {
  const picker = usePopover();

  return (
    <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onDateChange(step(view, date, -1))}
          aria-label="Kỳ trước"
          className={`rounded-control p-2 text-tr-subtle transition hover:bg-tr-hover ${focusRing}`}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onDateChange(step(view, date, 1))}
          aria-label="Kỳ sau"
          className={`rounded-control p-2 text-tr-subtle transition hover:bg-tr-hover ${focusRing}`}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>

      <Button onClick={() => onDateChange(todayStr())}>{t.common.today}</Button>

      {/* Muc 47: tieu de bam duoc de nhay thang/nam thay vi bam mui ten nhieu lan. */}
      <button
        type="button"
        onClick={picker.toggle}
        aria-haspopup="dialog"
        aria-expanded={picker.open}
        className={`inline-flex items-center gap-1.5 rounded-control px-2 py-1.5 text-base font-semibold text-tr-text transition hover:bg-tr-hover ${focusRing}`}
      >
        {rangeTitle(view, date)}
        <ChevronDown size={16} className="text-tr-muted" aria-hidden="true" />
      </button>

      {/* Muc 16: CTA chinh luon o goc phai cua thanh cong cu. */}
      {onCreate && (
        <Button variant="primary" className="ms-auto" onClick={onCreate}>
          <Plus size={16} aria-hidden="true" />
          {t.calendar.create}
        </Button>
      )}

      <div className={onCreate ? '' : 'ms-auto'}>
        <Segmented
          label="Chế độ xem lịch"
          value={view}
          onChange={onViewChange}
          options={VIEW_OPTIONS.map((option) => ({
            ...option,
            icon:
              option.value === 'list' ? (
                <List size={14} aria-hidden="true" />
              ) : option.value === 'month' ? (
                <CalendarDays size={14} aria-hidden="true" />
              ) : undefined,
          }))}
        />
      </div>

      <MonthYearPicker
        open={picker.open}
        anchor={picker.anchor}
        onClose={picker.close}
        value={date}
        onPick={onDateChange}
      />
    </div>
  );
}
