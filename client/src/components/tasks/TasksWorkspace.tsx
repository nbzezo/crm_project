import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Archive,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Eye,
  Filter,
  FolderKanban,
  KanbanSquare,
  List,
  Menu,
  Plus,
  Save,
  Search,
  Share2,
  SlidersHorizontal,
  Trash2,
  UserCheck,
  UserRound,
  X,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { api, qs } from '../../api/client';
import { PRIORITY_ORDER, t } from '../../i18n/vi';
import { invalidateCardViews } from '../../lib/queryKeys';
import { useAuthStore } from '../../stores/authStore';
import {
  countActiveTaskFilters,
  emptyTaskFilters,
  useUiStore,
  type TaskFilters,
} from '../../stores/uiStore';
import type { Assignee, Board, Card, Customer, Priority, Project, TaskRow } from '../../types';
import { Combobox } from '../common/Combobox';
import { Popover, usePopover } from '../common/Popover';
import { PageShell } from '../common/PageShell';
import {
  Button,
  DateInput,
  ErrorState,
  FormError,
  Select,
  SkeletonRows,
  focusRing,
} from '../common/ui';
import { parseAssigneeFilter } from '../kanban/BoardFilter';
import { useAssignees } from './AssigneePicker';
import { TaskWorkspaceCalendar } from './TaskWorkspaceCalendar';
import { TaskWorkspaceKanban } from './TaskWorkspaceKanban';
import { TaskWorkspaceList } from './TaskWorkspaceList';
import {
  DEFAULT_TASK_COLUMNS,
  TASK_COLUMN_LABELS,
  type SavedTaskView,
  type TaskActivity,
  type TaskColumnKey,
  type TaskGroup,
  type TaskScope,
  type TaskSort,
  type TaskViewMode,
  type TaskWorkspaceConfig,
} from './TaskWorkspaceTypes';

const PREF_KEY = 'workflow.tasks-workspace.v1';

interface WorkspacePreferences {
  mode: TaskViewMode;
  sort: TaskSort;
  group: TaskGroup;
  columns: TaskColumnKey[];
  sidebarCollapsed: boolean;
}

const DEFAULT_PREFERENCES: WorkspacePreferences = {
  mode: 'list',
  sort: 'due_asc',
  group: 'due',
  columns: DEFAULT_TASK_COLUMNS,
  sidebarCollapsed: false,
};

