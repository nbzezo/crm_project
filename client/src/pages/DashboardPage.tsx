import { useQuery } from '@tanstack/react-query';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router';
import { api } from '../api/client';
import { ErrorState, Skeleton, focusRing } from '../components/common/ui';
import {
  ActionWidget,
  AttentionWidget,
  BoardSummaryWidget,
  ContractsWidget,
  KpiSummary,
  PipelineWidget,
  RecentActivityWidget,
  ReminderWidget,
  buildRecommendedActions,
  type DashboardData,
  type TaskBucketKey,
} from '../components/dashboard/DashboardWidgets';
import { emptyTaskFilters, useUiStore } from '../stores/uiStore';
import { t } from '../i18n/vi';

function currentDateLabel(): string {
  const value = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
  return value.charAt(0).toLocaleUpperCase('vi') + value.slice(1);
}

function DashboardHeader({
  refreshing,
  onRefresh,
}: {
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <span className="mb-1.5 inline-flex items-center rounded-full bg-[var(--tr-yellow-soft)] px-2.5 py-0.5 text-2xs font-bold tracking-wide text-[var(--tr-on-yellow)] uppercase">
          Trung tâm điều hành
        </span>
        <h1 className="text-2xl font-bold tracking-[-0.03em] text-tr-text sm:text-3xl">
          Tổng quan
        </h1>
        <p className="mt-0.5 text-sm text-tr-muted">Toàn cảnh công việc &amp; kinh doanh của bạn</p>
      </div>
      <div className="flex items-center gap-2 self-start sm:self-auto">
        <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-tr-border bg-tr-panel px-3 text-xs text-tr-subtle shadow-sm">
          <CalendarDays size={14} className="text-tr-muted" aria-hidden="true" />
          {currentDateLabel()}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-tr-border bg-tr-panel text-tr-subtle shadow-sm transition hover:border-tr-primary/20 hover:text-tr-text disabled:cursor-wait disabled:opacity-60 ${focusRing}`}
          aria-label={refreshing ? 'Đang làm mới Tổng quan' : 'Làm mới Tổng quan'}
          title="Làm mới dữ liệu"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const openCard = useUiStore((state) => state.openCard);
  const setTaskFilters = useUiStore((state) => state.setTaskFilters);
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/api/views/dashboard'),
  });

  const openTaskBucket = (bucket: TaskBucketKey) => {
    const due =
      bucket === 'next7'
        ? 'week'
        : bucket === 'overdue' || bucket === 'today' || bucket === 'tomorrow'
          ? bucket
          : '';
    setTaskFilters({ ...emptyTaskFilters, status: 'open', due });
    void navigate('/tasks');
  };

  if (error)
    return (
      <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-5">
        <DashboardHeader refreshing={isFetching} onRefresh={() => void refetch()} />
        <ErrorState onRetry={() => void refetch()} />
      </div>
    );

  if (isLoading || !data)
    return (
      <div
        role="status"
        aria-label={t.common.loading}
        className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-5"
      >
        <DashboardHeader refreshing onRefresh={() => void refetch()} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-12">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton
              key={index}
              className={`rounded-panel ${index === 0 ? 'h-40 sm:col-span-2 md:col-span-8 md:row-span-2' : 'h-[76px] md:col-span-4'}`}
            />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <Skeleton className="h-72 rounded-panel lg:col-span-7" />
          <Skeleton className="h-72 rounded-panel lg:col-span-5" />
          <Skeleton className="h-56 rounded-panel lg:col-span-7" />
          <Skeleton className="h-56 rounded-panel lg:col-span-5" />
        </div>
      </div>
    );

  const recommendations = buildRecommendedActions(data);

  return (
    <div className="mx-auto max-w-[1600px] space-y-3 p-3 sm:space-y-4 sm:p-5">
      <DashboardHeader refreshing={isFetching} onRefresh={() => void refetch()} />

      <KpiSummary data={data} onOpenOverdueTasks={() => openTaskBucket('overdue')} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <ActionWidget
            data={data}
            recommendations={recommendations}
            onOpenTask={openCard}
            onShowTasks={openTaskBucket}
          />
        </div>
        <div className="min-w-0 lg:col-span-5">
          <ReminderWidget reminders={data.upcoming_reminders} onOpenTask={openCard} />
        </div>

        <div className="min-w-0 lg:col-span-7">
          <PipelineWidget data={data} />
        </div>
        <div className="min-w-0 lg:col-span-5">
          <ContractsWidget data={data} />
        </div>
      </div>

      <AttentionWidget data={data} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <RecentActivityWidget interactions={data.recent_interactions} />
        </div>
        <div className="min-w-0 lg:col-span-5">
          <BoardSummaryWidget boards={data.recent_boards} />
        </div>
      </div>
    </div>
  );
}
