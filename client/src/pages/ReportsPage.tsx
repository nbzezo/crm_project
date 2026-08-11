import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format, startOfMonth, startOfQuarter, subMonths } from 'date-fns';
import { api, qs } from '../api/client';
import { ErrorState, Panel, Skeleton, focusRing } from '../components/common/ui';
import {
  CATEGORICAL_COLORS,
  CHART_INK,
  CHART_PRIMARY,
  PRIORITY_COLORS,
  PRIORITY_ORDER,
  STAGE_ORDER,
  t,
} from '../i18n/vi';
import {
  formatDateShort,
  formatMonth,
  formatPercent,
  formatVND,
  formatVNDShort,
  todayStr,
} from '../lib/format';
import { FACTOR_LABELS, QUADRANT_COLORS, QUADRANT_LABELS } from '../i18n/scoring';
import type { Factor, InteractionType, Priority, Quadrant, Stage } from '../types';

interface ReportsData {
  from: string;
  to: string;
  completed_by_week: { week_start: string; count: number }[];
  open_by_priority: { priority: Priority; count: number }[];
  pipeline_by_stage: { stage: Stage; count: number; sum_vnd: number }[];
  won_by_month: { month: string; count: number; sum_vnd: number }[];
  interactions_by_type: { type: InteractionType; count: number }[];
  win_rate: { won: number; lost: number; rate: number };
  top_customers: { id: number; name: string; won_vnd: number; won_count: number }[];
  summary: { overdue_count: number; due_week_count: number; open_pipeline_vnd: number };
  /** F-10 + F-16 — đối chiếu điểm lúc chốt với kết quả thắng/thua. */
  score_winloss: {
    by_quadrant: Record<Quadrant, { won: number; lost: number }>;
    lost_reason_by_factor: Record<string, Record<string, number>>;
    scored_closed_count: number;
    min_deals: number;
  };
}

type RangeKey = 'month' | 'quarter' | 'six' | 'custom';

const AXIS_PROPS = {
  stroke: CHART_INK.axis,
  tick: { fill: CHART_INK.muted, fontSize: 11 },
  tickLine: false,
};

