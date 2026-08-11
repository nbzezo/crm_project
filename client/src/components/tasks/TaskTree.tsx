import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  ExternalLink,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { EmptyState, InlineDate } from '../common/ui';
import { PRIORITY_COLORS, PRIORITY_ORDER, t } from '../../i18n/vi';
import { isOverdue } from '../../lib/format';
import { invalidateCardViews } from '../../lib/queryKeys';
import { undoableDelete } from '../../lib/undo';
import { useUiStore } from '../../stores/uiStore';
import type { Customer, Label, Priority, TaskRow } from '../../types';

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

  if (visibleTasks.length === 0) {
    return <EmptyState message={emptyMessage} hint={emptyHint} action={emptyAction} />;
  }

  const renderRow = (task: TaskRow, isChild: boolean, childCount: number) => {
    const isOpen = expanded.has(task.id);
    return (
      <div
        key={task.id}
        className={`group flex items-center gap-2 px-2 py-1.5 transition hover:bg-tr-hover ${
          isChild ? 'bg-tr-hover/40' : ''
        }`}
      >
        <span style={{ width: isChild ? 34 : 0 }} className="shrink-0" />

        {/* Nút mở / thu việc con */}
        {!isChild ? (
          childCount > 0 ? (
            <button
              onClick={() => toggleExpand(task.id)}
              className="shrink-0 rounded p-0.5 text-tr-muted transition hover:bg-tr-hover-strong hover:text-tr-text"
              title={isOpen ? 'Thu gọn việc con' : 'Xem việc con'}
            >
              {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>
          ) : (
            <span className="w-[22px] shrink-0" />
          )
        ) : (
          <CornerDownRight size={13} className="shrink-0 text-tr-muted" />
        )}

        <input
          type="checkbox"
          checked={!!task.is_done}
          onChange={(e) => update.mutate({ id: task.id, patch: { is_done: e.target.checked } })}
          className="h-4 w-4 shrink-0 rounded border-tr-border text-tr-primary"
        />

        {/* Tiêu đề — bấm để sửa tại chỗ */}
        <div className="min-w-0 flex-1">
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
              onClick={() => {
                setEditingId(task.id);
                setTitleDraft(task.title);
              }}
              className={`w-full truncate rounded px-1.5 py-0.5 text-left text-sm ${
                task.is_done ? 'text-tr-muted line-through' : 'text-tr-text'
              } hover:bg-tr-hover-strong`}
              title="Bấm để sửa tên"
            >
              {task.title}
              {childCount > 0 && (
                <span className="ml-2 rounded bg-tr-hover-strong px-1.5 py-0.5 text-2xs text-tr-subtle">
                  {task.subtask_done ?? 0}/{childCount}
                </span>
              )}
            </button>
          )}
        </div>

        {cols.priority && (
          <select
            value={task.priority}
            onChange={(e) =>
              update.mutate({ id: task.id, patch: { priority: e.target.value as Priority } })
            }
            className="w-24 shrink-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-tr-subtle transition hover:border-tr-border"
            style={{ color: PRIORITY_COLORS[task.priority] }}
          >
            {PRIORITY_ORDER.map((p) => (
              <option key={p} value={p} className="text-tr-text">
                {t.priority[p]}
              </option>
            ))}
          </select>
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
          <div className="w-24 shrink-0">
            <InlineDate
              value={task.due_date}
              highlight={isOverdue(task.due_date, task.is_done)}
              onChange={(v) => update.mutate({ id: task.id, patch: { due_date: v } })}
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
            className="w-40 shrink-0 truncate rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-tr-subtle transition hover:border-tr-border"
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
          <span className="hidden w-44 shrink-0 truncate text-xs text-tr-muted lg:block">
            {task.board_name} · {task.list_name}
          </span>
        )}

        {cols.labels && (
          <span className="hidden w-14 shrink-0 gap-1 xl:flex">
            {(task.label_ids ?? []).map((labelId) => {
              const label = labels.find((l) => l.id === labelId);
              if (!label) return null;
              return (
                <span
                  key={labelId}
                  title={label.name}
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: label.color }}
                />
              );
            })}
          </span>
        )}

        <div className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
          {!isChild && (
            <button
              onClick={() => {
                setAddingUnder(task.id);
                setSubtaskDraft('');
                setExpanded((prev) => new Set(prev).add(task.id));
              }}
              className="rounded p-1 text-tr-muted hover:bg-tr-hover-strong hover:text-tr-text"
              title="Thêm việc con"
            >
              <Plus size={14} />
            </button>
          )}
          <button
            onClick={() => openCard(task.id)}
            className="rounded p-1 text-tr-muted hover:bg-tr-hover-strong hover:text-tr-text"
            title="Mở chi tiết"
          >
            <ExternalLink size={14} />
          </button>
          <button
            onClick={() => setDeleteTask(task)}
            className="rounded p-1 text-tr-muted hover:bg-tr-hover-strong hover:text-tr-danger"
            title={t.common.delete}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="divide-y divide-tr-border overflow-hidden rounded-lg border border-tr-border bg-tr-panel">
        {tree.map(({ task, children }) => (
          <div key={task.id}>
            {renderRow(task, false, children.length)}

            {expanded.has(task.id) && (
              <div className="border-t border-tr-border">
                {children.map((child) => renderRow(child, true, 0))}

                {addingUnder === task.id ? (
                  <div className="flex items-center gap-2 py-1.5 pr-2 pl-[3.4rem]">
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
                      className="flex-1 rounded border-2 border-tr-primary bg-tr-panel px-2 py-1 text-sm text-tr-text outline-none"
                    />
                    <button
                      onClick={() =>
                        subtaskDraft.trim() &&
                        addSubtask.mutate({ parentId: task.id, title: subtaskDraft.trim() })
                      }
                      className="rounded-[3px] bg-tr-primary px-2.5 py-1 text-xs font-medium text-tr-on-primary"
                    >
                      {t.common.add}
                    </button>
                    <button
                      onClick={() => setAddingUnder(null)}
                      className="rounded p-1 text-tr-muted hover:bg-tr-hover"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setAddingUnder(task.id);
                      setSubtaskDraft('');
                    }}
                    className="flex w-full items-center gap-1.5 py-1.5 pl-[3.4rem] text-xs text-tr-muted transition hover:bg-tr-hover hover:text-tr-text"
                  >
                    <Plus size={13} /> Thêm việc con
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
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
