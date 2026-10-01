import { Suspense, lazy, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Check,
  Circle,
  CircleCheck,
  CircleDot,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  MoreHorizontal,
  Plus,
  Settings2,
} from 'lucide-react';
import { api, qs } from '../api/client';
import { ChartDataTable } from '../components/common/ChartDataTable';
import { RevenueLineActions } from '../components/crm/RevenueLineActions';
import { RevenueFunnelCards } from '../components/crm/RevenueFunnelCards';
import { RevenueGroupOverview } from '../components/crm/RevenueGroupOverview';
import { RevenueBaseComparison } from '../components/crm/RevenueBaseComparison';
import { RevenueKpiView } from '../components/crm/RevenueKpiView';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { PageHeader, PageShell } from '../components/common/PageShell';
import { Popover, PopoverItem, usePopover } from '../components/common/Popover';
import {
  Button,
  EmptyState,
  IconButton,
  Input,
  Panel,
  Segmented,
  Select,
  SkeletonRows,
  TableHead,
  focusRing,
} from '../components/common/ui';
import {
  REVENUE_GROUP_COLORS,
  REVENUE_STAGE_COLORS,
  REVENUE_STAGE_ORDER,
  SERVICE_STATUS_ORDER,
  t,
} from '../i18n/vi';
import { formatVND, formatVNDInput, formatVNDShort, parseVNDInput } from '../lib/format';
import { formatPeriod, funnel, receivable } from '../lib/revenue';
import type {
  RevenueCell,
  RevenueComparisonResponse,
  RevenueGroup,
  RevenueLine,
  RevenueLinesResponse,
  RevenueStage,
  RevenueSummary,
  Service,
  ServiceStatus,
} from '../types';

/* Lazy: modal chi tai khi nguoi dung mo. Nhap tinh thi chunk cua no nam
   trong bundle cua trang du phan lon luot xem khong bao gio mo toi. */
const RevenueLineForm = lazy(() =>
  import('../components/crm/RevenueLineForm').then((module) => ({
    default: module.RevenueLineForm,
  }))
);
const MonthlyRevenueModal = lazy(() =>
  import('../components/crm/MonthlyRevenueModal').then((module) => ({
    default: module.MonthlyRevenueModal,
  }))
);
const RevenueAnchorDialog = lazy(() =>
  import('../components/crm/RevenueAnchorDialog').then((module) => ({
    default: module.RevenueAnchorDialog,
  }))
);
const RevenueImportDialog = lazy(() =>
  import('../components/crm/RevenueImportDialog').then((module) => ({
    default: module.RevenueImportDialog,
  }))
);
const ServiceCatalog = lazy(() =>
  import('../components/crm/ServiceCatalog').then((module) => ({ default: module.ServiceCatalog }))
);

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function periodOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/* Mau truc/nhan lay tu token trong index.css (khoi `.recharts-*`), khong dat o day. */
const AXIS_PROPS = {
  tick: { fontSize: 11 },
  tickLine: false,
};

type RevenueView = 'total' | 'new' | 'base' | 'kpi';
type KindFilter = 'new_expansion' | 'new' | 'expansion';

const VIEW_OPTIONS: { value: RevenueView; label: string }[] = [
  { value: 'total', label: t.revenueView.total },
  { value: 'new', label: t.revenueView.new },
  { value: 'base', label: t.revenueView.base },
  { value: 'kpi', label: 'KPI' },
];

const VIEW_DESCRIPTION: Record<RevenueView, string> = {
  total: 'Gộp doanh thu Mới, Mở rộng và Nền.',
  new: 'Doanh thu trong 12 tháng đầu kể từ tháng phát sinh doanh thu đầu tiên của hợp đồng mới hoặc mở rộng.',
  base: 'Doanh thu của hợp đồng từ tháng thứ 13 trở đi, so với năm trước.',
  kpi: 'Chỉ tiêu theo AM; ghi nhận doanh thu mới, mở rộng và mở rộng từ Nền (đã đối soát).',
};

const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: 'new_expansion', label: 'Tất cả' },
  { value: 'new', label: 'Mới' },
  { value: 'expansion', label: 'Mở rộng' },
];

function groupSetOf(view: RevenueView, kind: KindFilter): Set<RevenueGroup> | null {
  if (view === 'base') return new Set(['base']);
  if (view === 'total' || view === 'kpi') return null;
  return kind === 'new_expansion' ? new Set(['new', 'expansion']) : new Set([kind]);
}

const CHART_VIEW_OPTIONS = [
  { value: 'monthly' as const, label: 'Theo tháng' },
  { value: 'cumulative' as const, label: 'Lũy kế' },
];

