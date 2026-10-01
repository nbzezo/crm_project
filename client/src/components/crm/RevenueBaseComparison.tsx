import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { History } from 'lucide-react';
import { api } from '../../api/client';
import { ChartDataTable } from '../common/ChartDataTable';
import { Button, EmptyState, Panel, Segmented, SkeletonRows, TableHead } from '../common/ui';
import { REVENUE_GROUP_COLORS } from '../../i18n/vi';
import { formatVND, formatVNDInput, formatVNDShort, parseVNDInput } from '../../lib/format';
import { formatPeriod } from '../../lib/revenue';
import type { RevenueComparisonLine, RevenueComparisonResponse } from '../../types';

type Mode = 'avg' | 'same' | 'year';

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'avg', label: 'So với TB tháng năm trước' },
  { value: 'same', label: 'So với cùng kỳ năm trước' },
  { value: 'year', label: 'Dự kiến cả năm' },
];

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const AXIS_PROPS = { tick: { fontSize: 11 }, tickLine: false };

function periodOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Tháng được đưa vào so sánh: thuộc nhóm đang xem và đã có số, hoặc đã qua hẳn.
 * Tháng hiện tại chưa nhập không tính — chưa hết tháng thì 0 chưa phải là 0.
 */
function comparedPeriods(line: RevenueComparisonLine, current: string): string[] {
  return line.periods.filter((p) => (line.months[p] ?? 0) > 0 || p < current);
}

interface LineView {
  /** Số năm nay dùng để so (TB tháng hoặc tổng). */
  value: number;
  /** Số năm trước tương ứng; null = không có gì để so. */
  reference: number | null;
  approx: boolean;
}

function viewOf(line: RevenueComparisonLine, mode: Mode, current: string): LineView {
  const periods = comparedPeriods(line, current);
  const actual = periods.reduce((sum, p) => sum + (line.months[p] ?? 0), 0);
  if (mode === 'avg') {
    return {
      value: periods.length ? Math.round(actual / periods.length) : 0,
      reference: line.prev_avg_vnd,
      approx: false,
    };
  }
  if (mode === 'same') {
    let reference = 0;
    let approx = false;
    let any = false;
    for (const p of periods) {
      const same = line.prev_same_period[p];
      if (!same) continue;
      any = true;
      reference += same.value;
      if (same.approx) approx = true;
    }
    return { value: actual, reference: any ? reference : null, approx };
  }
  return {
    value: line.projected_total_vnd,
    reference: line.prev_total_vnd > 0 ? line.prev_total_vnd : null,
    approx: line.prev_total_approx,
  };
}

function Change({ value, reference }: { value: number; reference: number | null }) {
  if (reference === null || reference === 0) return <span className="text-tr-muted">—</span>;
  const diff = value - reference;
  const pct = Math.round((diff / reference) * 1000) / 10;
  if (diff === 0) return <span className="text-tr-muted">= 0%</span>;
  return (
    <span className={diff > 0 ? 'text-tr-success' : 'text-tr-danger'}>
      {diff > 0 ? '▲' : '▼'} {Math.abs(pct)}%
    </span>
  );
}

/**
 * Doanh thu Nền so với năm trước — ba chế độ:
 *  ① từng tháng so với TB tháng năm trước;
 *  ② từng tháng so với cùng kỳ năm trước;
 *  ③ dự kiến cả năm so với tổng năm trước.
 * Chỉ so các tháng thuộc Nền, nên dòng mới chuyển sang Nền giữa năm chỉ so
 * phần Nền với đúng các tháng đó của năm trước.
 */
