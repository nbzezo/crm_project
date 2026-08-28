import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Check, Circle, Ellipsis, PanelRightOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { PRIORITY_ORDER, t } from '../../i18n/vi';
import { formatDate } from '../../lib/format';
import type { BoardFull, Label, List, Priority, TaskRow } from '../../types';
import { Popover, PopoverItem, usePopover } from '../common/Popover';
import { focusRing } from '../common/ui';

const DAY_MS = 86_400_000;

function localDay(value?: string | null): Date | null {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function daysFromToday(value?: string | null): number | null {
  const date = localDay(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / DAY_MS);
}

export function normalizeTaskText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi');
}

/*
 * `isReviewStatus()` và `statusClasses()` đã bị xóa ở v19.
 *
 * Cả hai đoán trạng thái công việc từ *tên cột* — một nguồn sự thật thứ hai bên
 * cạnh `cards.status`, và luôn sai với bảng đặt tên cột theo cách khác. Nay cột
 * tự khai báo nó nghĩa là gì (`lists.status_mapping`), nên trạng thái đọc thẳng
 * từ `card.status` và không còn gì để đoán.
 */

const priorityClasses: Record<Priority, string> = {
  urgent: 'border-priority-urgent/35 bg-priority-urgent/15 text-priority-urgent',
  high: 'border-priority-high/35 bg-priority-high/15 text-priority-high',
  medium: 'border-priority-medium/35 bg-priority-medium/15 text-priority-medium',
  low: 'border-priority-low/35 bg-priority-low/15 text-priority-low',
};

export function PrioritySelect({
  value,
  onChange,
  taskTitle,
  disabled,
}: {
  value: Priority;
  onChange: (value: Priority) => void;
  taskTitle: string;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as Priority)}
      aria-label={`${t.card.priority}: ${taskTitle}`}
      className={`min-h-6 max-w-28 cursor-pointer rounded-full border px-2 text-xs font-semibold outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-tr-primary disabled:cursor-wait disabled:opacity-60 ${priorityClasses[value]}`}
    >
      {PRIORITY_ORDER.map((priority) => (
        <option key={priority} value={priority} className="bg-tr-panel text-tr-text">
          {t.priority[priority]}
        </option>
      ))}
    </select>
  );
}

/**
 * Ô chọn **danh sách** (cột Kanban) của một công việc.
 *
 * Trước v19 ô này mang nhãn "Trạng thái" và tự đoán màu từ *tên cột* — một
 * nguồn sự thật thứ hai bên cạnh `cards.status`. Nay nó đúng nghĩa là chọn cột;
 * cột nào khai báo ánh xạ thì đổi cột kéo theo trạng thái, và máy chủ lo việc đó.
 */
export function StatusSelect({
  task,
  lists,
  onChange,
  disabled,
}: {
  task: TaskRow;
  lists: Pick<List, 'id' | 'name' | 'status_mapping'>[];
  onChange: (listId: number) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={task.list_id}
      disabled={disabled || lists.length === 0}
      onChange={(event) => onChange(Number(event.target.value))}
      aria-label={`Danh sách: ${task.title}`}
      title={`${task.board_name} · ${task.list_name}`}
      className={`min-h-6 max-w-36 cursor-pointer rounded-full border border-tr-border bg-tr-hover px-2 text-xs font-medium text-tr-subtle outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-tr-primary disabled:cursor-default disabled:opacity-80`}
    >
      {lists.length === 0 && <option value={task.list_id}>{task.list_name}</option>}
      {lists.map((list) => (
        <option key={list.id} value={list.id} className="bg-tr-panel text-tr-text">
          {list.name}
        </option>
      ))}
    </select>
  );
}

export type DeadlineTone = 'danger' | 'warning' | 'soon' | 'normal' | 'done';

/** Presentation thuần để bảng, dashboard và tooltip dùng cùng một cách diễn đạt deadline. */
export function getDeadlinePresentation(value: string | null, isDone: boolean) {
  const difference = daysFromToday(value);
  if (!value || difference === null)
    return { primary: '—', secondary: '', tone: 'normal' as const };
  if (isDone) return { primary: formatDate(value), secondary: '', tone: 'done' as const };
  if (difference < 0) {
    return {
      primary: `Quá hạn ${Math.abs(difference)} ngày`,
      secondary: formatDate(value),
      tone: 'danger' as const,
    };
  }
  if (difference === 0)
    return { primary: 'Hôm nay', secondary: formatDate(value), tone: 'danger' as const };
  if (difference === 1)
    return { primary: 'Ngày mai', secondary: formatDate(value), tone: 'warning' as const };
  if (difference <= 7) {
    return {
      primary: `Còn ${difference} ngày`,
      secondary: formatDate(value),
      tone: 'soon' as const,
    };
  }
  return { primary: formatDate(value), secondary: '', tone: 'normal' as const };
}

const deadlineClasses: Record<DeadlineTone, string> = {
  danger: 'text-tr-danger',
  warning: 'text-tr-warning',
  soon: 'text-tr-warning',
  normal: 'text-tr-subtle',
  done: 'text-tr-muted',
};

