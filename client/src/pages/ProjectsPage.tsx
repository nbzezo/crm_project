import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Ban, CircleDollarSign, Plus, UserRound } from 'lucide-react';
import { api } from '../api/client';
import { Modal } from '../components/common/Modal';
import {
  Button,
  DateInput,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  Input,
  Select,
  SkeletonRows,
  Textarea,
  focusRing,
} from '../components/common/ui';
import { PageHeader, PageShell } from '../components/common/PageShell';
import { AssigneePicker } from '../components/tasks/AssigneePicker';
import { PROJECT_STATUSES } from '@workflow/contracts';
import { t } from '../i18n/vi';
import { formatDateShort, formatVNDShort } from '../lib/format';
import type { Customer, Project, ProjectHealth, ProjectStatus } from '../types';

/** Màu sức khỏe — đỏ/vàng/xanh, đọc được trong một cái liếc mắt qua danh sách. */
export const HEALTH_TONE: Record<ProjectHealth, string> = {
  green: 'bg-tr-success/15 text-tr-success',
  amber: 'bg-tr-warning/15 text-tr-warning',
  red: 'bg-tr-danger/15 text-tr-danger',
};

export function HealthBadge({ health }: { health: ProjectHealth }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-2xs font-semibold ${HEALTH_TONE[health]}`}
    >
      {t.projectHealth[health]}
    </span>
  );
}

export default function ProjectsPage() {
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const {
    data: projects = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['projects', showArchived],
    queryFn: () => api.get<Project[]>(`/api/projects${showArchived ? '?archived=1' : ''}`),
  });

  return (
    <PageShell>
      <PageHeader
        title={t.nav.projects}
        description="Kế hoạch so với thực tế, ngân sách và sức khỏe của từng dự án"
        align="center"
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-tr-subtle">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="h-4 w-4 rounded border-tr-border"
              />
              Hiện cả dự án đã lưu trữ
            </label>
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={16} aria-hidden="true" /> Dự án mới
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="rounded-panel border border-tr-border bg-tr-panel">
          <SkeletonRows rows={5} cols={4} />
        </div>
      ) : error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : projects.length === 0 ? (
        <EmptyState
          message="Chưa có dự án nào."
          hint="Dự án gom nhiều bảng, công việc và hợp đồng lại để theo dõi tiến độ chung."
          action={<Button onClick={() => setCreating(true)}>Tạo dự án đầu tiên</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      <ProjectForm open={creating} onClose={() => setCreating(false)} />
    </PageShell>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      to={`/projects/${project.id}`}
      className={`block rounded-panel border border-tr-border bg-tr-panel p-4 shadow-sm transition hover:border-tr-primary/50 hover:bg-tr-hover ${focusRing}`}
    >
      <div className="mb-2 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-tr-text">{project.name}</h2>
          <p className="truncate text-xs text-tr-muted">
            {[project.code, project.customer_name, t.projectStatus[project.status]]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <HealthBadge health={project.health} />
      </div>

      {/* Thanh tiến độ: phần trăm việc đã xong, kèm mốc thời gian đã trôi qua để
          thấy ngay hai con số đó có đi cùng nhau không. */}
      <div className="mb-2">
        <div className="mb-1 flex items-center justify-between text-2xs text-tr-muted">
          <span>
            {project.task_done}/{project.task_total} việc
          </span>
          <span className="tabular-nums">{project.progress_pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-tr-hover-strong">
          <div
            className={`h-full rounded-full ${project.health === 'red' ? 'bg-tr-danger' : project.health === 'amber' ? 'bg-tr-warning' : 'bg-tr-success'}`}
            style={{ width: `${project.progress_pct}%` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-tr-muted">
        {project.plan_end && (
          <span
            className={project.days_left !== null && project.days_left < 0 ? 'text-tr-danger' : ''}
          >
            Hạn {formatDateShort(project.plan_end)}
            {project.days_left !== null &&
              (project.days_left < 0
                ? ` · trễ ${Math.abs(project.days_left)} ngày`
                : ` · còn ${project.days_left} ngày`)}
          </span>
        )}
        {project.task_overdue > 0 && (
          <span className="inline-flex items-center gap-1 text-tr-danger">
            <AlertTriangle size={11} aria-hidden="true" /> {project.task_overdue} quá hạn
          </span>
        )}
        {project.task_waiting > 0 && (
          <span className="inline-flex items-center gap-1 text-tr-danger">
            <Ban size={11} aria-hidden="true" /> {project.task_waiting} bị chặn / chờ
          </span>
        )}
        {project.task_unassigned > 0 && (
          <span className="inline-flex items-center gap-1 text-tr-warning">
            <UserRound size={11} aria-hidden="true" /> {project.task_unassigned} chưa giao
          </span>
        )}
        {project.budget_vnd > 0 && (
          <span className="inline-flex items-center gap-1">
            <CircleDollarSign size={11} aria-hidden="true" />
            {formatVNDShort(project.budget_vnd)}
          </span>
        )}
      </div>
    </Link>
  );
}

const EMPTY = {
  name: '',
  code: '',
  status: 'planning' as ProjectStatus,
  plan_start: null as string | null,
  plan_end: null as string | null,
  actual_start: null as string | null,
  actual_end: null as string | null,
  budget_vnd: 0,
  notes: '',
};

/** Form dự án — dùng chung cho tạo mới và sửa (truyền `project`). */
export function ProjectForm({
  open,
  onClose,
  project,
}: {
  open: boolean;
  onClose: () => void;
  project?: Project;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const [loadedId, setLoadedId] = useState<number | 'new' | null>(null);

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', 'select'],
    queryFn: () => api.get<Customer[]>('/api/customers'),
    staleTime: 60_000,
    enabled: open,
  });

  // Nạp lại ngay trong render — cùng lý do với TaskFormDialog: đặt trong useEffect
  // thì lần render commit đầu tiên vẫn mang dữ liệu của dự án trước.
  const key = project?.id ?? 'new';
  if (open && loadedId !== key) {
    setLoadedId(key);
    setForm(
      project
        ? {
            name: project.name,
            code: project.code ?? '',
            status: project.status,
            plan_start: project.plan_start,
            plan_end: project.plan_end,
            actual_start: project.actual_start,
            actual_end: project.actual_end,
            budget_vnd: project.budget_vnd,
            notes: project.notes,
          }
        : EMPTY
    );
    setCustomerId(project?.customer_id ?? '');
    setOwnerId(project?.owner_contact_id ?? null);
  }
  if (!open && loadedId !== null) setLoadedId(null);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        code: form.code.trim() || null,
        customer_id: customerId === '' ? null : customerId,
        owner_contact_id: ownerId,
      };
      return project
        ? api.patch<Project>(`/api/projects/${project.id}`, payload)
        : api.post<Project>('/api/projects', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      if (project) queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      onClose();
    },
  });

  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? `${t.common.edit}: ${project.name}` : 'Dự án mới'}
      dirty={form.name.trim() !== (project?.name ?? '')}
      footer={
        <>
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button
            variant="primary"
            disabled={!form.name.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? t.common.saving : t.common.save}
          </Button>
        </>
      }
    >
      <FormError error={save.error} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Tên dự án" required>
            <Input autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
        </div>
        <Field label="Mã dự án">
          <Input
            value={form.code}
            onChange={(e) => set('code', e.target.value)}
            placeholder="DA-2026-01"
          />
        </Field>
        <Field label={t.card.customer} hint="Để trống nếu là dự án nội bộ.">
          <Select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">— Dự án nội bộ —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <AssigneePicker
          label="Chủ dự án"
          value={ownerId}
          onChange={setOwnerId}
          hint="Người chịu trách nhiệm chung cho tiến độ dự án."
        />
        <Field label="Trạng thái">
          <Select
            value={form.status}
            onChange={(e) => set('status', e.target.value as ProjectStatus)}
          >
            {PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t.projectStatus[status]}
              </option>
            ))}
          </Select>
        </Field>

        {/* Kế hoạch và thực tế đặt cạnh nhau: chênh lệch giữa hai cặp ngày này
            chính là phép đo, không phải thông tin phụ. */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bắt đầu (kế hoạch)">
            <DateInput value={form.plan_start} onChange={(v) => set('plan_start', v)} />
          </Field>
          <Field label="Kết thúc (kế hoạch)">
            <DateInput value={form.plan_end} onChange={(v) => set('plan_end', v)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bắt đầu (thực tế)">
            <DateInput value={form.actual_start} onChange={(v) => set('actual_start', v)} />
          </Field>
          <Field label="Kết thúc (thực tế)">
            <DateInput value={form.actual_end} onChange={(v) => set('actual_end', v)} />
          </Field>
        </div>

        <Field label="Ngân sách (₫)">
          <Input
            type="number"
            min={0}
            value={form.budget_vnd}
            onChange={(e) => set('budget_vnd', Number(e.target.value) || 0)}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t.customer.notes}>
            <Textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
