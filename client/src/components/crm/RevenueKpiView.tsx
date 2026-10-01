import { useState } from 'react';
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
import { TriangleAlert } from 'lucide-react';
import { api, qs } from '../../api/client';
import { ChartDataTable } from '../common/ChartDataTable';
import { EmptyState, Panel, SkeletonRows, TableHead, focusRing } from '../common/ui';
import { REVENUE_GROUP_COLORS, t } from '../../i18n/vi';
import {
  formatShare,
  formatVND,
  formatVNDInput,
  formatVNDShort,
  parseVNDInput,
} from '../../lib/format';
import { formatPeriod } from '../../lib/revenue';
import type {
  RevenueKpiEntry,
  RevenueKpiMonth,
  RevenueKpiResponse,
  RevenueKpiStatus,
} from '../../types';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const AXIS_PROPS = { tick: { fontSize: 11 }, tickLine: false };
const NO_AM_LABEL = 'Chưa gán AM';

const STATUS_LABEL: Record<RevenueKpiStatus, string> = {
  counted: 'Ghi nhận',
  base_growth: 'Mở rộng từ Nền',
  lost: 'Lost',
  pending: 'Chờ đối soát',
  missing_baseline: 'Chưa có TB năm trước',
};

function periodOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function sumMonths(months: RevenueKpiMonth[], key: keyof Omit<RevenueKpiMonth, 'period'>) {
  return months.reduce((s, m) => s + m[key], 0);
}

function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—';
}

/**
 * KPI doanh thu theo AM. Ghi nhận = Mới + Mở rộng + phần Nền vượt TB tháng năm
 * trước, chỉ tính doanh thu đã đối soát; tính riêng từng dòng, không bù trừ.
 * Phần Nền thiếu hụt là Lost — chỉ để theo dõi, không trừ KPI.
 */
