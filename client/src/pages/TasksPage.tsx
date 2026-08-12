import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Filter,
  Flame,
  List,
  ListTree,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { api, qs } from '../api/client';
import { Popover, usePopover } from '../components/common/Popover';
import { TaskTree, buildTree } from '../components/tasks/TaskTree';
import { TaskTable } from '../components/tasks/TaskTable';
import { daysFromToday, isReviewStatus } from '../components/tasks/TaskPresentation';
import {
  Button,
  DateInput,
  ErrorState,
  Input,
  Select,
  SkeletonRows,
  focusRing,
} from '../components/common/ui';
import { PRIORITY_COLORS, PRIORITY_ORDER, t } from '../i18n/vi';
import { invalidateCardViews } from '../lib/queryKeys';
import { emptyTaskFilters, useUiStore, type TaskFilters } from '../stores/uiStore';
import type { Board, BoardFull, Customer, Priority, TaskRow } from '../types';

export function useTaskQuery() {
  const filters = useUiStore((s) => s.taskFilters);
  const params = {
    q: filters.q,
    priority: filters.priority,
    customer_id: filters.customerId,
    board_id: filters.boardId,
    done:
      filters.status === 'done'
        ? '1'
        : filters.status === 'open' || filters.status === 'review'
          ? '0'
          : '',
    overdue: filters.due === 'overdue' ? '1' : '',
  };
  return useQuery({
    queryKey: ['tasks', params, filters.status, filters.due],
    queryFn: () => api.get<TaskRow[]>(`/api/views/tasks${qs(params)}`),
    select: (rows) =>
      rows.filter((task) => {
        if (filters.status === 'review' && !isReviewStatus(task.list_name)) return false;
        const difference = daysFromToday(task.due_date);
        if (filters.due === 'today') return difference === 0;
        if (filters.due === 'tomorrow') return difference === 1;
        if (filters.due === 'week')
          return difference !== null && difference >= 0 && difference <= 7;
        if (filters.due === 'none') return task.due_date === null;
        return true;
      }),
  });
}

