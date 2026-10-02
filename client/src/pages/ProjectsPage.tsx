import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Ban, CircleDollarSign, Plus, UserRound } from 'lucide-react';
import { api } from '../api/client';
import { Button, EmptyState, ErrorState, SkeletonRows, focusRing } from '../components/common/ui';
import { PageHeader, PageShell } from '../components/common/PageShell';
import { t } from '../i18n/vi';
import { formatDateShort, formatVNDShort } from '../lib/format';
import type { Project } from '../types';
import { HealthBadge } from '../components/crm/ProjectHealthBadge';
import { ProjectForm } from '../components/crm/ProjectForm';

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
          hint="Dự án gom các luồng việc, công việc và hợp đồng lại để theo dõi tiến độ chung."
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
        <div className="mb-1 flex items-center justify-between text-xs text-tr-muted">
          <span>
            {project.task_done}/{project.task_total} việc
          </span>
          <span className="tabular-nums">{project.progress_pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-tr-hover-strong">
          <div
            className={`h-full rounded-full ${project.health === 'red' ? 'bg-tr-danger' : project.health === 'amber' ? 'bg-tr-warning' : project.health === 'unknown' ? 'bg-tr-muted' : 'bg-tr-success'}`}
            style={{ width: `${project.progress_pct}%` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-tr-muted">
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