export function SmartDeadline({
  value,
  isDone,
  onChange,
  taskTitle,
  disabled,
}: {
  value: string | null;
  isDone: boolean;
  onChange: (value: string | null) => void;
  taskTitle: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const presentation = getDeadlinePresentation(value, isDone);

  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value || null);
          setEditing(false);
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => event.key === 'Escape' && setEditing(false)}
        aria-label={`Hạn hoàn thành: ${taskTitle}`}
        className="h-8 w-32 rounded-control border border-tr-primary bg-tr-panel px-1.5 text-xs text-tr-text outline-none focus:ring-1 focus:ring-tr-primary"
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setEditing(true)}
      title={
        value ? `Hạn hoàn thành: ${formatDate(value)}. Bấm để thay đổi.` : 'Thêm hạn hoàn thành'
      }
      className={`min-w-24 rounded-control border border-transparent px-1.5 py-0.5 text-left text-xs leading-tight transition hover:border-tr-border hover:bg-tr-hover disabled:cursor-wait disabled:opacity-60 ${focusRing} ${deadlineClasses[presentation.tone]}`}
    >
      <span
        className={
          presentation.tone === 'normal' || presentation.tone === 'done'
            ? 'font-normal'
            : 'font-semibold'
        }
      >
        {presentation.primary}
      </span>
      {presentation.secondary && (
        <span className="mt-0.5 block text-xs font-normal tabular-nums text-tr-muted">
          {presentation.secondary}
        </span>
      )}
    </button>
  );
}

export function LabelTags({ labels, limit = 2 }: { labels: Label[]; limit?: number }) {
  if (labels.length === 0) return <span className="text-xs text-tr-muted">—</span>;
  const shown = labels.slice(0, limit);
  return (
    <span className="flex max-w-40 items-center gap-1 overflow-hidden">
      {shown.map((label) => (
        <span
          key={label.id}
          title={label.name}
          className="inline-flex min-h-5 min-w-0 items-center gap-1 rounded-full border border-tr-border bg-tr-hover px-1.5 text-xs font-medium text-tr-subtle"
        >
          <span
            aria-hidden="true"
            className="h-2.5 w-0.5 shrink-0 rounded-full"
            style={{ backgroundColor: label.color }}
          />
          <span className="truncate">{label.name}</span>
        </span>
      ))}
      {labels.length > limit && (
        <span
          className="shrink-0 text-xs text-tr-muted"
          title={labels
            .slice(limit)
            .map((label) => label.name)
            .join(', ')}
        >
          +{labels.length - limit}
        </span>
      )}
    </span>
  );
}

export function useTaskBoardLists(tasks: TaskRow[]): Map<number, List[]> {
  const boardIds = useMemo(() => [...new Set(tasks.map((task) => task.board_id))], [tasks]);
  const queries = useQueries({
    queries: boardIds.map((boardId) => ({
      queryKey: ['board', boardId],
      queryFn: () => api.get<BoardFull>(`/api/boards/${boardId}/full`),
      staleTime: 60_000,
    })),
  });

  return useMemo(() => {
    const map = new Map<number, List[]>();
    boardIds.forEach((boardId, index) => map.set(boardId, queries[index]?.data?.lists ?? []));
    return map;
  }, [boardIds, queries]);
}

export function TaskRowActions({
  task,
  onOpen,
  onToggleDone,
  onDelete,
  onEditTitle,
  onAddSubtask,
}: {
  task: TaskRow;
  onOpen: () => void;
  onToggleDone: () => void;
  onDelete: () => void;
  onEditTitle?: () => void;
  onAddSubtask?: () => void;
}) {
  const menu = usePopover();
  return (
    <>
      <div className="flex items-center justify-end gap-0.5">
        <button
          type="button"
          onClick={onToggleDone}
          title={task.is_done ? t.card.markUndone : t.card.markDone}
          aria-label={`${task.is_done ? t.card.markUndone : t.card.markDone}: ${task.title}`}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-control text-tr-subtle transition hover:bg-tr-hover-strong hover:text-tr-success fine:h-8 fine:w-8 ${focusRing}`}
        >
          {task.is_done ? (
            <Circle size={15} aria-hidden="true" />
          ) : (
            <Check size={15} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={onOpen}
          title="Mở chi tiết"
          aria-label={`Mở chi tiết: ${task.title}`}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-control text-tr-subtle transition hover:bg-tr-hover-strong hover:text-tr-text fine:h-8 fine:w-8 ${focusRing}`}
        >
          <PanelRightOpen size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={menu.toggle}
          title="Thao tác khác"
          aria-label={`Thao tác khác: ${task.title}`}
          aria-haspopup="dialog"
          className={`inline-flex h-9 w-9 items-center justify-center rounded-control text-tr-subtle transition hover:bg-tr-hover-strong hover:text-tr-text fine:h-8 fine:w-8 ${focusRing}`}
        >
          <Ellipsis size={16} aria-hidden="true" />
        </button>
      </div>

      <Popover
        open={menu.open}
        anchor={menu.anchor}
        onClose={menu.close}
        title="Thao tác công việc"
        width={248}
      >
        <PopoverItem
          onClick={() => {
            menu.close();
            onOpen();
          }}
          icon={<PanelRightOpen size={15} />}
        >
          Mở chi tiết
        </PopoverItem>
        {onEditTitle && (
          <PopoverItem
            onClick={() => {
              menu.close();
              onEditTitle();
            }}
            icon={<Pencil size={15} />}
          >
            Sửa tên tại chỗ
          </PopoverItem>
        )}
        {onAddSubtask && (
          <PopoverItem
            onClick={() => {
              menu.close();
              onAddSubtask();
            }}
            icon={<Plus size={15} />}
          >
            Thêm việc con
          </PopoverItem>
        )}
        <PopoverItem
          onClick={() => {
            menu.close();
            onToggleDone();
          }}
          icon={task.is_done ? <Circle size={15} /> : <Check size={15} />}
        >
          {task.is_done ? t.card.markUndone : t.card.markDone}
        </PopoverItem>
        <div className="my-2 border-t border-tr-border" />
        <PopoverItem
          danger
          onClick={() => {
            menu.close();
            onDelete();
          }}
          icon={<Trash2 size={15} />}
        >
          {t.common.delete}
        </PopoverItem>
      </Popover>
    </>
  );
}
