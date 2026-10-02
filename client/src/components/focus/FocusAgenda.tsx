import { useMemo, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { EmptyState, Panel, Segmented, focusRing } from '../common/ui';
import type { AgendaGroup, AgendaItem, DayLoad, FocusData } from './focusTypes';
import { DRAG_TYPE, FocusItemRow, KIND_META, useOpenItem } from './FocusItemRow';
import { dayMonth, eachDay, weekdayLong, weekdayShort } from './focusPeriod';
import { canComplete, canReschedule, useFocusActions } from './useFocusActions';
import { addDays } from '../../lib/format';

type Layout = 'timeline' | 'groups';

const GROUP_LABEL: Record<AgendaGroup, string> = {
  todo: 'Phải làm',
  calendar: 'Lịch & sự kiện',
  milestone: 'Mốc kinh doanh & dự án',
};

/** Tha mot muc (keo tu bat ky dau tren man hinh) vao mot ngay de doi han. */
function useDayDrop(data: FocusData) {
  const { reschedule } = useFocusActions();
  const [over, setOver] = useState<string | null>(null);
  const byKey = useMemo(
    () => new Map([...data.items, ...data.carry_over].map((item) => [item.key, item])),
    [data]
  );
  const props = (date: string) => ({
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (over !== date) setOver(date);
    },
    onDragLeave: () => setOver((current) => (current === date ? null : current)),
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      setOver(null);
      const item = byKey.get(event.dataTransfer.getData(DRAG_TYPE));
      if (item && canReschedule(item)) reschedule(item, date);
    },
  });
  return { over, props };
}

export function FocusAgenda({ data }: { data: FocusData }) {
  const [layout, setLayout] = useState<Layout>('timeline');
  const dayCount = data.range.days;

  return (
    <Panel
      title="Lịch trình"
      action={
        <Segmented
          label="Cách hiển thị lịch trình"
          value={layout}
          onChange={setLayout}
          options={[
            { value: 'timeline', label: dayCount === 1 ? 'Theo giờ' : 'Theo ngày' },
            { value: 'groups', label: 'Theo nhóm' },
          ]}
        />
      }
    >
      {data.items.length === 0 && (layout === 'groups' || dayCount > 1) ? (
        <EmptyState
          message="Không có việc, lịch hay mốc nào trong kỳ này."
          hint="Chọn kỳ khác hoặc xem phạm vi rộng hơn."
        />
      ) : layout === 'groups' ? (
        <GroupedList data={data} />
      ) : dayCount === 1 ? (
        <DayView data={data} date={data.range.from} />
      ) : dayCount <= 14 ? (
        <ColumnsView data={data} />
      ) : (
        <GridView data={data} />
      )}
      {layout === 'timeline' && dayCount > 1 && (
        <p className="mt-2 hidden text-xs text-tr-muted fine:block print:hidden">
          Kéo một việc, nhắc hẹn hoặc hành động cơ hội sang ngày khác để dời hạn.
        </p>
      )}
    </Panel>
  );
}

/* ---------- Theo nhom ---------- */