function loadPreferences(): WorkspacePreferences {
  try {
    const value = JSON.parse(
      localStorage.getItem(PREF_KEY) ?? '{}'
    ) as Partial<WorkspacePreferences>;
    return {
      mode: value.mode ?? DEFAULT_PREFERENCES.mode,
      sort: value.sort ?? DEFAULT_PREFERENCES.sort,
      group: value.group ?? DEFAULT_PREFERENCES.group,
      columns: Array.isArray(value.columns) ? value.columns : DEFAULT_PREFERENCES.columns,
      sidebarCollapsed: value.sidebarCollapsed ?? false,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function taskParams(scope: TaskScope, filters: TaskFilters) {
  return {
    q: filters.q,
    priority: filters.priority,
    customer_id: filters.customerId,
    board_id: filters.boardId,
    project_id: filters.projectId,
    done:
      scope === 'completed'
        ? '1'
        : filters.status === 'done'
          ? '1'
          : filters.status === 'all'
            ? ''
            : '0',
    card_status:
      filters.status === 'doing' || filters.status === 'blocked' || filters.status === 'review'
        ? filters.status
        : '',
    waiting: filters.status === 'waiting' ? '1' : '',
    overdue: filters.due === 'overdue' ? '1' : '',
    assignee_contact_id: typeof filters.assignee === 'number' ? filters.assignee : '',
    mine: scope === 'assigned' || filters.assignee === 'mine' ? '1' : '',
    unassigned: filters.assignee === 'none' ? '1' : '',
    created: scope === 'created' ? '1' : '',
    watching: scope === 'watching' ? '1' : '',
  };
}

function useWorkspaceTasks(scope: TaskScope) {
  const filters = useUiStore((state) => state.taskFilters);
  const params = taskParams(scope, filters);
  return useQuery({
    queryKey: ['tasks', 'workspace', scope, params],
    queryFn: () => api.get<TaskRow[]>(`/api/views/tasks${qs(params)}`),
    enabled: scope !== 'activity',
    select: (rows) =>
      rows.filter((task) => {
        if (filters.due === 'none') return task.due_date === null;
        if (!filters.due || filters.due === 'overdue') return true;
        if (!task.due_date) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const due = new Date(`${task.due_date.slice(0, 10)}T00:00:00`);
        const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
        if (filters.due === 'today') return days === 0;
        if (filters.due === 'tomorrow') return days === 1;
        return days >= 0 && days <= 7;
      }),
  });
}

function WorkspaceSidebar({
  scope,
  onScope,
  collapsed,
  onToggle,
  summary,
  boards,
  savedViews,
  onApplySavedView,
  onDeleteSavedView,
}: {
  scope: TaskScope;
  onScope: (scope: TaskScope) => void;
  collapsed: boolean;
  onToggle: () => void;
  summary: TaskRow[];
  boards: Board[];
  savedViews: SavedTaskView[];
  onApplySavedView: (view: SavedTaskView) => void;
  onDeleteSavedView: (view: SavedTaskView) => void;
}) {
  const userId = useAuthStore((state) => state.user?.id);
  const counts = {
    owned: summary.filter((task) => !task.is_done).length,
    assigned: summary.filter((task) => !task.is_done && task.is_assigned_to_me).length,
    created: summary.filter((task) => !task.is_done && task.is_created_by_me).length,
    watching: summary.filter((task) => task.is_watching).length,
    completed: summary.filter((task) => task.is_done).length,
  };
  const items: { key: TaskScope; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'owned', label: 'Đang mở', icon: <UserRound size={16} />, count: counts.owned },
    { key: 'assigned', label: 'Được giao', icon: <UserCheck size={16} />, count: counts.assigned },
    { key: 'created', label: 'Tôi đã tạo', icon: <Plus size={16} />, count: counts.created },
    { key: 'watching', label: 'Đang theo dõi', icon: <Eye size={16} />, count: counts.watching },
    {
      key: 'completed',
      label: 'Hoàn thành',
      icon: <CheckCircle2 size={16} />,
      count: counts.completed,
    },
    { key: 'activity', label: 'Hoạt động', icon: <Activity size={16} /> },
    { key: 'all', label: 'Tất cả công việc', icon: <Archive size={16} /> },
  ];

  const setBoard = useUiStore((state) => state.setTaskFilters);
  return (
    <aside
      className={`${collapsed ? 'w-14' : 'w-full lg:w-56'} shrink-0 border-b border-tr-border bg-tr-surface transition-[width] lg:border-r lg:border-b-0`}
      aria-label="Điều hướng công việc"
    >
      <div className="flex h-14 items-center justify-between border-b border-tr-border px-3">
        {!collapsed && <span className="text-base font-semibold text-tr-text">Công việc</span>}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Mở rộng điều hướng công việc' : 'Thu gọn điều hướng công việc'}
          className={`rounded-control p-2 text-tr-muted hover:bg-tr-hover hover:text-tr-text ${focusRing}`}
        >
          {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
        </button>
      </div>
      <div
        className={`${collapsed ? 'hidden lg:block' : 'block'} tr-scroll max-h-72 overflow-y-auto p-2 lg:max-h-none`}
      >
        <nav className="space-y-1">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onScope(item.key)}
              aria-current={scope === item.key ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
              className={`flex min-h-10 w-full items-center gap-2 rounded-control px-2 text-sm transition ${focusRing} ${scope === item.key ? 'bg-tr-primary/12 font-medium text-tr-primary' : 'text-tr-subtle hover:bg-tr-hover hover:text-tr-text'} ${collapsed ? 'justify-center' : ''}`}
            >
              <span className="shrink-0">{item.icon}</span>
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                  {item.count !== undefined && (
                    <span className="text-xs tabular-nums text-tr-muted">{item.count}</span>
                  )}
                </>
              )}
            </button>
          ))}
        </nav>

        {!collapsed && (
          <>
            <div className="my-3 border-t border-tr-border" />
            <h3 className="px-2 text-xs font-semibold uppercase tracking-wide text-tr-muted">
              Truy cập nhanh
            </h3>
            <div className="mt-1 space-y-0.5">
              {savedViews.length === 0 && (
                <p className="px-2 py-2 text-xs text-tr-muted">Chưa có chế độ xem đã lưu.</p>
              )}
              {savedViews.map((view) => (
                <div
                  key={view.id}
                  className="group flex items-center rounded-control hover:bg-tr-hover"
                >
                  <button
                    type="button"
                    onClick={() => onApplySavedView(view)}
                    className={`flex min-h-9 min-w-0 flex-1 items-center gap-2 px-2 text-left text-xs text-tr-subtle ${focusRing}`}
                  >
                    {view.is_shared ? <Share2 size={13} /> : <Save size={13} />}
                    <span className="truncate">{view.name}</span>
                  </button>
                  {view.owner_user_id === userId && (
                    <button
                      type="button"
                      onClick={() => onDeleteSavedView(view)}
                      aria-label={`Xóa chế độ xem ${view.name}`}
                      className={`invisible mr-1 rounded p-1 text-tr-muted hover:text-tr-danger group-hover:visible focus:visible ${focusRing}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="my-3 border-t border-tr-border" />
            <h3 className="px-2 text-xs font-semibold uppercase tracking-wide text-tr-muted">
              Danh sách công việc
            </h3>
            <div className="mt-1 space-y-0.5">
              {boards.slice(0, 10).map((board) => (
                <button
                  key={board.id}
                  type="button"
                  onClick={() => {
                    setBoard({ boardId: board.id });
                    onScope('all');
                  }}
                  className={`flex min-h-9 w-full items-center gap-2 rounded-control px-2 text-xs text-tr-subtle hover:bg-tr-hover hover:text-tr-text ${focusRing}`}
                >
                  <FolderKanban size={14} style={{ color: board.color }} />
                  <span className="truncate">{board.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function QuickAdd({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const openTaskComposer = useUiStore((state) => state.openTaskComposer);
  const openCard = useUiStore((state) => state.openCard);
  const pushToast = useUiStore((state) => state.pushToast);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () =>
      api.post<Card>('/api/cards', { title: title.trim(), priority, due_date: dueDate }),
    onSuccess: (card) => {
      invalidateCardViews(queryClient);
      setTitle('');
      pushToast('Đã tạo công việc', 'success', {
        label: 'Mở',
        run: () => openCard(card.id, 'drawer'),
      });
    },
  });
  const submit = () => title.trim() && !create.isPending && create.mutate();
  return (
    <div className="border-b border-tr-border bg-tr-primary/5 px-3 py-3">
      <FormError error={create.error} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-64 flex-1">
          <span className="sr-only">Tên công việc mới</span>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit();
              if (event.key === 'Escape') onClose();
            }}
            placeholder="Tên công việc mới…"
            className={`h-9 w-full rounded-control border border-tr-primary bg-tr-panel px-3 text-sm text-tr-text outline-none ${focusRing}`}
          />
        </label>
        <Select
          value={priority}
          onChange={(event) => setPriority(event.target.value as Priority)}
          aria-label="Ưu tiên"
        >
          {PRIORITY_ORDER.map((value) => (
            <option key={value} value={value}>
              {t.priority[value]}
            </option>
          ))}
        </Select>
        <div className="w-40">
          <DateInput value={dueDate} onChange={setDueDate} aria-label="Hạn hoàn thành" />
        </div>
        <Button variant="primary" disabled={!title.trim() || create.isPending} onClick={submit}>
          {create.isPending ? 'Đang thêm…' : 'Thêm'}
        </Button>
        <Button
          onClick={() => {
            openTaskComposer({ context: {}, draft: { title: title.trim(), priority, dueDate } });
            onClose();
          }}
        >
          Chi tiết…
        </Button>
        <Button variant="ghost" onClick={onClose} aria-label="Đóng thêm nhanh">
          <X size={16} />
        </Button>
      </div>
    </div>
  );
}

function ActivityFeed() {
  const openCard = useUiStore((state) => state.openCard);
  const {
    data = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['tasks', 'activity'],
    queryFn: () => api.get<TaskActivity[]>('/api/views/tasks/activity'),
  });
  const actionText = (item: TaskActivity) => {
    if (item.action === 'created') return 'đã tạo công việc';
    if (item.action === 'completed') return 'đã hoàn thành';
    if (item.action === 'reopened') return 'đã mở lại';
    if (item.action === 'moved') return 'đã di chuyển';
    if (item.action === 'commented') return 'đã bình luận';
    if (item.action === 'watched')
      return item.new_value === 'true' ? 'đã theo dõi' : 'đã bỏ theo dõi';
    return `đã cập nhật ${item.field ?? 'công việc'}`;
  };
  if (isLoading) return <SkeletonRows rows={8} cols={3} />;
  if (error) return <ErrorState onRetry={() => refetch()} />;
  return (
    <div className="mx-auto max-w-4xl rounded-panel border border-tr-border bg-tr-panel shadow-sm">
      {data.length === 0 ? (
        <p className="p-8 text-center text-sm text-tr-muted">Chưa có hoạt động công việc.</p>
      ) : (
        data.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => openCard(item.card_id, 'drawer')}
            className={`flex w-full gap-3 border-b border-tr-border px-4 py-3 text-left last:border-b-0 hover:bg-tr-hover ${focusRing}`}
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tr-primary/10 text-tr-primary">
              <Activity size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-sm text-tr-text">
                <strong>{item.actor_name ?? 'Hệ thống'}</strong> {actionText(item)}{' '}
                <strong>“{item.task_title}”</strong>
              </span>
              {item.new_value && item.action === 'updated' && (
                <span className="mt-0.5 block truncate text-xs text-tr-subtle">
                  Giá trị mới: {item.new_value}
                </span>
              )}
              <span className="mt-1 block text-xs text-tr-muted">
                {item.board_name} ·{' '}
                {formatDistanceToNow(new Date(item.created_at.replace(' ', 'T')), {
                  addSuffix: true,
                  locale: vi,
                })}
              </span>
            </span>
          </button>
        ))
      )}
    </div>
  );
}

function FilterPanel({ onClose }: { onClose: () => void }) {
  const filters = useUiStore((state) => state.taskFilters);
  const setFilters = useUiStore((state) => state.setTaskFilters);
  const reset = useUiStore((state) => state.resetTaskFilters);
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
  const { data: projects = [] } = useQuery({
    queryKey: ['projects', false],
    queryFn: () => api.get<Project[]>('/api/projects'),
    staleTime: 60_000,
  });
  const { data: assignees = [] } = useAssignees();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold text-tr-subtle">
        Trạng thái
        <Select
          value={filters.status}
          onChange={(event) => setFilters({ status: event.target.value as TaskFilters['status'] })}
        >
          <option value="open">Đang mở</option>
          <option value="all">Mọi trạng thái</option>
          <option value="doing">Đang làm</option>
          <option value="waiting">Đang chờ</option>
          <option value="blocked">Bị chặn</option>
          <option value="review">Chờ duyệt</option>
          <option value="done">Hoàn thành</option>
        </Select>
      </label>
      <label className="text-xs font-semibold text-tr-subtle">
        Hạn
        <Select
          value={filters.due}
          onChange={(event) => setFilters({ due: event.target.value as TaskFilters['due'] })}
        >
          <option value="">Mọi hạn</option>
          <option value="overdue">Quá hạn</option>
          <option value="today">Hôm nay</option>
          <option value="tomorrow">Ngày mai</option>
          <option value="week">Trong 7 ngày</option>
          <option value="none">Không có hạn</option>
        </Select>
      </label>
      <label className="text-xs font-semibold text-tr-subtle">
        Ưu tiên
        <Select
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
      </label>
      <label className="text-xs font-semibold text-tr-subtle">
        Người phụ trách
        <Select
          aria-label="Người phụ trách"
          value={filters.assignee}
          onChange={(event) => setFilters({ assignee: parseAssigneeFilter(event.target.value) })}
        >
          <option value="">Mọi người</option>
          <option value="mine">Của tôi</option>
          <option value="none">Chưa giao</option>
          {(assignees as Assignee[]).map((person) => (
            <option key={person.id} value={person.id}>
              {person.full_name}
            </option>
          ))}
        </Select>
      </label>
      <label className="text-xs font-semibold text-tr-subtle">
        Khách hàng
        <Combobox
          value={filters.customerId}
          onChange={(value) => setFilters({ customerId: value === '' ? '' : Number(value) })}
          options={customers.map((item) => ({ id: item.id, label: item.name }))}
          placeholder="Mọi khách hàng"
          searchPlaceholder="Tìm khách hàng…"
          emptyText="Không tìm thấy."
          ariaLabel="Khách hàng"
        />
      </label>
      <label className="text-xs font-semibold text-tr-subtle">
        Bảng
        <Combobox
          value={filters.boardId}
          onChange={(value) => setFilters({ boardId: value === '' ? '' : Number(value) })}
          options={boards.map((item) => ({ id: item.id, label: item.name }))}
          placeholder="Mọi bảng"
          searchPlaceholder="Tìm bảng…"
          emptyText="Không tìm thấy."
          ariaLabel="Bảng"
        />
      </label>
      <label className="text-xs font-semibold text-tr-subtle sm:col-span-2">
        Dự án
        <Combobox
          value={filters.projectId}
          onChange={(value) => setFilters({ projectId: value === '' ? '' : Number(value) })}
          options={projects.map((item) => ({ id: item.id, label: item.name }))}
          placeholder="Mọi dự án"
          searchPlaceholder="Tìm dự án…"
          emptyText="Không tìm thấy."
          ariaLabel="Dự án"
        />
      </label>
      <div className="flex justify-between border-t border-tr-border pt-3 sm:col-span-2">
        <Button variant="ghost" onClick={reset}>
          Xóa bộ lọc
        </Button>
        <Button variant="primary" onClick={onClose}>
          Xong
        </Button>
      </div>
    </div>
  );
}

export function TasksWorkspace() {
  const queryClient = useQueryClient();
  const preferences = useMemo(loadPreferences, []);
  const [scope, setScope] = useState<TaskScope>('owned');
  const [mode, setMode] = useState<TaskViewMode>(preferences.mode);
  const [sort, setSort] = useState<TaskSort>(preferences.sort);
  const [group, setGroup] = useState<TaskGroup>(preferences.group);
  const [columns, setColumns] = useState<TaskColumnKey[]>(preferences.columns);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(preferences.sidebarCollapsed);
  const [adding, setAdding] = useState(false);
  const [savingView, setSavingView] = useState(false);
  const [viewName, setViewName] = useState('');
  const [viewShared, setViewShared] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const filters = useUiStore((state) => state.taskFilters);
  const setFilters = useUiStore((state) => state.setTaskFilters);
  const resetFilters = useUiStore((state) => state.resetTaskFilters);
  const filterPopover = usePopover();
  const columnPopover = usePopover();
  const { data: tasks = [], isLoading, error, refetch } = useWorkspaceTasks(scope);
  const { data: summary = [] } = useQuery({
    queryKey: ['tasks', 'workspace-summary'],
    queryFn: () => api.get<TaskRow[]>('/api/views/tasks'),
    staleTime: 30_000,
  });
  const { data: boards = [] } = useQuery({
    queryKey: ['boards', false],
    queryFn: () => api.get<Board[]>('/api/boards'),
    staleTime: 60_000,
  });
  const { data: savedViews = [] } = useQuery({
    queryKey: ['tasks', 'saved-views'],
    queryFn: () => api.get<SavedTaskView[]>('/api/views/tasks/saved-views'),
  });

  useEffect(() => {
    localStorage.setItem(
      PREF_KEY,
      JSON.stringify({
        mode,
        sort,
        group,
        columns,
        sidebarCollapsed,
      } satisfies WorkspacePreferences)
    );
  }, [mode, sort, group, columns, sidebarCollapsed]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key === '/' &&
        !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const saveView = useMutation({
    mutationFn: () =>
      api.post('/api/views/tasks/saved-views', {
        name: viewName.trim(),
        is_shared: viewShared,
        config: { scope, mode, sort, group, columns, filters } satisfies TaskWorkspaceConfig,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'saved-views'] });
      setSavingView(false);
      setViewName('');
      setViewShared(false);
    },
  });
  const deleteView = useMutation({
    mutationFn: (id: number) => api.del(`/api/views/tasks/saved-views/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks', 'saved-views'] }),
  });

  const applyScope = (next: TaskScope) => {
    setScope(next);
    if (next === 'completed') setFilters({ status: 'done' });
    else if (next !== 'activity')
      setFilters({ status: next === 'all' ? 'all' : 'open', assignee: '' });
  };
  const applySaved = (view: SavedTaskView) => {
    const config = view.config;
    if (config.scope) setScope(config.scope);
    if (config.mode) setMode(config.mode);
    if (config.sort) setSort(config.sort);
    if (config.group) setGroup(config.group);
    if (config.columns) setColumns(config.columns);
    if (config.filters) setFilters({ ...emptyTaskFilters, ...config.filters });
  };
  const filterCount = countActiveTaskFilters(filters);

  return (
    <PageShell width="default" spacing="none" className="!p-0">
      <div className="flex h-[calc(100dvh-3.5rem)] min-h-[640px] flex-col overflow-hidden bg-tr-panel lg:flex-row">
        <WorkspaceSidebar
          scope={scope}
          onScope={applyScope}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((value) => !value)}
          summary={summary}
          boards={boards}
          savedViews={savedViews}
          onApplySavedView={applySaved}
          onDeleteSavedView={(view) => deleteView.mutate(view.id)}
        />
        <section
          className="flex min-w-0 flex-1 flex-col overflow-hidden"
          aria-label="Nội dung công việc"
        >
          <header className="shrink-0 border-b border-tr-border bg-tr-panel">
            <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-3 lg:px-5">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed((value) => !value)}
                  className={`rounded-control p-2 text-tr-muted hover:bg-tr-hover lg:hidden ${focusRing}`}
                  aria-label="Mở điều hướng"
                >
                  <Menu size={18} />
                </button>
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-semibold text-tr-text">
                    {scope === 'activity'
                      ? 'Hoạt động công việc'
                      : scope === 'completed'
                        ? 'Công việc hoàn thành'
                        : scope === 'watching'
                          ? 'Đang theo dõi'
                          : scope === 'created'
                            ? 'Tôi đã tạo'
                            : scope === 'assigned'
                              ? 'Được giao cho tôi'
                              : scope === 'all'
                                ? 'Tất cả công việc'
                                : 'Công việc'}
                  </h1>
                  <p className="text-xs text-tr-muted">
                    {scope === 'activity'
                      ? 'Dòng thời gian thay đổi trên các công việc bạn có quyền xem'
                      : `${isLoading ? 'Đang tải' : tasks.length} công việc`}
                  </p>
                </div>
              </div>
              <Button
                variant="primary"
                aria-expanded={adding}
                onClick={() => setAdding((value) => !value)}
              >
                <Plus size={16} /> Thêm công việc
              </Button>
            </div>
            {scope !== 'activity' && (
              <div
                className="flex items-center gap-1 px-3 lg:px-5"
                role="tablist"
                aria-label="Kiểu hiển thị công việc"
              >
                {(
                  [
                    ['list', 'Danh sách', <List size={15} key="list" />],
                    ['kanban', 'Kanban', <KanbanSquare size={15} key="kanban" />],
                    ['calendar', 'Lịch', <CalendarDays size={15} key="calendar" />],
                  ] as const
                ).map(([value, label, icon]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={mode === value}
                    onClick={() => setMode(value)}
                    className={`relative inline-flex min-h-10 items-center gap-1.5 px-3 text-xs font-medium ${focusRing} ${mode === value ? 'text-tr-primary' : 'text-tr-muted hover:text-tr-text'}`}
                  >
                    {icon}
                    {label}
                    {mode === value && (
                      <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-tr-primary" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </header>

          {adding && <QuickAdd onClose={() => setAdding(false)} />}

          {scope !== 'activity' && (
            <div className="border-b border-tr-border bg-tr-surface/70 px-3 py-2 lg:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative min-w-56 flex-1 lg:max-w-80">
                  <span className="sr-only">Tìm công việc</span>
                  <Search
                    size={15}
                    className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-tr-muted"
                  />
                  <input
                    ref={searchRef}
                    value={filters.q}
                    onChange={(event) => setFilters({ q: event.target.value })}
                    placeholder="Tìm công việc…  /"
                    className={`h-9 w-full rounded-control border border-tr-border bg-tr-panel pr-3 pl-8 text-sm text-tr-text outline-none placeholder:text-tr-muted focus:border-tr-primary ${focusRing}`}
                  />
                </label>
                <button
                  type="button"
                  onClick={filterPopover.toggle}
                  aria-expanded={filterPopover.open}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-control border px-3 text-xs font-medium ${focusRing} ${filterCount ? 'border-tr-primary/30 bg-tr-primary/10 text-tr-primary' : 'border-tr-border bg-tr-panel text-tr-subtle hover:bg-tr-hover'}`}
                >
                  <Filter size={14} /> Bộ lọc nâng cao{' '}
                  {filterCount > 0 && (
                    <span className="rounded-full bg-tr-primary px-1.5 text-tr-on-primary">
                      {filterCount}
                    </span>
                  )}
                </button>
                <Popover
                  open={filterPopover.open}
                  anchor={filterPopover.anchor}
                  onClose={filterPopover.close}
                  title="Bộ lọc nâng cao"
                  width={420}
                >
                  <FilterPanel onClose={filterPopover.close} />
                </Popover>
                <label className="inline-flex h-9 items-center gap-1 rounded-control border border-tr-border bg-tr-panel px-2 text-xs text-tr-subtle">
                  <SlidersHorizontal size={14} />
                  <span className="sr-only">Sắp xếp</span>
                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as TaskSort)}
                    className="bg-transparent outline-none"
                  >
                    <option value="due_asc">Hạn: sớm nhất</option>
                    <option value="due_desc">Hạn: muộn nhất</option>
                    <option value="created_desc">Mới tạo</option>
                    <option value="priority_desc">Ưu tiên cao</option>
                    <option value="title_asc">Tên A–Z</option>
                  </select>
                </label>
                <label className="inline-flex h-9 items-center gap-1 rounded-control border border-tr-border bg-tr-panel px-2 text-xs text-tr-subtle">
                  <Columns3 size={14} />
                  <span className="sr-only">Nhóm theo</span>
                  <select
                    value={group}
                    onChange={(event) => setGroup(event.target.value as TaskGroup)}
                    className="bg-transparent outline-none"
                  >
                    <option value="due">Nhóm: Hạn</option>
                    <option value="status">Nhóm: Trạng thái</option>
                    <option value="priority">Nhóm: Ưu tiên</option>
                    <option value="assignee">Nhóm: Phụ trách</option>
                    <option value="board">Nhóm: Bảng</option>
                    <option value="customer">Nhóm: Khách hàng</option>
                    <option value="none">Không nhóm</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={columnPopover.toggle}
                  aria-expanded={columnPopover.open}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-control border border-tr-border bg-tr-panel px-3 text-xs font-medium text-tr-subtle hover:bg-tr-hover ${focusRing}`}
                >
                  <Columns3 size={14} /> Tùy chỉnh cột
                </button>
                <Popover
                  open={columnPopover.open}
                  anchor={columnPopover.anchor}
                  onClose={columnPopover.close}
                  title="Cột hiển thị"
                  width={300}
                >
                  <div className="grid grid-cols-2 gap-1">
                    {(Object.keys(TASK_COLUMN_LABELS) as TaskColumnKey[]).map((column) => (
                      <label
                        key={column}
                        className="flex min-h-9 cursor-pointer items-center gap-2 rounded-control px-2 text-xs text-tr-text hover:bg-tr-hover"
                      >
                        <input
                          type="checkbox"
                          checked={columns.includes(column)}
                          onChange={() =>
                            setColumns((current) =>
                              current.includes(column)
                                ? current.filter((item) => item !== column)
                                : [...current, column]
                            )
                          }
                          className="h-4 w-4 accent-tr-primary"
                        />
                        {TASK_COLUMN_LABELS[column]}
                      </label>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    className="mt-3"
                    onClick={() => setColumns(DEFAULT_TASK_COLUMNS)}
                  >
                    Khôi phục mặc định
                  </Button>
                </Popover>
                <button
                  type="button"
                  onClick={() => setSavingView((value) => !value)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-control border border-tr-border bg-tr-panel px-3 text-xs font-medium text-tr-subtle hover:bg-tr-hover ${focusRing}`}
                >
                  <Save size={14} /> Lưu chế độ xem
                </button>
              </div>
              {filterCount > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-tr-muted">Đang lọc:</span>
                  {filters.status !== emptyTaskFilters.status && (
                    <span className="rounded-full bg-tr-primary/10 px-2 py-1 text-tr-primary">
                      Trạng thái: {filters.status}
                    </span>
                  )}
                  {filters.due && (
                    <span className="rounded-full bg-tr-primary/10 px-2 py-1 text-tr-primary">
                      Hạn: {filters.due}
                    </span>
                  )}
                  {filters.priority && (
                    <span className="rounded-full bg-tr-primary/10 px-2 py-1 text-tr-primary">
                      Ưu tiên: {t.priority[filters.priority]}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="rounded-control px-2 py-1 text-tr-muted hover:bg-tr-hover hover:text-tr-text"
                  >
                    Xóa bộ lọc
                  </button>
                </div>
              )}
              {savingView && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-control border border-tr-border bg-tr-panel p-2">
                  <input
                    autoFocus
                    value={viewName}
                    onChange={(event) => setViewName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && viewName.trim()) saveView.mutate();
                      if (event.key === 'Escape') setSavingView(false);
                    }}
                    placeholder="Tên chế độ xem…"
                    className={`h-8 min-w-52 flex-1 rounded-control border border-tr-border bg-tr-panel px-2 text-sm outline-none ${focusRing}`}
                  />
                  <label className="flex items-center gap-2 text-xs text-tr-subtle">
                    <input
                      type="checkbox"
                      checked={viewShared}
                      onChange={(event) => setViewShared(event.target.checked)}
                      className="h-4 w-4 accent-tr-primary"
                    />
                    Chia sẻ với đội
                  </label>
                  <Button
                    variant="primary"
                    disabled={!viewName.trim() || saveView.isPending}
                    onClick={() => saveView.mutate()}
                  >
                    Lưu
                  </Button>
                  <Button variant="ghost" onClick={() => setSavingView(false)}>
                    Hủy
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="tr-scroll min-h-0 flex-1 overflow-auto p-3 lg:p-5">
            {scope === 'activity' ? (
              <ActivityFeed />
            ) : isLoading ? (
              <div className="rounded-panel border border-tr-border">
                <SkeletonRows rows={9} cols={6} />
              </div>
            ) : error ? (
              <ErrorState onRetry={() => refetch()} />
            ) : mode === 'kanban' ? (
              <TaskWorkspaceKanban tasks={tasks} group={group} />
            ) : mode === 'calendar' ? (
              <TaskWorkspaceCalendar tasks={tasks} />
            ) : (
              <TaskWorkspaceList
                tasks={tasks}
                columns={columns}
                group={group}
                sort={sort}
                emptyAction={
                  <Button variant="primary" onClick={() => setAdding(true)}>
                    <Plus size={15} /> Thêm công việc
                  </Button>
                }
              />
            )}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
