import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Users } from 'lucide-react';
import { api, qs } from '../api/client';
import { EmptyState, ErrorState, Panel, Skeleton, focusRing } from '../components/common/ui';
import { PageHeader } from '../components/common/PageShell';
import { ReportRangePicker } from '../components/common/ReportRangePicker';
import { t } from '../i18n/vi';
import { formatDateShort, formatPercent, todayStr } from '../lib/format';
import {
  avgCycleDays,
  buildUnitTree,
  collapseSingleChains,
  completedChange,
  onTimeRate,
  sumTotals,
  type PerfTotals,
  type PerformanceData,
  type PersonPerf,
  type UnitNode,
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

export default function PerformancePage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState(todayStr());
  const [view, setView] = useState<View>('units');
  const range = resolveRange(rangeKey, customFrom, customTo);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['performance', range.from, range.to],
    queryFn: () => api.get<PerformanceData>(`/api/views/performance${qs(range)}`),
  });

  const unitById = useMemo(
    () => new Map((data?.units ?? []).map((unit) => [unit.id, unit.name])),
    [data]
  );

  if (error)
    return (
      <div className="p-6">
        <ErrorState onRetry={() => refetch()} />
      </div>
    );

  const totals = data ? sumTotals(data.people) : null;
  const rate = totals ? onTimeRate(totals) : null;
  const solo = (data?.people.length ?? 0) <= 1;

  return (
    <div className="space-y-4 p-6">
      <PageHeader description="Năng suất và độ đúng hạn theo cá nhân và đơn vị, trong phạm vi bạn được xem." />
      <ReportRangePicker
        rangeKey={rangeKey}
        onRangeKeyChange={setRangeKey}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
      />

      {isLoading || !data || !totals ? (
        <div role="status" aria-label={t.common.loading} className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-panel" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-panel" />
        </div>
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-tr-muted">
            <Users size={14} aria-hidden="true" />
            Phạm vi: <strong className="text-tr-text">{SCOPE_LABEL[data.scope]}</strong>·{' '}
            {data.people.length} người · so với kỳ trước {formatDateShort(data.prev_from)} –{' '}
            {formatDateShort(data.prev_to)}
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
              hint={`${totals.slips} lần dời hạn trong kỳ`}
            />
          </div>

          {data.people.length === 0 ? (
            <EmptyState
              message="Không có nhân sự nào trong phạm vi bạn được xem."
              hint="Tài khoản cần được gắn với một người trong Tổ chức & nhân sự."
            />
          ) : (
            <Panel
              title={view === 'units' && !solo ? 'Theo đơn vị' : 'Theo cá nhân'}
              action={
                !solo && (
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
              {view === 'units' && !solo ? (
                <UnitTable data={data} />
              ) : (
                <PeopleTable people={data.people} unitName={(id) => unitById.get(id ?? -1)} />
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

function UnitTable({ data }: { data: PerformanceData }) {
  const roots = useMemo(() => collapseSingleChains(buildUnitTree(data.units, data.people)), [data]);
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
              <span className="text-xs font-normal text-tr-muted">
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
                  className="px-2 py-1.5 text-left font-normal text-tr-text"
                  style={{ paddingLeft: depth * 16 + 30 }}
                >
                  {person.name}
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
  unitName,
}: {
  people: PersonPerf[];
  unitName: (id: number | null) => string | undefined;
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
            <div className="text-tr-text">{person.name}</div>
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
