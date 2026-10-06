import { Suspense, lazy, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, CalendarDays, Crosshair, LayoutDashboard, RefreshCw } from 'lucide-react';
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
import { readPrefs } from '../components/focus/focusPrefs';
import { periodFor } from '../components/focus/focusPeriod';
import { focusPlanKey, focusPlanUrl, planStatus } from '../components/focus/focusPlanStatus';
import type { FocusPlan } from '../components/focus/focusTypes';
import { usePermission } from '../lib/permissions';
import { todayStr } from '../lib/format';
import { computedAtOf, freshUrl, refreshFresh } from '../lib/freshFetch';
import { stampLabel } from '../components/common/DataFreshness';

/**
 * Ket qua AI cua ky Trong tam mac dinh (loai ky + pham vi lan truoc, tinh tu hom
 * nay) da cu chua — de dat cham nhac tren tab khi nguoi dung dang o Toan canh.
 * Chi doc ket qua da luu (GET), khong bao gio goi AI.
 */
function useFocusPlanStale(enabled: boolean): string | null {
  const canUseAi = usePermission('ai', 'read');
  const prefs = readPrefs();
  const period = periodFor(prefs.kind, todayStr());
  const { data: plan } = useQuery({
    queryKey: focusPlanKey(period.from, period.to, prefs.mode),
    queryFn: () => api.get<FocusPlan | null>(focusPlanUrl(period.from, period.to, prefs.mode)),
    enabled: enabled && canUseAi,
    staleTime: 5 * 60_000,
  });
  // Dang o tab Trong tam thi da co dai nhac ngay trong khoi AI — khong can cham.
  if (!enabled || !plan) return null;
  const status = planStatus(plan, period);
  return status.stale ? status.reasons.join(' ') : null;
}

type DashboardView = 'overview' | 'focus' | 'report';

/* Bao cao tong keo theo recharts — tai rieng khi mo tab, khong lam nang Toan canh. */
const ReportsContent = lazy(() =>
  import('./ReportsPage').then((module) => ({ default: module.ReportsContent }))
);
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
  const canReport = usePermission('report.tasks', 'read');
  const wanted = fromUrl ?? stored;
  const view: DashboardView =
    wanted === 'focus' ? 'focus' : wanted === 'report' && canReport ? 'report' : 'overview';
  const setView = (next: DashboardView) => {
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* bo qua: chi mat ghi nho */
    }
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (next === 'overview') copy.delete('view');
        else copy.set('view', next);
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
  { value: 'report', label: 'Báo cáo tổng', icon: BarChart3 },
];

function DashboardTabs({
  view,
  onChange,
}: {
  view: DashboardView;
  onChange: (view: DashboardView) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const staleReason = useFocusPlanStale(view !== 'focus');
  const canReport = usePermission('report.tasks', 'read');
  const tabs = VIEW_TABS.filter((tab) => tab.value !== 'report' || canReport);
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label="Chế độ Tổng quan"
      className="flex gap-1 border-b border-tr-border print:hidden"
    >
      {tabs.map((tab, index) => {
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
            {tab.value === 'focus' && staleReason && (
              <span
                className="h-2 w-2 rounded-full bg-tr-warning"
                title={`Kết quả AI đã cũ — ${staleReason}`}
              >
                <span className="sr-only">(kết quả AI đã cũ, nên phân tích lại)</span>
              </span>
            )}
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
  computedAt,
}: {
  refreshing: boolean;
  onRefresh: () => void;
  overdueCount?: number;
  showBrief?: boolean;
  /** Thoi diem may chu tinh so lieu (ban luu dem toi da 5 phut). */
  computedAt?: string;
}) {
  return (
    <header className="flex items-start justify-between gap-3 sm:items-end print:hidden">
      <div className="min-w-0">
        {/* tr-display / tr-rule: moc cho theme Don sac */}
        <h1 className="tr-display tr-display-page text-2xl font-bold tracking-[-0.03em] text-tr-text sm:text-3xl">
          Tổng quan
        </h1>
        <span className="tr-rule" aria-hidden="true" />
        <p className="mt-0.5 text-sm text-tr-muted">Toàn cảnh công việc &amp; kinh doanh của bạn</p>
        {/* Dien thoai: ngay nam ngay duoi phu de, nut lam moi len canh tieu de — bot mot hang trong. */}
        <p className="mt-0.5 truncate text-xs text-tr-muted sm:hidden">
          {shortDateLabel()}
          {overdueCount != null && ` · ${overdueCount} việc quá hạn`}
        </p>
        {computedAt && (
          <p className="mt-0.5 text-xs text-tr-muted">
            Số liệu lúc {stampLabel(computedAt)} · bấm nút làm mới để tính lại ngay
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden min-h-9 items-center gap-1.5 rounded-control border border-tr-border bg-tr-panel px-3 text-xs text-tr-subtle shadow-sm sm:inline-flex">
          <CalendarDays size={14} className="text-tr-muted" aria-hidden="true" />
          {currentDateLabel()}
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
  const reportsFetching = useIsFetching({ queryKey: ['reports'] }) > 0;

  if (view === 'report')
    return (
      <div className="mx-auto max-w-[1600px] space-y-3 p-3 sm:space-y-4 sm:p-5">
        <DashboardHeader
          refreshing={reportsFetching}
          onRefresh={() => void refreshFresh(queryClient, 'reports')}
          showBrief={false}
        />
        <DashboardTabs view={view} onChange={setView} />
        <section id="dashboard-panel-report" role="tabpanel" aria-labelledby="dashboard-tab-report">
          <Suspense fallback={<Skeleton className="h-64 rounded-panel" />}>
            <ReportsContent />
          </Suspense>
        </section>
      </div>
    );

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
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: ({ queryKey }) => api.get<DashboardData>(freshUrl('/api/views/dashboard', queryKey)),
  });
  /* Ban luu dem 5 phut: nut lam moi phai bat may chu tinh lai, khong chi tai lai. */
  const refreshDashboard = () => void refreshFresh(queryClient, 'dashboard');

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
        onRefresh={refreshDashboard}
        overdueCount={data.kpi.overdue_task_count}
        computedAt={computedAtOf(data)}
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
