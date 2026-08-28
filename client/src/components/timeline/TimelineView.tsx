import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { addDays, differenceInCalendarDays, eachDayOfInterval, format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { PRIORITY_COLORS, PRIORITY_ORDER, t } from '../../i18n/vi';
import { contrastInk, formatDate, todayStr } from '../../lib/format';
import type { TimelineDependency, TimelineItem } from '../../types';
import { EmptyState, focusRing } from '../common/ui';

export type Zoom = 'week' | 'month' | 'quarter';

const BASE_DAY_WIDTH: Record<Zoom, number> = { week: 36, month: 14, quarter: 5 };
const DEFAULT_LABEL_WIDTH = 320;
const MIN_LABEL_WIDTH = 280;
const MAX_LABEL_WIDTH = 420;
const HEADER_HEIGHT = 64;
const GROUP_HEIGHT = 36;
const ROW_HEIGHT = 36;
const TOOLTIP_WIDTH = 296;

interface TimelineGroup {
  key: string;
  name: string;
  items: TimelineItem[];
}

interface TooltipPosition {
  left: number;
  top: number;
  width: number;
  placement: 'above' | 'below';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function progressFor(item: TimelineItem): number | null {
  return typeof item.progress === 'number' ? clamp(item.progress, 0, 100) : null;
}

function TaskTooltip({
  item,
  overdueDays,
  position,
  tooltipId,
}: {
  item: TimelineItem;
  overdueDays: number;
  position: TooltipPosition;
  tooltipId: string;
}) {
  const progress = progressFor(item);
  const rows = [
    ['Bắt đầu', formatDate(item.start_date)],
    ['Kết thúc', formatDate(item.due_date)],
    [
      'Trạng thái',
      item.is_done ? 'Hoàn thành' : overdueDays > 0 ? 'Đang quá hạn' : 'Đang thực hiện',
    ],
    ['Ưu tiên', t.priority[item.priority]],
    ...(progress !== null ? [['Tiến độ', `${progress}%`]] : []),
    ...(item.customer_name ? [['Khách hàng', item.customer_name]] : []),
    ...(item.board_name ? [['Bảng / dự án', item.board_name]] : []),
  ];

  return createPortal(
    <div
      id={tooltipId}
      role="tooltip"
      className="pointer-events-none fixed z-tooltip rounded-panel border border-tr-border bg-tr-panel p-3 text-left shadow-[var(--tr-popover-shadow)]"
      style={{
        left: position.left,
        top: position.top,
        width: position.width,
        transform: position.placement === 'above' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
      }}
    >
      <p className="break-words text-sm font-semibold leading-5 text-tr-text">{item.title}</p>
      {overdueDays > 0 && (
        <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-tr-danger">
          <AlertTriangle size={13} aria-hidden="true" /> Quá hạn {overdueDays} ngày
        </p>
      )}
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-tr-muted">{label}</dt>
            <dd className="min-w-0 break-words text-right font-medium text-tr-subtle">{value}</dd>
          </div>
        ))}
      </dl>
    </div>,
    document.body
  );
}

