import { useMemo, useRef } from 'react';
import { addDays, differenceInCalendarDays, eachDayOfInterval, format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import { PRIORITY_COLORS, PRIORITY_ORDER, t } from '../../i18n/vi';
import { EmptyState, focusRing } from '../common/ui';
import { contrastInk, formatDate, todayStr } from '../../lib/format';
import type { TimelineItem } from '../../types';

export type Zoom = 'week' | 'month' | 'quarter';

const DAY_WIDTH: Record<Zoom, number> = { week: 36, month: 14, quarter: 5 };
const LABEL_WIDTH = 224;
const ROW_HEIGHT = 32;

export function TimelineView({
  items,
  zoom,
  onOpenCard,
}: {
  items: TimelineItem[];
  zoom: Zoom;
  onOpenCard: (id: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dayWidth = DAY_WIDTH[zoom];

  const { days, groups, startDate } = useMemo(() => {
    const allDates = items.flatMap((i) => [i.start_date, i.due_date]).filter(Boolean);
    const today = todayStr();
    const min = allDates.length ? allDates.reduce((a, b) => (a < b ? a : b)) : today;
    const max = allDates.length ? allDates.reduce((a, b) => (a > b ? a : b)) : today;
    const from = addDays(parseISO(min), -7);
    const to = addDays(parseISO(max), 14);
    const days = eachDayOfInterval({ start: from, end: to });

    const map = new Map<string, TimelineItem[]>();
    for (const item of items) {
      const arr = map.get(item.group_name) ?? [];
      arr.push(item);
      map.set(item.group_name, arr);
    }
    return { days, groups: [...map.entries()], startDate: from };
  }, [items]);

  const totalWidth = days.length * dayWidth;
  const todayIndex = differenceInCalendarDays(parseISO(todayStr()), startDate);

  const months = useMemo(() => {
    const result: { label: string; span: number }[] = [];
    for (const day of days) {
      const label = format(day, 'MMMM yyyy', { locale: vi });
      const last = result[result.length - 1];
      if (last && last.label === label) last.span += 1;
      else result.push({ label, span: 1 });
    }
    return result;
  }, [days]);

  const scrollToToday = () => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollLeft = Math.max(0, todayIndex * dayWidth - 200);
  };

  if (items.length === 0) {
    return <EmptyState message={t.timeline.noItems} hint="Đặt ngày bắt đầu và hạn cho công việc để chúng hiện trên dòng thời gian." />;
  }

  return (
    <div className="overflow-hidden rounded-modal border border-tr-border bg-tr-panel shadow-sm">
      <div className="flex items-center gap-3 border-b border-tr-border px-3 py-1.5">
        {/* Chu giai mau: truoc day thanh cong viec to theo muc uu tien ma khong
            co bang chu giai nao, mau tro thanh kenh truyen tin duy nhat. */}
        <div className="flex flex-wrap items-center gap-3 text-2xs text-tr-muted">
          {PRIORITY_ORDER.map((p) => (
            <span key={p} className="inline-flex items-center gap-1">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: PRIORITY_COLORS[p] }}
              />
              {t.priority[p]}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={scrollToToday}
          className={`ml-auto rounded-control px-2 py-1 text-xs font-medium text-tr-primary hover:bg-tr-hover ${focusRing}`}
        >
          {t.common.today}
        </button>
      </div>

      <div className="flex">
        <div className="shrink-0 border-r border-tr-border bg-tr-surface" style={{ width: LABEL_WIDTH }}>
          <div className="h-14 border-b border-tr-border" />
          {groups.map(([groupName, groupItems]) => (
            <div key={groupName}>
              <div className="truncate border-b border-tr-border bg-tr-hover-strong px-3 py-1.5 text-xs font-semibold text-tr-subtle">
                {groupName}
              </div>
              {groupItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center border-b border-tr-border px-3 text-xs text-tr-subtle"
                  style={{ height: ROW_HEIGHT }}
                  title={item.title}
                >
                  <span className="min-w-0 truncate">{item.title}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div ref={scrollRef} className="tr-scroll flex-1 overflow-x-auto">
          <div style={{ width: totalWidth, position: 'relative' }}>
            <div className="sticky top-0 z-10 bg-tr-panel">
              <div className="flex h-7 border-b border-tr-border">
                {months.map((month, i) => (
                  <div
                    key={i}
                    className="truncate border-r border-tr-border px-2 text-xs leading-7 font-medium text-tr-subtle capitalize"
                    style={{ width: month.span * dayWidth }}
                  >
                    {month.span * dayWidth > 60 ? month.label : ''}
                  </div>
                ))}
              </div>
              <div className="flex h-7 border-b border-tr-border">
                {days.map((day, i) => {
                  const weekend = day.getDay() === 0 || day.getDay() === 6;
                  return (
                    <div
                      key={i}
                      className={`shrink-0 text-center text-[10px] leading-7 ${
                        weekend ? 'bg-tr-hover text-tr-muted' : 'text-tr-subtle'
                      } ${i === todayIndex ? 'bg-tr-hover-strong font-bold text-tr-primary' : ''}`}
                      style={{ width: dayWidth }}
                    >
                      {dayWidth >= 14 ? format(day, 'd') : ''}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pointer-events-none absolute inset-x-0 top-14 bottom-0 flex">
              {days.map((day, i) => {
                const weekend = day.getDay() === 0 || day.getDay() === 6;
                return (
                  <div
                    key={i}
                    className={`shrink-0 border-r border-tr-border ${weekend ? 'bg-tr-hover' : ''} ${
                      i === todayIndex ? 'bg-tr-hover' : ''
                    }`}
                    style={{ width: dayWidth }}
                  />
                );
              })}
            </div>

            <div className="relative">
              {groups.map(([groupName, groupItems]) => (
                <div key={groupName}>
                  <div className="border-b border-tr-border bg-tr-hover/60" style={{ height: 29 }} />
                  {groupItems.map((item) => {
                    const offset = differenceInCalendarDays(parseISO(item.start_date), startDate);
                    const span =
                      differenceInCalendarDays(parseISO(item.due_date), parseISO(item.start_date)) + 1;
                    return (
                      <div
                        key={item.id}
                        className="relative border-b border-tr-border"
                        style={{ height: ROW_HEIGHT }}
                      >
                        <button
                          type="button"
                          onClick={() => onOpenCard(item.id)}
                          title={`${item.title} — ${formatDate(item.start_date)} → ${formatDate(item.due_date)}`}
                          /* O muc thu phong nho, thanh qua hep de hien chu — nhan
                             day du van doc duoc bang trinh doc man hinh. */
                          aria-label={`${item.title}, ${formatDate(item.start_date)} đến ${formatDate(item.due_date)}, ưu tiên ${t.priority[item.priority]}`}
                          className={`absolute top-1.5 truncate rounded-control px-1.5 text-2xs font-medium transition hover:brightness-110 ${focusRing}`}
                          style={{
                            left: offset * dayWidth,
                            width: Math.max(span * dayWidth - 2, 8),
                            height: ROW_HEIGHT - 12,
                            lineHeight: `${ROW_HEIGHT - 12}px`,
                            backgroundColor: PRIORITY_COLORS[item.priority],
                            color: contrastInk(PRIORITY_COLORS[item.priority]),
                          }}
                        >
                          {span * dayWidth > 40 ? item.title : ''}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
