import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, CornerDownRight, Plus, X } from 'lucide-react';
import { api } from '../../api/client';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { EmptyState, InlineDate } from '../common/ui';
import { t } from '../../i18n/vi';
import { invalidateCardViews } from '../../lib/queryKeys';
import { undoableDelete } from '../../lib/undo';
import { useUiStore } from '../../stores/uiStore';
import type { Customer, Label, TaskRow } from '../../types';
import {
  LabelTags,
  PrioritySelect,
  SmartDeadline,
  StatusSelect,
  TaskRowActions,
  useTaskBoardLists,
} from './TaskPresentation';

export interface TaskColumns {
  priority?: boolean;
  startDate?: boolean;
  dueDate?: boolean;
  customer?: boolean;
  board?: boolean;
  labels?: boolean;
}

const ALL_COLUMNS: Required<TaskColumns> = {
  priority: true,
  startDate: true,
  dueDate: true,
  customer: true,
  board: true,
  labels: true,
};

/** Gom danh sách phẳng thành cây cha – con (tối đa 1 cấp). */
export function buildTree(tasks: TaskRow[]): { task: TaskRow; children: TaskRow[] }[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const childrenOf = new Map<number, TaskRow[]>();
  const roots: TaskRow[] = [];

  for (const task of tasks) {
    // Việc con có cha nằm ngoài bộ lọc thì hiển thị như việc gốc để không bị mất
    if (task.parent_id && byId.has(task.parent_id)) {
      const list = childrenOf.get(task.parent_id) ?? [];
      list.push(task);
      childrenOf.set(task.parent_id, list);
    } else {
      roots.push(task);
    }
  }
  return roots.map((task) => ({ task, children: childrenOf.get(task.id) ?? [] }));
}