const TimelineTaskBar = memo(function TimelineTaskBar({
  item,
  left,
  width,
  onOpenCard,
}: {
  item: TimelineItem;
  left: number;
  width: number;
  onOpenCard: (id: number) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);
  const today = todayStr();
  const overdueDays =
    !item.is_done && item.due_date < today
      ? differenceInCalendarDays(parseISO(today), parseISO(item.due_date))
      : 0;
  const progress = progressFor(item);
  /* Cờ `is_milestone` (v18) là khai báo tường minh; điều kiện một-ngày vẫn giữ
     làm suy đoán cho dữ liệu cũ chưa ai đánh dấu. */
  const milestone = !!item.is_milestone || item.start_date === item.due_date;
  const color = PRIORITY_COLORS[item.priority];
  const tooltipId = `timeline-task-${item.id}-tooltip`;

  const showTooltip = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const tooltipWidth = Math.min(TOOLTIP_WIDTH, Math.max(220, window.innerWidth - 16));
    const half = tooltipWidth / 2;
    const placement = rect.top > 190 ? 'above' : 'below';
    setTooltipPosition({
      left: clamp(rect.left + rect.width / 2, half + 8, window.innerWidth - half - 8),
      top: placement === 'above' ? rect.top - 8 : rect.bottom + 8,
      width: tooltipWidth,
      placement,
    });
  }, []);

  const hideTooltip = useCallback(() => setTooltipPosition(null), []);
  const accessibleState =
    overdueDays > 0 ? `, quá hạn ${overdueDays} ngày` : item.is_done ? ', đã hoàn thành' : '';

  if (milestone) {
    return (
      <>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => onOpenCard(item.id)}
          onMouseEnter={showTooltip}
          onMouseLeave={hideTooltip}
          onFocus={showTooltip}
          onBlur={hideTooltip}
          aria-describedby={tooltipPosition ? tooltipId : undefined}
          aria-label={`${item.title}, mốc ngày ${formatDate(item.start_date)}, ưu tiên ${t.priority[item.priority]}${accessibleState}`}
          className={`absolute top-2 h-5 w-5 rotate-45 cursor-pointer transition hover:scale-110 hover:brightness-110 ${focusRing} ${
            overdueDays > 0 ? 'ring-2 ring-tr-danger ring-offset-1 ring-offset-tr-panel' : ''
          }`}
          style={{
            left: left + Math.max(width / 2 - 10, 0),
            backgroundColor: color,
            borderRadius: 3,
          }}
        />
        {tooltipPosition && (
          <TaskTooltip
            item={item}
            overdueDays={overdueDays}
            position={tooltipPosition}
            tooltipId={tooltipId}
          />
        )}
      </>
    );
  }

  const label =
    width >= 150 && progress !== null
      ? `${item.title} ${progress}%`
      : width >= 72
        ? item.title
        : width >= 42 && progress !== null
          ? `${progress}%`
          : '';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => onOpenCard(item.id)}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        aria-describedby={tooltipPosition ? tooltipId : undefined}
        aria-label={`${item.title}, ${formatDate(item.start_date)} đến ${formatDate(item.due_date)}, ưu tiên ${t.priority[item.priority]}${progress !== null ? `, tiến độ ${progress}%` : ''}${accessibleState}`}
        className={`absolute top-1.5 flex min-h-6 cursor-pointer items-center overflow-hidden rounded-[5px] px-2 text-xs font-semibold transition hover:z-30 hover:brightness-110 ${focusRing} ${
          overdueDays > 0 ? 'ring-2 ring-inset ring-tr-danger' : ''
        }`}
        style={{
          left,
          width: Math.max(width, 8),
          backgroundColor: color,
          color: contrastInk(color),
        }}
      >
        {progress !== null && (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 bg-white/20"
            style={{ width: `${progress}%` }}
          />
        )}
        <span className="relative z-10 min-w-0 flex-1 truncate text-left">{label}</span>
        {overdueDays > 0 && width >= 30 && (
          <AlertTriangle aria-hidden="true" size={12} className="relative z-10 ml-1 shrink-0" />
        )}
      </button>
      {tooltipPosition && (
        <TaskTooltip
          item={item}
          overdueDays={overdueDays}
          position={tooltipPosition}
          tooltipId={tooltipId}
        />
      )}
    </>
  );
});

/**
 * Toa do cua tung thanh dang hien — dung de ve duong phu thuoc.
 *
 * Phai tinh cung mot cong thuc voi luc render thanh (GROUP_HEIGHT cho tieu de
 * nhom, ROW_HEIGHT cho moi dong, nhom thu gon thi khong chiem cho). Neu hai noi
 * tinh khac nhau thi duong noi se lech khoi thanh ma khong co gi bao loi.
 */
interface BarBox {
  left: number;
  right: number;
  centerY: number;
}

function layoutBars(
  groups: TimelineGroup[],
  collapsed: Set<string>,
  dayWidth: number,
  startDate: Date
): Map<number, BarBox> {
  const boxes = new Map<number, BarBox>();
  let y = 0;
  for (const group of groups) {
    y += GROUP_HEIGHT;
    if (collapsed.has(group.key)) continue;
    for (const item of group.items) {
      const rangeStart = item.start_date <= item.due_date ? item.start_date : item.due_date;
      const rangeEnd = item.start_date <= item.due_date ? item.due_date : item.start_date;
      const offset = differenceInCalendarDays(parseISO(rangeStart), startDate);
      const span = differenceInCalendarDays(parseISO(rangeEnd), parseISO(rangeStart)) + 1;
      boxes.set(item.id, {
        left: offset * dayWidth + 1,
        right: offset * dayWidth + Math.max(span * dayWidth - 2, 8),
        centerY: y + ROW_HEIGHT / 2,
      });
      y += ROW_HEIGHT;
    }
  }
  return boxes;
}

