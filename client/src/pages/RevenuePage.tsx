import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
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
import { Check, Download, Info, Plus, Settings2 } from 'lucide-react';
import { api, qs } from '../api/client';
import { RevenueLineForm } from '../components/crm/RevenueLineForm';
import { MonthlyRevenueModal } from '../components/crm/MonthlyRevenueModal';
import { ServiceCatalog } from '../components/crm/ServiceCatalog';
import { RevenueLineActions } from '../components/crm/RevenueLineActions';
import { RevenueFunnelCards } from '../components/crm/RevenueFunnelCards';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { PageHeader, PageShell } from '../components/common/PageShell';
import { Popover, PopoverItem, usePopover } from '../components/common/Popover';
import {
  Button,
  EmptyState,
  Input,
  Panel,
  Segmented,
  Select,
  SkeletonRows,
  TableHead,
  focusRing,
} from '../components/common/ui';
import {
  CHART_INK,
  REVENUE_STAGE_COLORS,
  REVENUE_STAGE_ORDER,
  REVENUE_STAGE_TINTS,
  SERVICE_STATUS_COLORS,
  SERVICE_STATUS_ORDER,
  t,
} from '../i18n/vi';
import { formatVND, formatVNDInput, formatVNDShort, parseVNDInput } from '../lib/format';
import { funnel } from '../lib/revenue';
import type {
  RevenueCell,
  RevenueLine,
  RevenueLinesResponse,
  RevenueStage,
  RevenueSummary,
  Service,
} from '../types';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function periodOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

const AXIS_PROPS = {
  stroke: CHART_INK.axis,
  tick: { fill: CHART_INK.muted, fontSize: 11 },
  tickLine: false,
};

const CHART_VIEW_OPTIONS = [
  { value: 'monthly' as const, label: 'Theo tháng' },
  { value: 'cumulative' as const, label: 'Lũy kế' },
];