export function TaskFilterBar() {
  const filters = useUiStore((s) => s.taskFilters);
  const setFilters = useUiStore((s) => s.setTaskFilters);
  const resetFilters = useUiStore((s) => s.resetTaskFilters);
  const moreFilters = usePopover();

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', 'select'],
    queryFn: () => api.get<Customer[]>('/api/customers'),
    staleTime: 60_000,
  });
  const { data: boards = [] } = useQuery({
    queryKey: ['boards', false],
    queryFn: () => api.get<Board[]>('/api/boards'),
    staleTime: 60_000,
  });

  const activeFilters = [
    filters.q ? { key: 'q', label: `Tìm: ${filters.q}`, clear: () => setFilters({ q: '' }) } : null,
    filters.status !== emptyTaskFilters.status
      ? {
          key: 'status',
          label: `Trạng thái: ${statusLabels[filters.status]}`,
          clear: () => setFilters({ status: emptyTaskFilters.status }),
        }
      : null,
    filters.priority
      ? {
          key: 'priority',
          label: `Ưu tiên: ${t.priority[filters.priority]}`,
          clear: () => setFilters({ priority: '' }),
        }
      : null,
    filters.due
      ? {
          key: 'due',
          label: `Deadline: ${dueLabels[filters.due]}`,
          clear: () => setFilters({ due: '' }),
        }
      : null,
    filters.customerId !== ''
      ? {
          key: 'customer',
          label: `Khách hàng: ${customers.find((item) => item.id === filters.customerId)?.name ?? 'Đã chọn'}`,
          clear: () => setFilters({ customerId: '' }),
        }
      : null,
    filters.boardId !== ''
      ? {
          key: 'board',
          label: `Bảng: ${boards.find((item) => item.id === filters.boardId)?.name ?? 'Đã chọn'}`,
          clear: () => setFilters({ boardId: '' }),
        }
      : null,
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-52 flex-1 sm:max-w-72">
          <span className="sr-only">Tìm công việc</span>
          <Search
            size={15}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-tr-muted"
          />
          <input
            value={filters.q}
            onChange={(event) => setFilters({ q: event.target.value })}
            placeholder="Tìm công việc…"
            className={`h-9 w-full rounded-control border border-tr-border bg-tr-panel pr-3 pl-8 text-sm text-tr-text outline-none transition placeholder:text-tr-muted hover:border-tr-muted focus:border-tr-primary ${focusRing}`}
          />
        </label>
        <div className="w-36">
          <Select
            value={filters.status}
            aria-label="Trạng thái"
            onChange={(event) =>
              setFilters({ status: event.target.value as TaskFilters['status'] })
            }
          >
            <option value="open">Đang mở</option>
            <option value="all">Mọi trạng thái</option>
            <option value="review">Chờ duyệt</option>
            <option value="done">Hoàn thành</option>
          </Select>
        </div>
        <div className="w-40">
          <Select
            value={filters.priority}
            aria-label="Ưu tiên"
            onChange={(event) => setFilters({ priority: event.target.value as Priority | '' })}
          >
            <option value="">Mọi ưu tiên</option>
            {PRIORITY_ORDER.map((priority) => (
              <option key={priority} value={priority}>
                {t.priority[priority]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select
            value={filters.due}
            aria-label="Deadline"
            onChange={(event) => setFilters({ due: event.target.value as TaskFilters['due'] })}
          >
            <option value="">Mọi deadline</option>
            <option value="overdue">Quá hạn</option>
            <option value="today">Hôm nay</option>
            <option value="tomorrow">Ngày mai</option>
            <option value="week">Trong 7 ngày</option>
            <option value="none">Chưa có deadline</option>
          </Select>
        </div>
        <div className="w-48">
          <Select
            value={filters.customerId}
            aria-label="Khách hàng"
            onChange={(event) =>
              setFilters({
                customerId: event.target.value === '' ? '' : Number(event.target.value),
              })
            }
          >
            <option value="">Mọi khách hàng</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="button"
          onClick={moreFilters.toggle}
          aria-haspopup="dialog"
          className={`inline-flex h-9 items-center gap-1.5 rounded-control border border-tr-border bg-tr-panel px-3 text-sm text-tr-subtle transition hover:bg-tr-hover hover:text-tr-text ${focusRing}`}
        >
          <Filter size={14} aria-hidden="true" />
          Bộ lọc
          {filters.boardId !== '' && (
            <span className="rounded-full bg-tr-primary px-1.5 text-2xs font-semibold text-tr-on-primary">
              1
            </span>
          )}
        </button>
        <Popover
          open={moreFilters.open}
          anchor={moreFilters.anchor}
          onClose={moreFilters.close}
          title="Bộ lọc bổ sung"
          width={320}
        >
          <label className="block text-xs font-semibold text-tr-subtle" htmlFor="task-board-filter">
            Dự án / Bảng
          </label>
          <div className="mt-1.5">
            <Select
              id="task-board-filter"
              value={filters.boardId}
              onChange={(event) =>
                setFilters({ boardId: event.target.value === '' ? '' : Number(event.target.value) })
              }
            >
              <option value="">Mọi bảng</option>
              {boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                </option>
              ))}
            </Select>
          </div>
          <button
            type="button"
            onClick={() => setFilters({ boardId: '' })}
            disabled={filters.boardId === ''}
            className={`mt-3 text-xs font-medium text-tr-primary hover:underline disabled:cursor-not-allowed disabled:text-tr-muted disabled:no-underline ${focusRing}`}
          >
            Xóa bộ lọc bảng
          </button>
        </Popover>
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Bộ lọc đang áp dụng">
          {activeFilters.map((filter) => (
            <span
              key={filter.key}
              className="inline-flex h-7 max-w-64 items-center gap-1 rounded-full border border-tr-primary/30 bg-tr-primary/10 px-2.5 text-xs font-medium text-tr-primary"
            >
              <span className="truncate">{filter.label}</span>
              <button
                type="button"
                onClick={filter.clear}
                aria-label={`Xóa ${filter.label}`}
                className={`-mr-1 rounded-full p-0.5 transition hover:bg-tr-primary/15 ${focusRing}`}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={resetFilters}
            className={`ml-1 text-xs font-medium text-tr-muted transition hover:text-tr-text hover:underline ${focusRing}`}
          >
            Xóa bộ lọc
          </button>
        </div>
      )}
    </div>
  );
}

const statusLabels: Record<TaskFilters['status'], string> = {
  all: 'Tất cả',
  open: 'Đang mở',
  done: 'Hoàn thành',
  review: 'Chờ duyệt',
};

const dueLabels: Record<Exclude<TaskFilters['due'], ''>, string> = {
  overdue: 'Quá hạn',
  today: 'Hôm nay',
  tomorrow: 'Ngày mai',
  week: 'Trong 7 ngày',
  none: 'Chưa có deadline',
};

function TaskSummaryBar() {
  const filters = useUiStore((state) => state.taskFilters);
  const setFilters = useUiStore((state) => state.setTaskFilters);
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', 'summary'],
    queryFn: () => api.get<TaskRow[]>('/api/views/tasks'),
  });

  const openTasks = tasks.filter((task) => !task.is_done);
  const summary = [
    {
      key: 'open',
      label: 'Đang mở',
      count: openTasks.length,
      icon: <CheckCircle2 size={15} aria-hidden="true" />,
      active: filters.status === 'open' && !filters.due && !filters.priority,
      patch: { status: 'open' } satisfies Partial<TaskFilters>,
      tone: 'text-tr-subtle',
    },
    {
      key: 'today',
      label: 'Hôm nay',
      count: openTasks.filter((task) => daysFromToday(task.due_date) === 0).length,
      icon: <CalendarClock size={15} aria-hidden="true" />,
      active: filters.due === 'today',
      patch: { status: 'open', due: 'today' } satisfies Partial<TaskFilters>,
      tone: 'text-tr-warning',
    },
    {
      key: 'overdue',
      label: 'Quá hạn',
      count: openTasks.filter((task) => (daysFromToday(task.due_date) ?? 0) < 0).length,
      icon: <AlertTriangle size={15} aria-hidden="true" />,
      active: filters.due === 'overdue',
      patch: { status: 'open', due: 'overdue' } satisfies Partial<TaskFilters>,
      tone: 'text-tr-danger',
    },
    {
      key: 'review',
      label: 'Chờ duyệt',
      count: openTasks.filter((task) => isReviewStatus(task.list_name)).length,
      icon: <CheckCircle2 size={15} aria-hidden="true" />,
      active: filters.status === 'review',
      patch: { status: 'review' } satisfies Partial<TaskFilters>,
      tone: 'text-tr-warning',
    },
    {
      key: 'urgent',
      label: 'Khẩn cấp',
      count: openTasks.filter((task) => task.priority === 'urgent').length,
      icon: <Flame size={15} aria-hidden="true" />,
      active: filters.priority === 'urgent',
      patch: { status: 'open', priority: 'urgent' } satisfies Partial<TaskFilters>,
      tone: 'text-tr-danger',
    },
  ];

  return (
    <section
      aria-label="Tổng quan công việc"
      className="flex flex-wrap items-center gap-1.5 rounded-panel border border-tr-border bg-tr-panel p-1.5 shadow-sm"
    >
      <span className="px-2 text-2xs font-semibold tracking-wide text-tr-muted uppercase">
        Ưu tiên xử lý
      </span>
      {summary.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => setFilters({ ...emptyTaskFilters, ...item.patch })}
          aria-pressed={item.active}
          className={`inline-flex h-8 items-center gap-1.5 rounded-control border px-2.5 text-xs transition ${focusRing} ${
            item.active
              ? 'border-tr-primary/40 bg-tr-primary/15 text-tr-primary'
              : 'border-transparent text-tr-subtle hover:border-tr-border hover:bg-tr-hover'
          }`}
        >
          <span className={item.tone}>{item.icon}</span>
          <span className="font-semibold tabular-nums text-tr-text">
            {isLoading ? '—' : item.count}
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </section>
  );
}

