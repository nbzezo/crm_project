import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { CARD_STATUSES, type CardStatus } from '@workflow/contracts';
import { CalendarDays, GripVertical, Plus, UserRound } from 'lucide-react';
import { api } from '../../api/client';
import { t } from '../../i18n/vi';
import { invalidateCardViews } from '../../lib/queryKeys';
import { useUiStore } from '../../stores/uiStore';
import type { Priority, TaskRow } from '../../types';
import { Button, focusRing } from '../common/ui';
import { CARD_STATUS_TONE } from './CardStatusControl';
import { getDeadlinePresentation } from './TaskPresentation';
import type { TaskGroup } from './TaskWorkspaceTypes';

interface Lane {
  key: string;
  label: string;
  tasks: TaskRow[];
  patch?: Record<string, unknown>;
}

function lanesFor(tasks: TaskRow[], group: TaskGroup): Lane[] {
  if (group === 'status' || group === 'none' || group === 'due') {
    return CARD_STATUSES.map((status) => ({
      key: status,
      label: t.cardStatus[status],
      tasks: tasks.filter((task) => task.status === status),
      patch: { status },
    }));
  }
  if (group === 'priority') {
    return (['urgent', 'high', 'medium', 'low'] as Priority[]).map((priority) => ({
      key: priority,
      label: t.priority[priority],
      tasks: tasks.filter((task) => task.priority === priority),
      patch: { priority },
    }));
  }

  const keyOf = (task: TaskRow) => {
    if (group === 'assignee')
      return task.assignee_contact_id == null ? 'none' : String(task.assignee_contact_id);
    if (group === 'board') return String(task.board_id);
    return task.customer_id == null ? 'none' : String(task.customer_id);
  };
  const labelOf = (task: TaskRow) => {
    if (group === 'assignee') return task.assignee_name ?? 'Chưa giao';
    if (group === 'board') return task.board_name;
    return task.customer_name ?? 'Không gắn khách hàng';
  };
  const map = new Map<string, Lane>();
  for (const task of tasks) {
    const key = keyOf(task);
    const current = map.get(key) ?? { key, label: labelOf(task), tasks: [] };
    current.tasks.push(task);
    if (group === 'assignee')
      current.patch = { assignee_contact_id: key === 'none' ? null : Number(key) };
    if (group === 'board') current.patch = { list_id: task.list_id };
    if (group === 'customer') current.patch = { customer_id: key === 'none' ? null : Number(key) };
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'vi'));
}

function TaskCardContent({
  task,
  onOpen,
  dragHandle,
}: {
  task: TaskRow;
  onOpen: () => void;
  dragHandle?: React.ButtonHTMLAttributes<HTMLButtonElement>;
}) {
  const deadline = getDeadlinePresentation(task.due_date, Boolean(task.is_done));
  return (
    <article className="rounded-panel border border-tr-border bg-tr-panel p-3 shadow-sm transition hover:border-tr-primary/30 hover:shadow-md">
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...dragHandle}
          className={`mt-0.5 cursor-grab rounded p-1 text-tr-muted hover:bg-tr-hover ${focusRing}`}
          aria-label={`Di chuyển ${task.title}`}
        >
          <GripVertical size={15} />
        </button>
        <button type="button" onClick={onOpen} className={`min-w-0 flex-1 text-left ${focusRing}`}>
          <span
            className={`block text-sm font-semibold ${task.is_done ? 'text-tr-muted line-through' : 'text-tr-text'}`}
          >
            {task.title}
          </span>
          <span className="mt-1 block truncate text-xs text-tr-muted">
            {task.customer_name ?? task.project_name ?? task.board_name}
          </span>
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {task.due_date && (
          <span
            className={`inline-flex items-center gap-1 ${deadline.tone === 'danger' ? 'text-tr-danger' : 'text-tr-subtle'}`}
          >
            <CalendarDays size={13} /> {deadline.primary}
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-tr-subtle">
          <UserRound size={13} /> {task.assignee_name ?? 'Chưa giao'}
        </span>
        {(task.subtask_total ?? 0) > 0 && (
          <span className="ml-auto text-tr-muted">
            {task.subtask_done ?? 0}/{task.subtask_total}
          </span>
        )}
      </div>
    </article>
  );
}

function DraggableTaskCard({ task, onOpen }: { task: TaskRow; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task-${task.id}`,
    data: { taskId: task.id },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={isDragging ? 'opacity-30' : ''}
    >
      <TaskCardContent task={task} onOpen={onOpen} dragHandle={{ ...listeners, ...attributes }} />
    </div>
  );
}

function KanbanLane({ lane, onOpen }: { lane: Lane; onOpen: (id: number) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `lane-${lane.key}`, data: { lane } });
  const statusTone = CARD_STATUSES.includes(lane.key as CardStatus)
    ? CARD_STATUS_TONE[lane.key as CardStatus]
    : 'bg-tr-hover text-tr-subtle';
  return (
    <section
      ref={setNodeRef}
      className={`w-[292px] shrink-0 rounded-panel border p-2 transition ${isOver ? 'border-tr-primary bg-tr-primary/5' : 'border-tr-border bg-tr-surface'}`}
    >
      <header className="flex h-9 items-center justify-between px-1">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone}`}>
          {lane.label}
        </span>
        <span className="text-xs tabular-nums text-tr-muted">{lane.tasks.length}</span>
      </header>
      <div className="mt-1 min-h-24 space-y-2">
        {lane.tasks.map((task) => (
          <DraggableTaskCard key={task.id} task={task} onOpen={() => onOpen(task.id)} />
        ))}
      </div>
      <Button variant="ghost" className="mt-2 w-full justify-start text-xs" disabled>
        <Plus size={14} /> Thêm vào nhóm
      </Button>
    </section>
  );
}

export function TaskWorkspaceKanban({ tasks, group }: { tasks: TaskRow[]; group: TaskGroup }) {
  const queryClient = useQueryClient();
  const openCard = useUiStore((state) => state.openCard);
  const [active, setActive] = useState<TaskRow | null>(null);
  const lanes = useMemo(() => lanesFor(tasks, group), [tasks, group]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor)
  );
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Record<string, unknown> }) =>
      api.patch(`/api/cards/${id}`, patch),
    onSuccess: () => invalidateCardViews(queryClient),
  });

  const handleEnd = (event: DragEndEvent) => {
    setActive(null);
    if (!event.over) return;
    const id = Number(String(event.active.id).replace('task-', ''));
    const lane = event.over.data.current?.lane as Lane | undefined;
    if (lane?.patch) update.mutate({ id, patch: lane.patch });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(event) =>
        setActive(tasks.find((task) => `task-${task.id}` === event.active.id) ?? null)
      }
      onDragEnd={handleEnd}
      onDragCancel={() => setActive(null)}
    >
      <div className="tr-scroll flex min-h-[520px] items-start gap-3 overflow-x-auto pb-3">
        {lanes.map((lane) => (
          <KanbanLane key={lane.key} lane={lane} onOpen={(id) => openCard(id, 'drawer')} />
        ))}
      </div>
      <DragOverlay>
        {active ? (
          <div className="w-[276px]">
            <TaskCardContent task={active} onOpen={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
