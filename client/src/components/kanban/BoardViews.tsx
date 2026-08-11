import { CalendarDays, ChevronDown, GanttChartSquare, Table2, Trello } from 'lucide-react';
import { Popover, PopoverItem, usePopover } from '../common/Popover';
import { t } from '../../i18n/vi';

export type BoardViewMode = 'board' | 'calendar' | 'timeline' | 'table';

export const BOARD_VIEWS: { value: BoardViewMode; label: string; icon: typeof Trello }[] = [
  { value: 'board', label: 'Bảng', icon: Trello },
  { value: 'calendar', label: t.nav.calendar, icon: CalendarDays },
  { value: 'timeline', label: t.nav.timeline, icon: GanttChartSquare },
  { value: 'table', label: 'Bảng tính', icon: Table2 },
];

/**
 * Chip đổi dạng xem cạnh tên bảng — chuyển ngay trong bảng hiện tại,
 * không điều hướng sang trang khác.
 */
export function BoardViewChip({
  value,
  onChange,
}: {
  value: BoardViewMode;
  onChange: (mode: BoardViewMode) => void;
}) {
  const pop = usePopover();
  const current = BOARD_VIEWS.find((v) => v.value === value)!;
  const Icon = current.icon;

  return (
    <>
      <button
        onClick={pop.toggle}
        className="inline-flex items-center gap-1.5 rounded px-2 py-1.5 text-sm font-medium text-white transition hover:bg-white/20"
        title="Đổi dạng xem của bảng này"
      >
        <Icon size={16} />
        {current.label}
        <ChevronDown size={13} />
      </button>
      <Popover open={pop.open} anchor={pop.anchor} onClose={pop.close} title="Dạng xem" width={240}>
        {BOARD_VIEWS.map(({ value: mode, label, icon: ItemIcon }) => (
          <PopoverItem
            key={mode}
            icon={<ItemIcon size={15} />}
            onClick={() => {
              onChange(mode);
              pop.close();
            }}
          >
            <span className={mode === value ? 'font-semibold text-tr-primary' : ''}>{label}</span>
          </PopoverItem>
        ))}
      </Popover>
    </>
  );
}

/** Thanh dock nổi dưới đáy bảng — đổi dạng xem tại chỗ. */
export function BoardViewDock({
  value,
  onChange,
}: {
  value: BoardViewMode;
  onChange: (mode: BoardViewMode) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center">
      <nav className="tr-popover-shadow pointer-events-auto flex items-center gap-1 rounded-lg border border-tr-border bg-tr-panel p-1">
        {BOARD_VIEWS.map(({ value: mode, label, icon: Icon }) => (
          <button
            key={mode}
            onClick={() => onChange(mode)}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition ${
              value === mode
                ? 'bg-tr-hover font-medium text-tr-primary'
                : 'text-tr-subtle hover:bg-tr-hover'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