export function TaskTree({
  tasks,
  columns = ALL_COLUMNS,
  emptyMessage = 'Không có công việc nào.',
  emptyHint,
  emptyAction,
  onChanged,
}: {
  tasks: TaskRow[];
  columns?: TaskColumns;
  emptyMessage?: string;
  emptyHint?: string;
  emptyAction?: React.ReactNode;
  onChanged?: () => void;
}) {
  const queryClient = useQueryClient();
  const openCard = useUiStore((s) => s.openCard);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [addingUnder, setAddingUnder] = useState<number | null>(null);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [deleteTask, setDeleteTask] = useState<TaskRow | null>(null);
  /** Dong dang cho het gio hoan tac — an khoi cay nhung chua goi API xoa. */
  const [pendingDelete, setPendingDelete] = useState<Set<number>>(new Set());

  const cols = { ...ALL_COLUMNS, ...columns };
  const visibleTasks = useMemo(
    () => (pendingDelete.size === 0 ? tasks : tasks.filter((task) => !pendingDelete.has(task.id))),
    [tasks, pendingDelete]
  );
  const tree = useMemo(() => buildTree(visibleTasks), [visibleTasks]);
  const listsByBoard = useTaskBoardLists(visibleTasks);

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', 'select'],
    queryFn: () => api.get<Customer[]>('/api/customers'),
    staleTime: 60_000,
    enabled: cols.customer,
  });
  const { data: labels = [] } = useQuery({
    queryKey: ['labels'],
    queryFn: () => api.get<Label[]>('/api/labels'),
    staleTime: 5 * 60_000,
    enabled: cols.labels,
  });

  const refresh = () => {
    invalidateCardViews(queryClient);
    queryClient.invalidateQueries({ queryKey: ['customer'] });
    onChanged?.();
  };

  const update = useMutation({
    mutationFn: (vars: { id: number; patch: Record<string, unknown> }) =>
      api.patch(`/api/cards/${vars.id}`, vars.patch),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/cards/${id}`),
    onSuccess: refresh,
  });

  const addSubtask = useMutation({
    mutationFn: (vars: { parentId: number; title: string }) =>
      api.post('/api/cards', { parent_id: vars.parentId, title: vars.title }),
    onSuccess: (_data, vars) => {
      refresh();
      setExpanded((prev) => new Set(prev).add(vars.parentId));
      setSubtaskDraft('');
    },
  });

  const toggleExpand = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const commitTitle = (task: TaskRow) => {
    const value = titleDraft.trim();
    if (value && value !== task.title) update.mutate({ id: task.id, patch: { title: value } });
    setEditingId(null);
  };

  const startTitleEdit = (task: TaskRow) => {
    setEditingId(task.id);
    setTitleDraft(task.title);
  };

  const startAddingSubtask = (taskId: number) => {
    setAddingUnder(taskId);
    setSubtaskDraft('');
    setExpanded((previous) => new Set(previous).add(taskId));
  };

  if (visibleTasks.length === 0) {
    return <EmptyState message={emptyMessage} hint={emptyHint} action={emptyAction} />;
  }

  const renderRow = (task: TaskRow, isChild: boolean, childCount: number) => {
    const isOpen = expanded.has(task.id);
    return (
      <div
        key={task.id}
        className={`group grid min-h-12 grid-cols-[auto_auto_minmax(220px,1fr)_100px_110px_132px_140px_80px] items-center gap-2 px-3 py-1.5 transition hover:bg-tr-hover 2xl:grid-cols-[auto_auto_minmax(240px,1fr)_100px_110px_132px_150px_150px_180px_80px] ${
          isChild ? 'bg-tr-hover/40' : ''
        }`}
      >
        {/* Nút mở / thu việc con */}
        <span className={isChild ? 'pl-4' : ''}>
          {!isChild ? (
            childCount > 0 ? (
              <button
                type="button"
                onClick={() => toggleExpand(task.id)}
                className="shrink-0 rounded p-0.5 text-tr-muted transition hover:bg-tr-hover-strong hover:text-tr-text focus-visible:outline-2 focus-visible:outline-tr-primary"
                title={isOpen ? 'Thu gọn việc con' : 'Xem việc con'}
                aria-expanded={isOpen}
              >
                {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>
            ) : (
              <span className="block w-5" />
            )
          ) : (
            <CornerDownRight size={13} className="shrink-0 text-tr-muted" />
          )}
        </span>

        <input
          type="checkbox"
          checked={!!task.is_done}
          onChange={(e) => update.mutate({ id: task.id, patch: { is_done: e.target.checked } })}
          className="h-4 w-4 shrink-0 rounded border-tr-border text-tr-primary"
        />

        {/* Tiêu đề — bấm để sửa tại chỗ */}
        <div className="min-w-0">
          {editingId === task.id ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => commitTitle(task)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setEditingId(null);
              }}
              className="w-full rounded border-2 border-tr-primary bg-tr-panel px-1.5 py-0.5 text-sm text-tr-text outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => openCard(task.id, 'drawer')}
              className={`block w-full truncate rounded-control px-1.5 py-0.5 text-left text-sm font-semibold ${
                task.is_done ? 'text-tr-muted line-through' : 'text-tr-text'
              } hover:text-tr-primary hover:underline focus-visible:outline-2 focus-visible:outline-tr-primary`}
              title={task.title}
            >
              {task.title}
              {childCount > 0 && (
                <span className="ml-2 rounded bg-tr-hover-strong px-1.5 py-0.5 text-2xs text-tr-subtle">
                  {task.subtask_done ?? 0}/{childCount}
                </span>
              )}
            </button>
          )}
          <span
            className="block truncate px-1.5 text-2xs text-tr-muted"
            title={`${task.board_name} · ${task.list_name}`}
          >
            {task.customer_name ?? 'Chưa gắn khách hàng'} · {task.board_name}
          </span>
        </div>

        {cols.priority && (
          <PrioritySelect
            value={task.priority}
            taskTitle={task.title}
            onChange={(priority) => update.mutate({ id: task.id, patch: { priority } })}
          />
        )}

        {cols.startDate && (
          <div className="w-24 shrink-0">
            <InlineDate
              value={task.start_date}
              onChange={(v) => update.mutate({ id: task.id, patch: { start_date: v } })}
            />
          </div>
        )}

        {cols.dueDate && (
          <div>
            <SmartDeadline
              value={task.due_date}
              isDone={Boolean(task.is_done)}
              taskTitle={task.title}
              onChange={(dueDate) => update.mutate({ id: task.id, patch: { due_date: dueDate } })}
            />
          </div>
        )}

        {cols.customer && (
          <select
            value={task.customer_id ?? ''}
            onChange={(e) =>
              update.mutate({
                id: task.id,
                patch: { customer_id: e.target.value === '' ? null : Number(e.target.value) },
              })
            }
            aria-label={`Khách hàng: ${task.title}`}
            className="hidden w-36 truncate rounded-control border border-transparent bg-transparent px-1 py-0.5 text-xs text-tr-subtle outline-none transition hover:border-tr-border focus-visible:border-tr-primary 2xl:block"
          >
            <option value="">— khách hàng —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        {cols.board && (
          <span className="hidden truncate text-xs text-tr-muted 2xl:block" title={task.board_name}>
            {task.board_name}
          </span>
        )}

        <span className="flex min-w-0 items-center gap-1.5">
          <StatusSelect
            task={task}
            lists={listsByBoard.get(task.board_id) ?? []}
            onChange={(listId) => update.mutate({ id: task.id, patch: { list_id: listId } })}
          />
          {cols.labels && (
            <span className="hidden min-w-0 2xl:block">
              <LabelTags
                labels={(task.label_ids ?? [])
                  .map((labelId) => labels.find((label) => label.id === labelId))
                  .filter((label): label is Label => Boolean(label))}
                limit={1}
              />
            </span>
          )}
        </span>

        <div className="opacity-50 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <TaskRowActions
            task={task}
            onOpen={() => openCard(task.id, 'drawer')}
            onToggleDone={() => update.mutate({ id: task.id, patch: { is_done: !task.is_done } })}
            onDelete={() => setDeleteTask(task)}
            onEditTitle={() => startTitleEdit(task)}
            onAddSubtask={isChild ? undefined : () => startAddingSubtask(task.id)}
          />
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="tr-scroll overflow-x-auto rounded-panel border border-tr-border bg-tr-panel shadow-sm">
        <div className="min-w-[870px] 2xl:min-w-[1260px]">
          <div className="sticky top-0 z-10 grid grid-cols-[auto_auto_minmax(220px,1fr)_100px_110px_132px_140px_80px] items-center gap-2 border-b border-tr-border bg-tr-surface px-3 py-2 text-2xs font-semibold tracking-wide text-tr-subtle uppercase 2xl:grid-cols-[auto_auto_minmax(240px,1fr)_100px_110px_132px_150px_150px_180px_80px]">
            <span className="w-5" />
            <span className="sr-only">Hoàn thành</span>
            <span>Công việc</span>
            <span>Ưu tiên</span>
            <span>Bắt đầu</span>
            <span>Hạn hoàn thành</span>
            <span className="hidden 2xl:block">Khách hàng</span>
            <span className="hidden 2xl:block">Dự án / Bảng</span>
            <span>Trạng thái / Nhãn</span>
            <span className="text-right">Thao tác</span>
          </div>
          <div className="divide-y divide-tr-border">
            {tree.map(({ task, children }) => (
              <div key={task.id}>
                {renderRow(task, false, children.length)}

                {expanded.has(task.id) && (
                  <div className="border-t border-tr-border">
                    {children.map((child) => renderRow(child, true, 0))}

                    {addingUnder === task.id ? (
                      <div className="flex items-center gap-2 py-2 pr-3 pl-12">
                        <CornerDownRight size={13} className="shrink-0 text-tr-muted" />
                        <input
                          autoFocus
                          value={subtaskDraft}
                          placeholder="Tên việc con…"
                          onChange={(e) => setSubtaskDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && subtaskDraft.trim())
                              addSubtask.mutate({ parentId: task.id, title: subtaskDraft.trim() });
                            if (e.key === 'Escape') setAddingUnder(null);
                          }}
                          className="flex-1 rounded-control border-2 border-tr-primary bg-tr-panel px-2 py-1 text-sm text-tr-text outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            subtaskDraft.trim() &&
                            addSubtask.mutate({ parentId: task.id, title: subtaskDraft.trim() })
                          }
                          className="rounded-control bg-tr-primary px-2.5 py-1 text-xs font-medium text-tr-on-primary"
                        >
                          {t.common.add}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddingUnder(null)}
                          className="rounded-control p-1 text-tr-muted hover:bg-tr-hover"
                          aria-label={t.common.cancel}
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startAddingSubtask(task.id)}
                        className="flex w-full items-center gap-1.5 py-1.5 pl-12 text-xs text-tr-muted transition hover:bg-tr-hover hover:text-tr-text"
                      >
                        <Plus size={13} /> Thêm việc con
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteTask !== null}
        message={
          (deleteTask?.subtask_total ?? 0) > 0
            ? `Xóa "${deleteTask?.title}" sẽ xóa cả ${deleteTask?.subtask_total} việc con bên trong.`
            : `Xóa công việc "${deleteTask?.title}"?`
        }
        onCancel={() => setDeleteTask(null)}
        onConfirm={() => {
          const target = deleteTask;
          setDeleteTask(null);
          if (!target) return;
          // An dong ngay, chi goi DELETE khi het gio hoan tac.
          setPendingDelete((prev) => new Set(prev).add(target.id));
          undoableDelete({
            message: `Đã xóa “${target.title}”`,
            commit: () => remove.mutate(target.id),
            revert: () =>
              setPendingDelete((prev) => {
                const next = new Set(prev);
                next.delete(target.id);
                return next;
              }),
          });
        }}
      />
    </>
  );
}
