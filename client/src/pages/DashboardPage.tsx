import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Crosshair, LayoutDashboard, RefreshCw } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
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
  WorkloadWidget,
  buildRecommendedActions,
  type DashboardData,
  type TaskBucketKey,
} from '../components/dashboard/DashboardWidgets';
import { emptyTaskFilters, useUiStore } from '../stores/uiStore';
import { t } from '../i18n/vi';
import { AiBrief } from '../components/ai/AiBrief';
import { FocusView } from '../components/focus/FocusView';

type DashboardView = 'overview' | 'focus';
const VIEW_KEY = 'dashboard.view';

/* Tab dang xem nam tren URL (?view=focus) de chia se / quay lai dung cho; khi
   URL khong noi gi thi lay tab lan truoc nguoi dung de lai tren may nay. */
function useDashboardView(): [DashboardView, (view: DashboardView) => void] {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get('view');
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(VIEW_KEY);
  } catch {
    stored = null;
  }
  const view: DashboardView = (fromUrl ?? stored) === 'focus' ? 'focus' : 'overview';
  const setView = (next: DashboardView) => {
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* bo qua: chi mat ghi nho */
    }
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (next === 'focus') copy.set('view', 'focus');
        else copy.delete('view');
        return copy;
      },
      { replace: true }
    );
  };
  return [view, setView];
}

const VIEW_TABS: { value: DashboardView; label: string; icon: typeof Crosshair }[] = [
  { value: 'overview', label: 'Toàn cảnh', icon: LayoutDashboard },
  { value: 'focus', label: 'Trọng tâm', icon: Crosshair },
];

function DashboardTabs({
  view,
  onChange,
}: {
  view: DashboardView;
  onChange: (view: DashboardView) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next =
      (index + (event.key === 'ArrowRight' ? 1 : -1) + VIEW_TABS.length) % VIEW_TABS.length;
    onChange(VIEW_TABS[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label="Chế độ Tổng quan"
      className="flex gap-1 border-b border-tr-border print:hidden"
    >
      {VIEW_TABS.map((tab, index) => {
        const selected = view === tab.value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`dashboard-tab-${tab.value}`}
            aria-selected={selected}
            aria-controls={`dashboard-panel-${tab.value}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`-mb-px inline-flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-medium transition fine:min-h-9 ${focusRing} ${
              selected
                ? 'border-tr-primary text-tr-text'
                : 'border-transparent text-tr-subtle hover:text-tr-text'
            }`}
          >
            <Icon size={15} aria-hidden="true" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function currentDateLabel(): string {
  const value = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
  return value.charAt(0).toLocaleUpperCase('vi') + value.slice(1);
}

function shortDateLabel(): string {
  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
  }).format(new Date());
}

function DashboardHeader({
  refreshing,
  onRefresh,
  overdueCount,
  showBrief = true,
}: {
  refreshing: boolean;
  onRefresh: () => void;
  overdueCount?: number;
  showBrief?: boolean;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:hidden">
      <div className="min-w-0">
        {/* tr-display / tr-rule: moc cho theme Don sac */}
        <h1 className="tr-display tr-display-page text-2xl font-bold tracking-[-0.03em] text-tr-text sm:text-3xl">
          Tổng quan
        </h1>
        <span className="tr-rule" aria-hidden="true" />
        <p className="mt-0.5 text-sm text-tr-muted">Toàn cảnh công việc &amp; kinh doanh của bạn</p>
      </div>
      <div className="flex w-full items-center gap-2 self-start sm:w-auto sm:self-auto">
        <span className="hidden min-h-9 items-center gap-1.5 rounded-control border border-tr-border bg-tr-panel px-3 text-xs text-tr-subtle shadow-sm sm:inline-flex">
          <CalendarDays size={14} className="text-tr-muted" aria-hidden="true" />
          {currentDateLabel()}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-tr-muted sm:hidden">
          {shortDateLabel()}
          {overdueCount != null && ` · ${overdueCount} việc quá hạn`}
        </span>
        {showBrief && <AiBrief contextType="today" />}
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-tr-border bg-tr-panel text-tr-subtle shadow-sm transition hover:border-tr-primary/20 hover:text-tr-text disabled:cursor-wait disabled:opacity-60 fine:h-9 fine:w-9 ${focusRing}`}
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
  const [view, setView] = useDashboardView();
  const queryClient = useQueryClient();
  const focusFetching = useIsFetching({ queryKey: ['focus'] }) > 0;

  if (view === 'focus')
    return (
      <div className="mx-auto max-w-[1600px] space-y-3 p-3 sm:space-y-4 sm:p-5">
        <DashboardHeader
          refreshing={focusFetching}
          onRefresh={() => void queryClient.invalidateQueries({ queryKey: ['focus'] })}
          showBrief={false}
        />
        <DashboardTabs view={view} onChange={setView} />
        <section id="dashboard-panel-focus" role="tabpanel" aria-labelledby="dashboard-tab-focus">
          <FocusView />
        </section>
      </div>
    );

  return <OverviewDashboard tabs={<DashboardTabs view={view} onChange={setView} />} />;
}

function OverviewDashboard({ tabs }: { tabs: ReactNode }) {
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
        {tabs}
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
        {tabs}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-12">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton
              key={index}
              className={`rounded-panel ${index === 0 ? 'col-span-2 h-40 md:col-span-8 md:row-span-2' : 'h-[76px] md:col-span-4'}`}
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
  const prioritizedReminderIds = new Set(
    recommendations
      .map((item) => /^reminder-(\d+)$/.exec(item.id)?.[1])
      .filter((id): id is string => Boolean(id))
      .map(Number)
  );
  const prioritizedDealIds = new Set(
    recommendations
      .map((item) => /^deal-(\d+)$/.exec(item.id)?.[1])
      .filter((id): id is string => Boolean(id))
      .map(Number)
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-3 p-3 sm:space-y-4 sm:p-5">
      <DashboardHeader
        refreshing={isFetching}
        onRefresh={() => void refetch()}
        overdueCount={data.kpi.overdue_task_count}
      />
      {tabs}

      <div
        id="dashboard-panel-overview"
        role="tabpanel"
        aria-labelledby="dashboard-tab-overview"
        className="space-y-3 sm:space-y-4"
      >
        <KpiSummary data={data} onOpenTasks={openTaskBucket} />

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
            <ReminderWidget
              reminders={data.upcoming_reminders}
              onOpenTask={openCard}
              excludedIds={prioritizedReminderIds}
            />
          </div>

          {/* Đặt ngay dưới việc cần làm: biết việc gì đến hạn rồi thì câu hỏi kế tiếp
            luôn là "đang nằm ở ai" — không nên phải cuộn xuống cuối trang mới thấy. */}
          <div className="min-w-0 lg:col-span-5">
            <WorkloadWidget
              data={data}
              onSelectAssignee={(assignee) => {
                setTaskFilters({ ...emptyTaskFilters, status: 'open', assignee });
                void navigate('/tasks');
              }}
            />
          </div>

          <div className="min-w-0 lg:col-span-7">
            <PipelineWidget data={data} />
          </div>
          <div className="min-w-0 lg:col-span-5">
            <ContractsWidget data={data} />
          </div>
        </div>

        <AttentionWidget data={data} excludedDealIds={prioritizedDealIds} />

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-7">
            <RecentActivityWidget interactions={data.recent_interactions} />
          </div>
          <div className="min-w-0 lg:col-span-5">
            <BoardSummaryWidget boards={data.recent_boards} />
          </div>
        </div>
      </div>
    </div>
  );
}
