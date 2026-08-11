import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { api, qs } from '../api/client';
import { TaskTree, buildTree } from '../components/tasks/TaskTree';
import { TaskTable } from '../components/tasks/TaskTable';
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
import { useUiStore } from '../stores/uiStore';
import type { Board, BoardFull, Customer, Priority, TaskRow } from '../types';

export function useTaskQuery() {
  const filters = useUiStore((s) => s.taskFilters);
  const params = {
    q: filters.q,
    priority: filters.priority,
    customer_id: filters.customerId,
    board_id: filters.boardId,
    done: filters.status === 'done' ? '1' : filters.status === 'open' ? '0' : '',
    overdue: filters.status === 'overdue' ? '1' : '',
  };
  return useQuery({
    queryKey: ['tasks', params],
    queryFn: () => api.get<TaskRow[]>(`/api/views/tasks${qs(params)}`),
  });
}

export function TaskFilterBar() {
  const filters = useUiStore((s) => s.taskFilters);
  const setFilters = useUiStore((s) => s.setTaskFilters);

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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-60">
        <Input
          value={filters.q}
          onChange={(e) => setFilters({ q: e.target.value })}
          placeholder={t.table.filterText}
        />
      </div>
      <div className="w-40">
        <Select
          value={filters.status}
          onChange={(e) => setFilters({ status: e.target.value as typeof filters.status })}
        >
          <option value="all">{t.common.all}</option>
          <option value="open">{t.common.open}</option>
          <option value="done">{t.common.done}</option>
          <option value="overdue">{t.common.overdue}</option>
        </Select>
      </div>
      <div className="w-44">
        <Select
          value={filters.priority}
          onChange={(e) => setFilters({ priority: e.target.value as Priority | '' })}
        >
          <option value="">Mọi mức ưu tiên</option>
          {PRIORITY_ORDER.map((p) => (
            <option key={p} value={p}>
              {t.priority[p]}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-56">
        <Select
          value={filters.customerId}
          onChange={(e) =>
            setFilters({ customerId: e.target.value === '' ? '' : Number(e.target.value) })
          }
        >
          <option value="">Mọi khách hàng</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-56">
        <Select
          value={filters.boardId}
          onChange={(e) =>
            setFilters({ boardId: e.target.value === '' ? '' : Number(e.target.value) })
          }
        >
          <option value="">Mọi bảng</option>
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </div>
    </div>
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
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <TaskFilterBar />
        <div className="ml-auto flex items-center gap-2">
          {/* Cay: co viec con, them nhanh. Bang: sap xep theo cot. */}
          <div
            role="group"
            aria-label="Kiểu hiển thị"
            className="inline-flex rounded-panel border border-tr-border bg-tr-panel p-0.5"
          >
            {(
              [
                ['tree', 'Dạng cây'],
                ['table', 'Dạng bảng'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                className={`rounded-control px-3 py-1 text-sm transition ${focusRing} ${
                  mode === value
                    ? 'bg-tr-primary font-medium text-tr-on-primary'
                    : 'text-tr-subtle hover:bg-tr-hover'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === 'tree' && (
            <div className="w-44">
              <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
                <option value="none">Không nhóm</option>
                <option value="priority">Nhóm theo ưu tiên</option>
                <option value="customer">Nhóm theo khách hàng</option>
                <option value="board">Nhóm theo bảng</option>
              </Select>
            </div>
          )}
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
                  {group.color && (
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: group.color }}
                    />
                  )}
                  {group.label}
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
    groupBy === 'customer'
      ? (task.customer_name ?? 'Không gắn khách hàng')
      : task.board_name;

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
