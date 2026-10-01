import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronRight, Eye, EyeOff, Pencil, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { api } from '../../api/client';
import { PRIORITY_ORDER, t } from '../../i18n/vi';
import { invalidateCardViews } from '../../lib/queryKeys';
import { MD_QUERY, useMediaQuery } from '../../lib/useMediaQuery';
import { useUiStore } from '../../stores/uiStore';
import type { Assignee, Priority, TaskRow } from '../../types';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { EmptyState, InlineDate, focusRing } from '../common/ui';
import { AssigneeSelect, useAssignees } from './AssigneePicker';
import { CardStatusSelect } from './CardStatusControl';
import { TaskCardRow } from './TaskCardRow';
import { PrioritySelect, SmartDeadline } from './TaskPresentation';
import type { TaskColumnKey, TaskGroup, TaskSort } from './TaskWorkspaceTypes';

interface TaskGroupRows {
  key: string;
  label: string;
  tasks: TaskRow[];
}

const PRIORITY_RANK: Record<Priority, number> = { urgent: 4, high: 3, medium: 2, low: 1 };

function dateLabel(value: string): string {
  try {
    return format(new Date(value.replace(' ', 'T')), 'dd/MM/yyyy HH:mm', { locale: vi });
  } catch {
    return value;
  }
}

