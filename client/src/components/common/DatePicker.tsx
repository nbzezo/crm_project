import { useEffect, useRef, useState } from 'react';
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { todayStr } from '../../lib/format';

/* Lap lai lop focus thay vi nhap `focusRing` tu ui.tsx: ui.tsx nhap file nay de
   giu `DateInput` o dung cho cu, nen nhap nguoc lai se thanh vong. Popover.tsx
   cung viet thang vi cung ly do. */
const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-primary';

/** Tuan bat dau Thu 2 — lich Viet Nam, khong phai Chu nhat nhu mac dinh US. */
const WEEK_OPTIONS = { weekStartsOn: 1 } as const;
const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/**
 * Luoi chon ngay dat trong Popover cua DateInput.
 *
 * Tu ve thay vi dung lich cua trinh duyet vi `<input type="date">` hien thi theo
 * locale trinh duyet — xem ghi chu o `parseDateInput` trong lib/format.ts.
 */
export function DatePicker({
  value,
  onSelect,
}: {
  value: string | null;
  onSelect: (value: string | null) => void;
}) {
  const today = todayStr();
  const selected = value ? parseISO(value) : null;
  const [cursor, setCursor] = useState(() => startOfMonth(selected ?? parseISO(today)));
  // Ngay dang nhan focus ban phim — roving tabindex: chi mot o trong luoi vao
  // duoc bang Tab, cac o con lai di chuyen bang phim mui ten.
  const [focusDay, setFocusDay] = useState(() => selected ?? parseISO(today));
  const gridRef = useRef<HTMLDivElement>(null);
  const shouldFocus = useRef(false);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(cursor), WEEK_OPTIONS),
    end: endOfWeek(endOfMonth(cursor), WEEK_OPTIONS),
  });

  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus();
  }, [focusDay]);

  const moveFocus = (days: number) => {
    const next = addDays(focusDay, days);
    shouldFocus.current = true;
    setFocusDay(next);
    if (!isSameMonth(next, cursor)) setCursor(startOfMonth(next));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    moveFocus(step);
  };

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => setCursor(addMonths(cursor, -1))}
          aria-label="Tháng trước"
          className={`rounded-control p-2 text-tr-muted transition hover:bg-tr-hover hover:text-tr-text ${focusRing}`}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <span aria-live="polite" className="text-sm font-semibold text-tr-text">
          Tháng {format(cursor, 'M')} / {format(cursor, 'yyyy')}
        </span>
        <button
          type="button"
          onClick={() => setCursor(addMonths(cursor, 1))}
          aria-label="Tháng sau"
          className={`rounded-control p-2 text-tr-muted transition hover:bg-tr-hover hover:text-tr-text ${focusRing}`}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5" aria-hidden="true">
        {WEEKDAYS.map((label) => (
          <span key={label} className="py-1 text-center text-[11px] font-semibold text-tr-muted">
            {label}
          </span>
        ))}
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-label="Chọn ngày"
        onKeyDown={onKeyDown}
        className="grid grid-cols-7 gap-0.5"
      >
        {days.map((day) => {
          const iso = format(day, 'yyyy-MM-dd');
          const isSelected = selected != null && isSameDay(day, selected);
          const isToday = iso === today;
          const outside = !isSameMonth(day, cursor);
          return (
            <button
              key={iso}
              type="button"
              role="gridcell"
              aria-selected={isSelected}
              aria-current={isToday ? 'date' : undefined}
              tabIndex={isSameDay(day, focusDay) ? 0 : -1}
              onClick={() => onSelect(iso)}
              onFocus={() => setFocusDay(day)}
              className={`min-h-9 rounded-control text-sm tabular-nums transition ${focusRing} ${
                isSelected
                  ? 'bg-tr-primary font-semibold text-tr-on-primary'
                  : outside
                    ? 'text-tr-muted hover:bg-tr-hover'
                    : 'text-tr-text hover:bg-tr-hover'
              } ${isToday && !isSelected ? 'font-semibold text-tr-primary ring-1 ring-tr-primary/40 ring-inset' : ''}`}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between gap-2 border-t border-tr-border pt-2">
        <button
          type="button"
          onClick={() => onSelect(today)}
          className={`rounded-control px-2 py-1.5 text-xs font-medium text-tr-primary transition hover:bg-tr-hover ${focusRing}`}
        >
          Hôm nay
        </button>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`rounded-control px-2 py-1.5 text-xs text-tr-muted transition hover:bg-tr-hover hover:text-tr-text ${focusRing}`}
        >
          Xoá ngày
        </button>
      </div>
    </div>
  );
}