type GroupBy = 'none' | 'priority' | 'customer' | 'board';

export default function TasksPage() {
  const { data: tasks = [], isLoading, error, refetch } = useTaskQuery();
  const resetFilters = useUiStore((s) => s.resetTaskFilters);
  const [mode, setMode] = useState<'tree' | 'table'>('tree');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [adding, setAdding] = useState(false);

  const groups = groupTasks(tasks, groupBy);

  return (
    <div className="space-y-3 p-4 sm:p-6">
      <TaskSummaryBar />

      <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1">
          <TaskFilterBar />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">
          {mode === 'tree' && (
            <label className="flex items-center gap-1.5 text-xs text-tr-muted">
              <span className="whitespace-nowrap">Nhóm theo</span>
              <span className="w-40">
                <Select
                  value={groupBy}
                  onChange={(event) => setGroupBy(event.target.value as GroupBy)}
                >
                  <option value="none">Không nhóm</option>
                  <option value="priority">Ưu tiên</option>
                  <option value="customer">Khách hàng</option>
                  <option value="board">Dự án / Bảng</option>
                </Select>
              </span>
            </label>
          )}
          <div
            role="group"
            aria-label="Kiểu hiển thị"
            className="inline-flex rounded-panel border border-tr-border bg-tr-panel p-0.5"
          >
            {(
              [
                ['tree', 'Cây công việc', <ListTree key="tree" size={14} aria-hidden="true" />],
                ['table', 'Danh sách', <List key="table" size={14} aria-hidden="true" />],
              ] as const
            ).map(([value, label, icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                className={`inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-xs transition ${focusRing} ${
                  mode === value
                    ? 'bg-tr-primary font-medium text-tr-on-primary'
                    : 'text-tr-subtle hover:bg-tr-hover'
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
          <Button variant="primary" onClick={() => setAdding((v) => !v)}>
            <Plus size={16} /> Thêm công việc
          </Button>
        </div>
      </div>

      {adding && <QuickAddRow onClose={() => setAdding(false)} />}

      {isLoading ? (
        <div className="rounded-panel border border-tr-border bg-tr-panel">
          <SkeletonRows rows={8} cols={6} />
        </div>
      ) : error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : mode === 'table' ? (
        <TaskTable tasks={tasks} onClearFilters={resetFilters} />
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.key}>
              {group.label && (
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-tr-text">
                  <span className="rounded-full border border-tr-border bg-tr-panel px-2.5 py-1">
                    {group.label}
                  </span>
                  <span className="text-xs font-normal text-tr-muted">
                    ({buildTree(group.tasks).length})
                  </span>
                </h3>
              )}
              <TaskTree
                tasks={group.tasks}
                emptyMessage="Không có công việc nào khớp bộ lọc."
                emptyHint="Thử nới bộ lọc hoặc thêm công việc mới."
                emptyAction={<Button onClick={resetFilters}>{t.common.clearFilter}</Button>}
              />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** Hàng thêm nhanh: tiêu đề + bảng/danh sách + ưu tiên + hạn, nhớ lựa chọn gần nhất. */
function QuickAddRow({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [boardId, setBoardId] = useState<string>('');
  const [listId, setListId] = useState<string>('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState('');
  const openTaskComposer = useUiStore((s) => s.openTaskComposer);

  const { data: boards = [] } = useQuery({
    queryKey: ['boards', false],
    queryFn: () => api.get<Board[]>('/api/boards'),
  });
  const { data: board } = useQuery({
    queryKey: ['board', Number(boardId)],
    queryFn: () => api.get<BoardFull>(`/api/boards/${boardId}/full`),
    enabled: boardId !== '',
  });
  const { data: customers = [] } = useQuery({
    queryKey: ['customers', 'select'],
    queryFn: () => api.get<Customer[]>('/api/customers'),
    staleTime: 60_000,
  });

  // Mặc định chọn bảng đầu tiên và danh sách đầu tiên của bảng đó
  useEffect(() => {
    if (boardId === '' && boards.length > 0) setBoardId(String(boards[0].id));
  }, [boards, boardId]);
  useEffect(() => {
    if (board && board.lists.length > 0) setListId(String(board.lists[0].id));
  }, [board?.id]);

  const create = useMutation({
    mutationFn: () =>
      api.post('/api/cards', {
        list_id: Number(listId),
        title: title.trim(),
        priority,
        due_date: dueDate,
        customer_id: customerId === '' ? null : Number(customerId),
      }),
    onSuccess: () => {
      invalidateCardViews(queryClient);
      setTitle('');
    },
  });

  const submit = () => {
    if (title.trim() && listId) create.mutate();
  };

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-tr-border bg-tr-panel p-3">
      <div className="min-w-56 flex-1">
        <Input
          autoFocus
          value={title}
          placeholder="Tên công việc mới…"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') onClose();
          }}
        />
      </div>
      <div className="w-44">
        <Select
          value={boardId}
          onChange={(e) => {
            setBoardId(e.target.value);
            setListId('');
          }}
        >
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-36">
        <Select value={listId} onChange={(e) => setListId(e.target.value)}>
          {board?.lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-36">
        <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
          {PRIORITY_ORDER.map((p) => (
            <option key={p} value={p}>
              {t.priority[p]}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-36">
        <DateInput value={dueDate} onChange={setDueDate} />
      </div>
      <div className="w-48">
        <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">— khách hàng —</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <Button variant="primary" disabled={!title.trim() || !listId} onClick={submit}>
        {t.common.add}
      </Button>
      {/* Can gan them co hoi / hop dong / viec can lam thi mo form day du, giu nguyen lua chon. */}
      <Button
        onClick={() => {
          openTaskComposer({
            context: customerId === '' ? {} : { customer_id: Number(customerId) },
            listId: listId === '' ? undefined : Number(listId),
            draftTitle: title.trim() || undefined,
          });
          onClose();
        }}
      >
        Chi tiết…
      </Button>
      <Button variant="ghost" onClick={onClose}>
        <X size={16} />
      </Button>
    </div>
  );
}

function groupTasks(
  tasks: TaskRow[],
  groupBy: GroupBy
): { key: string; label: string | null; color?: string; tasks: TaskRow[] }[] {
  if (groupBy === 'none') return [{ key: 'all', label: null, tasks }];

  if (groupBy === 'priority') {
    return PRIORITY_ORDER.map((p) => ({
      key: p,
      label: t.priority[p],
      color: PRIORITY_COLORS[p],
      tasks: withParents(tasks, (task) => task.priority === p),
    })).filter((group) => group.tasks.length > 0);
  }

  const keyOf = (task: TaskRow) =>
    groupBy === 'customer' ? (task.customer_name ?? 'Không gắn khách hàng') : task.board_name;

  const names = [...new Set(tasks.map(keyOf))].sort((a, b) => a.localeCompare(b, 'vi'));
  return names.map((name) => ({
    key: name,
    label: name,
    tasks: withParents(tasks, (task) => keyOf(task) === name),
  }));
}

/** Giữ lại việc cha của những việc con lọt bộ lọc để cây không bị đứt. */
function withParents(tasks: TaskRow[], match: (task: TaskRow) => boolean): TaskRow[] {
  const matched = tasks.filter(match);
  const ids = new Set(matched.map((task) => task.id));
  const result = [...matched];
  for (const task of matched) {
    if (task.parent_id && !ids.has(task.parent_id)) {
      const parent = tasks.find((p) => p.id === task.parent_id);
      if (parent) {
        result.push(parent);
        ids.add(parent.id);
      }
    }
  }
  return result;
}