function dueGroup(task: TaskRow): { key: string; label: string; order: number } {
  if (task.is_done) return { key: 'done', label: 'Hoàn thành', order: 5 };
  if (!task.due_date) return { key: 'none', label: 'Không có hạn', order: 4 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${task.due_date.slice(0, 10)}T00:00:00`);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { key: 'overdue', label: 'Quá hạn', order: 0 };
  if (days === 0) return { key: 'today', label: 'Hôm nay', order: 1 };
  if (days <= 7) return { key: 'soon', label: 'Sắp tới', order: 2 };
  return { key: 'later', label: 'Sau 7 ngày', order: 3 };
}

function sortTasks(tasks: TaskRow[], sort: TaskSort): TaskRow[] {
  const copy = [...tasks];
  copy.sort((a, b) => {
    if (sort === 'title_asc') return a.title.localeCompare(b.title, 'vi');
    if (sort === 'priority_desc') return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    if (sort === 'created_desc') return b.created_at.localeCompare(a.created_at);
    const av = a.due_date ?? (sort === 'due_asc' ? '9999-12-31' : '0000-00-00');
    const bv = b.due_date ?? (sort === 'due_asc' ? '9999-12-31' : '0000-00-00');
    return sort === 'due_asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });
  return copy;
}

export function groupWorkspaceTasks(
  tasks: TaskRow[],
  group: TaskGroup,
  sort: TaskSort
): TaskGroupRows[] {
  const sorted = sortTasks(tasks, sort);
  if (group === 'none') return [{ key: 'all', label: 'Tất cả công việc', tasks: sorted }];

  if (group === 'due') {
    const map = new Map<string, TaskGroupRows & { order: number }>();
    for (const task of sorted) {
      const bucket = dueGroup(task);
      const current = map.get(bucket.key) ?? { ...bucket, tasks: [] };
      current.tasks.push(task);
      map.set(bucket.key, current);
    }
    return [...map.values()].sort((a, b) => a.order - b.order);
  }

  const labelOf = (task: TaskRow): string => {
    if (group === 'status') return task.status;
    if (group === 'priority') return t.priority[task.priority];
    if (group === 'assignee') return task.assignee_name ?? 'Chưa giao';
    if (group === 'board') return task.board_name;
    return task.customer_name ?? 'Không gắn khách hàng';
  };
  const map = new Map<string, TaskRow[]>();
  for (const task of sorted) map.set(labelOf(task), [...(map.get(labelOf(task)) ?? []), task]);
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'vi'))
    .map(([label, groupTasks]) => ({ key: label, label, tasks: groupTasks }));
}

interface TaskRowNode {
  task: TaskRow;
  depth: number;
  childCount: number;
}

/** Gom việc con vào nhóm của việc cha và trả về danh sách phẳng theo thứ tự cha → con. */
function nestTasks(
  tasks: TaskRow[],
  group: TaskGroup,
  sort: TaskSort,
  collapsedParents: Set<number>
): Array<TaskGroupRows & { rows: TaskRowNode[]; total: number }> {
  const sorted = sortTasks(tasks, sort);
  const ids = new Set(sorted.map((task) => task.id));
  const childrenOf = new Map<number, TaskRow[]>();
  const roots: TaskRow[] = [];
  for (const task of sorted) {
    if (task.parent_id && ids.has(task.parent_id)) {
      childrenOf.set(task.parent_id, [...(childrenOf.get(task.parent_id) ?? []), task]);
    } else {
      roots.push(task);
    }
  }
  return groupWorkspaceTasks(roots, group, sort).map((taskGroup) => {
    const rows: TaskRowNode[] = [];
    const walk = (task: TaskRow, depth: number) => {
      const children = childrenOf.get(task.id) ?? [];
      rows.push({ task, depth, childCount: children.length });
      if (!collapsedParents.has(task.id)) for (const child of children) walk(child, depth + 1);
    };
    for (const task of taskGroup.tasks) walk(task, 0);
    const count = (task: TaskRow): number =>
      1 + (childrenOf.get(task.id) ?? []).reduce((sum, child) => sum + count(child), 0);
    return {
      ...taskGroup,
      rows,
      total: taskGroup.tasks.reduce((sum, root) => sum + count(root), 0),
    };
  });
}

function ProgressCell({ task }: { task: TaskRow }) {
  const total = task.subtask_total ?? 0;
  const done = task.subtask_done ?? 0;
  if (total === 0) return <span className="text-tr-muted">—</span>;
  const percent = Math.round((done / total) * 100);
  return (
    <span className="flex min-w-24 items-center gap-2 text-xs text-tr-subtle">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-tr-hover-strong">
        <span
          className="block h-full rounded-full bg-tr-success"
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="tabular-nums">
        {done}/{total}
      </span>
    </span>
  );
}

function BulkBar({
  selected,
  tasks,
  onDone,
  onClear,
}: {
  selected: Set<number>;
  tasks: TaskRow[];
  onDone: () => void;
  onClear: () => void;
}) {
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { data: assignees = [] } = useAssignees();
  const mutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      await Promise.all([...selected].map((id) => api.patch(`/api/cards/${id}`, patch)));
    },
    onSuccess: () => {
      invalidateCardViews(queryClient);
      onDone();
    },
  });
  const remove = useMutation({
    mutationFn: async () => {
      await Promise.all([...selected].map((id) => api.del(`/api/cards/${id}`)));
    },
    onSuccess: () => {
      invalidateCardViews(queryClient);
      setDeleteOpen(false);
      onDone();
    },
  });
  const selectedTasks = tasks.filter((task) => selected.has(task.id));

  return (
    <>
      <div className="sticky bottom-[calc(var(--tr-tabbar-h)+0.75rem)] z-30 mx-auto mb-3 flex w-fit max-w-[calc(100%-1rem)] flex-wrap items-center gap-2 rounded-panel border border-tr-primary/25 bg-tr-panel px-3 py-2 shadow-xl md:bottom-3">
        <span className="text-sm font-semibold text-tr-text">Đã chọn {selected.size}</span>
        <span className="h-5 w-px bg-tr-border" />
        <button
          type="button"
          onClick={() => mutation.mutate({ is_done: true })}
          className={`inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-xs font-medium text-tr-success hover:bg-tr-hover fine:min-h-0 ${focusRing}`}
        >
          <Check size={14} /> Hoàn thành
        </button>
        <select
          aria-label="Đổi ưu tiên hàng loạt"
          defaultValue=""
          onChange={(event) => {
            if (event.target.value) mutation.mutate({ priority: event.target.value });
            event.target.value = '';
          }}
          className="min-h-11 rounded-control border border-tr-border bg-tr-panel px-2 text-xs text-tr-text fine:min-h-0"
        >
          <option value="">Đổi ưu tiên…</option>
          {PRIORITY_ORDER.map((priority) => (
            <option key={priority} value={priority}>
              {t.priority[priority]}
            </option>
          ))}
        </select>
        <select
          aria-label="Đổi người phụ trách hàng loạt"
          defaultValue=""
          onChange={(event) => {
            if (event.target.value)
              mutation.mutate({ assignee_contact_id: Number(event.target.value) });
            event.target.value = '';
          }}
          className="min-h-11 rounded-control border border-tr-border bg-tr-panel px-2 text-xs text-tr-text fine:min-h-0"
        >
          <option value="">Giao cho…</option>
          {(assignees as Assignee[]).map((person) => (
            <option key={person.id} value={person.id}>
              {person.full_name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className={`inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-xs font-medium text-tr-danger hover:bg-tr-danger/10 fine:min-h-0 ${focusRing}`}
        >
          <Trash2 size={14} /> Xóa
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label="Bỏ chọn"
          className={`flex h-11 w-11 items-center justify-center rounded-control text-tr-muted hover:bg-tr-hover fine:h-8 fine:w-8 ${focusRing}`}
        >
          <X size={15} />
        </button>
      </div>
      <ConfirmDialog
        open={deleteOpen}
        message={`Xóa ${selectedTasks.length} công việc đã chọn?`}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}

export function TaskWorkspaceList({
  tasks,
  columns,
  group,
  sort,
  emptyAction,
}: {
  tasks: TaskRow[];
  columns: TaskColumnKey[];
  group: TaskGroup;
  sort: TaskSort;
  emptyAction?: React.ReactNode;
}) {
  const isWide = useMediaQuery(MD_QUERY);
  const queryClient = useQueryClient();
  const openCard = useUiStore((state) => state.openCard);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(['done']));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [collapsedParents, setCollapsedParents] = useState<Set<number>>(new Set());
  const groups = useMemo(
    () => nestTasks(tasks, group, sort, collapsedParents),
    [tasks, group, sort, collapsedParents]
  );
  const toggleParent = (id: number) =>
    setCollapsedParents((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const patchTask = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Record<string, unknown> }) =>
      api.patch(`/api/cards/${id}`, patch),
    onSuccess: () => invalidateCardViews(queryClient),
  });
  const watchTask = useMutation({
    mutationFn: ({ id, watching }: { id: number; watching: boolean }) =>
      api.put(`/api/cards/${id}/watch`, { watching }),
    onSuccess: () => invalidateCardViews(queryClient),
  });

  if (tasks.length === 0) {
    return (
      <EmptyState
        message="Không có công việc nào trong chế độ xem này."
        hint="Thử đổi bộ lọc, chọn một mục khác hoặc tạo công việc mới."
        action={emptyAction}
      />
    );
  }

  const has = (column: TaskColumnKey) => columns.includes(column);
  const toggleOne = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const startEdit = (task: TaskRow) => {
    setEditingId(task.id);
    setTitleDraft(task.title);
  };
  const commitEdit = (task: TaskRow) => {
    const title = titleDraft.trim();
    if (title && title !== task.title) patchTask.mutate({ id: task.id, patch: { title } });
    setEditingId(null);
  };

  return (
    <div>
      {selected.size > 0 && (
        <BulkBar
          selected={selected}
          tasks={tasks}
          onDone={() => setSelected(new Set())}
          onClear={() => setSelected(new Set())}
        />
      )}
      <div className="tr-scroll overflow-auto rounded-panel border border-tr-border bg-tr-panel shadow-sm">
        {!isWide ? (
          <div className="divide-y divide-tr-border">
            {groups.map((taskGroup) => (
              <section key={taskGroup.key}>
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((current) => {
                      const next = new Set(current);
                      if (next.has(taskGroup.key)) next.delete(taskGroup.key);
                      else next.add(taskGroup.key);
                      return next;
                    })
                  }
                  className="sticky top-0 z-10 flex min-h-11 w-full items-center gap-2 bg-tr-surface px-3 py-2 text-left text-sm font-semibold text-tr-text"
                >
                  {collapsed.has(taskGroup.key) ? (
                    <ChevronRight size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                  <span className="tr-eyebrow flex-1">{taskGroup.label}</span>
                  <span className="text-xs text-tr-muted">{taskGroup.total}</span>
                </button>
                {!collapsed.has(taskGroup.key) && (
                  <div className="divide-y divide-tr-border">
                    {taskGroup.rows.map(({ task, depth, childCount }) => (
                      <TaskCardRow
                        key={task.id}
                        task={task}
                        depth={depth}
                        childCount={childCount}
                        childrenCollapsed={collapsedParents.has(task.id)}
                        onToggleChildren={() => toggleParent(task.id)}
                        onOpen={() =>
                          selected.size > 0 ? toggleOne(task.id) : openCard(task.id, 'drawer')
                        }
                        selected={selected.has(task.id)}
                        onSelect={() => toggleOne(task.id)}
                        onComplete={() =>
                          patchTask.mutate({ id: task.id, patch: { is_done: !task.is_done } })
                        }
                        selectionMode={selected.size > 0}
                      />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        ) : (
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead className="sticky top-0 z-20 bg-tr-surface">
              <tr className="text-xs font-semibold text-tr-subtle">
                <th
                  scope="col"
                  className="sticky left-0 z-30 w-10 border-b border-tr-border bg-tr-surface px-2 py-2"
                >
                  <input
                    type="checkbox"
                    aria-label="Chọn tất cả công việc"
                    checked={selected.size === tasks.length && tasks.length > 0}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked ? new Set(tasks.map((task) => task.id)) : new Set()
                      )
                    }
                    className={`h-4 w-4 accent-tr-primary ${focusRing}`}
                  />
                </th>
                <th
                  scope="col"
                  className="sticky left-10 z-30 min-w-[310px] border-b border-tr-border bg-tr-surface px-2 py-2"
                >
                  Công việc
                </th>
                {has('priority') && (
                  <th scope="col" className="min-w-28 border-b border-tr-border px-2 py-2">
                    Ưu tiên
                  </th>
                )}
                {has('startDate') && (
                  <th scope="col" className="min-w-32 border-b border-tr-border px-2 py-2">
                    Bắt đầu
                  </th>
                )}
                {has('dueDate') && (
                  <th scope="col" className="min-w-36 border-b border-tr-border px-2 py-2">
                    Hạn
                  </th>
                )}
                {has('assignee') && (
                  <th scope="col" className="min-w-40 border-b border-tr-border px-2 py-2">
                    Người phụ trách
                  </th>
                )}
                {has('status') && (
                  <th scope="col" className="min-w-36 border-b border-tr-border px-2 py-2">
                    Trạng thái
                  </th>
                )}
                {has('customer') && (
                  <th scope="col" className="min-w-44 border-b border-tr-border px-2 py-2">
                    Khách hàng
                  </th>
                )}
                {has('project') && (
                  <th scope="col" className="min-w-40 border-b border-tr-border px-2 py-2">
                    Dự án
                  </th>
                )}
                {has('board') && (
                  <th scope="col" className="min-w-40 border-b border-tr-border px-2 py-2">
                    Bảng
                  </th>
                )}
                {has('progress') && (
                  <th scope="col" className="min-w-36 border-b border-tr-border px-2 py-2">
                    Tiến độ
                  </th>
                )}
                {has('creator') && (
                  <th scope="col" className="min-w-36 border-b border-tr-border px-2 py-2">
                    Người tạo
                  </th>
                )}
                {has('createdAt') && (
                  <th scope="col" className="min-w-40 border-b border-tr-border px-2 py-2">
                    Ngày tạo
                  </th>
                )}
                {has('source') && (
                  <th scope="col" className="min-w-44 border-b border-tr-border px-2 py-2">
                    Nguồn
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {groups.map((taskGroup) => (
                <Fragment key={taskGroup.key}>
                  <tr>
                    <td
                      colSpan={columns.length + 2}
                      className="border-b border-tr-border bg-tr-surface/95 px-3 py-2"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsed((current) => {
                            const next = new Set(current);
                            if (next.has(taskGroup.key)) next.delete(taskGroup.key);
                            else next.add(taskGroup.key);
                            return next;
                          })
                        }
                        className={`tr-eyebrow inline-flex min-h-7 items-center gap-1.5 rounded-control text-xs font-semibold text-tr-text ${focusRing}`}
                        aria-expanded={!collapsed.has(taskGroup.key)}
                      >
                        {collapsed.has(taskGroup.key) ? (
                          <ChevronRight size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                        {taskGroup.label}
                        <span className="font-normal text-tr-muted">{taskGroup.total}</span>
                      </button>
                    </td>
                  </tr>
                  {!collapsed.has(taskGroup.key) &&
                    taskGroup.rows.map(({ task, depth, childCount }) => (
                      <tr
                        key={task.id}
                        className={`group h-11 hover:bg-tr-hover ${depth > 0 ? 'bg-tr-surface' : ''}`}
                      >
                        <td
                          className={`sticky left-0 z-10 border-b border-tr-border ${depth > 0 ? 'bg-tr-surface' : 'bg-tr-panel'} px-2 group-hover:bg-tr-hover`}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(task.id)}
                            onChange={() => toggleOne(task.id)}
                            aria-label={`Chọn ${task.title}`}
                            className={`h-4 w-4 accent-tr-primary ${focusRing}`}
                          />
                        </td>
                        <td
                          className={`sticky left-10 z-10 border-b border-tr-border ${depth > 0 ? 'bg-tr-surface' : 'bg-tr-panel'} px-2 group-hover:bg-tr-hover`}
                        >
                          <div
                            className="flex min-w-0 items-center gap-1"
                            style={{ paddingLeft: depth * 24 }}
                          >
                            {childCount > 0 ? (
                              <button
                                type="button"
                                onClick={() => toggleParent(task.id)}
                                aria-expanded={!collapsedParents.has(task.id)}
                                aria-label={`${collapsedParents.has(task.id) ? 'Mở' : 'Thu gọn'} việc con của ${task.title}`}
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-tr-muted hover:bg-tr-hover-strong ${focusRing}`}
                              >
                                {collapsedParents.has(task.id) ? (
                                  <ChevronRight size={14} />
                                ) : (
                                  <ChevronDown size={14} />
                                )}
                              </button>
                            ) : (
                              <span className="w-6 shrink-0" aria-hidden="true" />
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                watchTask.mutate({ id: task.id, watching: !task.is_watching })
                              }
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-tr-muted hover:bg-tr-hover-strong hover:text-tr-primary ${focusRing}`}
                              aria-label={
                                task.is_watching
                                  ? `Bỏ theo dõi ${task.title}`
                                  : `Theo dõi ${task.title}`
                              }
                              title={task.is_watching ? 'Bỏ theo dõi' : 'Theo dõi'}
                            >
                              {task.is_watching ? <Eye size={15} /> : <EyeOff size={15} />}
                            </button>
                            <input
                              type="checkbox"
                              checked={Boolean(task.is_done)}
                              onChange={(event) =>
                                patchTask.mutate({
                                  id: task.id,
                                  patch: { is_done: event.target.checked },
                                })
                              }
                              aria-label={`${task.is_done ? 'Đánh dấu chưa hoàn thành' : 'Đánh dấu hoàn thành'}: ${task.title}`}
                              className={`h-4 w-4 shrink-0 accent-tr-primary ${focusRing}`}
                            />
                            {editingId === task.id ? (
                              <input
                                autoFocus
                                value={titleDraft}
                                onChange={(event) => setTitleDraft(event.target.value)}
                                onBlur={() => commitEdit(task)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') event.currentTarget.blur();
                                  if (event.key === 'Escape') setEditingId(null);
                                }}
                                className="h-8 min-w-0 flex-1 rounded-control border-2 border-tr-primary bg-tr-panel px-2 outline-none"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => openCard(task.id, 'drawer')}
                                className={`min-w-0 flex-1 truncate rounded-control px-1 py-1 text-left ${depth > 0 ? 'text-xs' : 'font-medium'} ${task.is_done ? 'text-tr-muted line-through' : 'text-tr-text'} hover:text-tr-primary ${focusRing}`}
                                title={task.title}
                              >
                                {task.parent_id ? (
                                  <span className="mr-2 text-tr-muted">↳</span>
                                ) : null}
                                {task.title}
                                {childCount > 0 && (
                                  <span className="ml-2 text-xs font-normal text-tr-muted">
                                    ({childCount} việc con)
                                  </span>
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => startEdit(task)}
                              aria-label={`Đổi tên ${task.title}`}
                              className={`invisible rounded-control p-1.5 text-tr-muted hover:bg-tr-hover-strong group-hover:visible focus:visible ${focusRing}`}
                            >
                              <Pencil size={13} />
                            </button>
                          </div>
                        </td>
                        {has('priority') && (
                          <td className="border-b border-tr-border px-2">
                            <PrioritySelect
                              value={task.priority}
                              taskTitle={task.title}
                              onChange={(priority) =>
                                patchTask.mutate({ id: task.id, patch: { priority } })
                              }
                            />
                          </td>
                        )}
                        {has('startDate') && (
                          <td className="border-b border-tr-border px-2">
                            <InlineDate
                              value={task.start_date}
                              onChange={(start_date) =>
                                patchTask.mutate({ id: task.id, patch: { start_date } })
                              }
                            />
                          </td>
                        )}
                        {has('dueDate') && (
                          <td className="border-b border-tr-border px-2">
                            <SmartDeadline
                              value={task.due_date}
                              isDone={Boolean(task.is_done)}
                              taskTitle={task.title}
                              onChange={(due_date) =>
                                patchTask.mutate({ id: task.id, patch: { due_date } })
                              }
                            />
                          </td>
                        )}
                        {has('assignee') && (
                          <td className="border-b border-tr-border px-2">
                            <AssigneeSelect
                              value={task.assignee_contact_id}
                              taskTitle={task.title}
                              onChange={(assignee_contact_id) =>
                                patchTask.mutate({ id: task.id, patch: { assignee_contact_id } })
                              }
                            />
                          </td>
                        )}
                        {has('status') && (
                          <td className="border-b border-tr-border px-2">
                            <CardStatusSelect
                              value={task.status}
                              taskTitle={task.title}
                              onChange={(status) =>
                                patchTask.mutate({ id: task.id, patch: { status } })
                              }
                            />
                          </td>
                        )}
                        {has('customer') && (
                          <td
                            className="max-w-48 truncate border-b border-tr-border px-2 text-xs text-tr-subtle"
                            title={task.customer_name ?? ''}
                          >
                            {task.customer_name ?? '—'}
                          </td>
                        )}
                        {has('project') && (
                          <td className="max-w-44 truncate border-b border-tr-border px-2 text-xs text-tr-subtle">
                            {task.project_name ?? '—'}
                          </td>
                        )}
                        {has('board') && (
                          <td className="max-w-44 truncate border-b border-tr-border px-2 text-xs text-tr-subtle">
                            {task.board_name}
                          </td>
                        )}
                        {has('progress') && (
                          <td className="border-b border-tr-border px-2">
                            <ProgressCell task={task} />
                          </td>
                        )}
                        {has('creator') && (
                          <td className="border-b border-tr-border px-2 text-xs text-tr-subtle">
                            {task.creator_name ?? '—'}
                          </td>
                        )}
                        {has('createdAt') && (
                          <td className="border-b border-tr-border px-2 text-xs text-tr-subtle">
                            {dateLabel(task.created_at)}
                          </td>
                        )}
                        {has('source') && (
                          <td className="max-w-48 truncate border-b border-tr-border px-2 text-xs text-tr-subtle">
                            {task.project_name
                              ? `Dự án · ${task.project_name}`
                              : `Bảng · ${task.board_name}`}
                          </td>
                        )}
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
