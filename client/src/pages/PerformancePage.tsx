import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import {
  ArrowDown,
  ArrowUp,
  Building2,
  ChevronDown,
  ChevronRight,
  User,
  Users,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, qs } from '../api/client';
import { EmptyState, ErrorState, Panel, Skeleton, focusRing } from '../components/common/ui';
import { ChartDataTable } from '../components/common/ChartDataTable';
import { PageHeader } from '../components/common/PageShell';
import { ReportRangePicker } from '../components/common/ReportRangePicker';
import { t } from '../i18n/vi';
import { formatDateShort, formatPercent, todayStr } from '../lib/format';
import {
  avgCycleDays,
  buildUnitTree,
  collapseSingleChains,
  compareRows,
  completedChange,
  onTimeRate,
  peopleOf,
  subjectOptions,
  sumTotals,
  weeklySeries,
  type CompareRow,
  type PerfTotals,
  type PerformanceData,
  type PersonPerf,
  type Subject,
  type UnitNode,
  type WeekPoint,
} from '../lib/performance';
import { resolveRange, type RangeKey } from '../lib/reportRange';

const SCOPE_LABEL: Record<PerformanceData['scope'], string> = {
  none: 'Không có quyền xem',
  own: 'Chỉ của bạn',
  unit: 'Đơn vị của bạn',
  subtree: 'Đơn vị của bạn và các đơn vị trực thuộc',
  all: 'Toàn công ty',
};

type View = 'units' | 'people';
type SortKey =
  | 'name'
  | 'received'
  | 'completed'
  | 'on_time_rate'
  | 'open_count'
  | 'overdue_count'
  | 'blocked_count'
  | 'slips'
  | 'cycle'
  | 'spent_hours';

/* Ty le dung han: duoi 70% la dang lo, tu 90% la tot — nguong de doc nhanh,
   khong phai KPI chinh thuc. */
function rateTone(rate: number | null): string {
  if (rate == null) return 'text-tr-muted';
  if (rate < 0.7) return 'text-tr-danger';
  if (rate >= 0.9) return 'text-tr-success';
  return 'text-tr-text';
}

function formatDays(value: number | null): string {
  if (value == null) return '—';
  return `${value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} ngày`;
}

function formatHours(value: number): string {
  if (value === 0) return '—';
  return `${value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} giờ`;
}

function Change({ totals }: { totals: PerfTotals }) {
  const change = completedChange(totals);
  if (change == null || change === 0) return null;
  const up = change > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={`ml-1 inline-flex items-center text-xs ${up ? 'text-tr-success' : 'text-tr-danger'}`}
      title={`Kỳ trước: ${totals.prev_completed}`}
    >
      <Icon size={11} aria-hidden="true" />
      {formatPercent(Math.abs(change))}
      <span className="sr-only">{up ? ' tăng' : ' giảm'} so với kỳ trước</span>
    </span>
  );
}

/** Cac o so lieu dung chung cho dong don vi va dong ca nhan. */
function MetricCells({ totals }: { totals: PerfTotals }) {
  const rate = onTimeRate(totals);
  return (
    <>
      <td className="px-2 py-1.5 text-right tabular-nums">{totals.received}</td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">
        {totals.completed}
        <Change totals={totals} />
      </td>
      <td
        className={`px-2 py-1.5 text-right tabular-nums ${rateTone(rate)}`}
        title={
          rate == null ? 'Chưa có việc có hạn' : `${totals.on_time}/${totals.completed_with_due}`
        }
      >
        {rate == null ? '—' : formatPercent(rate)}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">{totals.open_count}</td>
      <td
        className={`px-2 py-1.5 text-right tabular-nums ${totals.overdue_count > 0 ? 'font-semibold text-tr-danger' : ''}`}
      >
        {totals.overdue_count}
      </td>
      <td
        className={`px-2 py-1.5 text-right tabular-nums ${totals.blocked_count > 0 ? 'text-tr-warning' : ''}`}
      >
        {totals.blocked_count}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">{totals.slips}</td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">
        {formatDays(avgCycleDays(totals))}
      </td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">
        {formatHours(totals.spent_hours)}
      </td>
    </>
  );
}