function GroupedList({ data }: { data: FocusData }) {
  const multiDay = data.range.days > 1;
  return (
    <div className="space-y-4">
      {(['todo', 'calendar', 'milestone'] as AgendaGroup[]).map((group) => {
        const items = data.items.filter((item) => item.group === group);
        if (items.length === 0) return null;
        return (
          <section key={group} aria-label={GROUP_LABEL[group]}>
            <h3 className="mb-1 text-xs font-semibold text-tr-subtle">
              {GROUP_LABEL[group]} <span className="text-tr-muted">({items.length})</span>
            </h3>
            <ul className="divide-y divide-tr-border">
              {items.map((item) => (
                <FocusItemRow
                  key={item.key}
                  item={item}
                  today={data.range.today}
                  showDate={multiDay}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/* ---------- Mot ngay: dong thoi gian theo gio ---------- */

function DayView({ data, date }: { data: FocusData; date: string }) {
  const items = data.items.filter((item) => item.date === date);
  const timed = items.filter((item) => item.time);
  const slots = data.free_slots.filter((slot) => slot.date === date);
  const untimedTodo = items.filter((item) => !item.time && item.group === 'todo');
  const untimedOther = items.filter((item) => !item.time && item.group !== 'todo');

  type Row = { at: string; node: ReactNode };
  const rows: Row[] = [
    ...timed.map((item) => ({
      at: item.time!,
      node: <FocusItemRow key={item.key} item={item} today={data.range.today} />,
    })),
    ...slots.map((slot) => ({
      at: slot.start,
      node: (
        <li
          key={`slot-${slot.start}`}
          className="mx-1.5 my-1 rounded-control border border-dashed border-tr-border px-2 py-1 text-xs text-tr-muted"
        >
          Trống {slot.start}–{slot.end} · {Math.round((slot.minutes / 60) * 10) / 10} giờ có thể làm
          việc tập trung
        </li>
      ),
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section aria-label="Theo giờ">
        <h3 className="mb-1 text-xs font-semibold text-tr-subtle">Theo giờ</h3>
        {rows.length === 0 ? (
          <p className="py-3 text-sm text-tr-muted">Không có lịch theo giờ.</p>
        ) : (
          <ul>{rows.map((row) => row.node)}</ul>
        )}
      </section>
      <section aria-label="Trong ngày">
        <h3 className="mb-1 text-xs font-semibold text-tr-subtle">
          Phải làm trong ngày <span className="text-tr-muted">({untimedTodo.length})</span>
        </h3>
        {untimedTodo.length === 0 ? (
          <p className="py-3 text-sm text-tr-muted">Không có việc đến hạn.</p>
        ) : (
          <ul className="divide-y divide-tr-border">
            {untimedTodo.map((item) => (
              <FocusItemRow key={item.key} item={item} today={data.range.today} />
            ))}
          </ul>
        )}
        {untimedOther.length > 0 && (
          <>
            <h3 className="mt-3 mb-1 text-xs font-semibold text-tr-subtle">Mốc & sự kiện</h3>
            <ul className="divide-y divide-tr-border">
              {untimedOther.map((item) => (
                <FocusItemRow key={item.key} item={item} today={data.range.today} />
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

/* ---------- Tuan / toi 14 ngay: moi ngay mot cot ---------- */

function loadLabel(day: DayLoad | undefined): string | null {
  if (!day || (day.task_count === 0 && day.meeting_minutes === 0)) return null;
  return `${day.load_hours} giờ`;
}

function ColumnsView({ data }: { data: FocusData }) {
  const { over, props } = useDayDrop(data);
  const days = eachDay(data.range.from, data.range.to);
  const loadByDate = new Map(data.days.map((day) => [day.date, day]));
  return (
    /* Mot tuan chia deu be ngang (cot hep thi tieu de cat ngan, van doc duoc qua
       tooltip); dai hon 7 ngay moi cho cuon ngang thay vi ep cot qua hep. */
    <div
      className={`flex flex-col gap-1.5 md:grid md:pb-1 ${
        days.length <= 7
          ? 'md:grid-cols-[repeat(var(--focus-days),minmax(0,1fr))]'
          : 'md:auto-cols-[minmax(120px,1fr)] md:grid-flow-col md:overflow-x-auto'
      }`}
      style={{ '--focus-days': days.length } as CSSProperties}
    >
      {days.map((date) => {
        const items = data.items.filter((item) => item.date === date);
        const load = loadByDate.get(date);
        const isToday = date === data.range.today;
        const past = date < data.range.today;
        return (
          <section
            key={date}
            aria-label={`${weekdayLong(date)} ${dayMonth(date)}`}
            {...props(date)}
            className={`flex min-h-24 min-w-0 flex-col rounded-panel border p-1.5 transition ${
              over === date
                ? 'border-tr-primary bg-tr-primary/5'
                : isToday
                  ? 'border-tr-primary/50 bg-tr-panel'
                  : load && !load.is_workday
                    ? 'border-tr-border bg-tr-hover/50'
                    : 'border-tr-border bg-tr-panel'
            } ${past ? 'opacity-80' : ''}`}
          >
            <header className="mb-1 flex items-baseline justify-between gap-1 px-1">
              <span
                className={`text-xs font-semibold ${isToday ? 'text-tr-primary' : 'text-tr-subtle'}`}
              >
                {weekdayShort(date)} {dayMonth(date)}
              </span>
              {loadLabel(load) && (
                <span
                  className={`text-[11px] tabular-nums ${load?.overloaded ? 'font-semibold text-tr-danger' : 'text-tr-muted'}`}
                  title="Ước tính giờ việc + giờ họp"
                >
                  {loadLabel(load)}
                </span>
              )}
            </header>
            {items.length === 0 ? (
              <p className="px-1 py-2 text-xs text-tr-muted">—</p>
            ) : (
              <ul className="space-y-1">
                {items.map((item) => (
                  <FocusChip key={item.key} item={item} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Muc thu gon trong o ngay — chi icon, gio va tieu de. */
function FocusChip({ item }: { item: AgendaItem }) {
  const open = useOpenItem();
  const { complete, pending } = useFocusActions();
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const movable = canReschedule(item);
  return (
    <li
      draggable={movable}
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, item.key);
        event.dataTransfer.effectAllowed = 'move';
      }}
      className={`group flex min-w-0 items-center gap-1 rounded-control border px-1 py-0.5 text-xs ${
        item.overdue
          ? 'border-tr-danger/30 bg-tr-danger/5'
          : item.group === 'milestone'
            ? 'border-tr-warning/30 bg-tr-warning/5'
            : 'border-tr-border bg-tr-panel'
      } ${item.done ? 'opacity-60' : ''} ${movable ? 'cursor-grab' : ''}`}
    >
      {canComplete(item) ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => complete(item)}
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-tr-border text-transparent hover:border-tr-success hover:text-tr-success print:hidden ${focusRing}`}
          aria-label={`Đánh dấu xong: ${item.title}`}
          title="Đánh dấu xong"
        >
          <Check size={10} aria-hidden="true" />
        </button>
      ) : (
        <Icon size={12} className={`shrink-0 ${meta.tone}`} aria-label={meta.label} />
      )}
      <button
        type="button"
        onClick={() => open(item)}
        className={`min-w-0 flex-1 truncate text-left ${item.done ? 'line-through' : ''} ${focusRing}`}
        title={`${meta.label}: ${item.title}${item.meta ? ` — ${item.meta}` : ''}`}
      >
        {item.time && <span className="mr-1 text-tr-muted tabular-nums">{item.time}</span>}
        <span className="text-tr-text">{item.title}</span>
      </button>
    </li>
  );
}

/* ---------- Thang / khoang dai: luoi lich ---------- */

function GridView({ data }: { data: FocusData }) {
  const { over, props } = useDayDrop(data);
  const { from, to, today } = data.range;
  const [selected, setSelected] = useState<string>(from <= today && today <= to ? today : from);
  const loadByDate = new Map(data.days.map((day) => [day.date, day]));

  /* Luoi bat dau tu thu Hai va ket thuc o Chu nhat de cot luon dung thu. */
  const start = (() => {
    const dow = new Date(`${from}T00:00:00`).getDay();
    return addDays(from, dow === 0 ? -6 : 1 - dow);
  })();
  const end = (() => {
    const dow = new Date(`${to}T00:00:00`).getDay();
    return addDays(to, dow === 0 ? 0 : 7 - dow);
  })();
  const cells = eachDay(start, end);
  const maxLoad = Math.max(1, ...data.days.map((day) => day.load_hours));
  const selectedItems = data.items.filter((item) => item.date === selected);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-1">
        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((label) => (
          <div
            key={label}
            aria-hidden="true"
            className="px-1 text-center text-xs font-semibold text-tr-muted"
          >
            {label}
          </div>
        ))}
        {cells.map((date) => {
          const inRange = date >= from && date <= to;
          if (!inRange) return <div key={date} aria-hidden="true" className="min-h-16" />;
          const items = data.items.filter((item) => item.date === date);
          const load = loadByDate.get(date);
          const heat = load ? Math.min(1, load.load_hours / maxLoad) : 0;
          const milestones = items.filter((item) => item.group === 'milestone').length;
          const overdue = items.some((item) => item.overdue);
          return (
            <button
              key={date}
              type="button"
              aria-pressed={selected === date}
              aria-label={`${weekdayLong(date)} ${dayMonth(date)}: ${items.length} mục`}
              onClick={() => setSelected(date)}
              {...props(date)}
              className={`relative flex min-h-16 min-w-0 flex-col items-stretch overflow-hidden rounded-control border p-1 text-left transition sm:min-h-20 ${focusRing} ${
                over === date
                  ? 'border-tr-primary bg-tr-primary/10'
                  : selected === date
                    ? 'border-tr-primary'
                    : 'border-tr-border hover:border-tr-primary/40'
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute inset-0 ${load?.overloaded ? 'bg-tr-danger' : 'bg-tr-primary'}`}
                style={{ opacity: heat * 0.14 }}
              />
              <span className="relative flex items-center justify-between gap-1">
                <span
                  className={`text-xs font-semibold tabular-nums ${date === today ? 'rounded-full bg-tr-primary px-1.5 text-tr-on-primary' : 'text-tr-subtle'}`}
                >
                  {Number(date.slice(8, 10))}
                </span>
                <span className="flex gap-0.5">
                  {overdue && (
                    <span className="h-1.5 w-1.5 rounded-full bg-tr-danger" title="Có việc trễ" />
                  )}
                  {milestones > 0 && (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-tr-warning"
                      title="Có mốc kinh doanh"
                    />
                  )}
                </span>
              </span>
              <span className="relative mt-0.5 hidden min-w-0 space-y-0.5 sm:block">
                {items.slice(0, 2).map((item) => (
                  <span key={item.key} className="block truncate text-[11px] text-tr-text">
                    {item.title}
                  </span>
                ))}
              </span>
              {items.length > 0 && (
                <span className="relative mt-auto text-[11px] text-tr-muted tabular-nums">
                  {/* Man hep an tieu de nen dem tong; man rong da hien 2 tieu de dau. */}
                  <span className="sm:hidden">{items.length} mục</span>
                  {items.length > 2 && (
                    <span className="hidden sm:inline">+{items.length - 2} mục khác</span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <section aria-label={`Chi tiết ${dayMonth(selected)}`}>
        <h3 className="mb-1 text-xs font-semibold text-tr-subtle">
          {weekdayLong(selected)} {dayMonth(selected)}{' '}
          <span className="text-tr-muted">({selectedItems.length})</span>
        </h3>
        {selectedItems.length === 0 ? (
          <p className="py-2 text-sm text-tr-muted">Ngày này trống.</p>
        ) : (
          <ul className="divide-y divide-tr-border">
            {selectedItems.map((item) => (
              <FocusItemRow key={item.key} item={item} today={today} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
