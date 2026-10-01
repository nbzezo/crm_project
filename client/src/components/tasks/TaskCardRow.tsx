import { Check, ChevronRight } from 'lucide-react';
import { useRef } from 'react';
import { formatDateShort } from '../../lib/format';
import { t } from '../../i18n/vi';
import type { TaskRow } from '../../types';
import { focusRing } from '../common/ui';

/** Hang the dung chung cho cac dang xem cong viec tren man hinh hep. */
export function TaskCardRow({
  task,
  onOpen,
  selected,
  onSelect,
  onComplete,
  selectionMode = false,
}: {
  task: TaskRow;
  onOpen: () => void;
  selected?: boolean;
  onSelect?: () => void;
  onComplete?: () => void;
  selectionMode?: boolean;
}) {
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const cancelHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  return (
    <article
      className="flex min-w-0 items-start gap-2 border-b border-tr-border bg-tr-panel px-3 py-2"
      onPointerDown={(event) => {
        if (!onSelect || event.pointerType === 'mouse') return;
        pointerStart.current = { x: event.clientX, y: event.clientY };
        held.current = false;
        holdTimer.current = setTimeout(() => {
          held.current = true;
          onSelect();
        }, 400);
      }}
      onPointerMove={(event) => {
        if (
          pointerStart.current &&
          Math.hypot(
            event.clientX - pointerStart.current.x,
            event.clientY - pointerStart.current.y
          ) > 8
        )
          cancelHold();
      }}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
    >
      {(onComplete || onSelect) && (
        <button
          type="button"
          onClick={() => {
            if (held.current) {
              held.current = false;
              return;
            }
            if (selectionMode) onSelect?.();
            else onComplete?.();
          }}
          aria-label={
            selectionMode
              ? `${selected ? 'Bỏ chọn' : 'Chọn'} ${task.title}`
              : `${task.is_done ? 'Bỏ hoàn thành' : 'Hoàn thành'} ${task.title}`
          }
          aria-pressed={selectionMode ? selected : Boolean(task.is_done)}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-control ${focusRing}`}
        >
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${(selectionMode ? selected : task.is_done) ? 'border-tr-primary bg-tr-primary text-tr-on-primary' : 'border-tr-muted'}`}
          >
            {(selectionMode ? selected : task.is_done) && <Check size={13} aria-hidden="true" />}
          </span>
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          if (held.current) {
            held.current = false;
            return;
          }
          onOpen();
        }}
        className={`min-h-11 min-w-0 flex-1 text-left ${focusRing}`}
      >
        <span
          className={`block text-sm font-semibold ${task.is_done ? 'text-tr-muted line-through' : 'text-tr-text'}`}
        >
          {task.title}
        </span>
        <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-tr-muted">
          <span>{t.priority[task.priority]}</span>
          {task.due_date && <span>{formatDateShort(task.due_date)}</span>}
          {task.customer_name && <span className="truncate">{task.customer_name}</span>}
          <span>{task.assignee_name ?? 'Chưa giao'}</span>
          <span>{t.cardStatus[task.status ?? 'todo']}</span>
          {(task.subtask_total ?? 0) > 0 && (
            <span>
              {task.subtask_done ?? 0}/{task.subtask_total} việc con
            </span>
          )}
        </span>
      </button>
      <ChevronRight size={16} className="mt-3 shrink-0 text-tr-muted" aria-hidden="true" />
    </article>
  );
}
