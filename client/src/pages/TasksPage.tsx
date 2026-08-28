import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Filter,
  Flame,
  List,
  ListTree,
  PauseCircle,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { api, qs } from '../api/client';
import { Combobox } from '../components/common/Combobox';
import { Popover, usePopover } from '../components/common/Popover';
import { PageHeader, PageShell } from '../components/common/PageShell';
import { TaskTree, buildTree } from '../components/tasks/TaskTree';
import { TaskTable } from '../components/tasks/TaskTable';
import { daysFromToday } from '../components/tasks/TaskPresentation';
import {
  Button,
  DateInput,
  ErrorState,
  FormError,
  Input,
  Select,
  SkeletonRows,
  focusRing,
} from '../components/common/ui';
import { PRIORITY_COLORS, PRIORITY_ORDER, t } from '../i18n/vi';
import { invalidateCardViews } from '../lib/queryKeys';
import { emptyTaskFilters, useUiStore, type TaskFilters } from '../stores/uiStore';
import { useAssignees } from '../components/tasks/AssigneePicker';
import { isWaitingStatus } from '../components/tasks/CardStatusControl';
import { parseAssigneeFilter } from '../components/kanban/BoardFilter';
import type {
  Assignee,
  Board,
  BoardFull,
  Card,
  Customer,
  Priority,
  Project,
  TaskRow,
} from '../types';