const METRIC_HEADERS: { key: SortKey; label: string; hint: string }[] = [
  { key: 'received', label: 'Nhận mới', hint: 'Việc được tạo trong kỳ và đang giao cho người này' },
  {
    key: 'completed',
    label: 'Hoàn thành',
    hint: 'Việc hoàn thành trong kỳ; mũi tên so với kỳ trước cùng độ dài',
  },
  {
    key: 'on_time_rate',
    label: 'Đúng hạn',
    hint: 'Tỷ lệ việc xong không muộn hơn hạn, trong các việc có hạn',
  },
  { key: 'open_count', label: 'Đang mở', hint: 'Việc chưa xong tại thời điểm hiện tại' },
  { key: 'overdue_count', label: 'Quá hạn', hint: 'Việc chưa xong đã qua hạn' },
  { key: 'blocked_count', label: 'Bị chặn', hint: 'Việc đang mở được đánh dấu vướng mắc' },
  { key: 'slips', label: 'Dời hạn', hint: 'Số lần đổi hạn trong kỳ' },
  { key: 'cycle', label: 'TB xử lý', hint: 'Số ngày trung bình từ lúc tạo đến lúc hoàn thành' },
  {
    key: 'spent_hours',
    label: 'Giờ thực tế',
    hint: 'Tổng giờ đã ghi trên các việc hoàn thành trong kỳ',
  },
];

function sortValue(row: PersonPerf, key: SortKey): number | string {
  if (key === 'name') return row.name;
  if (key === 'on_time_rate') return onTimeRate(row) ?? -1;
  if (key === 'cycle') return avgCycleDays(row) ?? -1;
  return row[key];
}

const SUBJECT_KEY = 'performance.subject';

function loadSubject(): Subject | null {
  try {
    return localStorage.getItem(SUBJECT_KEY) as Subject | null;
  } catch {
    return null;
  }
}

type Screen = 'me' | 'team';

/*
 * Hai man tach rieng:
 *   - "Của tôi": chi so lieu cua chinh nguoi dang xem — ai cung co.
 *   - "Phòng ban": cong ty / phong ban / nhan su minh quan ly. Chi hien khi pham
 *     vi quyen cho thay it nhat MOT nguoi khac ngoai minh; nhan vien thuong
 *     (pham vi `own`) chi co man "Của tôi".
 * Man dang xem nam tren URL (?screen=team) de chia se / quay lai dung cho.
 */