export function RevenueBaseComparison({
  year,
  data,
  isLoading,
}: {
  year: number;
  data: RevenueComparisonResponse | undefined;
  isLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('avg');
  const [fillMessage, setFillMessage] = useState('');
  const lines = data?.lines ?? [];
  const current = data?.current_period ?? periodOf(year, 12);

  const saveBaseline = useMutation({
    mutationFn: (input: { lineId: number; value: number | null }) =>
      api.put(`/api/revenues/lines/${input.lineId}/baseline`, {
        year,
        avg_monthly_vnd: input.value,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['revenues'] }),
  });

  const fill = useMutation({
    mutationFn: () =>
      api.post<{ filled: number; no_data: number }>('/api/revenues/baselines/fill', {
        year,
        line_ids: lines.map((l) => l.line_id),
      }),
    onSuccess: (result) => {
      setFillMessage(
        `Đã điền ${result.filled} dòng. ${result.no_data} dòng không có dữ liệu năm ${year - 1}. Dòng đã nhập tay được giữ nguyên.`
      );
      queryClient.invalidateQueries({ queryKey: ['revenues'] });
    },
  });

  const views = lines.map((line) => viewOf(line, mode, current));
  const sumValue = views.reduce((s, v) => s + v.value, 0);
  const sumReference = views.reduce((s, v) => s + (v.reference ?? 0), 0);
  const anyApprox = views.some((v) => v.approx);
  const decreasing = views.filter((v) => v.reference !== null && v.value < v.reference).length;
  const ytd = lines.reduce((s, l) => s + l.ytd_actual_vnd, 0);

  /* Biểu đồ: cột là năm nay (thực tế + dự kiến), đường là mức năm trước theo chế độ. */
  const chartData = MONTHS.map((m) => {
    const period = periodOf(year, m);
    let actual = 0;
    let projected = 0;
    let reference = 0;
    for (const line of lines) {
      if (!line.periods.includes(period)) continue;
      const amount = line.months[period] ?? 0;
      if (amount > 0) actual += amount;
      else if (mode === 'year') projected += line.projection[period]?.value ?? 0;
      reference +=
        mode === 'avg' ? (line.prev_avg_vnd ?? 0) : (line.prev_same_period[period]?.value ?? 0);
    }
    return { name: `T${m}`, actual, projected, reference };
  });
  const referenceLabel = mode === 'avg' ? 'TB tháng năm trước' : 'Cùng kỳ năm trước';

  const kpis =
    mode === 'avg'
      ? [
          { label: 'TB tháng năm nay', value: formatVND(sumValue) },
          { label: `TB tháng năm ${year - 1}`, value: formatVND(sumReference) },
        ]
      : mode === 'same'
        ? [
            { label: 'Doanh thu Nền (các tháng đã có)', value: formatVND(sumValue) },
            {
              label: `Cùng kỳ năm ${year - 1}${anyApprox ? ' (≈)' : ''}`,
              value: formatVND(sumReference),
            },
          ]
        : [
            { label: 'Dự kiến cả năm', value: formatVND(sumValue) },
            {
              label: `Tổng năm ${year - 1}${anyApprox ? ' (≈)' : ''}`,
              value: formatVND(sumReference),
            },
          ];

  return (
    <Panel
      title={`Doanh thu nền so với năm ${year - 1}`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Chế độ so sánh"
            value={mode}
            onChange={setMode}
            options={MODE_OPTIONS}
          />
          <Button
            size="sm"
            onClick={() => fill.mutate()}
            disabled={lines.length === 0 || fill.isPending}
            title={`Tính TB tháng năm ${year - 1} từ số liệu đã nhập, chỉ điền cho dòng chưa nhập tay`}
          >
            <History size={14} aria-hidden="true" /> Lấy TB từ dữ liệu năm {year - 1}
          </Button>
        </div>
      }
    >
      {fillMessage && (
        <p role="status" className="mb-3 text-xs text-tr-muted">
          {fillMessage}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-lg border border-tr-border bg-tr-panel p-3">
            <div className="text-xs font-medium text-tr-subtle">{kpi.label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-tr-text">{kpi.value}</div>
          </div>
        ))}
        <div className="rounded-lg border border-tr-border bg-tr-panel p-3">
          <div className="text-xs font-medium text-tr-subtle">
            {mode === 'year' ? 'Chênh lệch dự kiến' : 'Chênh lệch'}
          </div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-tr-text">
            {formatVND(sumValue - sumReference)}
          </div>
          <div className="mt-1 text-xs">
            <Change value={sumValue} reference={sumReference || null} />
          </div>
        </div>
        <div className="rounded-lg border border-tr-border bg-tr-panel p-3">
          {mode === 'year' ? (
            <>
              <div className="text-xs font-medium text-tr-subtle">Tỷ lệ hoàn thành</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-tr-text">
                {sumReference ? `${Math.round((ytd / sumReference) * 100)}%` : '—'}
              </div>
              <div className="mt-1 text-xs text-tr-muted">
                Thực tế {formatVNDShort(ytd)} / năm trước
              </div>
            </>
          ) : (
            <>
              <div className="text-xs font-medium text-tr-subtle">Dòng giảm doanh thu</div>
              <div
                className={`mt-1 text-lg font-semibold tabular-nums ${decreasing ? 'text-tr-danger' : 'text-tr-text'}`}
              >
                {decreasing} / {lines.length}
              </div>
              <div className="mt-1 text-xs text-tr-muted">Cần chú ý nguy cơ rời bỏ</div>
            </>
          )}
        </div>
      </div>

      {mode === 'year' && (
        <p className="mt-2 text-xs text-tr-muted">
          Dự kiến = thực tế các tháng đã qua + số dự kiến đã nhập. Tháng chưa nhập: có cùng kỳ năm
          trước thì lấy cùng kỳ × tỷ lệ (năm nay / năm trước) của các tháng trước đó, chưa có cùng
          kỳ thì lấy TB các tháng trước đó. Dòng tạm dừng, đã ngừng hoặc hết hạn hợp đồng tính 0.
        </p>
      )}

      <div className="mt-4 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
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
            <Bar
              dataKey="actual"
              stackId="y"
              name={`Năm ${year}`}
              fill={REVENUE_GROUP_COLORS.base}
            />
            {mode === 'year' && (
              <Bar
                dataKey="projected"
                stackId="y"
                name="Dự kiến (chưa nhập)"
                fill={REVENUE_GROUP_COLORS.base}
                fillOpacity={0.35}
              />
            )}
            {/* Cột năm trước đặt cạnh cột năm nay: Recharts 2 vẽ cột đè lên đường,
                nên một đường so sánh sẽ bị che đúng ở các tháng cao nhất. */}
            <Bar
              dataKey="reference"
              name={referenceLabel}
              fill="var(--tr-muted)"
              fillOpacity={0.55}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ChartDataTable
        caption={`Doanh thu nền ${year} so với ${referenceLabel.toLowerCase()}`}
        valueLabel="Năm nay · năm trước"
        rows={chartData.map((row) => ({
          name: row.name,
          value: `${formatVNDShort(row.actual + row.projected)} · ${formatVNDShort(row.reference)}`,
        }))}
      />

      {isLoading ? (
        <SkeletonRows rows={4} cols={6} />
      ) : lines.length === 0 ? (
        <EmptyState message="Chưa có dòng nào thuộc doanh thu Nền trong năm này." />
      ) : (
        <div className="tr-scroll mt-3 max-h-[60vh] overflow-auto">
          <table className="w-full text-sm">
            <TableHead className="sticky top-0 z-20">
              <tr>
                <th scope="col" className="sticky left-0 z-30 min-w-52 bg-tr-surface px-3 py-2">
                  Khách hàng · dịch vụ
                </th>
                <th scope="col" className="px-3 py-2 whitespace-nowrap">
                  Nền từ
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right whitespace-nowrap"
                  title="Nhập tay. Để trống thì dùng số tự tính từ dữ liệu năm trước (chữ nghiêng)."
                >
                  TB tháng {year - 1}
                </th>
                {mode === 'year' ? (
                  <>
                    <th scope="col" className="px-3 py-2 text-right whitespace-nowrap">
                      Thực tế lũy kế
                    </th>
                    <th scope="col" className="px-3 py-2 text-right whitespace-nowrap">
                      Dự kiến cả năm
                    </th>
                    <th scope="col" className="px-3 py-2 text-right whitespace-nowrap">
                      Năm {year - 1}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right whitespace-nowrap">
                      Chênh lệch
                    </th>
                    <th scope="col" className="px-3 py-2 text-right whitespace-nowrap">
                      Hoàn thành
                    </th>
                  </>
                ) : (
                  <>
                    <th scope="col" className="px-3 py-2 text-right whitespace-nowrap">
                      {mode === 'avg' ? 'TB tháng năm nay' : 'Tổng các tháng'}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right whitespace-nowrap">
                      Chênh lệch
                    </th>
                    {MONTHS.map((m) => (
                      <th key={m} scope="col" className="px-2 py-2 text-right whitespace-nowrap">
                        T{m}
                      </th>
                    ))}
                  </>
                )}
              </tr>
            </TableHead>
            <tbody className="divide-y divide-tr-border">
              {lines.map((line, i) => {
                const view = views[i];
                return (
                  <tr key={line.line_id} className="group hover:bg-tr-hover">
                    <td className="sticky left-0 z-10 bg-tr-panel px-3 py-1.5 group-hover:bg-tr-hover">
                      <Link
                        to={`/customers/${line.customer_id}`}
                        className="font-medium text-tr-text hover:text-tr-primary hover:underline"
                      >
                        {line.customer_name}
                      </Link>
                      <div className="text-xs text-tr-muted">
                        {line.service_name ?? 'Chưa gán dịch vụ'}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-tr-subtle">
                      {line.anchor.mode === 'base'
                        ? 'Toàn bộ ✎'
                        : formatPeriod(line.anchor.base_from)}
                      {line.anchor.mode === 'manual' && ' ✎'}
                    </td>
                    <td className="px-2 py-1">
                      <BaselineInput
                        line={line}
                        onSave={(value) => saveBaseline.mutate({ lineId: line.line_id, value })}
                      />
                    </td>
                    {mode === 'year' ? (
                      <>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {formatVNDInput(line.ytd_actual_vnd) || '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                          {formatVNDInput(line.projected_total_vnd) || '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-tr-subtle">
                          {line.prev_total_vnd
                            ? `${line.prev_total_approx ? '≈ ' : ''}${formatVNDInput(line.prev_total_vnd)}`
                            : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right text-xs whitespace-nowrap">
                          <Change value={view.value} reference={view.reference} />
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-tr-subtle">
                          {line.prev_total_vnd
                            ? `${Math.round((line.ytd_actual_vnd / line.prev_total_vnd) * 100)}%`
                            : '—'}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                          {formatVNDInput(view.value) || '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right text-xs whitespace-nowrap">
                          <Change value={view.value} reference={view.reference} />
                          {view.approx && <span className="text-tr-muted"> ≈</span>}
                        </td>
                        {MONTHS.map((m) => (
                          <MonthCompare
                            key={m}
                            line={line}
                            period={periodOf(year, m)}
                            current={current}
                            mode={mode}
                          />
                        ))}
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/** Một ô tháng ở chế độ ①/②: số năm nay và % so với mốc năm trước. */
function MonthCompare({
  line,
  period,
  current,
  mode,
}: {
  line: RevenueComparisonLine;
  period: string;
  current: string;
  mode: 'avg' | 'same';
}) {
  if (!line.periods.includes(period)) {
    return (
      <td className="px-2 py-1.5 text-right text-xs text-tr-muted" title="Tháng này chưa thuộc Nền">
        ·
      </td>
    );
  }
  const amount = line.months[period] ?? 0;
  if (amount === 0 && period >= current) {
    return <td className="px-2 py-1.5 text-right text-xs text-tr-muted">—</td>;
  }
  const same = line.prev_same_period[period];
  const reference = mode === 'avg' ? line.prev_avg_vnd : (same?.value ?? null);
  const title =
    reference === null
      ? 'Chưa có số năm trước để so'
      : `${mode === 'avg' ? 'TB tháng năm trước' : `Cùng kỳ ${formatPeriod(`${Number(period.slice(0, 4)) - 1}${period.slice(4)}`)}`}: ${formatVND(reference)}${mode === 'same' && same?.approx ? ' (không có số cùng kỳ, dùng TB tháng)' : ''}`;
  return (
    <td className="px-2 py-1 text-right whitespace-nowrap" title={title}>
      <div className="tabular-nums">{formatVNDShort(amount)}</div>
      <div className="text-[11px]">
        <Change value={amount} reference={reference} />
        {mode === 'same' && same?.approx && <span className="text-tr-muted"> ≈</span>}
      </div>
    </td>
  );
}

/** Ô nhập TB tháng năm trước; để trống = dùng số tự tính (hiện nghiêng làm gợi ý). */
function BaselineInput({
  line,
  onSave,
}: {
  line: RevenueComparisonLine;
  onSave: (value: number | null) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const saved = line.baseline_avg_vnd;
  const shown = text ?? (saved !== null ? formatVNDInput(saved) : '');
  const computed =
    line.prev_avg_source === 'computed' && line.prev_avg_vnd !== null
      ? formatVNDInput(line.prev_avg_vnd)
      : '—';
  return (
    <input
      inputMode="numeric"
      value={shown}
      placeholder={computed}
      aria-label={`TB tháng năm trước — ${line.customer_name}`}
      title={
        saved !== null
          ? 'Đã nhập tay. Xoá trắng để dùng số tự tính.'
          : 'Chưa nhập — đang dùng TB tự tính từ dữ liệu năm trước (chữ nghiêng)'
      }
      onChange={(e) =>
        setText(e.target.value === '' ? '' : formatVNDInput(parseVNDInput(e.target.value)))
      }
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => {
        if (text !== null) {
          const next = text.trim() === '' ? null : parseVNDInput(text);
          if (next !== saved) onSave(next);
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
      className="w-28 rounded-control-inner border border-tr-border bg-tr-panel px-1.5 py-1 text-right text-sm tabular-nums outline-none placeholder:text-tr-muted placeholder:italic focus:border-tr-primary"
    />
  );
}
