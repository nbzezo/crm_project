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
import { ChartDataTable } from '../common/ChartDataTable';
import { Panel, TableHead, focusRing } from '../common/ui';
import { REVENUE_GROUP_COLORS, REVENUE_GROUP_ORDER, t } from '../../i18n/vi';
import { formatShare, formatVND, formatVNDInput, formatVNDShort } from '../../lib/format';
import type { RevenueComparisonResponse, RevenueGroup, RevenueSummary } from '../../types';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const AXIS_PROPS = { tick: { fontSize: 11 }, tickLine: false };

/** Màn hình nhóm nào mở khi bấm vào một nhóm. */
const GROUP_LINK: Record<RevenueGroup, string> = {
  new: '/revenue/new',
  expansion: '/revenue/new',
  base: '/revenue/base',
};

function periodOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Doanh thu tổng: Mới + Mở rộng + Nền. Thẻ tỷ trọng, biểu đồ cột chồng theo
 * nhóm và bảng nhóm × 12 tháng. Dự kiến cả năm lấy từ cùng công thức với màn
 * hình Nền để hai nơi không bao giờ lệch nhau.
 */
export function RevenueGroupOverview({
  year,
  summary,
  comparison,
}: {
  year: number;
  summary: RevenueSummary | undefined;
  comparison: RevenueComparisonResponse | undefined;
}) {
  const groups = summary?.by_group;
  const total = summary?.totals.amount_vnd ?? 0;

  /* Dự kiến cả năm theo nhóm: cộng số dự kiến từng tháng vào nhóm của tháng đó. */
  const projected: Record<RevenueGroup, number> = { new: 0, expansion: 0, base: 0 };
  let projectedTotal = 0;
  let prevTotal = 0;
  let prevApprox = false;
  for (const line of comparison?.lines ?? []) {
    for (const [period, value] of Object.entries(line.projection)) {
      projected[line.groups[period]] += value.value;
    }
    projectedTotal += line.projected_total_vnd;
    prevTotal += line.prev_total_vnd;
    if (line.prev_total_approx) prevApprox = true;
  }
  const yearChange = projectedTotal - prevTotal;

  const chartData = MONTHS.map((m) => {
    const period = periodOf(year, m);
    return {
      name: `T${m}`,
      new: groups?.new.months[period] ?? 0,
      expansion: groups?.expansion.months[period] ?? 0,
      base: groups?.base.months[period] ?? 0,
    };
  });

  return (
    <Panel title={`Cơ cấu doanh thu theo nhóm — năm ${year}`}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {REVENUE_GROUP_ORDER.map((group) => {
          const amount = groups?.[group].totals.amount_vnd ?? 0;
          return (
            <Link
              key={group}
              to={GROUP_LINK[group]}
              className={`rounded-lg border border-tr-border bg-tr-panel p-3 transition hover:bg-tr-hover ${focusRing}`}
            >
              <div className="flex items-center gap-1.5 text-xs font-medium text-tr-subtle">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: REVENUE_GROUP_COLORS[group] }}
                  aria-hidden="true"
                />
                Doanh thu {t.revenueGroup[group].toLowerCase()}
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-tr-text">
                {formatVND(amount)}
              </div>
              <div className="mt-1 space-y-0.5 text-xs text-tr-muted">
                <div>{formatShare(amount, total)} tổng doanh thu</div>
                <div>Dự kiến cả năm: {formatVNDShort(projected[group])}</div>
              </div>
            </Link>
          );
        })}
        <div className="rounded-lg border border-tr-border bg-tr-surface p-3">
          <div className="text-xs font-medium text-tr-subtle">Doanh thu tổng</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-tr-text">
            {formatVND(total)}
          </div>
          <div className="mt-1 space-y-0.5 text-xs text-tr-muted">
            <div>Dự kiến cả năm: {formatVNDShort(projectedTotal)}</div>
            <div>
              Năm trước{prevApprox ? ' (≈)' : ''}: {formatVNDShort(prevTotal)}
              {prevTotal > 0 && (
                <span className={yearChange >= 0 ? 'text-tr-success' : 'text-tr-danger'}>
                  {' '}
                  {yearChange >= 0 ? '↑' : '↓'} {formatShare(Math.abs(yearChange), prevTotal)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 h-48">
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
            {REVENUE_GROUP_ORDER.map((group) => (
              <Bar
                key={group}
                dataKey={group}
                stackId="group"
                name={t.revenueGroup[group]}
                fill={REVENUE_GROUP_COLORS[group]}
                stroke="var(--tr-panel)"
                strokeWidth={1}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartDataTable
        caption={`Doanh thu ${year} theo nhóm và tháng`}
        valueLabel="Theo nhóm"
        rows={chartData.map((row) => ({
          name: row.name,
          value: REVENUE_GROUP_ORDER.map(
            (group) => `${t.revenueGroup[group]} ${formatVNDShort(row[group])}`
          ).join(' · '),
        }))}
      />

      <div className="tr-scroll mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <TableHead>
            <tr>
              <th scope="col" className="px-3 py-2 whitespace-nowrap">
                Nhóm
              </th>
              <th scope="col" className="px-3 py-2 text-right whitespace-nowrap">
                Cả năm
              </th>
              {MONTHS.map((m) => (
                <th key={m} scope="col" className="px-2 py-2 text-right whitespace-nowrap">
                  T{m}
                </th>
              ))}
            </tr>
          </TableHead>
          <tbody className="divide-y divide-tr-border">
            {REVENUE_GROUP_ORDER.map((group) => (
              <tr key={group}>
                <th scope="row" className="px-3 py-1.5 text-left font-medium whitespace-nowrap">
                  <Link to={GROUP_LINK[group]} className="hover:text-tr-primary hover:underline">
                    {t.revenueGroup[group]}
                  </Link>
                </th>
                <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                  {formatVNDInput(groups?.[group].totals.amount_vnd ?? 0) || '—'}
                </td>
                {MONTHS.map((m) => (
                  <td key={m} className="px-2 py-1.5 text-right tabular-nums text-tr-subtle">
                    {formatVNDInput(groups?.[group].months[periodOf(year, m)] ?? 0) || '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-tr-surface font-semibold">
            <tr>
              <th scope="row" className="px-3 py-2 text-left">
                Tổng
              </th>
              <td className="px-3 py-2 text-right tabular-nums">{formatVNDInput(total) || '—'}</td>
              {chartData.map((row) => (
                <td key={row.name} className="px-2 py-2 text-right tabular-nums">
                  {formatVNDInput(row.new + row.expansion + row.base) || '—'}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </Panel>
  );
}