export default function RevenuePage() {
  const queryClient = useQueryClient();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [am, setAm] = useState('');
  const [chartView, setChartView] = useState<'monthly' | 'cumulative'>('monthly');
  const [lineForm, setLineForm] = useState<{ open: boolean; line?: RevenueLine | null }>({
    open: false,
  });
  const [monthsFor, setMonthsFor] = useState<RevenueLine | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  /** Tháng đang mở menu "chuyển trạng thái cả cột". */
  const [bulkMonth, setBulkMonth] = useState<number | null>(null);
  const bulkPopover = usePopover();

  const filters = { q: term, status, service_id: serviceId, am };
  const listKey = ['revenues', 'lines', year, filters] as const;
  const hasActiveFilters = Boolean(term || status || serviceId || am);

  const clearFilters = () => {
    setTerm('');
    setStatus('');
    setServiceId('');
    setAm('');
  };

  const { data, isLoading } = useQuery({
    queryKey: listKey,
    queryFn: () => api.get<RevenueLinesResponse>(`/api/revenues/lines${qs({ year, ...filters })}`),
  });
  const lines = data?.lines ?? [];

  const { data: summary } = useQuery({
    queryKey: ['revenues', 'summary', year, filters],
    queryFn: () => api.get<RevenueSummary>(`/api/revenues/summary${qs({ year, ...filters })}`),
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

  /** Tổng doanh thu từng tháng của các dòng đang hiển thị — dòng chân bảng. */
  const monthTotals = useMemo(
    () =>
      MONTHS.map((m) =>
        lines.reduce((sum, line) => sum + (line.months[periodOf(year, m)]?.amount_vnd ?? 0), 0)
      ),
    [lines, year]
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
        description={t.revenue.subtitle}
        align="center"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/api/export/revenues.csv"
              className={`inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-medium text-tr-subtle transition hover:bg-tr-hover ${focusRing}`}
            >
              <Download size={15} aria-hidden="true" /> Xuất CSV
            </a>
            <Button onClick={() => setCatalogOpen(true)}>
              <Settings2 size={15} aria-hidden="true" /> {t.service.manage}
            </Button>
            <Button variant="primary" onClick={() => setLineForm({ open: true, line: null })}>
              <Plus size={16} aria-hidden="true" /> {t.revenue.newLine}
            </Button>
          </div>
        }
      />

      {/* Thanh lọc: năm, tìm kiếm, bộ lọc nghiệp vụ */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-tr-border bg-tr-panel p-2.5">
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

      {/* Phễu doanh thu năm: cùng một khoản tiền đi qua các giai đoạn */}
      <RevenueFunnelCards total={total} detailed lineCount={summary?.line_count ?? 0} year={year} />

      <Panel
        title={`Doanh thu theo tháng — năm ${year}`}
        action={
          <Segmented
            label="Chế độ xem biểu đồ"
            value={chartView}
            onChange={setChartView}
            options={CHART_VIEW_OPTIONS}
          />
        }
      >
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartView === 'monthly' ? chartData : cumulativeChartData}
              margin={{ top: 4, right: 8, bottom: 0, left: 8 }}
            >
              <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
              <XAxis dataKey="name" {...AXIS_PROPS} />
              <YAxis {...AXIS_PROPS} tickFormatter={(v: number) => formatVNDShort(v)} width={64} />
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
        <div className="overflow-hidden rounded-lg border border-tr-border bg-tr-panel shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-tr-border px-3 py-2 text-xs text-tr-muted">
            <span className="inline-flex items-center gap-1.5" title={t.revenue.guideFlow}>
              <Info size={12} className="shrink-0" aria-hidden="true" />
              {t.revenue.guide}
            </span>
            <span className="flex flex-wrap items-center gap-3">
              {REVENUE_STAGE_ORDER.map((stage) => (
                <span key={stage} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: REVENUE_STAGE_COLORS[stage] }}
                  />
                  {t.revenueStage[stage]}
                </span>
              ))}
            </span>
          </div>
          <div className="tr-scroll max-h-[70vh] overflow-auto">
            <table className="w-full text-sm">
              <TableHead className="sticky top-0 z-20 shadow-[0_1px_0_var(--tr-border)]">
                <tr>
                  <th
                    scope="col"
                    className="sticky top-0 left-0 z-30 min-w-12 bg-tr-surface px-3 py-2.5"
                  >
                    STT
                  </th>
                  <th
                    scope="col"
                    className="sticky top-0 left-12 z-30 min-w-56 border-r border-tr-border bg-tr-surface px-3 py-2.5"
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
                  {MONTHS.map((m) => (
                    <th scope="col" key={m} className="px-2 py-2.5 text-right whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          setBulkMonth(m);
                          bulkPopover.show(e);
                        }}
                        title={t.revenue.setStageForMonth}
                        aria-label={`${t.revenue.setStageForMonth}: ${t.revenue.month} ${m}`}
                        className={`rounded px-1 py-0.5 uppercase transition hover:bg-tr-hover hover:text-tr-primary ${focusRing}`}
                      >
                        {t.revenue.month} {m}
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="px-2 py-2.5"></th>
                </tr>
              </TableHead>
              <tbody className="divide-y divide-tr-border">
                {lines.map((line, index) => (
                  <tr key={line.id} className="group hover:bg-tr-hover">
                    <td className="sticky left-0 z-10 min-w-12 bg-tr-panel px-3 py-1.5 text-tr-muted tabular-nums group-hover:bg-tr-hover">
                      {index + 1}
                    </td>
                    <td className="sticky left-12 z-10 border-r border-tr-border bg-tr-panel px-3 py-1.5 group-hover:bg-tr-hover">
                      <Link
                        to={`/customers/${line.customer_id}`}
                        className="font-medium text-tr-text hover:text-tr-primary hover:underline"
                      >
                        {line.customer_name}
                      </Link>
                      {line.contract_name && (
                        <div className="text-2xs text-tr-muted">{line.contract_name}</div>
                      )}
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
                      <StatusChip color={SERVICE_STATUS_COLORS[line.status]}>
                        {t.serviceStatus[line.status]}
                      </StatusChip>
                    </td>
                    <td
                      className="bg-tr-surface px-3 py-1.5 text-right font-semibold tabular-nums text-tr-text"
                      title={`${t.revenue.forecast}: ${formatVND(line.totals.forecast_vnd)}`}
                    >
                      {formatVNDInput(line.totals.amount_vnd) || '0'}
                    </td>
                    {MONTHS.map((m) => {
                      const period = periodOf(year, m);
                      const cell = line.months[period];
                      return (
                        <MonthCell
                          key={m}
                          cell={cell}
                          monthLabel={`T${m}`}
                          onAmount={(amount_vnd) =>
                            saveCell.mutate({ lineId: line.id, period, amount_vnd })
                          }
                          onStage={(stage) => saveCell.mutate({ lineId: line.id, period, stage })}
                        />
                      );
                    })}
                    <td className="px-2 py-1.5">
                      <RevenueLineActions
                        line={line}
                        onMonths={setMonthsFor}
                        onEdit={(next) => setLineForm({ open: true, line: next })}
                        onDelete={(next) => setDeleteId(next.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 z-20 bg-tr-surface text-sm font-semibold shadow-[0_-1px_0_var(--tr-border)]">
                <tr>
                  <td className="sticky bottom-0 left-0 z-30 min-w-12 bg-tr-surface px-3 py-2" />
                  <td className="sticky bottom-0 left-12 z-30 border-r border-tr-border bg-tr-surface px-3 py-2 text-tr-subtle">
                    {t.revenue.grandTotal}
                  </td>
                  <td colSpan={5} />
                  <td className="px-3 py-2 text-right tabular-nums text-tr-text">
                    {formatVNDInput(grandTotal) || '0'}
                  </td>
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

      {/* Chuyển trạng thái toàn bộ một tháng */}
      <Popover
        open={bulkPopover.open && bulkMonth !== null}
        anchor={bulkPopover.anchor}
        onClose={() => {
          bulkPopover.close();
          setBulkMonth(null);
        }}
        title={`${t.revenue.setStageForMonth} ${bulkMonth}/${year}`}
        width={260}
      >
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
              if (bulkMonth) bulkStage.mutate({ period: periodOf(year, bulkMonth), stage });
              bulkPopover.close();
              setBulkMonth(null);
            }}
          >
            {t.revenueStage[stage]}
          </PopoverItem>
        ))}
      </Popover>

      <RevenueLineForm
        open={lineForm.open}
        line={lineForm.line}
        onClose={() => setLineForm({ open: false })}
      />
      <MonthlyRevenueModal
        open={monthsFor !== null}
        line={monthsFor}
        year={year}
        onClose={() => setMonthsFor(null)}
      />
      <ServiceCatalog open={catalogOpen} onClose={() => setCatalogOpen(false)} />
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

/** hex + alpha -> rgba(); dùng cho badge nền nhạt/viền mảnh không cần đổi bảng màu nguồn. */
function hexToRgba(hex: string, alpha: number): string {
  const v = hex.replace('#', '');
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Badge trạng thái nhẹ: chấm màu + nền nhạt/viền mảnh cùng tông thay vì nền đặc bão hòa. */
function StatusChip({ color, children }: { color: string; children: string }) {
  return (
    <span
      className="inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={{
        backgroundColor: hexToRgba(color, 0.14),
        borderColor: hexToRgba(color, 0.35),
        color,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {children}
    </span>
  );
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
  onAmount,
  onStage,
}: {
  cell: RevenueCell | undefined;
  monthLabel: string;
  onAmount: (value: number) => void;
  onStage: (stage: RevenueStage) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const popover = usePopover();
  const amount = cell?.amount_vnd ?? 0;
  const stage = cell?.stage ?? 'forecast';
  const shown = text ?? formatVNDInput(amount);
  const variance = cell ? cell.amount_vnd - cell.forecast_vnd : 0;

  return (
    <td className="px-1 py-1" style={{ backgroundColor: REVENUE_STAGE_TINTS[stage] }}>
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
          className={`shrink-0 rounded-full p-0.5 transition hover:ring-2 hover:ring-tr-border disabled:opacity-25 ${focusRing}`}
        >
          <span
            className="block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: REVENUE_STAGE_COLORS[stage] }}
          />
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
          className={`w-24 rounded border border-transparent bg-transparent px-1.5 py-1 text-right text-sm tabular-nums outline-none transition hover:border-tr-border focus:border-tr-primary focus:bg-tr-panel ${
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
