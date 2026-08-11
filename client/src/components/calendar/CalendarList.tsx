import { useMemo } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import { EmptyState, focusRing } from '../common/ui';
import { OverdueIcon, type CalEvent } from './calendarModel';
import { t } from '../../i18n/vi';
import { todayStr } from '../../lib/format';

/** Tieu de tuong doi cho de doc: hom nay / ngay mai / hom qua, con lai la thu + ngay. */
function dayHeading(dateStr: string, today: string): string {
  if (dateStr === today) return t.common.today.toUpperCase();
  if (dateStr === format(addDays(parseISO(today), 1), 'yyyy-MM-dd')) return 'NGÀY MAI';
  if (dateStr === format(addDays(parseISO(today), -1), 'yyyy-MM-dd')) return 'HÔM QUA';
  return format(parseISO(dateStr), 'EEEE', { locale: vi }).toUpperCase();
}

/**
 * Che do Danh sach (muc 15) — dang dong thoi gian, nhom theo ngay.
 *
 * Tu dung thay vi dung `@fullcalendar/list` vi BRD doi tieu de tuong doi
 * ("HÔM NAY · 11/08") va bo cuc hai cot; plugin list render mot <table> khac han
 * va bi rang buoc vao khoang ngay cua thanh cong cu.
 */
export function CalendarList({
  events,
  onSelect,
}: {
  events: CalEvent[];
  onSelect: (event: CalEvent) => void;
}) {
  const today = todayStr();

  const groups = useMemo(() => {
    const byDate = new Map<string, CalEvent[]>();
    for (const event of events) {
      const list = byDate.get(event.date) ?? [];
      list.push(event);
      byDate.set(event.date, list);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => ({
        date,
        // Su kien co gio len truoc theo gio; su kien ca ngay xuong duoi.
        items: items.sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99')),
      }));
  }, [events]);

  if (groups.length === 0) {
    return (
      <div className="tr-scroll h-full overflow-y-auto">
        <EmptyState message="Không có lịch trong khoảng thời gian này." />
      </div>
    );
  }

  return (
    <div className="tr-scroll h-full overflow-y-auto pe-1">
      {groups.map((group) => (
        <section key={group.date} className="mb-5 last:mb-0">
          <h3
            className={`mb-2 flex items-baseline gap-2 border-b border-tr-border pb-1.5 text-xs font-semibold tracking-wide ${
              group.date === today ? 'text-tr-primary' : 'text-tr-muted'
            }`}
          >
            {dayHeading(group.date, today)}
            <span className="font-normal text-tr-muted">
              · {format(parseISO(group.date), 'dd/MM')}
            </span>
          </h3>

          <ul className="flex flex-col gap-1">
            {group.items.map((event) => (
              <li key={event.key}>
                <button
                  type="button"
                  onClick={() => onSelect(event)}
                  className={`flex w-full items-center gap-3 rounded-control px-2 py-2 text-start transition hover:bg-tr-hover ${focusRing}`}
                >
                  {/* Cot gio co do rong co dinh de moi dong thang hang nhu timeline. */}
                  <span className="w-12 shrink-0 text-xs tabular-nums text-tr-muted">
                    {event.time ?? '—'}
                  </span>
                  <span
                    aria-hidden="true"
                    className="h-6 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: event.bg }}
                  />
                  <event.Icon size={15} className="shrink-0 text-tr-muted" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm ${
                        event.done ? 'text-tr-muted line-through' : 'text-tr-text'
                      }`}
                    >
                      {event.title}
                    </span>
                    {event.subtitle && (
                      <span className="block truncate text-2xs text-tr-muted">
                        {event.subtitle}
                      </span>
                    )}
                  </span>
                  {event.overdue && !event.done && (
                    <span className="tr-badge-overdue inline-flex shrink-0 items-center gap-1 rounded-control px-1.5 py-0.5 text-2xs font-semibold">
                      <OverdueIcon size={11} aria-hidden="true" />
                      {t.common.overdue}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