export function TimelineView({
  items,
  dependencies = [],
  zoom,
  onOpenCard,
  emptyMessage,
  emptyHint,
}: {
  items: TimelineItem[];
  dependencies?: TimelineDependency[];
  zoom: Zoom;
  onOpenCard: (id: number) => void;
  emptyMessage?: string;
  emptyHint?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [labelWidth, setLabelWidth] = useState(DEFAULT_LABEL_WIDTH);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const update = () =>
      setViewportWidth((current) => {
        const next = Math.round(element.clientWidth);
        return current === next ? current : next;
      });
    update();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { days, groups, startDate } = useMemo(() => {
    const allDates = items.flatMap((item) => [item.start_date, item.due_date]).filter(Boolean);
    const today = todayStr();
    const min = allDates.length ? allDates.reduce((a, b) => (a < b ? a : b)) : today;
    const max = allDates.length ? allDates.reduce((a, b) => (a > b ? a : b)) : today;
    const from = addDays(parseISO(min), -7);
    const to = addDays(parseISO(max), 14);
    const days = eachDayOfInterval({ start: from, end: to });

    const map = new Map<string, TimelineGroup>();
    for (const item of items) {
      const key = `${item.group_id}:${item.group_name}`;
      const group = map.get(key) ?? { key, name: item.group_name, items: [] };
      group.items.push(item);
      map.set(key, group);
    }
    return { days, groups: [...map.values()], startDate: from };
  }, [items]);

  const baseDayWidth = BASE_DAY_WIDTH[zoom];
  const dayWidth = Math.max(baseDayWidth, viewportWidth > 0 ? viewportWidth / days.length : 0);
  const timelineWidth = days.length * dayWidth;
  const todayIndex = differenceInCalendarDays(parseISO(todayStr()), startDate);
  const todayVisible = todayIndex >= 0 && todayIndex < days.length;

  /**
   * Đường nối từ mép phải việc trước sang mép trái việc sau, đi vòng theo hai
   * đoạn ngang + một đoạn dọc (kiểu Gantt) thay vì đường thẳng chéo — đường chéo
   * cắt qua các thanh khác và đọc rất khó khi có nhiều dòng.
   */
  const dependencyEdges = useMemo(() => {
    if (dependencies.length === 0) return [];
    const boxes = layoutBars(groups, collapsedGroups, dayWidth, startDate);
    const GAP = 8;
    return dependencies
      .map((edge) => {
        const from = boxes.get(edge.predecessor_id);
        const to = boxes.get(edge.successor_id);
        // Nhóm bị thu gọn thì thanh không tồn tại — bỏ cạnh đó thay vì vẽ vào hư không.
        if (!from || !to) return null;
        const midX = Math.max(from.right + GAP, to.left - GAP);
        return {
          from: edge.predecessor_id,
          to: edge.successor_id,
          violated: edge.violated === 1,
          path: `M ${from.right} ${from.centerY} H ${midX} V ${to.centerY} H ${to.left}`,
        };
      })
      .filter((edge): edge is NonNullable<typeof edge> => edge !== null);
  }, [dependencies, groups, collapsedGroups, dayWidth, startDate]);

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

  const scrollToToday = useCallback(() => {
    if (!scrollRef.current || !todayVisible) return;
    scrollRef.current.scrollTo({
      left: Math.max(0, todayIndex * dayWidth - scrollRef.current.clientWidth / 2),
      behavior: 'smooth',
    });
  }, [dayWidth, todayIndex, todayVisible]);

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const startLabelResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = labelWidth;
      const onMove = (moveEvent: globalThis.PointerEvent) => {
        setLabelWidth(
          clamp(startWidth + moveEvent.clientX - startX, MIN_LABEL_WIDTH, MAX_LABEL_WIDTH)
        );
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [labelWidth]
  );

  const resizeLabelWithKeyboard = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setLabelWidth((width) =>
      clamp(width + (event.key === 'ArrowRight' ? 16 : -16), MIN_LABEL_WIDTH, MAX_LABEL_WIDTH)
    );
  }, []);

  if (items.length === 0) {
    return (
      <EmptyState
        message={emptyMessage ?? t.timeline.noItems}
        hint={
          emptyHint ?? 'Đặt ngày bắt đầu và hạn cho công việc để chúng hiện trên dòng thời gian.'
        }
      />
    );
  }

  return (
    <div
      data-testid="timeline-grid"
      className="w-full min-w-0 overflow-hidden rounded-modal border border-tr-border bg-tr-panel shadow-sm"
    >
      <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2 border-b border-tr-border px-3 py-2">
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-tr-muted"
          aria-label="Chú giải mức ưu tiên"
        >
          {PRIORITY_ORDER.map((priority) => (
            <span key={priority} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: PRIORITY_COLORS[priority] }}
              />
              {t.priority[priority]}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-tr-danger" aria-hidden="true" /> Quá hạn
          </span>
        </div>
        <button
          type="button"
          onClick={scrollToToday}
          disabled={!todayVisible}
          title={
            todayVisible
              ? 'Đưa ngày hôm nay vào giữa màn hình'
              : 'Hôm nay nằm ngoài phạm vi đang hiển thị'
          }
          className={`ml-auto rounded-control px-2.5 py-1 text-xs font-medium text-tr-primary transition hover:bg-tr-hover disabled:cursor-not-allowed disabled:text-tr-muted disabled:opacity-60 ${focusRing}`}
        >
          {t.common.today}
        </button>
      </div>

      <div className="flex min-w-0">
        <div
          data-testid="timeline-label-column"
          className="relative shrink-0 border-r border-tr-border bg-tr-surface"
          style={{ width: labelWidth }}
        >
          <div
            className="flex items-end justify-between border-b border-tr-border px-4 pb-2"
            style={{ height: HEADER_HEIGHT }}
          >
            <span className="text-xs font-semibold tracking-wide text-tr-subtle uppercase">
              Công việc
            </span>
            <span className="text-xs text-tr-muted">{items.length}</span>
          </div>
          {groups.map((group) => {
            const collapsed = collapsedGroups.has(group.key);
            return (
              <div key={group.key}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={!collapsed}
                  title={group.name}
                  className={`flex w-full items-center gap-2 border-b border-tr-border bg-tr-hover-strong px-3 text-left text-xs font-semibold text-tr-text transition hover:brightness-110 ${focusRing}`}
                  style={{ height: GROUP_HEIGHT }}
                >
                  {collapsed ? (
                    <ChevronRight size={15} className="shrink-0 text-tr-muted" aria-hidden="true" />
                  ) : (
                    <ChevronDown size={15} className="shrink-0 text-tr-muted" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{group.name}</span>
                  <span className="shrink-0 rounded-full bg-tr-panel px-1.5 py-0.5 text-xs font-medium text-tr-muted">
                    {group.items.length}
                  </span>
                </button>
                {!collapsed &&
                  group.items.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => onOpenCard(item.id)}
                      className={`flex w-full items-center gap-2 border-b border-tr-border px-4 text-left text-xs text-tr-subtle transition hover:bg-tr-hover ${focusRing}`}
                      style={{ height: ROW_HEIGHT }}
                      title={item.title}
                    >
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: PRIORITY_COLORS[item.priority] }}
                      />
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      {progressFor(item) !== null && (
                        <span className="shrink-0 text-xs tabular-nums text-tr-muted">
                          {progressFor(item)}%
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            );
          })}

          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Thay đổi độ rộng cột công việc"
            aria-valuemin={MIN_LABEL_WIDTH}
            aria-valuemax={MAX_LABEL_WIDTH}
            aria-valuenow={labelWidth}
            tabIndex={0}
            onPointerDown={startLabelResize}
            onKeyDown={resizeLabelWithKeyboard}
            className={`absolute inset-y-0 -right-1 z-40 w-2 cursor-ew-resize touch-none bg-transparent transition hover:bg-tr-primary/40 ${focusRing}`}
          />
        </div>

        <div
          ref={scrollRef}
          data-testid="timeline-scroll"
          className="tr-scroll min-w-0 flex-1 overflow-x-auto"
        >
          <div
            data-testid="timeline-canvas"
            className="relative"
            style={{ width: timelineWidth, minWidth: '100%' }}
          >
            <div className="sticky top-0 z-20 bg-tr-panel" style={{ height: HEADER_HEIGHT }}>
              <div className="flex h-8 border-b border-tr-border">
                {months.map((month) => (
                  <div
                    key={month.label}
                    className="shrink-0 truncate border-r-2 border-tr-border px-2 text-xs leading-8 font-semibold text-tr-subtle capitalize"
                    style={{ width: month.span * dayWidth }}
                  >
                    {month.span * dayWidth > 70 ? month.label : ''}
                  </div>
                ))}
              </div>
              <div className="flex h-8 border-b border-tr-border">
                {days.map((day, index) => {
                  const weekend = day.getDay() === 0 || day.getDay() === 6;
                  const monthBoundary = day.getDate() === 1;
                  const weekBoundary = day.getDay() === 1;
                  return (
                    <div
                      key={format(day, 'yyyy-MM-dd')}
                      className={`shrink-0 border-r text-center text-xs leading-8 tabular-nums ${
                        weekend ? 'bg-tr-hover/60 text-tr-muted' : 'text-tr-subtle'
                      } ${index === todayIndex ? 'bg-tr-primary/10 font-bold text-tr-primary' : ''}`}
                      style={{
                        width: dayWidth,
                        borderRightColor: 'color-mix(in srgb, var(--tr-border) 55%, transparent)',
                        borderLeftColor:
                          monthBoundary || weekBoundary ? 'var(--tr-border)' : undefined,
                        borderLeftWidth: monthBoundary ? 2 : weekBoundary ? 1 : 0,
                      }}
                      title={format(day, 'EEEE, dd/MM/yyyy', { locale: vi })}
                    >
                      {dayWidth >= 24
                        ? format(day, 'EE d', { locale: vi })
                        : dayWidth >= 11
                          ? format(day, 'd')
                          : ''}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="relative">
              <div className="pointer-events-none absolute inset-0 flex" aria-hidden="true">
                {days.map((day, index) => {
                  const weekend = day.getDay() === 0 || day.getDay() === 6;
                  const monthBoundary = day.getDate() === 1;
                  const weekBoundary = day.getDay() === 1;
                  return (
                    <div
                      key={format(day, 'yyyy-MM-dd')}
                      className={`shrink-0 border-r ${weekend ? 'bg-tr-hover/35' : ''} ${
                        index === todayIndex ? 'bg-tr-primary/5' : ''
                      }`}
                      style={{
                        width: dayWidth,
                        borderRightColor: 'color-mix(in srgb, var(--tr-border) 38%, transparent)',
                        borderLeftColor:
                          monthBoundary || weekBoundary ? 'var(--tr-border)' : undefined,
                        borderLeftWidth: monthBoundary ? 2 : weekBoundary ? 1 : 0,
                      }}
                    />
                  );
                })}
              </div>

              {/* Đường phụ thuộc vẽ TRÊN lưới nhưng DƯỚI các thanh (z-10), và
                  pointer-events-none để không chặn click mở thẻ. */}
              {dependencyEdges.length > 0 && (
                <svg
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-[5] h-full w-full overflow-visible"
                >
                  {dependencyEdges.map((edge) => (
                    <path
                      key={`${edge.from}-${edge.to}`}
                      d={edge.path}
                      fill="none"
                      strokeWidth={edge.violated ? 2 : 1.25}
                      strokeDasharray={edge.violated ? undefined : '3 3'}
                      stroke={
                        edge.violated
                          ? 'var(--tr-danger)'
                          : 'color-mix(in srgb, var(--tr-muted) 70%, transparent)'
                      }
                    />
                  ))}
                </svg>
              )}

              <div className="relative z-10">
                {groups.map((group) => {
                  const collapsed = collapsedGroups.has(group.key);
                  return (
                    <div key={group.key}>
                      <div
                        className="border-b border-tr-border bg-tr-hover-strong/75"
                        style={{ height: GROUP_HEIGHT }}
                      />
                      {!collapsed &&
                        group.items.map((item) => {
                          const rangeStart =
                            item.start_date <= item.due_date ? item.start_date : item.due_date;
                          const rangeEnd =
                            item.start_date <= item.due_date ? item.due_date : item.start_date;
                          const offset = differenceInCalendarDays(parseISO(rangeStart), startDate);
                          const span =
                            differenceInCalendarDays(parseISO(rangeEnd), parseISO(rangeStart)) + 1;
                          return (
                            <div
                              key={item.id}
                              className="relative border-b border-tr-border/70"
                              style={{ height: ROW_HEIGHT }}
                            >
                              <TimelineTaskBar
                                item={item}
                                left={offset * dayWidth + 1}
                                width={Math.max(span * dayWidth - 2, 8)}
                                onOpenCard={onOpenCard}
                              />
                            </div>
                          );
                        })}
                    </div>
                  );
                })}
              </div>
            </div>

            {todayVisible && (
              <div
                className="pointer-events-none absolute inset-y-0 z-30 border-l-2 border-tr-primary/75"
                style={{ left: todayIndex * dayWidth + dayWidth / 2 }}
                aria-hidden="true"
              >
                <span className="absolute top-11 -translate-x-1/2 rounded-full border border-tr-primary/50 bg-tr-panel px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap text-tr-primary shadow-sm">
                  Hôm nay
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