export default function PerformancePage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState(todayStr());
  const [view, setView] = useState<View>('units');
  const [chosen, setChosen] = useState<Subject | null>(loadSubject);
  const [params, setParams] = useSearchParams();
  const range = resolveRange(rangeKey, customFrom, customTo);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['performance', range.from, range.to],
    queryFn: () => api.get<PerformanceData>(`/api/views/performance${qs(range)}`),
  });

  const roots = useMemo(
    () => (data ? collapseSingleChains(buildUnitTree(data.units, data.people)) : []),
    [data]
  );
  const unitById = useMemo(
    () => new Map((data?.units ?? []).map((unit) => [unit.id, unit.name])),
    [data]
  );
  /* Man Phong ban khong co muc "Của tôi" — da co man rieng. */
  const options = useMemo(
    () => (data ? subjectOptions(roots, data).filter((o) => o.value !== 'me') : []),
    [roots, data]
  );

  if (error)
    return (
      <div className="p-6">
        <ErrorState onRetry={() => refetch()} />
      </div>
    );

  const meInScope = data?.me != null && data.people.some((p) => p.contact_id === data.me);
  const hasTeam = (data?.people.length ?? 0) > (meInScope ? 1 : 0);
  /* Tai khoan chua gan nhan su nhung co pham vi xem nguoi khac (vd. quan tri)
     thi mo thang man Phong ban — man Của tôi cua ho trong tron. */
  const screen: Screen = hasTeam && (params.get('screen') === 'team' || !meInScope) ? 'team' : 'me';
  const setScreen = (next: Screen) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (next === 'team') copy.set('screen', 'team');
        else copy.delete('screen');
        return copy;
      },
      { replace: true }
    );

  /* Lua chon da luu khong con hop le (doi pham vi, nguoi nghi viec) thi lui ve
     muc dau danh sach (Toàn phạm vi). */
  const personName = (id: number) => data?.people.find((p) => p.contact_id === id)?.name;
  const personId = (value: Subject | null) =>
    value?.startsWith('person:') ? Number(value.slice('person:'.length)) : null;
  const chosenPerson = personId(chosen);
  const chosenValid =
    chosen != null &&
    (options.some((o) => o.value === chosen) ||
      (chosenPerson != null && personName(chosenPerson) != null));
  const teamSubject: Subject = chosenValid ? chosen : (options[0]?.value ?? 'all');
  const subject: Subject = screen === 'me' ? 'me' : teamSubject;
  const selectSubject = (next: Subject) => {
    setChosen(next);
    try {
      localStorage.setItem(SUBJECT_KEY, next);
    } catch {
      /* bo qua: chi mat ghi nho lua chon */
    }
  };

  const selected = data ? peopleOf(subject, roots, data) : [];
  const totals = sumTotals(selected);
  const rate = onTimeRate(totals);
  const series = data
    ? weeklySeries(data.weekly, new Set(selected.map((p) => p.contact_id)), data.from, data.to)
    : [];
  const comparison = screen === 'team' ? compareRows(subject, roots) : [];
  const subjectPerson = personId(subject);
  const onlyOne = (data?.people.length ?? 0) <= 1;

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        description={
          screen === 'me'
            ? 'Năng suất và độ đúng hạn của chính bạn.'
            : 'Năng suất và độ đúng hạn của công ty, phòng ban và nhân sự bạn quản lý.'
        }
      />

      {hasTeam && (
        <div
          role="tablist"
          aria-label="Màn hình hiệu suất"
          className="flex gap-1 border-b border-tr-border"
        >
          {(
            [
              ['me', 'Của tôi', User],
              ['team', 'Phòng ban', Building2],
            ] as const
          )
            .filter(([key]) => key === 'team' || meInScope)
            .map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={screen === key}
                onClick={() => setScreen(key)}
                className={`-mb-px inline-flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-medium transition fine:min-h-9 ${focusRing} ${
                  screen === key
                    ? 'border-tr-primary text-tr-text'
                    : 'border-transparent text-tr-subtle hover:text-tr-text'
                }`}
              >
                <Icon size={15} aria-hidden="true" />
                {label}
              </button>
            ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <ReportRangePicker
          rangeKey={rangeKey}
          onRangeKeyChange={setRangeKey}
          customFrom={customFrom}
          onCustomFromChange={setCustomFrom}
          customTo={customTo}
          onCustomToChange={setCustomTo}
        />
        {screen === 'team' && options.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-tr-subtle">
            Xem của
            <select
              value={subject}
              onChange={(event) => selectSubject(event.target.value as Subject)}
              className={`min-h-[44px] rounded-panel border border-tr-border bg-tr-panel px-2 text-sm text-tr-text fine:min-h-0 fine:py-1.5 ${focusRing}`}
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {'   '.repeat(option.depth)}
                  {option.label}
                </option>
              ))}
              {subjectPerson != null && (
                <option value={subject}>{personName(subjectPerson)}</option>
              )}
            </select>
          </label>
        )}
      </div>

      {isLoading || !data ? (
        <div role="status" aria-label={t.common.loading} className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-panel" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-panel" />
        </div>
      ) : screen === 'me' && !meInScope ? (
        <EmptyState
          message="Chưa có số liệu của riêng bạn."
          hint="Tài khoản của bạn cần được gắn với một người trong Tổ chức & nhân sự để có số liệu của chính mình."
        />
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-tr-muted">
            <Users size={14} aria-hidden="true" />
            {screen === 'team' && (
              <>
                Phạm vi quyền: <strong className="text-tr-text">{SCOPE_LABEL[data.scope]}</strong>·
                đang xem {selected.length} người ·
              </>
            )}{' '}
            so với kỳ trước {formatDateShort(data.prev_from)} – {formatDateShort(data.prev_to)}
          </p>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label="Hoàn thành"
              value={String(totals.completed)}
              hint={`Kỳ trước ${totals.prev_completed} · nhận mới ${totals.received}`}
            />
            <Tile
              label="Đúng hạn"
              value={rate == null ? '—' : formatPercent(rate)}
              hint={
                rate == null
                  ? 'Chưa có việc có hạn'
                  : `${totals.on_time}/${totals.completed_with_due} việc có hạn`
              }
              tone={rateTone(rate)}
            />
            <Tile
              label="Quá hạn đang mở"
              value={String(totals.overdue_count)}
              hint={`${totals.open_count} việc đang mở · ${totals.blocked_count} bị chặn`}
              tone={totals.overdue_count > 0 ? 'text-tr-danger' : undefined}
            />
            <Tile
              label="Thời gian xử lý TB"
              value={formatDays(avgCycleDays(totals))}
              hint={
                screen === 'me'
                  ? `${totals.slips} lần dời hạn · ${formatHours(totals.spent_hours)} thực tế`
                  : `${totals.slips} lần dời hạn trong kỳ`
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel
              title="Hoàn thành theo tuần"
              className={comparison.length > 1 ? '' : 'lg:col-span-2'}
            >
              <WeeklyChart series={series} />
            </Panel>
            {comparison.length > 1 && (
              <Panel title="So sánh trong kỳ">
                <CompareChart rows={comparison} onSelect={selectSubject} />
              </Panel>
            )}
          </div>

          {screen === 'team' && (
            <Panel
              title={view === 'units' && !onlyOne ? 'Theo đơn vị' : 'Theo cá nhân'}
              action={
                !onlyOne && (
                  <div role="group" aria-label="Cách xem" className="flex gap-1">
                    {(
                      [
                        ['units', 'Theo đơn vị'],
                        ['people', 'Theo cá nhân'],
                      ] as [View, string][]
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={view === key}
                        onClick={() => setView(key)}
                        className={`min-h-9 rounded-control px-2.5 text-sm ${focusRing} ${
                          view === key
                            ? 'bg-tr-primary/10 font-medium text-tr-primary'
                            : 'text-tr-subtle hover:bg-tr-hover'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )
              }
            >
              {view === 'units' && !onlyOne ? (
                <UnitTable roots={roots} me={data.me} onSelect={selectSubject} />
              ) : (
                <PeopleTable
                  people={data.people}
                  me={data.me}
                  unitName={(id) => unitById.get(id ?? -1)}
                  onSelect={selectSubject}
                />
              )}
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

function Tile({
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
    <div className="rounded-xl border border-tr-border bg-tr-panel p-4 shadow-sm">
      <div className="truncate text-xs text-tr-subtle">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone ?? 'text-tr-text'}`}>{value}</div>
      {hint && <div className="text-xs text-tr-muted">{hint}</div>}
    </div>
  );
}

/* ---------- Bieu do ---------- */

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: '1px solid var(--tr-border)',
  backgroundColor: 'var(--tr-panel)',
  color: 'var(--tr-text)',
  fontSize: 12,
  boxShadow: 'var(--tr-popover-shadow)',
};

const AXIS_PROPS = { tick: { fontSize: 11 }, tickLine: false };

/* Thu tu co dinh: o 1 = dung han, o 2 = tre han; "khong co han" la xam phu de
   khong tranh su chu y voi hai nhom co y nghia. Mau dat trong index.css. */
const WEEK_SERIES = [
  { key: 'on_time', label: 'Đúng hạn', color: 'var(--tr-chart-1)' },
  { key: 'late', label: 'Trễ hạn', color: 'var(--tr-chart-2)' },
  { key: 'no_due', label: 'Không có hạn', color: 'var(--tr-chart-neutral)' },
] as const;

const COMPARE_SERIES = [
  { key: 'completed', label: 'Hoàn thành trong kỳ', color: 'var(--tr-chart-1)' },
  { key: 'overdue', label: 'Quá hạn đang mở', color: 'var(--tr-chart-2)' },
] as const;

function ChartLegend({ items }: { items: readonly { label: string; color: string }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-tr-subtle">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: item.color }}
            aria-hidden="true"
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function WeeklyChart({ series }: { series: WeekPoint[] }) {
  const rows = series.map((point) => ({ ...point, name: formatDateShort(point.week_start) }));
  const total = series.reduce((sum, p) => sum + p.on_time + p.late + p.no_due, 0);
  if (total === 0)
    return (
      <p className="py-12 text-center text-sm text-tr-muted">Chưa hoàn thành việc nào trong kỳ.</p>
    );
  return (
    <>
      <ChartLegend items={WEEK_SERIES} />
      <div className="h-64" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="name" {...AXIS_PROPS} />
            <YAxis allowDecimals={false} {...AXIS_PROPS} />
            <Tooltip
              cursor={{ fill: 'var(--tr-hover)' }}
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={(label) => `Tuần từ ${String(label)}`}
            />
            {WEEK_SERIES.map((item, index) => (
              <Bar
                key={item.key}
                dataKey={item.key}
                name={item.label}
                stackId="week"
                fill={item.color}
                stroke="var(--tr-panel)"
                strokeWidth={1}
                maxBarSize={36}
                radius={index === WEEK_SERIES.length - 1 ? [4, 4, 0, 0] : 0}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartDataTable
        caption="Việc hoàn thành theo tuần"
        valueLabel="Đúng hạn · Trễ · Không hạn"
        rows={rows.map((row) => ({
          name: `Tuần ${row.name}`,
          value: `${row.on_time} · ${row.late} · ${row.no_due}`,
        }))}
      />
    </>
  );
}

function CompareChart({
  rows,
  onSelect,
}: {
  rows: CompareRow[];
  onSelect: (subject: Subject) => void;
}) {
  const data = rows
    .map((row) => ({
      key: row.key,
      name: row.name,
      completed: row.totals.completed,
      overdue: row.totals.overdue_count,
    }))
    .sort((a, b) => b.completed - a.completed || a.name.localeCompare(b.name, 'vi'))
    /* Qua 12 dong thi nhan bi ep chong nhau — phan con lai xem o bang ben duoi. */
    .slice(0, 12);
  const height = Math.max(160, data.length * 36 + 24);
  return (
    <>
      <ChartLegend items={COMPARE_SERIES} />
      <div style={{ height }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
            barGap={2}
          >
            <CartesianGrid horizontal={false} />
            <XAxis type="number" allowDecimals={false} {...AXIS_PROPS} />
            <YAxis
              type="category"
              dataKey="name"
              width={130}
              {...AXIS_PROPS}
              tickFormatter={(value: string) =>
                value.length > 18 ? `${value.slice(0, 17)}…` : value
              }
            />
            <Tooltip cursor={{ fill: 'var(--tr-hover)' }} contentStyle={TOOLTIP_STYLE} />
            {COMPARE_SERIES.map((item) => (
              <Bar
                key={item.key}
                dataKey={item.key}
                name={item.label}
                fill={item.color}
                maxBarSize={12}
                radius={[0, 4, 4, 0]}
                className="cursor-pointer"
                onClick={(entry) => {
                  const key = (entry as { payload?: { key?: string } }).payload?.key;
                  if (key) onSelect(key as Subject);
                }}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-xs text-tr-muted">
        Bấm vào một cột, hoặc vào tên trong bảng bên dưới, để xem riêng đơn vị hoặc người đó.
      </p>
      <ChartDataTable
        caption="So sánh trong kỳ"
        valueLabel="Hoàn thành · Quá hạn"
        rows={data.map((row) => ({ name: row.name, value: `${row.completed} · ${row.overdue}` }))}
      />
    </>
  );
}

/* ---------- Bang ---------- */

function TableShell({
  caption,
  first,
  children,
  sort,
}: {
  caption: string;
  first: string;
  children: React.ReactNode;
  sort?: { key: SortKey; desc: boolean; onSort: (key: SortKey) => void };
}) {
  const header = (key: SortKey, label: string, hint: string, align: 'left' | 'right') => {
    const active = sort?.key === key;
    const content = (
      <>
        {label}
        {active &&
          (sort.desc ? (
            <ArrowDown size={11} aria-hidden="true" />
          ) : (
            <ArrowUp size={11} aria-hidden="true" />
          ))}
      </>
    );
    return (
      <th
        key={key}
        scope="col"
        title={hint}
        aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : undefined}
        className={`px-2 py-1.5 font-medium whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}
      >
        {sort ? (
          <button
            type="button"
            onClick={() => sort.onSort(key)}
            className={`inline-flex items-center gap-0.5 rounded-control hover:text-tr-text ${focusRing}`}
          >
            {content}
          </button>
        ) : (
          content
        )}
      </th>
    );
  };

  return (
    <div className="tr-scroll overflow-x-auto" tabIndex={0}>
      <table className="w-full min-w-[860px] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-xs text-tr-subtle">
          <tr>
            {header('name', first, '', 'left')}
            {METRIC_HEADERS.map((h) => header(h.key, h.label, h.hint, 'right'))}
          </tr>
        </thead>
        <tbody className="divide-y divide-tr-border">{children}</tbody>
      </table>
    </div>
  );
}

/** Ten mot nguoi trong bang — bam de xem rieng nguoi do o tren; dong cua chinh minh co nhan "Bạn". */
function PersonButton({
  person,
  me,
  onSelect,
}: {
  person: PersonPerf;
  me: number | null;
  onSelect: (subject: Subject) => void;
}) {
  const isMe = person.contact_id === me;
  return (
    <button
      type="button"
      onClick={() => onSelect(`person:${person.contact_id}`)}
      className={`inline-flex items-center gap-1.5 rounded-control text-left text-tr-text hover:text-tr-primary hover:underline ${focusRing}`}
    >
      {person.name}
      {isMe && (
        <span className="rounded-full bg-tr-primary/10 px-1.5 text-xs font-medium text-tr-primary">
          Bạn
        </span>
      )}
    </button>
  );
}

function UnitTable({
  roots,
  me,
  onSelect,
}: {
  roots: UnitNode[];
  me: number | null;
  onSelect: (subject: Subject) => void;
}) {
  /* Mac dinh mo san hai cap dau; `toggled` ghi cac nut nguoi dung da dao trang thai. */
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const keyOf = (node: UnitNode) => String(node.unit?.id ?? 'none');
  const isOpen = (node: UnitNode, depth: number) =>
    toggled.has(keyOf(node)) ? depth >= 2 : depth < 2;
  const toggle = (node: UnitNode) =>
    setToggled((current) => {
      const next = new Set(current);
      if (next.has(keyOf(node))) next.delete(keyOf(node));
      else next.add(keyOf(node));
      return next;
    });

  const renderNode = (node: UnitNode, depth: number): React.ReactNode => {
    const open = isOpen(node, depth);
    const label = node.unit?.name ?? 'Chưa xếp đơn vị';
    return (
      <Fragment key={keyOf(node)}>
        <tr className="bg-tr-hover/40">
          <th scope="row" className="px-2 py-1.5 text-left font-semibold text-tr-text">
            <button
              type="button"
              onClick={() => toggle(node)}
              aria-expanded={open}
              className={`flex items-center gap-1 rounded-control text-left ${focusRing}`}
              style={{ paddingLeft: depth * 16 }}
            >
              {open ? (
                <ChevronDown size={14} aria-hidden="true" />
              ) : (
                <ChevronRight size={14} aria-hidden="true" />
              )}
              <span className="whitespace-nowrap">{label}</span>
              <span className="text-xs font-normal whitespace-nowrap text-tr-muted">
                · {node.headcount} người
                {node.unit?.head_name ? ` · Trưởng: ${node.unit.head_name}` : ''}
              </span>
            </button>
          </th>
          <MetricCells totals={node.totals} />
        </tr>
        {open && (
          <>
            {node.members.map((person) => (
              <tr key={`p${person.contact_id}`}>
                <th
                  scope="row"
                  className="px-2 py-1.5 text-left font-normal"
                  style={{ paddingLeft: depth * 16 + 30 }}
                >
                  <PersonButton person={person} me={me} onSelect={onSelect} />
                </th>
                <MetricCells totals={person} />
              </tr>
            ))}
            {node.children.map((child) => renderNode(child, depth + 1))}
          </>
        )}
      </Fragment>
    );
  };

  return (
    <TableShell caption="Hiệu suất theo đơn vị" first="Đơn vị / nhân sự">
      {roots.map((node) => renderNode(node, 0))}
    </TableShell>
  );
}

function PeopleTable({
  people,
  me,
  unitName,
  onSelect,
}: {
  people: PersonPerf[];
  me: number | null;
  unitName: (id: number | null) => string | undefined;
  onSelect: (subject: Subject) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: 'completed',
    desc: true,
  });
  const sorted = useMemo(() => {
    const copy = [...people];
    copy.sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      const cmp = typeof av === 'string' ? av.localeCompare(String(bv), 'vi') : av - (bv as number);
      /* Bang nhau thi theo ten de thu tu on dinh giua cac lan tai. */
      return (sort.desc ? -cmp : cmp) || a.name.localeCompare(b.name, 'vi');
    });
    return copy;
  }, [people, sort]);

  const onSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key ? { key, desc: !current.desc } : { key, desc: key !== 'name' }
    );

  return (
    <TableShell caption="Hiệu suất theo cá nhân" first="Nhân sự" sort={{ ...sort, onSort }}>
      {sorted.map((person) => (
        <tr key={person.contact_id}>
          <th scope="row" className="px-2 py-1.5 text-left font-normal">
            <PersonButton person={person} me={me} onSelect={onSelect} />
            <div className="text-xs text-tr-muted">
              {unitName(person.org_unit_id) ?? 'Chưa xếp đơn vị'}
            </div>
          </th>
          <MetricCells totals={person} />
        </tr>
      ))}
    </TableShell>
  );
}
