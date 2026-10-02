import { useNavigate } from 'react-router';
import {
  Bell,
  CalendarClock,
  Check,
  CirclePause,
  FileText,
  Award,
  Flag,
  Gift,
  FlaskConical,
  FolderKanban,
  ListTodo,
  Milestone,
  NotebookPen,
  PhoneCall,
  Receipt,
  RefreshCcw,
  StickyNote,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { formatVNDShort } from '../../lib/format';
import { useUiStore } from '../../stores/uiStore';
import { PriorityBadge, focusRing } from '../common/ui';
import { addDays } from '../../lib/format';
import type { AgendaItem, AgendaKind } from './focusTypes';
import { dayMonth, nextMonday } from './focusPeriod';
import { canComplete, canReschedule, useFocusActions } from './useFocusActions';

export const KIND_META: Record<AgendaKind, { icon: LucideIcon; label: string; tone: string }> = {
  card: { icon: ListTodo, label: 'Công việc', tone: 'text-tr-primary' },
  reminder: { icon: Bell, label: 'Nhắc hẹn', tone: 'text-tr-warning' },
  quick_note: { icon: StickyNote, label: 'Ghi chú nhanh', tone: 'text-tr-warning' },
  next_action: { icon: PhoneCall, label: 'Hành động cơ hội', tone: 'text-tr-success' },
  event: { icon: CalendarClock, label: 'Lịch', tone: 'text-tr-primary' },
  meeting_note: { icon: NotebookPen, label: 'Biên bản họp', tone: 'text-tr-primary' },
  poc: { icon: FlaskConical, label: 'PoC', tone: 'text-tr-success' },
  deal_event: { icon: Flag, label: 'Sự kiện khách hàng', tone: 'text-tr-warning' },
  deal_close: { icon: Target, label: 'Dự kiến chốt', tone: 'text-tr-success' },
  hold_review: { icon: CirclePause, label: 'Xem lại tạm dừng', tone: 'text-tr-muted' },
  contract_end: { icon: FileText, label: 'Hợp đồng hết hạn', tone: 'text-tr-danger' },
  quote_expiry: { icon: Receipt, label: 'Báo giá hết hiệu lực', tone: 'text-tr-warning' },
  service_end: { icon: RefreshCcw, label: 'Dịch vụ đến hạn', tone: 'text-tr-warning' },
  board_milestone: { icon: Milestone, label: 'Hạn giai đoạn', tone: 'text-tr-primary' },
  project_end: { icon: FolderKanban, label: 'Kết thúc dự án', tone: 'text-tr-primary' },
  birthday: { icon: Gift, label: 'Sinh nhật khách', tone: 'text-tr-success' },
  contract_anniversary: { icon: Award, label: 'Kỷ niệm hợp đồng', tone: 'text-tr-success' },
};

/** Duong dan mo chi tiet; `null` = mo the cong viec (card) hoac khong co trang rieng. */
export function itemLink(item: AgendaItem): string | null {
  switch (item.kind) {
    case 'next_action':
    case 'deal_close':
    case 'poc':
    case 'hold_review':
    case 'deal_event':
      return item.deal_id ? `/deals/${item.deal_id}` : null;
    case 'contract_end':
      return '/contracts';
    case 'quote_expiry':
    case 'service_end':
    case 'contract_anniversary':
      return item.customer_id ? `/customers/${item.customer_id}` : null;
    case 'birthday':
      return item.customer_id ? `/customers/${item.customer_id}?contact=${item.id}` : null;
    case 'event':
      return '/calendar';
    case 'meeting_note':
      return item.deal_id
        ? `/deals/${item.deal_id}`
        : item.project_id
          ? `/projects/${item.project_id}`
          : '/calendar';
    case 'board_milestone':
      return `/boards/${item.id}`;
    case 'project_end':
      return `/projects/${item.id}`;
    case 'reminder':
      return item.card_id ? null : item.deal_id ? `/deals/${item.deal_id}` : '/calendar';
    default:
      return null;
  }
}

export function useOpenItem() {
  const navigate = useNavigate();
  const openCard = useUiStore((state) => state.openCard);
  return (item: AgendaItem) => {
    if (item.card_id) {
      openCard(item.card_id);
      return;
    }
    const link = itemLink(item);
    if (link) void navigate(link);
  };
}

/** Chuoi gio / ngay hien ben phai mot muc. */
function whenLabel(item: AgendaItem, showDate: boolean): string {
  const time = item.time ? (item.end_time ? `${item.time}–${item.end_time}` : item.time) : '';
  return [showDate ? dayMonth(item.date) : '', time].filter(Boolean).join(' ');
}

export const DRAG_TYPE = 'application/x-focus-item';

export function FocusItemRow({
  item,
  today,
  showDate = false,
  compact = false,
}: {
  item: AgendaItem;
  today: string;
  showDate?: boolean;
  compact?: boolean;
}) {
  const open = useOpenItem();
  const { complete, reschedule, pending } = useFocusActions();
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const movable = canReschedule(item);
  const when = whenLabel(item, showDate);

  const moveTargets: { label: string; date: string }[] = movable
    ? [
        ...(item.date < today ? [{ label: 'Hôm nay', date: today }] : []),
        { label: 'Mai', date: addDays(item.date < today ? today : item.date, 1) },
        { label: 'Tuần sau', date: nextMonday(today) },
      ].filter((target) => target.date !== item.date)
    : [];

  return (
    <li
      className={`group relative flex min-w-0 items-start gap-2 rounded-control px-1.5 py-1.5 transition hover:bg-tr-hover ${item.done ? 'opacity-60' : ''}`}
      draggable={movable}
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, item.key);
        event.dataTransfer.effectAllowed = 'move';
      }}
    >
      {canComplete(item) ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => complete(item)}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-tr-border text-transparent transition hover:border-tr-success hover:text-tr-success print:hidden ${focusRing}`}
          aria-label={`Đánh dấu xong: ${item.title}`}
          title="Đánh dấu xong"
        >
          <Check size={12} aria-hidden="true" />
        </button>
      ) : (
        <span
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center ${meta.tone}`}
          title={meta.label}
        >
          {item.done ? (
            <Check size={14} className="text-tr-success" aria-hidden="true" />
          ) : (
            <Icon size={14} aria-hidden="true" />
          )}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => open(item)}
          className={`block w-full min-w-0 rounded-control text-left ${focusRing}`}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {canComplete(item) && (
              <Icon size={13} className={`shrink-0 ${meta.tone}`} aria-label={meta.label} />
            )}
            <span
              className={`truncate text-sm font-medium text-tr-text ${item.done ? 'line-through' : ''}`}
              title={item.title}
            >
              {item.title}
            </span>
            {item.priority && (item.priority === 'urgent' || item.priority === 'high') && (
              <PriorityBadge priority={item.priority} small />
            )}
          </span>
          {!compact && (item.meta || item.slip_count > 1 || item.blocked || item.value_vnd) && (
            <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-tr-muted">
              {item.meta && <span className="truncate">{item.meta}</span>}
              {item.value_vnd ? (
                <span className="font-medium text-tr-subtle">{formatVNDShort(item.value_vnd)}</span>
              ) : null}
              {item.slip_count > 1 && (
                <span className="text-tr-warning">lùi hạn {item.slip_count} lần</span>
              )}
              {item.blocked && <span className="text-tr-danger">đang bị chặn</span>}
            </span>
          )}
        </button>
        {moveTargets.length > 0 && (
          /* Man hinh cam ung: mot hang nut duoi tieu de. Co chuot: noi len goc phai
           khi re chuot / focus vao dong, khong chiem cho cua tieu de khi an. */
          <span className="mt-1 flex gap-1 print:hidden hoverable:absolute hoverable:right-1.5 hoverable:bottom-1 hoverable:mt-0 hoverable:rounded-control hoverable:bg-tr-panel hoverable:p-0.5 hoverable:opacity-0 hoverable:shadow-sm hoverable:group-focus-within:opacity-100 hoverable:group-hover:opacity-100">
            {moveTargets.map((target) => (
              <button
                key={target.label}
                type="button"
                disabled={pending}
                onClick={() => reschedule(item, target.date)}
                className={`rounded-full border border-tr-border px-1.5 py-0.5 text-[11px] leading-none text-tr-subtle transition hover:border-tr-primary/40 hover:text-tr-primary ${focusRing}`}
                aria-label={`Dời “${item.title}” sang ${target.label.toLowerCase()}`}
              >
                {target.label}
              </button>
            ))}
          </span>
        )}
      </div>

      {(when || item.overdue) && (
        <span
          className={`shrink-0 text-xs font-medium tabular-nums ${item.overdue ? 'text-tr-danger' : 'text-tr-muted'}`}
        >
          {when || 'trễ'}
        </span>
      )}
    </li>
  );
}