export default function RevenuePage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const params = useParams();
  const view: RevenueView =
    params.view === 'new' || params.view === 'base' || params.view === 'kpi'
      ? params.view
      : 'total';
  const [kind, setKind] = useState<KindFilter>('new_expansion');
  const groupSet = groupSetOf(view, kind);
  const group = view === 'total' || view === 'kpi' ? undefined : view === 'base' ? 'base' : kind;
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [am, setAm] = useState('');
  const [chartView, setChartView] = useState<'monthly' | 'cumulative'>('monthly');
  const [chartOpen, setChartOpen] = useState(() => {
    try {
      return localStorage.getItem('workflow-revenue-chart-open-v1') === '1';
    } catch {
      return false;
    }
  });
  const [lineForm, setLineForm] = useState<{ open: boolean; line?: RevenueLine | null }>({
    open: false,
  });
  const [monthsFor, setMonthsFor] = useState<RevenueLine | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [anchorFor, setAnchorFor] = useState<RevenueLine | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  /** Nhập bù một tháng trước mốc tự động — chờ người dùng xác nhận. */
  const [retroSave, setRetroSave] = useState<{
    line: RevenueLine;
    period: string;
    amount_vnd: number;
  } | null>(null);
  /** Tháng đang mở menu "chuyển trạng thái cả cột". */
  const [bulkMonth, setBulkMonth] = useState<number | null>(null);
  const bulkPopover = usePopover();

  const filters = { q: term, status, service_id: serviceId, am, group };
  const listKey = ['revenues', 'lines', year, filters] as const;
  const hasActiveFilters = Boolean(term || status || serviceId || am);

  const clearFilters = () => {
    setTerm('');
    setStatus('');
    setServiceId('');
    setAm('');
  };
  const toggleChart = () => {
    setChartOpen((open) => {
      const next = !open;
      try {
        localStorage.setItem('workflow-revenue-chart-open-v1', next ? '1' : '0');
      } catch {
        // Trinh duyet chan storage khong duoc lam hong viec mo bang.
      }
      return next;
    });
  };

  const { data, isLoading } = useQuery({
    queryKey: listKey,
    enabled: view !== 'kpi',
    queryFn: () => api.get<RevenueLinesResponse>(`/api/revenues/lines${qs({ year, ...filters })}`),
  });
  const lines = data?.lines ?? [];

  const { data: summary } = useQuery({
    queryKey: ['revenues', 'summary', year, filters],
    enabled: view !== 'kpi',
    queryFn: () => api.get<RevenueSummary>(`/api/revenues/summary${qs({ year, ...filters })}`),
  });

  /* So sánh năm trước: màn hình Nền (chỉ tháng Nền) và màn hình Tổng (mọi tháng). */
  const { data: comparison, isLoading: comparisonLoading } = useQuery({
    queryKey: ['revenues', 'comparison', year, filters],
    queryFn: () =>
      api.get<RevenueComparisonResponse>(
        `/api/revenues/comparison${qs({ year, ...filters, group: view === 'base' ? 'base' : 'all' })}`
      ),
    enabled: view === 'total' || view === 'base',
  });

  const { data: years = [] } = useQuery({
    queryKey: ['revenues', 'years'],
    queryFn: () => api.get<number[]>('/api/revenues/years'),
  });

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.get<Service[]>('/api/services'),
  });

  const { data: ams = [] } = useQuery({
    queryKey: ['revenues', 'ams'],
    queryFn: () => api.get<string[]>('/api/revenues/ams'),
  });

  const refreshTotals = () => {
    queryClient.invalidateQueries({ queryKey: ['revenues', 'summary'] });
    queryClient.invalidateQueries({ queryKey: ['revenues', 'comparison'] });
    queryClient.invalidateQueries({ queryKey: ['revenues', 'years'] });
  };

  /** Ghi một ô tháng (số tiền và/hoặc trạng thái) rồi vá thẳng vào cache cho khỏi nháy. */
  const saveCell = useMutation({
    mutationFn: (input: {
      lineId: number;
      period: string;
      amount_vnd?: number;
      stage?: RevenueStage;
    }) =>
      api.put<RevenueCell & { line_id: number; period: string }>(
        `/api/revenues/lines/${input.lineId}/revenue`,
        { period: input.period, amount_vnd: input.amount_vnd, stage: input.stage }
      ),
    onSuccess: (cell) => {
      queryClient.setQueryData<RevenueLinesResponse>(listKey, (old) =>
        old
          ? {
              ...old,
              lines: old.lines.map((line) =>
                line.id !== cell.line_id
                  ? line
                  : recomputeTotals({
                      ...line,
                      months: { ...line.months, [cell.period]: cell },
                    })
              ),
            }
          : old
      );
      refreshTotals();
    },
  });

  /** Chuyển trạng thái cho tất cả dòng đang hiển thị trong một tháng. */
  const bulkStage = useMutation({
    mutationFn: (input: { period: string; stage: RevenueStage }) =>
      api.put<{ updated: number }>('/api/revenues/period-stage', {
        period: input.period,
        stage: input.stage,
        line_ids: lines.map((l) => l.id),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['revenues'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/revenues/lines/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['revenues'] }),
  });

  /** Tháng của dòng nằm ngoài nhóm đang xem — hiện mờ, không cộng vào tổng. */
  const outOfGroup = (line: RevenueLine, period: string) =>
    groupSet !== null && !groupSet.has(line.groups?.[period] ?? 'new');

  /**
   * Ghi số tiền một ô. Nhập bù vào tháng TRƯỚC mốc tự động sẽ kéo mốc lùi lại và
   * làm nhiều tháng đổi nhóm — hỏi lại trước khi lưu.
   */
  const saveAmount = (line: RevenueLine, period: string, amount_vnd: number) => {
    const first = line.anchor?.first_period;
    if (line.anchor?.mode === 'auto' && first && amount_vnd > 0 && period < first) {
      setRetroSave({ line, period, amount_vnd });
      return;
    }
    saveCell.mutate({ lineId: line.id, period, amount_vnd });
  };

  /** Tổng doanh thu từng tháng của các dòng đang hiển thị — dòng chân bảng. */
  const groupKey = groupSet ? [...groupSet].join(',') : '';
  const monthTotals = useMemo(
    () =>
      MONTHS.map((m) => {
        const period = periodOf(year, m);
        const only = groupKey ? new Set(groupKey.split(',')) : null;
        return lines.reduce(
          (sum, line) =>
            only && !only.has(line.groups?.[period] ?? 'new')
              ? sum
              : sum + (line.months[period]?.amount_vnd ?? 0),
          0
        );
      }),
    [lines, year, groupKey]
  );
  const grandTotal = monthTotals.reduce((a, b) => a + b, 0);

  const chartData = MONTHS.map((m) => {
    const row = summary?.months.find((x) => x.period === periodOf(year, m));
    return {
      name: `T${m}`,
      forecast: row?.stage_forecast_vnd ?? 0,
      reconciled: row?.stage_reconciled_vnd ?? 0,
      invoiced: row?.stage_invoiced_vnd ?? 0,
      paid: row?.stage_paid_vnd ?? 0,
    };
  });

  /** Cùng dữ liệu tháng, cộng dồn dần — không cần API riêng. */
  const cumulativeChartData = (() => {
    const running = { forecast: 0, reconciled: 0, invoiced: 0, paid: 0 };
    return chartData.map((row) => {
      running.forecast += row.forecast;
      running.reconciled += row.reconciled;
      running.invoiced += row.invoiced;
      running.paid += row.paid;
      return { name: row.name, ...running };
    });
  })();

  const total = funnel(summary?.totals);
  const yearOptions = years.includes(year) ? years : [year, ...years];

  return (
    <PageShell width="wide">
      <PageHeader
        title={t.nav.revenue}
        description={VIEW_DESCRIPTION[view]}
        align="center"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <IconButton
              label="Thao tác doanh thu"
              className="md:hidden"
              onClick={(event) => {
                setBulkMonth(null);
                bulkPopover.show(event);
              }}
            >
              <MoreHorizontal size={18} aria-hidden="true" />
            </IconButton>
            <a
              href="/api/export/revenues.csv"
              className={`inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-medium text-tr-subtle transition hover:bg-tr-hover ${focusRing}`}
            >
              <Download size={15} aria-hidden="true" /> Xuất CSV
            </a>
            <Button onClick={() => setImportOpen(true)}>
              <FileSpreadsheet size={15} aria-hidden="true" /> Nhập Excel
            </Button>
            <Button onClick={() => setCatalogOpen(true)}>
              <Settings2 size={15} aria-hidden="true" /> {t.service.manage}
            </Button>
            <Button variant="primary" onClick={() => setLineForm({ open: true, line: null })}>
              <Plus size={16} aria-hidden="true" /> {t.revenue.newLine}
            </Button>
          </div>
        }
      />

      {/* Ba màn hình: Tổng / Mới + Mở rộng / Nền — mỗi màn hình có đường dẫn riêng. */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Màn hình doanh thu"
          value={view}
          onChange={(next) => navigate(next === 'total' ? '/revenue' : `/revenue/${next}`)}
          options={VIEW_OPTIONS}
        />
        {view === 'new' && (
          <Segmented label="Loại hợp đồng" value={kind} onChange={setKind} options={KIND_OPTIONS} />
        )}
      </div>

      {/* Thanh lọc: năm, tìm kiếm, bộ lọc nghiệp vụ */}
      <div className="flex flex-wrap items-center gap-2 rounded-panel border border-tr-border bg-tr-panel p-2.5">
        <div className="w-28">
          <Select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label={t.revenue.year}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                Năm {y}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-[200px] flex-1 sm:max-w-xs">
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t.revenue.searchPlaceholder}
            aria-label={t.card.customer}
          />
        </div>
        <div className="w-44">
          <Select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            aria-label={t.revenue.service}
          >
            <option value="">Mọi dịch vụ</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label={t.revenue.status}
          >
            <option value="">{t.common.all}</option>
            {SERVICE_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {t.serviceStatus[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-36">
          <Select value={am} onChange={(e) => setAm(e.target.value)} aria-label={t.revenue.am}>
            <option value="">Mọi AM</option>
            {ams.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            {t.common.clearFilter}
          </Button>
        )}
      </div>

      {view === 'kpi' ? (
        <RevenueKpiView year={year} filters={{ q: term, status, service_id: serviceId, am }} />
      ) : (
        <>
          {/* Phễu doanh thu năm: cùng một khoản tiền đi qua các giai đoạn */}
          <RevenueFunnelCards
            total={total}
            detailed
            lineCount={summary?.line_count ?? 0}
            year={year}
          />

          {view === 'total' && (
            <RevenueGroupOverview year={year} summary={summary} comparison={comparison} />
          )}
          {view === 'base' && (
            <RevenueBaseComparison year={year} data={comparison} isLoading={comparisonLoading} />
          )}

          <Panel
            title={`Doanh thu theo tháng — năm ${year}`}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-expanded={chartOpen}
                  onClick={toggleChart}
                  className={`rounded-control px-2.5 py-1 text-xs font-medium text-tr-subtle hover:bg-tr-hover ${focusRing}`}
                >
                  {chartOpen ? 'Ẩn biểu đồ' : 'Hiện biểu đồ'}
                </button>
                {chartOpen && (
                  <Segmented
                    label="Chế độ xem biểu đồ"
                    value={chartView}
                    onChange={setChartView}
                    options={CHART_VIEW_OPTIONS}
                  />
                )}
              </div>
            }
          >
            {chartOpen && (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartView === 'monthly' ? chartData : cumulativeChartData}
                    margin={{ top: 4, right: 8, bottom: 0, left: 8 }}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="name" {...AXIS_PROPS} />
                    <YAxis
                      {...AXIS_PROPS}
                      tickFormatter={(v: number) => formatVNDShort(v)}
                      width={64}
                    />
                    <Tooltip content={<RevenueChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {REVENUE_STAGE_ORDER.map((stage) => (
                      <Bar
                        key={stage}
                        dataKey={stage}
                        stackId="revenue"
                        name={t.revenueStage[stage]}
                        fill={REVENUE_STAGE_COLORS[stage]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {/* Bieu do cot chong 4 giai doan: khong the doc bang ban phim hay trinh
            doc man hinh neu khong co bang kem theo. */}
            {chartOpen && (
              <ChartDataTable
                caption={`Doanh thu ${year} theo tháng — ${chartView === 'monthly' ? 'theo tháng' : 'lũy kế'}`}
                valueLabel="Tổng"
                rows={(chartView === 'monthly' ? chartData : cumulativeChartData).map((row) => ({
                  name: row.name,
                  value: REVENUE_STAGE_ORDER.map(
                    (stage) => `${t.revenueStage[stage]} ${formatVNDShort(row[stage])}`
                  ).join(' · '),
                }))}
              />
            )}
          </Panel>

          {/* Bảng nhập doanh thu 12 tháng */}
          {isLoading ? (
            <div className="rounded-panel border border-tr-border bg-tr-panel">
              <SkeletonRows rows={6} cols={6} />
            </div>
          ) : lines.length === 0 ? (
            hasActiveFilters ? (
              <EmptyState
                message={t.revenue.noResults}
                action={
                  <Button variant="secondary" onClick={clearFilters}>
                    {t.common.clearFilter}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                message={t.revenue.noLines}
                action={
                  <Button variant="primary" onClick={() => setLineForm({ open: true, line: null })}>
                    <Plus size={16} /> {t.revenue.newLine}
                  </Button>
                }
              />
            )
          ) : (
            <div className="overflow-hidden rounded-panel border border-tr-border bg-tr-panel shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-tr-border px-3 py-2 text-xs text-tr-muted">
                <span className="inline-flex items-center gap-1.5" title={t.revenue.guideFlow}>
                  <Info size={12} className="shrink-0" aria-hidden="true" />
                  {t.revenue.guide}
                </span>
                <span className="flex flex-wrap items-center gap-3">
                  {REVENUE_STAGE_ORDER.map((stage) => (
                    <span key={stage} className="flex items-center gap-1.5">
                      <RevenueStageGlyph stage={stage} />
                      {t.revenueStage[stage]}
                    </span>
                  ))}
                </span>
              </div>
              <div className="divide-y divide-tr-border md:hidden">
                {lines.map((line) => {
                  const paid = MONTHS.filter(
                    (month) => line.months[periodOf(year, month)]?.stage === 'paid'
                  ).length;
                  return (
                    <button
                      key={line.id}
                      type="button"
                      onClick={() => setMonthsFor(line)}
                      className="flex min-h-24 w-full flex-col gap-2 px-3 py-3 text-left text-tr-text"
                    >
                      <span className="flex w-full items-start justify-between gap-3">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {line.customer_name}
                          </span>
                          <span className="block truncate text-xs text-tr-muted">
                            {line.service_name ?? 'Chưa gán dịch vụ'}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {formatVNDShort(line.totals.amount_vnd)}
                        </span>
                      </span>
                      <span className="grid h-2 w-full grid-cols-12 gap-0.5" aria-hidden="true">
                        {MONTHS.map((month) => {
                          const stage = line.months[periodOf(year, month)]?.stage;
                          return (
                            <span
                              key={month}
                              className={`rounded-full ${stage === 'paid' ? 'bg-tr-success' : stage ? 'bg-tr-warning' : 'bg-tr-hover-strong'}`}
                            />
                          );
                        })}
                      </span>
                      <span className="text-xs text-tr-muted">Đã thu {paid}/12 tháng</span>
                    </button>
                  );
                })}
              </div>
              <div className="tr-scroll hidden max-h-[70vh] overflow-auto md:block">
                <table className="w-full text-sm">
                  <TableHead className="sticky top-0 z-20 shadow-[0_1px_0_var(--tr-border)]">
                    <tr>
                      <th
                        scope="col"
                        className="sticky top-0 left-0 z-30 min-w-56 border-r border-tr-border bg-tr-surface px-3 py-2.5"
                      >
                        {t.card.customer}
                      </th>
                      <th scope="col" className="px-3 py-2.5 whitespace-nowrap">
                        {t.revenue.am}
                      </th>
                      <th scope="col" className="px-3 py-2.5 whitespace-nowrap">
                        {t.revenue.contractKind}
                      </th>
                      <th scope="col" className="px-3 py-2.5 whitespace-nowrap">
                        {t.revenue.contractTerm}
                      </th>
                      <th scope="col" className="px-3 py-2.5 whitespace-nowrap">
                        {t.revenue.service}
                      </th>
                      <th scope="col" className="px-3 py-2.5 whitespace-nowrap">
                        {t.revenue.status}
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right whitespace-nowrap">
                        {t.revenue.total}
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right whitespace-nowrap">
                        {t.revenue.receivable}
                      </th>
                      {MONTHS.map((m) => (
                        <th
                          scope="col"
                          key={m}
                          className="px-2 py-2.5 text-right whitespace-nowrap"
                        >
                          <button
                            onClick={(e) => {
                              setBulkMonth(m);
                              bulkPopover.show(e);
                            }}
                            title={t.revenue.setStageForMonth}
                            aria-label={`${t.revenue.setStageForMonth}: ${t.revenue.month} ${m}`}
                            className={`rounded-control-inner px-1 py-0.5 transition hover:bg-tr-hover hover:text-tr-primary ${focusRing}`}
                          >
                            {t.revenue.month} {m}
                          </button>
                        </th>
                      ))}
                      <th scope="col" className="px-2 py-2.5"></th>
                    </tr>
                  </TableHead>
                  <tbody className="divide-y divide-tr-border">
                    {lines.map((line) => (
                      <tr key={line.id} className="group hover:bg-tr-hover">
                        <td className="sticky left-0 z-10 border-r border-tr-border bg-tr-panel px-3 py-1.5 group-hover:bg-tr-hover">
                          <Link
                            to={`/customers/${line.customer_id}`}
                            className="font-medium text-tr-text hover:text-tr-primary hover:underline"
                          >
                            {line.customer_name}
                          </Link>
                          {line.contract_name && (
                            <div className="text-xs text-tr-muted">{line.contract_name}</div>
                          )}
                          <GroupBadge line={line} year={year} onEdit={() => setAnchorFor(line)} />
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-tr-subtle">
                          {line.am || '—'}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-tr-subtle">
                          {t.contractKind[line.contract_kind]}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-tr-subtle">
                          {t.contractTerm[line.contract_term]}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-tr-text">
                          {line.service_name || <span className="text-tr-muted">— chưa gán —</span>}
                        </td>
                        <td className="px-3 py-1.5">
                          <StatusChip status={line.status}>
                            {t.serviceStatus[line.status]}
                          </StatusChip>
                        </td>
                        <td
                          className="bg-tr-surface px-3 py-1.5 text-right font-semibold tabular-nums text-tr-text"
                          title={`${t.revenue.forecast}: ${formatVND(line.totals.forecast_vnd)}`}
                        >
                          {formatVNDInput(line.totals.amount_vnd) || '0'}
                        </td>
                        <td
                          className="bg-tr-surface px-3 py-1.5 text-right tabular-nums"
                          title={t.revenue.receivableHint}
                        >
                          {receivable(line.totals) > 0 ? (
                            <span className="font-semibold text-tr-warning">
                              {formatVNDInput(receivable(line.totals))}
                            </span>
                          ) : (
                            <span className="text-tr-muted">—</span>
                          )}
                        </td>
                        {MONTHS.map((m) => {
                          const period = periodOf(year, m);
                          const cell = line.months[period];
                          return (
                            <MonthCell
                              key={m}
                              cell={cell}
                              monthLabel={`T${m}`}
                              outOfGroup={
                                outOfGroup(line, period)
                                  ? `Tháng này thuộc nhóm ${t.revenueGroup[line.groups[period]]}`
                                  : undefined
                              }
                              onAmount={(amount_vnd) => saveAmount(line, period, amount_vnd)}
                              onStage={(stage) =>
                                saveCell.mutate({ lineId: line.id, period, stage })
                              }
                            />
                          );
                        })}
                        <td className="px-2 py-1.5">
                          <RevenueLineActions
                            line={line}
                            onMonths={setMonthsFor}
                            onAnchor={setAnchorFor}
                            onEdit={(next) => setLineForm({ open: true, line: next })}
                            onDelete={(next) => setDeleteId(next.id)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 z-20 bg-tr-surface text-sm font-semibold shadow-[0_-1px_0_var(--tr-border)]">
                    <tr>
                      <td className="sticky bottom-0 left-0 z-30 border-r border-tr-border bg-tr-surface px-3 py-2 text-tr-subtle">
                        {t.revenue.grandTotal}
                      </td>
                      {/* AM, loại HĐ, thời hạn, dịch vụ, tình trạng */}
                      <td colSpan={5} />
                      <td className="px-3 py-2 text-right tabular-nums text-tr-text">
                        {formatVNDInput(grandTotal) || '0'}
                      </td>
                      <td />
                      {monthTotals.map((value, i) => (
                        <td key={i} className="px-2 py-2 text-right tabular-nums text-tr-text">
                          {formatVNDInput(value) || '—'}
                        </td>
                      ))}
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Chuyển trạng thái toàn bộ một tháng */}
      <Popover
        open={bulkPopover.open}
        anchor={bulkPopover.anchor}
        onClose={() => {
          bulkPopover.close();
          setBulkMonth(null);
        }}
        title={
          bulkMonth === null
            ? 'Chuyển trạng thái theo tháng'
            : `${t.revenue.setStageForMonth} ${bulkMonth}/${year}`
        }
        onBack={bulkMonth === null ? undefined : () => setBulkMonth(null)}
        width={260}
      >
        {bulkMonth === null ? (
          <div className="grid grid-cols-3 gap-1">
            {MONTHS.map((month) => (
              <button
                key={month}
                type="button"
                onClick={() => setBulkMonth(month)}
                className={`min-h-11 rounded-control text-sm text-tr-text hover:bg-tr-hover ${focusRing}`}
              >
                Tháng {month}
              </button>
            ))}
          </div>
        ) : (
          <>
            <p className="mb-2 text-xs text-tr-muted">
              Áp dụng cho {lines.length} dòng đang hiển thị, chỉ với tháng đã có số liệu.
            </p>
            {REVENUE_STAGE_ORDER.map((stage) => (
              <PopoverItem
                key={stage}
                icon={
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: REVENUE_STAGE_COLORS[stage] }}
                  />
                }
                onClick={() => {
                  bulkStage.mutate({ period: periodOf(year, bulkMonth), stage });
                  bulkPopover.close();
                  setBulkMonth(null);
                }}
              >
                {t.revenueStage[stage]}
              </PopoverItem>
            ))}
          </>
        )}
      </Popover>

      <Suspense fallback={null}>
        {lineForm.open && (
          <RevenueLineForm open line={lineForm.line} onClose={() => setLineForm({ open: false })} />
        )}
        {monthsFor !== null && (
          <MonthlyRevenueModal
            open
            line={monthsFor}
            year={year}
            onClose={() => setMonthsFor(null)}
          />
        )}
        {catalogOpen && <ServiceCatalog open onClose={() => setCatalogOpen(false)} />}
        {importOpen && (
          <RevenueImportDialog
            year={year}
            filters={{ q: term, status, service_id: serviceId, am }}
            onClose={() => setImportOpen(false)}
          />
        )}
        {anchorFor !== null && (
          <RevenueAnchorDialog line={anchorFor} year={year} onClose={() => setAnchorFor(null)} />
        )}
      </Suspense>
      <ConfirmDialog
        open={retroSave !== null}
        title="Nhập bù trước mốc phân nhóm"
        confirmLabel="Vẫn lưu"
        message={
          retroSave
            ? `${formatPeriod(retroSave.period)} nằm trước tháng có doanh thu đầu tiên hiện tại (${formatPeriod(retroSave.line.anchor.first_period)}). Lưu số này sẽ lùi mốc về ${formatPeriod(retroSave.period)}: 12 tháng Mới / Mở rộng bắt đầu sớm hơn và một số tháng sẽ chuyển sang Nền, báo cáo các năm liên quan thay đổi theo.`
            : ''
        }
        onCancel={() => setRetroSave(null)}
        onConfirm={() => {
          if (retroSave)
            saveCell.mutate(
              {
                lineId: retroSave.line.id,
                period: retroSave.period,
                amount_vnd: retroSave.amount_vnd,
              },
              { onSuccess: () => queryClient.invalidateQueries({ queryKey: ['revenues'] }) }
            );
          setRetroSave(null);
        }}
      />
      <ConfirmDialog
        open={deleteId !== null}
        message="Xóa dòng dịch vụ này? Toàn bộ doanh thu đã nhập của dòng sẽ bị xóa theo."
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) remove.mutate(deleteId);
          setDeleteId(null);
        }}
      />
    </PageShell>
  );
}

/**
 * Nhóm của dòng trong năm đang xem — ví dụ "Mới → Nền từ T8/2026". Bấm để sửa
 * mốc phân nhóm; mốc sửa tay có dấu ✎.
 */
function GroupBadge({
  line,
  year,
  onEdit,
}: {
  line: RevenueLine;
  year: number;
  onEdit: () => void;
}) {
  if (!line.groups) return null;
  const sequence: RevenueGroup[] = [];
  for (const m of MONTHS) {
    const g = line.groups[periodOf(year, m)];
    if (g && sequence[sequence.length - 1] !== g) sequence.push(g);
  }
  const label =
    sequence.length > 1
      ? `${t.revenueGroup[sequence[0]]} → Nền từ ${formatPeriod(line.anchor.base_from)}`
      : t.revenueGroup[sequence[0] ?? 'new'];
  return (
    <button
      type="button"
      onClick={onEdit}
      title="Mốc phân nhóm — bấm để xem / sửa"
      className={`mt-0.5 flex items-center gap-1 rounded-control-inner text-xs text-tr-subtle hover:text-tr-primary ${focusRing}`}
    >
      {sequence.map((g) => (
        <span
          key={g}
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: REVENUE_GROUP_COLORS[g] }}
          aria-hidden="true"
        />
      ))}
      {label}
      {line.anchor.mode !== 'auto' && <span aria-label="mốc sửa tay"> ✎</span>}
    </button>
  );
}

/** Tính lại tổng năm của một dòng sau khi sửa một ô. */
function recomputeTotals(line: RevenueLine): RevenueLine {
  const totals = {
    amount_vnd: 0,
    forecast_vnd: 0,
    stage_forecast_vnd: 0,
    stage_reconciled_vnd: 0,
    stage_invoiced_vnd: 0,
    stage_paid_vnd: 0,
  };
  for (const cell of Object.values(line.months)) {
    totals.amount_vnd += cell.amount_vnd;
    totals.forecast_vnd += cell.forecast_vnd;
    if (cell.stage === 'forecast') totals.stage_forecast_vnd += cell.amount_vnd;
    else if (cell.stage === 'reconciled') totals.stage_reconciled_vnd += cell.amount_vnd;
    else if (cell.stage === 'invoiced') totals.stage_invoiced_vnd += cell.amount_vnd;
    else totals.stage_paid_vnd += cell.amount_vnd;
  }
  return { ...line, totals };
}

/** Badge trạng thái dùng token semantic để tự đổi theo theme. */
function StatusChip({ status, children }: { status: ServiceStatus; children: string }) {
  const classes: Record<ServiceStatus, string> = {
    using:
      'border-service-status-using-fg/35 bg-service-status-using-bg text-service-status-using-fg',
    pending:
      'border-service-status-pending-fg/35 bg-service-status-pending-bg text-service-status-pending-fg',
    paused:
      'border-service-status-paused-fg/35 bg-service-status-paused-bg text-service-status-paused-fg',
    stopped:
      'border-service-status-stopped-fg/35 bg-service-status-stopped-bg text-service-status-stopped-fg',
  };
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${classes[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

function RevenueStageGlyph({ stage }: { stage: RevenueStage }) {
  const Glyph =
    stage === 'forecast'
      ? Circle
      : stage === 'reconciled'
        ? CircleDot
        : stage === 'invoiced'
          ? FileText
          : CircleCheck;
  return <Glyph size={12} aria-hidden="true" style={{ color: REVENUE_STAGE_COLORS[stage] }} />;
}

/** Tooltip biểu đồ: liệt kê từng giai đoạn của tháng kèm tổng cộng — dễ đọc ở cả hai theme. */
function RevenueChartTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: { dataKey?: string | number; name?: string; value?: number; color?: string }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const total = payload.reduce((sum, p) => sum + (p.value ?? 0), 0);
  return (
    <div className="min-w-[190px] rounded-control border border-tr-border bg-tr-panel px-3 py-2 text-xs shadow-lg">
      <div className="mb-1.5 font-semibold text-tr-text">
        Tháng {typeof label === 'string' ? label.replace(/^T/, '') : label}
      </div>
      <div className="space-y-1">
        {payload.map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-tr-subtle">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: p.color }}
                aria-hidden="true"
              />
              {p.name}
            </span>
            <span className="tabular-nums text-tr-text">{formatVND(p.value)}</span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-4 border-t border-tr-border pt-1.5 font-semibold text-tr-text">
        <span>Tổng</span>
        <span className="tabular-nums">{formatVND(total)}</span>
      </div>
    </div>
  );
}

/** Ô tháng: số tiền sửa tại chỗ + chấm trạng thái mở menu chuyển giai đoạn. */
function MonthCell({
  cell,
  monthLabel,
  outOfGroup,
  onAmount,
  onStage,
}: {
  cell: RevenueCell | undefined;
  monthLabel: string;
  /** Có giá trị = tháng không thuộc nhóm đang xem; nội dung là lời giải thích. */
  outOfGroup?: string;
  onAmount: (value: number) => void;
  onStage: (stage: RevenueStage) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const popover = usePopover();
  const amount = cell?.amount_vnd ?? 0;
  const stage = cell?.stage ?? 'forecast';
  const shown = text ?? formatVNDInput(amount);
  const variance = cell ? cell.amount_vnd - cell.forecast_vnd : 0;

  if (outOfGroup) {
    return (
      <td
        className="bg-tr-surface px-2 py-1 text-right text-xs tabular-nums text-tr-muted"
        title={outOfGroup}
      >
        {amount ? formatVNDInput(amount) : '·'}
      </td>
    );
  }

  return (
    <td className="px-1 py-1">
      <div className="flex items-center justify-end gap-1">
        <button
          onClick={popover.toggle}
          disabled={amount === 0}
          title={
            amount === 0
              ? 'Nhập số tiền trước khi chọn trạng thái'
              : `${t.revenueStage[stage]} · Bấm để đổi trạng thái${variance !== 0 ? ` · dự kiến ${formatVNDInput(cell!.forecast_vnd)}` : ''}${cell?.note ? ` · ${cell.note}` : ''}`
          }
          aria-label={
            amount === 0
              ? `${monthLabel}: chưa có số tiền`
              : `${monthLabel}: ${t.revenueStage[stage]} — bấm để đổi trạng thái`
          }
          className={`shrink-0 rounded-control-inner p-0.5 transition hover:ring-2 hover:ring-tr-border disabled:opacity-25 ${focusRing}`}
        >
          <RevenueStageGlyph stage={stage} />
        </button>
        <input
          inputMode="numeric"
          value={shown}
          aria-label={`Doanh thu ${monthLabel}`}
          onChange={(e) => setText(formatVNDInput(parseVNDInput(e.target.value)))}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => {
            const next = parseVNDInput(shown);
            if (next !== amount) onAmount(next);
            setText(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setText(null);
              e.currentTarget.blur();
            }
          }}
          placeholder="—"
          className={`w-24 rounded-control-inner border border-transparent bg-transparent px-1.5 py-1 text-right text-sm tabular-nums outline-none transition hover:border-tr-border focus:border-tr-primary focus:bg-tr-panel ${
            amount ? 'text-tr-text' : 'text-tr-muted'
          }`}
        />
      </div>

      <Popover
        open={popover.open}
        anchor={popover.anchor}
        onClose={popover.close}
        title={t.revenue.stage}
        width={240}
      >
        {variance !== 0 && (
          <p className="mb-2 text-xs text-tr-muted">
            {t.revenue.forecast}: {formatVND(cell!.forecast_vnd)} → thực tế{' '}
            {formatVND(cell!.amount_vnd)} ({variance > 0 ? '+' : ''}
            {formatVNDShort(variance)})
          </p>
        )}
        {REVENUE_STAGE_ORDER.map((option) => (
          <PopoverItem
            key={option}
            icon={
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: REVENUE_STAGE_COLORS[option] }}
              />
            }
            onClick={() => {
              if (option !== stage) onStage(option);
              popover.close();
            }}
          >
            <span className="flex flex-1 items-center justify-between">
              {t.revenueStage[option]}
              {option === stage && <Check size={14} className="text-tr-primary" />}
            </span>
          </PopoverItem>
        ))}
      </Popover>
    </td>
  );
}