export function useTaskQuery() {
  const filters = useUiStore((s) => s.taskFilters);
  const params = {
    q: filters.q,
    priority: filters.priority,
    customer_id: filters.customerId,
    board_id: filters.boardId,
    project_id: filters.projectId,
    // Moi lat cat vong doi deu ngu y "chua xong" — khong ai loc viec da dong de
    // xem no tung bi chan hay khong.
    done: filters.status === 'done' ? '1' : filters.status === 'all' ? '' : '0',
    card_status: filters.status === 'doing' || filters.status === 'blocked' ? filters.status : '',
    waiting: filters.status === 'waiting' ? '1' : '',
    overdue: filters.due === 'overdue' ? '1' : '',
    /* Ba nhanh cua bo loc nguoi phu trach anh xa sang ba tham so khac nhau cua API:
       'mine' doc contacts.is_me o may chu, 'none' loc viec chua giao, so la mot nguoi. */
    assignee_contact_id: typeof filters.assignee === 'number' ? filters.assignee : '',
    mine: filters.assignee === 'mine' ? '1' : '',
    unassigned: filters.assignee === 'none' ? '1' : '',
  };
  return useQuery({
    queryKey: ['tasks', params, filters.status, filters.due],
    queryFn: () => api.get<TaskRow[]>(`/api/views/tasks${qs(params)}`),
    select: (rows) =>
      rows.filter((task) => {
        /* Chỉ đọc trạng thái thật. Trước v19 còn đoán thêm từ tên cột — cột nào
           mang nghĩa "Chờ duyệt" nay tự khai báo, và migration đã kéo trạng thái
           của thẻ khớp theo, nên không còn gì để đoán. */
        if (filters.status === 'review' && task.status !== 'review') return false;
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
  const { data: assignees = [] } = useAssignees();
  const { data: projects = [] } = useQuery({
    queryKey: ['projects', false],
    queryFn: () => api.get<Project[]>('/api/projects'),
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
    filters.projectId !== ''
      ? {
          key: 'project',
          label: `Dự án: ${projects.find((p) => p.id === filters.projectId)?.name ?? 'Đã chọn'}`,
          clear: () => setFilters({ projectId: '' }),
        }
      : null,
    filters.assignee !== ''
      ? {
          key: 'assignee',
          label: `${t.card.assignee}: ${assigneeFilterLabel(filters.assignee, assignees)}`,
          clear: () => setFilters({ assignee: '' }),
        }
      : null,
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  const advancedFilterCount = [
    filters.priority,
    filters.assignee,
    filters.customerId,
    filters.boardId,
    filters.projectId,
  ].filter((value) => value !== '').length;

  const clearAdvancedFilters = () =>
    setFilters({ priority: '', assignee: '', customerId: '', boardId: '', projectId: '' });

  return (
    <section
      aria-label="Bộ lọc công việc"
      className="min-w-0 rounded-panel border border-tr-border bg-tr-panel p-3 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative w-full min-w-52 flex-1 md:max-w-80">
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
        <div className="w-[calc(50%-0.25rem)] sm:w-40">
          <Select
            value={filters.status}
            aria-label="Trạng thái"
            onChange={(event) =>
              setFilters({ status: event.target.value as TaskFilters['status'] })
            }
          >
            <option value="open">Đang mở</option>
            <option value="all">Mọi trạng thái</option>
            <option value="doing">Đang làm</option>
            <option value="waiting">Đang chờ ai đó</option>
            <option value="blocked">Bị chặn</option>
            <option value="review">Chờ duyệt</option>
            <option value="done">Hoàn thành</option>
          </Select>
        </div>
        <div className="w-[calc(50%-0.25rem)] sm:w-44">
          <Select
            value={filters.due}
            aria-label="Hạn hoàn thành"
            onChange={(event) => setFilters({ due: event.target.value as TaskFilters['due'] })}
          >
            <option value="">Mọi hạn hoàn thành</option>
            <option value="overdue">Quá hạn</option>
            <option value="today">Hôm nay</option>
            <option value="tomorrow">Ngày mai</option>
            <option value="week">Trong 7 ngày</option>
            <option value="none">Chưa có deadline</option>
          </Select>
        </div>
        <button
          type="button"
          onClick={moreFilters.toggle}
          aria-haspopup="dialog"
          aria-expanded={moreFilters.open}
          className={`inline-flex h-9 items-center gap-1.5 rounded-control border border-tr-border bg-tr-surface px-3 text-sm font-medium text-tr-subtle transition hover:bg-tr-hover hover:text-tr-text ${focusRing}`}
        >
          <Filter size={14} aria-hidden="true" />
          Bộ lọc nâng cao
          {advancedFilterCount > 0 && (
            <span className="rounded-full bg-tr-primary px-1.5 text-xs font-semibold text-tr-on-primary">
              {advancedFilterCount}
            </span>
          )}
        </button>
        <Popover
          open={moreFilters.open}
          anchor={moreFilters.anchor}
          onClose={moreFilters.close}
          title="Bộ lọc nâng cao"
          width={360}
        >
          <label
            className="block text-xs font-semibold text-tr-subtle"
            htmlFor="task-priority-filter"
          >
            {t.card.priority}
          </label>
          <div className="mt-1.5">
            <Select
              id="task-priority-filter"
              value={filters.priority}
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
          <label
            className="mt-3 block text-xs font-semibold text-tr-subtle"
            htmlFor="task-assignee-filter"
          >
            {t.card.assignee}
          </label>
          <div className="mt-1.5">
            <Select
              id="task-assignee-filter"
              value={filters.assignee}
              onChange={(event) =>
                setFilters({ assignee: parseAssigneeFilter(event.target.value) })
              }
            >
              <option value="">Mọi người phụ trách</option>
              <option value="mine">{t.card.mine}</option>
              <option value="none">{t.card.unassigned}</option>
              {assignees.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name} · {person.org_name}
                </option>
              ))}
            </Select>
          </div>
          <label
            className="mt-3 block text-xs font-semibold text-tr-subtle"
            htmlFor="task-customer-filter"
          >
            {t.card.customer}
          </label>
          <div className="mt-1.5">
            <Select
              id="task-customer-filter"
              value={filters.customerId}
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
          <label
            className="mt-3 block text-xs font-semibold text-tr-subtle"
            htmlFor="task-board-filter"
          >
            Bảng
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
          <label
            className="mt-3 block text-xs font-semibold text-tr-subtle"
            htmlFor="task-project-filter"
          >
            {t.nav.projects}
          </label>
          <div className="mt-1.5">
            <Select
              id="task-project-filter"
              value={filters.projectId}
              onChange={(event) =>
                setFilters({
                  projectId: event.target.value === '' ? '' : Number(event.target.value),
                })
              }
            >
              <option value="">Mọi dự án</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="mt-4 border-t border-tr-border pt-3">
            <button
              type="button"
              onClick={clearAdvancedFilters}
              disabled={advancedFilterCount === 0}
              className={`text-xs font-medium text-tr-primary transition hover:underline disabled:cursor-not-allowed disabled:text-tr-muted disabled:no-underline ${focusRing}`}
            >
              Xóa bộ lọc nâng cao
            </button>
          </div>
        </Popover>
      </div>

      {activeFilters.length > 0 && (
        <div
          className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-tr-border/70 pt-2"
          aria-label="Bộ lọc đang áp dụng"
        >
          <span className="mr-0.5 text-xs text-tr-muted">Đang lọc:</span>
          {activeFilters.map((filter) => (
            <span
              key={filter.key}
              className="inline-flex min-h-7 max-w-64 items-center gap-1 rounded-full border border-tr-primary/30 bg-tr-primary/10 px-2.5 text-xs font-medium text-tr-primary"
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
    </section>
  );
}

function assigneeFilterLabel(value: TaskFilters['assignee'], assignees: Assignee[]): string {
  if (value === 'mine') return t.card.mine;
  if (value === 'none') return t.card.unassigned;
  return assignees.find((person) => person.id === value)?.full_name ?? 'Đã chọn';
}

const statusLabels: Record<TaskFilters['status'], string> = {
  all: 'Tất cả',
  open: 'Đang mở',
  done: 'Hoàn thành',
  doing: 'Đang làm',
  waiting: 'Đang chờ ai đó',
  blocked: 'Bị chặn',
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
      /* Viec dang cho ben ngoai — thu khong tu chay tiep va can mot loi nhac.
         Truoc v16 khong dem duoc vi khong co gi phan biet "cho" voi "chua lam". */
      key: 'waiting',
      label: 'Đang chờ',
      count: openTasks.filter((task) => isWaitingStatus(task.status)).length,
      icon: <PauseCircle size={15} aria-hidden="true" />,
      active: filters.status === 'waiting',
      patch: { status: 'waiting' } satisfies Partial<TaskFilters>,
      tone: 'text-amber-500',
    },
    {
      key: 'review',
      label: 'Chờ duyệt',
      count: openTasks.filter((task) => task.status === 'review').length,
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
      className="flex flex-wrap items-center gap-1 rounded-panel border border-tr-border bg-tr-panel p-2 shadow-sm"
    >
      <span className="px-2 text-xs font-semibold tracking-wide text-tr-subtle uppercase">
        Cần chú ý
      </span>
      {summary.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => setFilters({ ...emptyTaskFilters, ...item.patch })}
          aria-pressed={item.active}
          aria-label={`${item.label}: ${isLoading ? 'đang tải' : item.count}`}
          className={`inline-flex h-8 items-center gap-1.5 rounded-control border px-2.5 text-xs transition ${focusRing} ${
            item.active
              ? 'border-tr-primary/40 bg-tr-primary/15 text-tr-primary'
              : 'border-transparent text-tr-subtle hover:border-tr-border hover:bg-tr-hover hover:text-tr-text'
          } ${!item.active && !isLoading && item.count === 0 ? 'opacity-55' : ''}`}
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

type GroupBy = 'none' | 'priority' | 'customer' | 'board' | 'assignee';

export default function TasksPage() {
  const { data: tasks = [], isLoading, error, refetch } = useTaskQuery();
  const resetFilters = useUiStore((s) => s.resetTaskFilters);
  const [mode, setMode] = useState<'tree' | 'table'>('tree');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [adding, setAdding] = useState(false);

  const groups = groupTasks(tasks, groupBy);

  return (
    <PageShell width="wide" spacing="none">
      <PageHeader
        title="Công việc"
        description="Theo dõi, ưu tiên và cập nhật công việc trên mọi bảng, dự án và khách hàng."
        className="mb-4 flex-col sm:flex-row sm:items-center"
        actions={
          <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
            <div
              role="group"
              aria-label="Kiểu hiển thị"
              className="inline-flex rounded-panel border border-tr-border bg-tr-panel p-0.5 shadow-sm"
            >
              {(
                [
                  ['tree', 'Phân cấp', <ListTree key="tree" size={15} aria-hidden="true" />],
                  ['table', 'Bảng', <List key="table" size={15} aria-hidden="true" />],
                ] as const
              ).map(([value, label, icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  aria-pressed={mode === value}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-xs font-medium transition ${focusRing} ${
                    mode === value
                      ? 'bg-tr-hover-strong text-tr-text shadow-sm'
                      : 'text-tr-muted hover:bg-tr-hover hover:text-tr-text'
                  }`}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
            <Button
              variant="primary"
              aria-expanded={adding}
              onClick={() => setAdding((value) => !value)}
            >
              <Plus size={16} aria-hidden="true" /> Thêm công việc
            </Button>
          </div>
        }
      />

      <TaskSummaryBar />

      <div className="mt-3">
        <TaskFilterBar />
      </div>

      {adding && (
        <div className="mt-3">
          <QuickAddRow onClose={() => setAdding(false)} />
        </div>
      )}

      <div className="mt-3 mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-tr-muted" aria-live="polite">
          {isLoading ? 'Đang tải công việc…' : `Hiển thị ${tasks.length} công việc`}
          {mode === 'tree' && ' theo cấu trúc cha – con'}
        </p>
        {mode === 'tree' && (
          <label className="flex items-center gap-2 text-xs font-medium text-tr-subtle">
            <span className="whitespace-nowrap">Nhóm theo</span>
            <span className="w-44">
              <Select
                value={groupBy}
                aria-label="Nhóm công việc theo"
                onChange={(event) => setGroupBy(event.target.value as GroupBy)}
              >
                <option value="none">Không nhóm</option>
                <option value="priority">Ưu tiên</option>
                <option value="customer">Khách hàng</option>
                <option value="assignee">{t.card.assignee}</option>
                <option value="board">Bảng</option>
              </Select>
            </span>
          </label>
        )}
      </div>

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
    </PageShell>
  );
}

/** Hàng thêm nhanh: tiêu đề + bảng/danh sách + ưu tiên + hạn, nhớ lựa chọn gần nhất. */
function QuickAddRow({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const titleRef = useRef<HTMLInputElement>(null);
  const openTaskComposer = useUiStore((s) => s.openTaskComposer);
  const pushToast = useUiStore((s) => s.pushToast);
  const openCard = useUiStore((s) => s.openCard);
  // Bang/khach hang dang loc o trang: dung lam mac dinh de the moi khong "roi" khoi view.
  const activeFilters = useUiStore((s) => s.taskFilters);

  const [title, setTitle] = useState('');
  const [boardId, setBoardId] = useState<string>('');
  const [listId, setListId] = useState<string>('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState<string | null>(null);
  // Khoi tao mot lan tu bo loc dang mo — sau do nguoi dung tu do doi, khong bi ghi de.
  const [customerId, setCustomerId] = useState(() =>
    activeFilters.customerId === '' ? '' : String(activeFilters.customerId)
  );

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

  // Uu tien bang dang loc tren trang; khong co thi moi roi ve bang dau tien.
  useEffect(() => {
    if (boardId !== '' || boards.length === 0) return;
    const filtered =
      activeFilters.boardId !== '' && boards.some((b) => b.id === activeFilters.boardId)
        ? activeFilters.boardId
        : boards[0].id;
    setBoardId(String(filtered));
  }, [boards, boardId, activeFilters.boardId]);
  useEffect(() => {
    if (board && board.lists.length > 0) setListId(String(board.lists[0].id));
  }, [board?.id]);

  const create = useMutation({
    mutationFn: () =>
      api.post<Card>('/api/cards', {
        list_id: Number(listId),
        title: title.trim(),
        priority,
        due_date: dueDate,
        customer_id: customerId === '' ? null : Number(customerId),
      }),
    onSuccess: (created) => {
      invalidateCardViews(queryClient);
      setTitle('');
      pushToast('Đã tạo công việc', 'success', {
        label: 'Mở công việc',
        run: () => openCard(created.id),
      });
      // Cho phep go lien tuc them viec ke tiep ma khong can bam lai vao o tieu de.
      requestAnimationFrame(() => titleRef.current?.focus());
    },
  });

  const submit = () => {
    if (title.trim() && listId && !create.isPending) create.mutate();
  };

  return (
    <div className="rounded-lg border border-tr-border bg-tr-panel p-3">
      <FormError error={create.error} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <Input
            ref={titleRef}
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
          <Combobox
            value={boardId === '' ? '' : Number(boardId)}
            onChange={(v) => {
              setBoardId(v === '' ? '' : String(v));
              setListId('');
            }}
            options={boards.map((b) => ({ id: b.id, label: b.name }))}
            searchPlaceholder="Tìm bảng…"
            emptyText="Không tìm thấy bảng."
            ariaLabel="Bảng"
            allowClear={false}
            onQuickCreate={async (name) => {
              const created = await api.post<Board>('/api/boards', { name });
              queryClient.invalidateQueries({ queryKey: ['boards'] });
              return { id: created.id, label: created.name };
            }}
            quickCreateLabel={(q) => `+ Tạo bảng "${q}"`}
          />
        </div>
        <div className="w-36">
          <Select value={listId} onChange={(e) => setListId(e.target.value)} aria-label="Danh sách">
            {board?.lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-36">
          <Select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            aria-label="Ưu tiên"
          >
            {PRIORITY_ORDER.map((p) => (
              <option key={p} value={p}>
                {t.priority[p]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-36">
          <DateInput value={dueDate} onChange={setDueDate} aria-label="Hạn hoàn thành" />
        </div>
        <div className="w-48">
          <Combobox
            value={customerId === '' ? '' : Number(customerId)}
            onChange={(v) => setCustomerId(v === '' ? '' : String(v))}
            options={customers.map((c) => ({ id: c.id, label: c.name }))}
            placeholder="— khách hàng —"
            searchPlaceholder="Tìm khách hàng…"
            emptyText="Không tìm thấy khách hàng."
            ariaLabel="Khách hàng"
            onQuickCreate={async (name) => {
              const created = await api.post<Customer>('/api/customers', { name });
              queryClient.invalidateQueries({ queryKey: ['customers'] });
              return { id: created.id, label: created.name };
            }}
            quickCreateLabel={(q) => `+ Tạo khách hàng "${q}"`}
          />
        </div>
        <Button
          variant="primary"
          disabled={!title.trim() || !listId || create.isPending}
          onClick={submit}
        >
          {create.isPending ? 'Đang thêm…' : t.common.add}
        </Button>
        {/* Can gan them co hoi / hop dong / viec can lam thi mo form day du, giu nguyen lua chon. */}
        <Button
          onClick={() => {
            openTaskComposer({
              context: customerId === '' ? {} : { customer_id: Number(customerId) },
              listId: listId === '' ? undefined : Number(listId),
              draft: { title: title.trim(), priority, dueDate },
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

  const keyOf = (task: TaskRow) => {
    if (groupBy === 'customer') return task.customer_name ?? 'Không gắn khách hàng';
    if (groupBy === 'assignee') {
      // Kèm tổ chức: hai người trùng tên ở hai công ty là chuyện thường.
      if (!task.assignee_name) return t.card.unassigned;
      return task.assignee_org_name
        ? `${task.assignee_name} · ${task.assignee_org_name}`
        : task.assignee_name;
    }
    return task.board_name;
  };

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
