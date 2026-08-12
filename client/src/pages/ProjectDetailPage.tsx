import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import {
  Button,
  EmptyState,
  ErrorState,
  Panel,
  Skeleton,
  focusRing,
} from '../components/common/ui';
import { AssigneeChip } from '../components/tasks/AssigneePicker';
import { TaskTree } from '../components/tasks/TaskTree';
import { TaskTable } from '../components/tasks/TaskTable';
import { BoardViewChip, BOARD_VIEWS, type BoardViewMode } from '../components/kanban/BoardViews';
import { TimelineBoard } from '../components/views/TimelineBoard';
import { LazyCalendarView } from '../components/calendar/LazyCalendarView';
import { DocumentPanel } from '../components/crm/DocumentUpload';
import { HealthBadge, ProjectForm } from './ProjectsPage';
import { t } from '../i18n/vi';
import { formatDateShort, formatVND, formatVNDShort } from '../lib/format';
import { useUiStore } from '../stores/uiStore';
import type { ProjectDetail } from '../types';

type Tab = 'overview' | 'tasks' | 'people' | 'commercial' | 'documents';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'tasks', label: 'Công việc' },
  { id: 'people', label: 'Nhân sự' },
  { id: 'commercial', label: 'Hợp đồng & cơ hội' },
  { id: 'documents', label: 'Tài liệu' },
];

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const id = Number(projectId);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const {
    data: project,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.get<ProjectDetail>(`/api/projects/${id}`),
    enabled: Number.isInteger(id),
  });

  const archive = useMutation({
    mutationFn: () => api.patch(`/api/projects/${id}`, { is_archived: !project?.is_archived }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/api/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      window.location.assign('/projects');
    },
  });

  if (isLoading) return <Skeleton className="m-6 h-64" />;
  if (error || !project)
    return (
      <div className="p-6">
        <ErrorState onRetry={() => refetch()} />
      </div>
    );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Link
        to="/projects"
        className={`inline-flex items-center gap-1 text-sm text-tr-muted hover:text-tr-primary ${focusRing}`}
      >
        <ArrowLeft size={14} aria-hidden="true" /> {t.nav.projects}
      </Link>

      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-56 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-tr-text">{project.name}</h1>
            <HealthBadge health={project.health} />
            {!!project.is_archived && (
              <span className="rounded-full bg-tr-hover px-2 py-0.5 text-2xs text-tr-muted">
                Đã lưu trữ
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-tr-muted">
            {[
              project.code,
              t.projectStatus[project.status],
              project.customer_name ?? 'Dự án nội bộ',
              project.owner_name ? `Chủ dự án: ${project.owner_name}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <Button onClick={() => setEditing(true)}>
          <Pencil size={15} aria-hidden="true" /> {t.common.edit}
        </Button>
        <Button onClick={() => archive.mutate()}>
          <Archive size={15} aria-hidden="true" />
          {project.is_archived ? 'Bỏ lưu trữ' : 'Lưu trữ'}
        </Button>
        <Button variant="danger" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={15} aria-hidden="true" /> {t.common.delete}
        </Button>
      </div>

      <div role="tablist" className="flex flex-wrap gap-1 border-b border-tr-border">
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${focusRing} ${
              tab === item.id
                ? 'border-tr-primary font-medium text-tr-primary'
                : 'border-transparent text-tr-subtle hover:text-tr-text'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview project={project} />}

      {tab === 'tasks' && <TasksTab project={project} />}

      {tab === 'people' && <People project={project} />}
      {tab === 'commercial' && <Commercial project={project} />}
      {tab === 'documents' && (
        <DocumentPanel
          links={project.customer_id ? { customer_id: project.customer_id } : {}}
          title="Tài liệu của khách hàng thuộc dự án"
        />
      )}

      <ProjectForm open={editing} onClose={() => setEditing(false)} project={project} />
      <ConfirmDialog
        open={confirmDelete}
        message={`Xóa dự án “${project.name}”? Công việc, bảng và hợp đồng bên trong KHÔNG bị xóa — chúng chỉ bỏ liên kết với dự án này.`}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          remove.mutate();
        }}
      />
    </div>
  );
}

/**
 * Tab Công việc — cùng bốn dạng xem như một bảng, nhưng phạm vi là cả dự án.
 *
 * Dùng lại `BoardViewChip` và `TimelineBoard` của trang Bảng thay vì dựng bản
 * riêng: một dự án cần Gantt hơn bất kỳ bảng đơn lẻ nào, và không có lý do gì để
 * hai nơi có hai cách chuyển dạng xem khác nhau.
 */
function TasksTab({ project }: { project: ProjectDetail }) {
  const queryClient = useQueryClient();
  const openTaskComposer = useUiStore((s) => s.openTaskComposer);
  const [searchParams, setSearchParams] = useSearchParams();

  const viewParam = searchParams.get('view') as BoardViewMode | null;
  const view: BoardViewMode =
    viewParam && BOARD_VIEWS.some((v) => v.value === viewParam) ? viewParam : 'board';
  const setView = (mode: BoardViewMode) => {
    const next = new URLSearchParams(searchParams);
    if (mode === 'board') next.delete('view');
    else next.set('view', mode);
    setSearchParams(next, { replace: true });
  };

  /* Dự án chưa có bảng nào thì KHÔNG có chỗ hợp lệ để thả việc vào — tạo bảng
     trước. Trước v19, nút "Thêm công việc" ở đây thả việc vào bảng của khách hàng
     hoặc bảng gắn sao đầu tiên, tức là ra ngoài dự án. */
  const createBoard = useMutation({
    mutationFn: () =>
      api.post<{ id: number }>('/api/boards', {
        name: project.name,
        project_id: project.id,
        customer_id: project.customer_id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
    },
  });

  if (project.boards.length === 0) {
    return (
      <EmptyState
        message="Dự án chưa có bảng công việc nào."
        hint="Công việc phải nằm trong một bảng thuộc dự án — tạo bảng trước rồi thêm việc vào đó."
        action={
          <Button
            variant="primary"
            disabled={createBoard.isPending}
            onClick={() => createBoard.mutate()}
          >
            <Plus size={15} aria-hidden="true" />
            {createBoard.isPending ? 'Đang tạo…' : `Tạo bảng “${project.name}”`}
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="rounded-panel bg-tr-hover-strong px-1">
          <BoardViewChip value={view} onChange={setView} />
        </div>
        <Button
          variant="primary"
          onClick={() =>
            openTaskComposer({
              context: project.customer_id ? { customer_id: project.customer_id } : {},
              projectId: project.id,
            })
          }
        >
          <Plus size={15} aria-hidden="true" /> Thêm công việc
        </Button>
      </div>

      {view === 'board' && (
        <TaskTree
          tasks={project.tasks}
          emptyMessage="Dự án chưa có công việc nào."
          emptyHint="Thêm công việc vào một trong các bảng của dự án."
        />
      )}
      {view === 'table' && <TaskTable tasks={project.tasks} />}
      {view === 'timeline' && (
        <div className="h-[70vh]">
          <TimelineBoard projectId={project.id} />
        </div>
      )}
      {view === 'calendar' && (
        <div className="flex h-[70vh] min-h-[520px] flex-col">
          <LazyCalendarView projectId={project.id} />
        </div>
      )}
    </div>
  );
}

function Overview({ project }: { project: ProjectDetail }) {
  /*
   * Hai cặp ngày đặt cạnh nhau — kế hoạch và thực tế. Chênh lệch giữa chúng
   * chính là phép đo, nên chúng phải nhìn thấy cùng lúc chứ không nằm hai chỗ.
   */
  const rows: [string, string][] = [
    ['Bắt đầu (kế hoạch)', project.plan_start ? formatDateShort(project.plan_start) : '—'],
    ['Bắt đầu (thực tế)', project.actual_start ? formatDateShort(project.actual_start) : '—'],
    ['Kết thúc (kế hoạch)', project.plan_end ? formatDateShort(project.plan_end) : '—'],
    ['Kết thúc (thực tế)', project.actual_end ? formatDateShort(project.actual_end) : '—'],
    ['Ngân sách', project.budget_vnd > 0 ? formatVND(project.budget_vnd) : '—'],
    [
      'Giá trị hợp đồng đã ký',
      project.contract_value_vnd > 0 ? formatVND(project.contract_value_vnd) : '—',
    ],
  ];

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Panel title="Tiến độ">
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-tr-subtle">
              {project.task_done}/{project.task_total} việc hoàn thành
            </span>
            <span className="font-semibold tabular-nums text-tr-text">{project.progress_pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-tr-hover-strong">
            <div
              className={`h-full rounded-full ${project.health === 'red' ? 'bg-tr-danger' : project.health === 'amber' ? 'bg-tr-warning' : 'bg-tr-success'}`}
              style={{ width: `${project.progress_pct}%` }}
            />
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Stat label="Quá hạn" value={project.task_overdue} tone="text-tr-danger" />
          <Stat label="Bị chặn / chờ" value={project.task_waiting} tone="text-tr-danger" />
          <Stat label="Chưa giao" value={project.task_unassigned} tone="text-tr-warning" />
          <Stat
            label="Còn lại"
            value={project.days_left === null ? '—' : `${project.days_left} ngày`}
            tone={
              project.days_left !== null && project.days_left < 0
                ? 'text-tr-danger'
                : 'text-tr-text'
            }
          />
        </dl>
      </Panel>

      <Panel title="Kế hoạch so với thực tế">
        <dl className="space-y-1.5 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <dt className="text-tr-muted">{label}</dt>
              <dd className="font-medium text-tr-text">{value}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel title={`Bảng công việc (${project.boards.length})`} className="lg:col-span-2">
        {project.boards.length === 0 ? (
          <EmptyState
            message="Chưa có bảng nào thuộc dự án này."
            hint="Mở một bảng rồi chọn dự án trong menu bảng để gắn vào đây."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {project.boards.map((board) => (
              <li key={board.id}>
                <Link
                  to={`/boards/${board.id}`}
                  className={`flex items-center gap-2 rounded-control px-2 py-2 transition hover:bg-tr-hover ${focusRing}`}
                >
                  <span
                    aria-hidden="true"
                    className="h-6 w-6 shrink-0 rounded"
                    style={{ background: board.background }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-tr-text">{board.name}</span>
                  <span className="text-xs text-tr-muted">{board.card_count} thẻ</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {project.notes && (
        <Panel title={t.customer.notes} className="lg:col-span-2">
          <p className="text-sm whitespace-pre-wrap text-tr-subtle">{project.notes}</p>
        </Panel>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <div>
      <dt className="text-2xs text-tr-muted">{label}</dt>
      <dd className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}

/**
 * Nhân sự dự án suy ra từ người phụ trách các công việc, không phải danh sách
 * thành viên khai báo tay — danh sách khai báo luôn lệch với thực tế.
 */
function People({ project }: { project: ProjectDetail }) {
  if (project.people.length === 0) {
    return (
      <EmptyState
        message="Chưa có ai được giao việc trong dự án này."
        hint="Danh sách này tự suy ra từ người phụ trách của từng công việc."
      />
    );
  }
  return (
    <div className="overflow-hidden rounded-panel border border-tr-border bg-tr-panel">
      <table className="w-full text-sm">
        <caption className="sr-only">Nhân sự tham gia dự án</caption>
        <thead className="bg-tr-surface text-left text-2xs tracking-wide text-tr-subtle uppercase">
          <tr>
            <th scope="col" className="px-3 py-2">
              Người phụ trách
            </th>
            <th scope="col" className="px-3 py-2">
              Tổ chức
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Đang mở
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Quá hạn
            </th>
            <th scope="col" className="px-3 py-2">
              Liên hệ
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-tr-border">
          {project.people.map((person) => (
            <tr key={person.contact_id} className="transition hover:bg-tr-hover">
              <td className="px-3 py-2">
                <AssigneeChip name={person.full_name} orgKind={person.org_kind} />
              </td>
              <td className="px-3 py-2 text-tr-subtle">{person.org_name ?? '—'}</td>
              <td className="px-3 py-2 text-right tabular-nums text-tr-text">
                {person.open_count}
              </td>
              <td
                className={`px-3 py-2 text-right tabular-nums ${person.overdue_count > 0 ? 'font-semibold text-tr-danger' : 'text-tr-muted'}`}
              >
                {person.overdue_count}
              </td>
              <td className="px-3 py-2">
                <span className="flex flex-wrap gap-2 text-xs">
                  {person.phone && (
                    <a href={`tel:${person.phone}`} className="text-tr-primary hover:underline">
                      {person.phone}
                    </a>
                  )}
                  {person.email && (
                    <a href={`mailto:${person.email}`} className="text-tr-primary hover:underline">
                      {person.email}
                    </a>
                  )}
                  {!person.phone && !person.email && <span className="text-tr-muted">—</span>}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Commercial({ project }: { project: ProjectDetail }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Panel title={`Hợp đồng (${project.contracts.length})`}>
        {project.contracts.length === 0 ? (
          <EmptyState message="Chưa có hợp đồng nào gắn với dự án này." />
        ) : (
          <ul className="space-y-1">
            {project.contracts.map((contract) => (
              <li
                key={contract.id}
                className="flex items-center gap-2 rounded-control px-1.5 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-tr-text">
                  {contract.name}
                  {contract.number && <span className="text-tr-muted"> · {contract.number}</span>}
                </span>
                <span className="shrink-0 tabular-nums text-tr-subtle">
                  {formatVNDShort(contract.value_vnd)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title={`Cơ hội (${project.deals.length})`}>
        {project.deals.length === 0 ? (
          <EmptyState message="Chưa có cơ hội nào gắn với dự án này." />
        ) : (
          <ul className="space-y-1">
            {project.deals.map((deal) => (
              <li key={deal.id}>
                <Link
                  to={`/deals/${deal.id}`}
                  className={`flex items-center gap-2 rounded-control px-1.5 py-2 text-sm transition hover:bg-tr-hover ${focusRing}`}
                >
                  <span className="min-w-0 flex-1 truncate text-tr-text">{deal.title}</span>
                  <span className="shrink-0 text-xs text-tr-muted">{t.stage[deal.stage]}</span>
                  <span className="shrink-0 tabular-nums text-tr-subtle">
                    {formatVNDShort(deal.value_vnd)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