export default function ReportsPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>('six');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState(todayStr());

  const range = resolveRange(rangeKey, customFrom, customTo);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reports', range.from, range.to],
    queryFn: () => api.get<ReportsData>(`/api/views/reports${qs(range)}`),
  });

  if (error)
    return (
      <div className="p-6">
        <ErrorState onRetry={() => refetch()} />
      </div>
    );

  if (isLoading || !data)
    return (
      <div role="status" aria-label={t.common.loading} className="space-y-4 p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-panel" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-panel" />
          ))}
        </div>
      </div>
    );

  const priorityData = PRIORITY_ORDER.map((priority) => ({
    priority,
    name: t.priority[priority],
    count: data.open_by_priority.find((row) => row.priority === priority)?.count ?? 0,
  })).filter((row) => row.count > 0);

  const stageData = STAGE_ORDER.filter((s) => s !== 'lost').map((stage) => {
    const row = data.pipeline_by_stage.find((r) => r.stage === stage);
    return { name: t.stage[stage], sum_vnd: row?.sum_vnd ?? 0, count: row?.count ?? 0 };
  });

  const interactionData = data.interactions_by_type.map((row) => ({
    name: t.interactionType[row.type],
    count: row.count,
  }));

  const weekData = data.completed_by_week.map((row) => ({
    name: formatDateShort(row.week_start),
    count: row.count,
  }));

  const monthData = data.won_by_month.map((row) => ({
    name: formatMonth(row.month),
    sum_vnd: row.sum_vnd,
    count: row.count,
  }));

  const winTotal = data.win_rate.won + data.win_rate.lost;

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['month', t.reports.thisMonth],
            ['quarter', t.reports.thisQuarter],
            ['six', t.reports.sixMonths],
            ['custom', t.reports.custom],
          ] as [RangeKey, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setRangeKey(key)}
            aria-pressed={rangeKey === key}
            className={`min-h-[44px] rounded-panel px-3 text-sm transition sm:min-h-0 sm:py-1.5 ${focusRing} ${
              rangeKey === key
                ? 'bg-tr-primary font-medium text-tr-on-primary'
                : 'border border-tr-border bg-tr-panel text-tr-subtle hover:bg-tr-hover'
            }`}
          >
            {label}
          </button>
        ))}
        {rangeKey === 'custom' && (
          <div className="flex items-center gap-2 text-sm">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              aria-label="Từ ngày"
              className="rounded-panel border border-tr-border bg-tr-panel px-2 py-1 text-tr-text"
            />
            <span className="text-tr-muted" aria-hidden="true">
              →
            </span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              aria-label="Đến ngày"
              className="rounded-panel border border-tr-border bg-tr-panel px-2 py-1 text-tr-text"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={t.common.overdue} value={String(data.summary.overdue_count)} />
        <Tile label={t.reports.dueThisWeek} value={String(data.summary.due_week_count)} />
        <Tile label={t.reports.openPipeline} value={formatVNDShort(data.summary.open_pipeline_vnd)} />
        <Tile
          label={t.reports.winRate}
          value={winTotal === 0 ? '—' : formatPercent(data.win_rate.rate)}
          hint={winTotal === 0 ? undefined : `${data.win_rate.won} thắng / ${data.win_rate.lost} thua`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title={t.reports.completedByWeek}>
          {weekData.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weekData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
                <XAxis dataKey="name" {...AXIS_PROPS} />
                <YAxis allowDecimals={false} {...AXIS_PROPS} />
                <Tooltip
                  cursor={{ fill: 'rgba(11,11,11,0.04)' }}
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) => [`${value} công việc`, 'Hoàn thành']}
                />
                <Bar dataKey="count" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <ChartSrData
            caption={t.reports.completedByWeek}
            rows={weekData.map((row) => ({ name: row.name, value: `${row.count} công việc` }))}
          />
        </Panel>

        <Panel title={t.reports.wonByMonth}>
          {monthData.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthData} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
                <XAxis dataKey="name" {...AXIS_PROPS} />
                <YAxis tickFormatter={(v) => formatVNDShort(v as number)} width={62} {...AXIS_PROPS} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) => [formatVND(value as number), 'Doanh thu']}
                />
                <Line
                  type="monotone"
                  dataKey="sum_vnd"
                  stroke={CHART_PRIMARY}
                  strokeWidth={2}
                  dot={{ r: 4, fill: CHART_PRIMARY, stroke: '#fff', strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
          <ChartSrData
            caption={t.reports.wonByMonth}
            rows={monthData.map((row) => ({ name: row.name, value: formatVND(row.sum_vnd) }))}
          />
        </Panel>

        <Panel title={t.reports.pipelineByStage}>
          {/* Guard rong: nam panel con lai deu co NoData, rieng panel nay truoc day
              van ve truc trong khi chua co co hoi nao. */}
          {stageData.every((row) => row.sum_vnd === 0 && row.count === 0) ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={stageData}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 4, left: 12 }}
              >
                <CartesianGrid horizontal={false} stroke={CHART_INK.grid} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => formatVNDShort(v as number)}
                  {...AXIS_PROPS}
                />
                <YAxis type="category" dataKey="name" width={104} {...AXIS_PROPS} />
                <Tooltip
                  cursor={{ fill: 'rgba(11,11,11,0.04)' }}
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value, _name, item) => [
                    `${formatVND(value as number)} · ${(item?.payload as { count: number }).count} cơ hội`,
                    'Giá trị',
                  ]}
                />
                <Bar dataKey="sum_vnd" fill={CHART_PRIMARY} radius={[0, 4, 4, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <ChartSrData
            caption={t.reports.pipelineByStage}
            rows={stageData.map((row) => ({
              name: row.name,
              value: `${formatVND(row.sum_vnd)} · ${row.count} cơ hội`,
            }))}
          />
        </Panel>

        <Panel title={t.reports.openByPriority}>
          {priorityData.length === 0 ? (
            <NoData />
          ) : (
            <DonutWithLegend
              data={priorityData.map((row) => ({ name: row.name, count: row.count }))}
              colors={priorityData.map((row) => PRIORITY_COLORS[row.priority])}
              unit="công việc"
            />
          )}
          <ChartSrData
            caption={t.reports.openByPriority}
            rows={priorityData.map((row) => ({ name: row.name, value: `${row.count} công việc` }))}
          />
        </Panel>

        <Panel title={t.reports.interactionsByType}>
          {interactionData.length === 0 ? (
            <NoData />
          ) : (
            <DonutWithLegend
              data={interactionData}
              colors={interactionData.map((_, i) => CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length])}
              unit="lần"
            />
          )}
          <ChartSrData
            caption={t.reports.interactionsByType}
            rows={interactionData.map((row) => ({ name: row.name, value: `${row.count} lần` }))}
          />
        </Panel>

        <Panel title={t.reports.topCustomers}>
          {data.top_customers.length === 0 ? (
            <NoData />
          ) : (
            <ul className="divide-y divide-tr-border">
              {data.top_customers.map((customer) => (
                <li key={customer.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-tr-text">{customer.name}</span>
                  <span className="text-xs text-tr-muted">{customer.won_count} cơ hội</span>
                  <span className="font-medium text-tr-success tabular-nums">
                    {formatVND(customer.won_vnd)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <ScoreWinLoss data={data.score_winloss} />
    </div>
  );
}

/**
 * F-10 + F-16 — kiểm chứng rubric bằng dữ liệu thật của chính tổ chức.
 *
 * Bảng chéo *lý do thua × yếu tố thấp nhất lúc chốt*: ô lệch (thua vì giá mà PRICE lúc
 * đó chấm cao) là bằng chứng **rubric đang bị chấm sai**, không phải rubric sai.
 *
 * Dưới ngưỡng số deal đã chốt thì chỉ hiện số đếm, không đưa khuyến nghị hiệu chỉnh
 * ngưỡng — dưới cỡ mẫu đó mọi kết luận đều là khớp nhiễu.
 */
function ScoreWinLoss({ data }: { data: ReportsData['score_winloss'] }) {
  const quadrants = Object.keys(data.by_quadrant) as Quadrant[];
  const enough = data.scored_closed_count >= data.min_deals;
  const reasons = Object.keys(data.lost_reason_by_factor);

  return (
    <Panel
      title="Thắng/thua theo điểm lúc chốt"
      action={
        <span className="text-xs text-tr-muted">
          {data.scored_closed_count} cơ hội đã chốt có điểm
        </span>
      }
      className="mt-4"
    >
      {data.scored_closed_count === 0 ? (
        <p className="py-6 text-center text-sm text-tr-muted">
          Chưa có cơ hội nào được chấm điểm rồi chốt. Bảng này sẽ có dữ liệu sau khi các cơ hội
          đang chấm được đóng lại.
        </p>
      ) : (
        <>
          {!enough && (
            <p className="mb-3 rounded-control border border-tr-warning/50 bg-tr-warning/10 px-2.5 py-2 text-xs text-tr-text">
              Mới có {data.scored_closed_count}/{data.min_deals} cơ hội đã chốt có điểm. Số liệu
              dưới đây chỉ để tham khảo — chưa đủ cỡ mẫu để hiệu chỉnh ngưỡng.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {quadrants.map((quadrant) => {
              const row = data.by_quadrant[quadrant];
              const total = row.won + row.lost;
              return (
                <div key={quadrant} className="rounded-control border border-tr-border p-2.5">
                  <span
                    className="text-xs font-semibold"
                    style={{ color: QUADRANT_COLORS[quadrant] }}
                  >
                    {QUADRANT_LABELS[quadrant]}
                  </span>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-tr-text">
                    {total === 0 ? '—' : formatPercent(row.won / total)}
                  </p>
                  <p className="text-xs text-tr-muted">
                    {row.won} thắng / {row.lost} thua
                  </p>
                </div>
              );
            })}
          </div>

          {reasons.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <h3 className="mb-2 text-xs font-semibold text-tr-subtle">
                Lý do thua × yếu tố thấp nhất lúc chốt
              </h3>
              <table className="w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="border-b border-tr-border text-left text-xs text-tr-muted">
                    <th className="py-1.5 pr-3 font-medium">Lý do thua</th>
                    <th className="py-1.5 font-medium">Yếu tố yếu nhất khi chốt</th>
                  </tr>
                </thead>
                <tbody>
                  {reasons.map((reason) => (
                    <tr key={reason} className="border-b border-tr-border/60">
                      <th scope="row" className="py-1.5 pr-3 text-left font-normal text-tr-text">
                        {t.lostReason[reason] ?? reason}
                      </th>
                      <td className="py-1.5">
                        <span className="flex flex-wrap gap-1.5">
                          {Object.entries(data.lost_reason_by_factor[reason]).map(
                            ([factor, count]) => (
                              <span
                                key={factor}
                                className="rounded bg-tr-hover px-1.5 py-0.5 text-xs text-tr-subtle"
                              >
                                {FACTOR_LABELS[factor as Factor] ?? factor} × {count}
                              </span>
                            )
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-tr-muted">
                Ô lệch — ví dụ thua vì giá mà yếu tố yếu nhất lại không phải Giá cả — là bằng
                chứng rubric đang bị chấm sai, không phải rubric sai.
              </p>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

/**
 * Ban so lieu chi danh cho trinh doc man hinh.
 * Bieu do SVG cua recharts khong co noi dung thay the, nen nguoi dung
 * trinh doc man hinh truoc day mat toan bo phan bao cao.
 */
function ChartSrData({
  caption,
  rows,
}: {
  caption: string;
  rows: { name: string; value: string }[];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Mục</th>
          <th scope="col">Giá trị</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <th scope="row">{row.name}</th>
            <td>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: '1px solid var(--tr-border)',
  backgroundColor: 'var(--tr-panel)',
  color: 'var(--tr-text)',
  fontSize: 12,
  boxShadow: 'var(--tr-popover-shadow)',
};

function DonutWithLegend({
  data,
  colors,
  unit,
}: {
  data: { name: string; count: number }[];
  colors: string[];
  unit: string;
}) {
  const total = data.reduce((sum, row) => sum + row.count, 0);
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width="55%" height={190}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="name"
            innerRadius={45}
            outerRadius={72}
            paddingAngle={2}
            stroke="#fff"
            strokeWidth={2}
          >
            {data.map((_, index) => (
              <Cell key={index} fill={colors[index]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value, name) => [`${value} ${unit}`, name as string]}
          />
        </PieChart>
      </ResponsiveContainer>
      <ul className="flex-1 space-y-1.5">
        {data.map((row, index) => (
          <li key={row.name} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: colors[index] }}
            />
            <span className="flex-1 truncate text-tr-subtle">{row.name}</span>
            <span className="font-medium text-tr-text tabular-nums">{row.count}</span>
            <span className="w-10 text-right text-xs text-tr-muted tabular-nums">
              {total ? Math.round((row.count / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-tr-border bg-tr-panel p-4 shadow-sm">
      <div className="truncate text-xs text-tr-subtle">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-tr-text">{value}</div>
      {hint && <div className="text-xs text-tr-muted">{hint}</div>}
    </div>
  );
}

function NoData() {
  return <p className="py-12 text-center text-sm text-tr-muted">Chưa có dữ liệu trong khoảng này.</p>;
}

function resolveRange(key: RangeKey, customFrom: string, customTo: string) {
  const today = new Date();
  if (key === 'month')
    return { from: format(startOfMonth(today), 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };
  if (key === 'quarter')
    return { from: format(startOfQuarter(today), 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };
  if (key === 'six')
    return { from: format(subMonths(today, 6), 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };
  return { from: customFrom || format(subMonths(today, 6), 'yyyy-MM-dd'), to: customTo };
}