export function RevenueKpiView({
  year,
  filters,
}: {
  year: number;
  filters: Record<string, string | undefined>;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['revenues', 'kpi', year, filters],
    queryFn: () => api.get<RevenueKpiResponse>(`/api/revenues/kpi${qs({ year, ...filters })}`),
  });

  const saveTarget = useMutation({
    mutationFn: (input: { am: string; period: string; value: number | null }) =>
      api.put('/api/revenues/kpi-targets', {
        am: input.am,
        period: input.period,
        target_vnd: input.value,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['revenues', 'kpi'] }),
  });

  if (isLoading || !data) {
    return (
      <Panel title={`KPI doanh thu — năm ${year}`}>
        <SkeletonRows rows={5} cols={6} />
      </Panel>
    );
  }

  const months = data.months;
  /* Lũy kế đến hết tháng hiện tại — so chỉ tiêu cùng kỳ, không so cả năm. */
  const toDate = months.filter((m) => m.period <= data.current_period);
  const targetYear = sumMonths(months, 'target_vnd');
  const targetToDate = sumMonths(toDate, 'target_vnd');
  const achievedToDate = sumMonths(toDate, 'total_vnd');
  const lostToDate = sumMonths(toDate, 'lost_vnd');
  const missing = sumMonths(months, 'missing_baseline_count');
  const pending = sumMonths(months, 'pending_count');

  const chartData = months.map((m, i) => ({
    name: `T${i + 1}`,
    target: m.target_vnd,
    new: m.new_vnd,
    expansion: m.expansion_vnd,
    base: m.base_growth_vnd,
  }));

  const rowsSpec: {
    label: string;
    value: (m: RevenueKpiMonth) => number;
    strong?: boolean;
    tone?: string;
  }[] = [
    { label: 'Chỉ tiêu', value: (m) => m.target_vnd },
    { label: 'Mới', value: (m) => m.new_vnd },
    { label: 'Mở rộng', value: (m) => m.expansion_vnd },
    { label: 'Mở rộng từ Nền', value: (m) => m.base_growth_vnd },
    { label: 'Tổng ghi nhận', value: (m) => m.total_vnd, strong: true },
    { label: 'Lost (không trừ KPI)', value: (m) => m.lost_vnd, tone: 'text-tr-danger' },
  ];

  return (
    <>
      <Panel title={`KPI doanh thu — năm ${year}`}>
        <p className="mb-3 text-xs text-tr-muted">
          Ghi nhận = Mới + Mở rộng + phần doanh thu Nền vượt TB tháng năm trước. Chỉ tính doanh thu
          đã đối soát trở lên, riêng từng dòng (không bù trừ). Phần Nền thấp hơn TB năm trước ghi là
          Lost, không trừ vào KPI.
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Chỉ tiêu năm" value={formatVND(targetYear)} />
          <Stat
            label={`Chỉ tiêu đến ${formatPeriod(data.current_period)}`}
            value={formatVND(targetToDate)}
          />
          <Stat
            label="Thực đạt lũy kế"
            value={formatVND(achievedToDate)}
            hint={`${percent(achievedToDate, targetToDate)} chỉ tiêu lũy kế · ${percent(achievedToDate, targetYear)} cả năm`}
          />
          <Stat label="Lost lũy kế" value={formatVND(lostToDate)} tone="text-tr-danger" />
          <div className="rounded-lg border border-tr-border bg-tr-panel p-3">
            <div className="text-xs font-medium text-tr-subtle">Cần xử lý</div>
            <div className="mt-1 space-y-0.5 text-xs">
              <div className={missing ? 'text-tr-warning' : 'text-tr-muted'}>
                {missing > 0 && (
                  <TriangleAlert size={12} className="mr-1 inline" aria-hidden="true" />
                )}
                {missing} tháng · dòng chưa có TB năm trước
              </div>
              <div className="text-tr-muted">{pending} tháng · dòng chờ đối soát</div>
            </div>
          </div>
        </div>

        <div className="mt-4 h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" {...AXIS_PROPS} />
              <YAxis {...AXIS_PROPS} tickFormatter={(v: number) => formatVNDShort(v)} width={64} />
              <Tooltip
                formatter={(value) => formatVND(Number(value))}
                contentStyle={{
                  background: 'var(--tr-panel)',
                  border: '1px solid var(--tr-border)',
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="new" stackId="kpi" name="Mới" fill={REVENUE_GROUP_COLORS.new} />
              <Bar
                dataKey="expansion"
                stackId="kpi"
                name="Mở rộng"
                fill={REVENUE_GROUP_COLORS.expansion}
              />
              <Bar
                dataKey="base"
                stackId="kpi"
                name="Mở rộng từ Nền"
                fill={REVENUE_GROUP_COLORS.base}
              />
              <Bar dataKey="target" name="Chỉ tiêu" fill="var(--tr-muted)" fillOpacity={0.55} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ChartDataTable
          caption={`KPI doanh thu ${year} theo tháng`}
          valueLabel="Ghi nhận / chỉ tiêu"
          rows={chartData.map((row) => ({
            name: row.name,
            value: `${formatVNDShort(row.new + row.expansion + row.base)} / ${formatVNDShort(row.target)}`,
          }))}
        />

        <div className="tr-scroll mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <TableHead>
              <tr>
                <th scope="col" className="px-3 py-2 whitespace-nowrap">
                  Chỉ số
                </th>
                {MONTHS.map((m) => {
                  const period = periodOf(year, m);
                  return (
                    <th key={m} scope="col" className="px-1 py-1 text-right">
                      <button
                        type="button"
                        onClick={() => setSelected(selected === period ? null : period)}
                        aria-pressed={selected === period}
                        title="Xem chi tiết từng dòng của tháng"
                        className={`rounded-control-inner px-1.5 py-1 hover:bg-tr-hover hover:text-tr-primary ${selected === period ? 'bg-tr-hover text-tr-primary' : ''} ${focusRing}`}
                      >
                        T{m}
                      </button>
                    </th>
                  );
                })}
                <th scope="col" className="px-3 py-2 text-right whitespace-nowrap">
                  Cả năm
                </th>
              </tr>
            </TableHead>
            <tbody className="divide-y divide-tr-border">
              {rowsSpec.map((spec) => (
                <tr key={spec.label} className={spec.strong ? 'bg-tr-surface font-semibold' : ''}>
                  <th scope="row" className="px-3 py-1.5 text-left font-medium whitespace-nowrap">
                    {spec.label}
                  </th>
                  {months.map((m) => (
                    <td
                      key={m.period}
                      className={`px-2 py-1.5 text-right tabular-nums ${spec.tone ?? ''}`}
                    >
                      {spec.value(m) ? formatVNDShort(spec.value(m)) : '—'}
                    </td>
                  ))}
                  <td className={`px-3 py-1.5 text-right tabular-nums ${spec.tone ?? ''}`}>
                    {formatVNDShort(months.reduce((s, m) => s + spec.value(m), 0))}
                  </td>
                </tr>
              ))}
              <tr>
                <th scope="row" className="px-3 py-1.5 text-left font-medium whitespace-nowrap">
                  % đạt
                </th>
                {months.map((m) => (
                  <td key={m.period} className="px-2 py-1.5 text-right tabular-nums">
                    <Achievement achieved={m.total_vnd} target={m.target_vnd} />
                  </td>
                ))}
                <td className="px-3 py-1.5 text-right tabular-nums">
                  <Achievement achieved={sumMonths(months, 'total_vnd')} target={targetYear} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      {selected && (
        <MonthDetails
          period={selected}
          entries={data.entries.filter((e) => e.period === selected)}
          onClose={() => setSelected(null)}
        />
      )}

      <Panel title="Chỉ tiêu theo AM">
        <p className="mb-3 text-xs text-tr-muted">
          Nhập chỉ tiêu từng tháng cho từng AM (Enter để lưu, xoá trắng để bỏ chỉ tiêu). Dưới mỗi ô
          là số đã ghi nhận. Có thể nhập hàng loạt qua sheet “Chỉ tiêu KPI” trong file Excel mẫu.
        </p>
        {data.by_am.length === 0 ? (
          <EmptyState message="Chưa có AM nào trên các dòng doanh thu." />
        ) : (
          <div className="tr-scroll overflow-x-auto">
            <table className="w-full text-sm">
              <TableHead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 bg-tr-surface px-3 py-2">
                    {t.revenue.am}
                  </th>
                  {MONTHS.map((m) => (
                    <th key={m} scope="col" className="px-1 py-2 text-right">
                      T{m}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 text-right whitespace-nowrap">
                    Chỉ tiêu năm
                  </th>
                  <th scope="col" className="px-3 py-2 text-right whitespace-nowrap">
                    Đạt lũy kế
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    %
                  </th>
                </tr>
              </TableHead>
              <tbody className="divide-y divide-tr-border">
                {data.by_am.map((row) => {
                  const amToDate = row.months.filter((m) => m.period <= data.current_period);
                  const amTarget = sumMonths(amToDate, 'target_vnd');
                  const amAchieved = sumMonths(amToDate, 'total_vnd');
                  return (
                    <tr key={row.am || '__none__'}>
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-tr-panel px-3 py-1.5 text-left font-medium whitespace-nowrap"
                      >
                        {row.am || <span className="text-tr-muted">{NO_AM_LABEL}</span>}
                      </th>
                      {row.months.map((m) => (
                        <td key={m.period} className="px-1 py-1 text-right">
                          <TargetInput
                            label={`Chỉ tiêu ${row.am || NO_AM_LABEL} ${formatPeriod(m.period)}`}
                            value={m.target_vnd}
                            onSave={(value) =>
                              saveTarget.mutate({ am: row.am, period: m.period, value })
                            }
                          />
                          <div className="pr-1.5 text-[11px] tabular-nums text-tr-muted">
                            {m.total_vnd ? formatVNDShort(m.total_vnd) : ''}
                          </div>
                        </td>
                      ))}
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                        {formatVNDShort(sumMonths(row.months, 'target_vnd'))}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatVNDShort(amAchieved)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        <Achievement achieved={amAchieved} target={amTarget} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-tr-border bg-tr-panel p-3">
      <div className="text-xs font-medium text-tr-subtle">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${tone ?? 'text-tr-text'}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-tr-muted">{hint}</div>}
    </div>
  );
}

/** % đạt kèm dấu ✓ khi đủ chỉ tiêu — không chỉ dựa vào màu. */
function Achievement({ achieved, target }: { achieved: number; target: number }) {
  if (target <= 0) return <span className="text-tr-muted">—</span>;
  const reached = achieved >= target;
  return (
    <span className={reached ? 'text-tr-success' : 'text-tr-subtle'}>
      {reached ? '✓ ' : ''}
      {formatShare(achieved, target)}
    </span>
  );
}

function TargetInput({
  label,
  value,
  onSave,
}: {
  label: string;
  value: number;
  onSave: (value: number | null) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (value ? formatVNDInput(value) : '');
  return (
    <input
      inputMode="numeric"
      value={shown}
      placeholder="—"
      aria-label={label}
      onChange={(e) =>
        setText(e.target.value === '' ? '' : formatVNDInput(parseVNDInput(e.target.value)))
      }
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => {
        if (text !== null) {
          const next = text.trim() === '' ? null : parseVNDInput(text);
          if ((next ?? 0) !== value) onSave(next === 0 ? null : next);
        }
        setText(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setText(null);
          e.currentTarget.blur();
        }
      }}
      className="w-24 rounded-control-inner border border-transparent bg-transparent px-1.5 py-1 text-right text-sm tabular-nums outline-none hover:border-tr-border focus:border-tr-primary focus:bg-tr-panel"
    />
  );
}

/** Chi tiết một tháng: dòng nào đóng góp bao nhiêu, dòng nào Lost hoặc cần xử lý. */
function MonthDetails({
  period,
  entries,
  onClose,
}: {
  period: string;
  entries: RevenueKpiEntry[];
  onClose: () => void;
}) {
  const order: RevenueKpiStatus[] = [
    'missing_baseline',
    'lost',
    'pending',
    'base_growth',
    'counted',
  ];
  const sorted = [...entries].sort(
    (a, b) => order.indexOf(a.status) - order.indexOf(b.status) || b.kpi_vnd - a.kpi_vnd
  );
  return (
    <Panel
      title={`Chi tiết KPI ${formatPeriod(period)}`}
      action={
        <button
          type="button"
          onClick={onClose}
          className={`rounded-control px-2.5 py-1 text-xs font-medium text-tr-subtle hover:bg-tr-hover ${focusRing}`}
        >
          Đóng
        </button>
      }
    >
      {sorted.length === 0 ? (
        <EmptyState message="Tháng này chưa có dòng nào đóng góp hoặc cần chú ý." />
      ) : (
        <div className="tr-scroll max-h-[50vh] overflow-auto">
          <table className="w-full text-sm">
            <TableHead className="sticky top-0">
              <tr>
                <th scope="col" className="px-3 py-2">
                  Khách hàng · dịch vụ
                </th>
                <th scope="col" className="px-3 py-2">
                  {t.revenue.am}
                </th>
                <th scope="col" className="px-3 py-2">
                  Nhóm
                </th>
                <th scope="col" className="px-3 py-2 text-right whitespace-nowrap">
                  Doanh thu đã đối soát
                </th>
                <th scope="col" className="px-3 py-2 text-right whitespace-nowrap">
                  TB năm trước
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Ghi nhận KPI
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Lost
                </th>
                <th scope="col" className="px-3 py-2">
                  Trạng thái
                </th>
              </tr>
            </TableHead>
            <tbody className="divide-y divide-tr-border">
              {sorted.map((e) => (
                <tr key={`${e.line_id}-${e.period}`}>
                  <td className="px-3 py-1.5">
                    <Link
                      to={`/customers/${e.customer_id}`}
                      className="text-tr-text hover:text-tr-primary hover:underline"
                    >
                      {e.customer_name}
                    </Link>
                    <div className="text-xs text-tr-muted">
                      {e.service_name ?? 'Chưa gán dịch vụ'}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-tr-subtle">{e.am || NO_AM_LABEL}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <span
                      className="mr-1.5 inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: REVENUE_GROUP_COLORS[e.group] }}
                      aria-hidden="true"
                    />
                    {t.revenueGroup[e.group]}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatVNDInput(e.revenue_vnd) || '0'}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-tr-subtle">
                    {e.group === 'base'
                      ? e.prev_avg_vnd
                        ? formatVNDInput(e.prev_avg_vnd)
                        : '—'
                      : ''}
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                    {e.kpi_vnd ? formatVNDInput(e.kpi_vnd) : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-tr-danger">
                    {e.lost_vnd ? formatVNDInput(e.lost_vnd) : ''}
                  </td>
                  <td className="px-3 py-1.5 text-xs whitespace-nowrap">
                    {e.status === 'missing_baseline' ? (
                      <span className="text-tr-warning">
                        <TriangleAlert size={12} className="mr-1 inline" aria-hidden="true" />
                        {STATUS_LABEL[e.status]}
                      </span>
                    ) : (
                      <span className={e.status === 'lost' ? 'text-tr-danger' : 'text-tr-subtle'}>
                        {STATUS_LABEL[e.status]}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
