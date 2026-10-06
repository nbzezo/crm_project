import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Ban,
  CalendarX2,
  ChevronRight,
  Hourglass,
  Snowflake,
  UserX,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../../api/client';
import { formatVNDShort } from '../../lib/format';
import { usePermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/authStore';
import { emptyTaskFilters, useUiStore } from '../../stores/uiStore';
import { Panel, Segmented, focusRing } from '../common/ui';
import type { AttentionItem, FocusData, RetroStats, WaitingItem } from './focusTypes';
import { FocusItemRow } from './FocusItemRow';
import { dayMonth } from './focusPeriod';

/* ---------- Ton tu truoc ky ---------- */

export function CarryOverPanel({ data }: { data: FocusData }) {
  const [expanded, setExpanded] = useState(false);
  const items = data.carry_over;
  if (items.length === 0) return null;
  const shown = expanded ? items : items.slice(0, 6);
  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          <AlertTriangle size={15} className="text-tr-danger" aria-hidden="true" />
          Tồn từ trước kỳ
          <span className="text-sm font-normal text-tr-muted">
            ({data.summary.carry_over_count})
          </span>
        </span>
      }
      className="border-tr-danger/30"
    >
      <ul className="divide-y divide-tr-border">
        {shown.map((item) => (
          <FocusItemRow key={item.key} item={item} today={data.range.today} showDate />
        ))}
      </ul>
      {items.length > 6 && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className={`mt-2 text-xs font-medium text-tr-primary hover:underline print:hidden ${focusRing}`}
        >
          {expanded ? 'Thu gọn' : `Xem thêm ${items.length - 6}`}
        </button>
      )}
    </Panel>
  );
}

/* ---------- Can chu y ---------- */

const ATTENTION_ICON: Record<AttentionItem['kind'], LucideIcon> = {
  slipping: Hourglass,
  blocked: Ban,
  stale_deal: Snowflake,
  cold_customer: Snowflake,
  unassigned: UserX,
  overloaded_day: AlertTriangle,
  conflict: CalendarX2,
};

const SEVERITY_TONE: Record<AttentionItem['severity'], string> = {
  danger: 'text-tr-danger',
  warning: 'text-tr-warning',
  info: 'text-tr-primary',
};

export function AttentionPanel({
  data,
  onSelectDay,
}: {
  data: FocusData;
  onSelectDay: (date: string) => void;
}) {
  const navigate = useNavigate();
  const openCard = useUiStore((state) => state.openCard);
  const open = (item: AttentionItem) => {
    if (item.card_id) openCard(item.card_id);
    else if (item.deal_id) void navigate(`/deals/${item.deal_id}`);
    else if (item.customer_id) void navigate(`/customers/${item.customer_id}`);
    else if (item.date) onSelectDay(item.date);
  };
  return (
    <Panel title="Cần chú ý">
      {data.attention.length === 0 ? (
        <p className="text-sm text-tr-muted">Không có tín hiệu bất thường trong kỳ này.</p>
      ) : (
        <ul className="divide-y divide-tr-border">
          {data.attention.map((item) => {
            const Icon = ATTENTION_ICON[item.kind];
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  className={`group flex w-full min-w-0 items-start gap-2 rounded-control px-1 py-1.5 text-left transition hover:bg-tr-hover ${focusRing}`}
                >
                  <Icon
                    size={15}
                    className={`mt-0.5 shrink-0 ${SEVERITY_TONE[item.severity]}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-sm font-medium text-tr-text"
                      title={item.title}
                    >
                      {item.title}
                    </span>
                    <span className="block truncate text-xs text-tr-muted">{item.meta}</span>
                  </span>
                  <ChevronRight
                    size={14}
                    className="mt-1 shrink-0 text-tr-muted"
                    aria-hidden="true"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ---------- Ai dang cho ai ---------- */

const REASON_LABEL: Record<WaitingItem['reason'], string> = {
  assigned: 'giao cho bạn',
  nudged: 'đã nhắc bạn',
  approval: 'chờ bạn duyệt',
  delegated: 'bạn đã giao',
  watching: 'bạn đang theo dõi',
};

export function WaitingPanel({ data }: { data: FocusData }) {
  const openCard = useUiStore((state) => state.openCard);
  const { on_me: onMe, on_others: onOthers } = data.waiting;
  const [tab, setTab] = useState<'me' | 'others'>(
    onMe.length > 0 || onOthers.length === 0 ? 'me' : 'others'
  );
  if (data.scope.me == null) return null;
  const list = tab === 'me' ? onMe : onOthers;
  return (
    <Panel
      title="Đang chờ"
      action={
        <Segmented
          label="Ai đang chờ ai"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'me', label: `Chờ tôi · ${onMe.length}` },
            { value: 'others', label: `Tôi chờ · ${onOthers.length}` },
          ]}
        />
      }
    >
      {list.length === 0 ? (
        <p className="text-sm text-tr-muted">
          {tab === 'me' ? 'Không ai đang chờ bạn.' : 'Không có việc nào bạn đang chờ người khác.'}
        </p>
      ) : (
        <ul className="divide-y divide-tr-border">
          {list.map((item) => (
            <li key={`${item.card_id}-${item.reason}`}>
              <button
                type="button"
                onClick={() => openCard(item.card_id)}
                className={`flex w-full min-w-0 items-start gap-2 rounded-control px-1 py-1.5 text-left transition hover:bg-tr-hover ${focusRing}`}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-sm font-medium text-tr-text"
                    title={item.title}
                  >
                    {item.title}
                  </span>
                  <span className="block truncate text-xs text-tr-muted">
                    {[
                      item.person_name,
                      REASON_LABEL[item.reason],
                      item.nudge_count > 0 ? `nhắc ${item.nudge_count} lần` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                {item.due_date && (
                  <span
                    className={`shrink-0 text-xs font-medium tabular-nums ${item.overdue ? 'text-tr-danger' : 'text-tr-muted'}`}
                  >
                    {dayMonth(item.due_date)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {tab === 'others' && onOthers.some((item) => item.overdue) && (
        <p className="mt-2 text-xs text-tr-muted">
          Mở việc để gửi lời nhắc — hoặc dùng mục “Tin nhắn soạn sẵn” của AI phía trên.
        </p>
      )}
    </Panel>
  );
}

/* ---------- Moc kinh doanh & du an ---------- */

export function MilestonesPanel({ data }: { data: FocusData }) {
  const items = data.items.filter((item) => item.group === 'milestone');
  if (items.length === 0) return null;
  const total = items.reduce(
    (sum, item) => sum + (item.kind === 'deal_close' ? (item.value_vnd ?? 0) : 0),
    0
  );
  return (
    <Panel
      title="Mốc kinh doanh & dự án"
      action={
        total > 0 ? (
          <span className="text-xs text-tr-muted">Chốt dự kiến {formatVNDShort(total)}</span>
        ) : undefined
      }
    >
      <ul className="divide-y divide-tr-border">
        {items.map((item) => (
          <FocusItemRow key={item.key} item={item} today={data.range.today} showDate />
        ))}
      </ul>
    </Panel>
  );
}

/* ---------- Nhin lai ky ---------- */

function percent(value: number | null): string {
  return value == null ? '—' : `${Math.round(value * 100)}%`;
}

function Delta({
  current,
  previous,
  suffix = '',
}: {
  current: number;
  previous: number;
  suffix?: string;
}) {
  const diff = current - previous;
  if (diff === 0) return <span className="text-tr-muted">= kỳ trước</span>;
  return (
    <span className={diff > 0 ? 'text-tr-success' : 'text-tr-danger'}>
      {diff > 0 ? '+' : ''}
      {diff}
      {suffix} so với kỳ trước
    </span>
  );
}

function RetroRow({
  label,
  current,
  previous,
  format = String,
}: {
  label: string;
  current: number;
  previous: number;
  format?: (value: number) => string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5 text-sm">
      <span className="text-tr-subtle">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="font-semibold text-tr-text tabular-nums">{format(current)}</span>
        <span className="text-xs">
          <Delta current={current} previous={previous} />
        </span>
      </span>
    </div>
  );
}

export function RetroPanel({ data }: { data: FocusData }) {
  if (!data.retro) return null;
  const { current, previous } = data.retro;
  const done = current.done_on_time + current.done_late;
  const finished = data.range.to < data.range.today;
  return (
    <Panel
      title={finished ? 'Nhìn lại kỳ' : 'Tiến độ kỳ đến hôm nay'}
      action={
        <span className="text-xs text-tr-muted">
          Kỳ trước: {dayMonth(previous.from)} – {dayMonth(previous.to)}
        </span>
      }
    >
      {current.planned === 0 ? (
        <p className="mb-2 text-sm text-tr-subtle">Không có việc nào đến hạn trong khoảng này.</p>
      ) : (
        <div className="mb-2 flex items-end gap-3">
          <span className="text-3xl font-bold tracking-[-0.035em] text-tr-text tabular-nums">
            {percent(current.completion_rate)}
          </span>
          <span className="pb-1 text-sm text-tr-subtle">
            xong {done}/{current.planned} việc đến hạn · {current.done_on_time} đúng hạn
            {current.done_late > 0 ? `, ${current.done_late} trễ` : ''}
            {current.still_open > 0
              ? ` · ${current.still_open} ${finished ? 'bị trượt' : 'còn mở'}`
              : ''}
          </span>
        </div>
      )}
      <RetroBar stats={current} />
      <div className="mt-2 divide-y divide-tr-border">
        <RetroRow
          label="Việc hoàn thành trong kỳ"
          current={current.completed_in_range}
          previous={previous.completed_in_range}
        />
        <RetroRow
          label="Cuộc họp / cuộc gọi"
          current={current.meetings}
          previous={previous.meetings}
        />
        <RetroRow
          label="Tương tác khách hàng đã ghi"
          current={current.interactions}
          previous={previous.interactions}
        />
        <RetroRow
          label="Cơ hội thắng"
          current={current.deals_won}
          previous={previous.deals_won}
          format={(value) =>
            value > 0 ? `${value} · ${formatVNDShort(current.deals_won_vnd)}` : String(value)
          }
        />
        {(current.deals_lost > 0 || previous.deals_lost > 0) && (
          <RetroRow
            label="Cơ hội thua"
            current={current.deals_lost}
            previous={previous.deals_lost}
          />
        )}
      </div>
    </Panel>
  );
}

function RetroBar({ stats }: { stats: RetroStats }) {
  if (stats.planned === 0) return null;
  const part = (value: number) => `${(value / stats.planned) * 100}%`;
  return (
    <div
      className="flex h-2 overflow-hidden rounded-full bg-tr-hover"
      role="img"
      aria-label={`${stats.done_on_time} đúng hạn, ${stats.done_late} trễ, ${stats.still_open} chưa xong trên ${stats.planned} việc`}
    >
      <span className="bg-tr-success" style={{ width: part(stats.done_on_time) }} />
      <span className="bg-tr-warning" style={{ width: part(stats.done_late) }} />
      <span className="bg-tr-danger/60" style={{ width: part(stats.still_open) }} />
    </div>
  );
}

/* ---------- Tai cua nhom ---------- */

export function WorkloadPanel({ data }: { data: FocusData }) {
  const navigate = useNavigate();
  const setTaskFilters = useUiStore((state) => state.setTaskFilters);
  if (data.scope.mode !== 'team' || data.workload.length === 0) return null;
  const capacity = Math.max(1, data.summary.workdays_left) * 8;
  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          <Users size={15} aria-hidden="true" /> Tải công việc của nhóm trong kỳ
        </span>
      }
    >
      <ul className="divide-y divide-tr-border">
        {data.workload.map((row) => {
          const ratio = row.estimate_hours / capacity;
          return (
            <li key={row.assignee_contact_id ?? 'none'}>
              <button
                type="button"
                onClick={() => {
                  setTaskFilters({
                    ...emptyTaskFilters,
                    status: 'open',
                    assignee: row.assignee_contact_id ?? 'none',
                  });
                  void navigate('/tasks');
                }}
                className={`flex w-full min-w-0 items-center gap-3 rounded-control px-1 py-2 text-left transition hover:bg-tr-hover ${focusRing}`}
              >
                <span className="w-36 min-w-0 truncate text-sm font-medium text-tr-text">
                  {row.assignee_name ?? 'Chưa giao'}
                </span>
                <span className="block h-2 flex-1 overflow-hidden rounded-full bg-tr-hover">
                  <span
                    className={`block h-full rounded-full ${ratio > 1 ? 'bg-tr-danger' : ratio > 0.85 ? 'bg-tr-warning' : 'bg-tr-success'}`}
                    style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
                  />
                </span>
                <span className="w-44 shrink-0 text-right text-xs text-tr-muted tabular-nums">
                  {row.open_count} việc · {Math.round(row.estimate_hours * 10) / 10} giờ
                  {row.overdue_count > 0 && (
                    <span className="text-tr-danger"> · {row.overdue_count} trễ</span>
                  )}
                  {row.done_count > 0 && <span> · {row.done_count} xong</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ---------- KPI doanh thu (xem theo thang) ---------- */

interface KpiMonth {
  period: string;
  target_vnd: number;
  total_vnd: number;
  pending_count: number;
}

export function RevenuePanel({ data }: { data: FocusData }) {
  const canRead = usePermission('revenues', 'read');
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const period = data.range.from.slice(0, 7);
  /* Chi khi ky nam tron trong mot thang: KPI doanh thu tinh theo thang. */
  const monthly = data.range.to.slice(0, 7) === period && data.range.days >= 28;
  const year = Number(period.slice(0, 4));
  const am = data.scope.mode === 'me' && userId ? `&am_user_id=${userId}` : '';
  const { data: kpi } = useQuery({
    queryKey: ['revenues', 'kpi', year, am],
    queryFn: () =>
      api.get<{ months: KpiMonth[] }>(`/api/revenues/kpi?year=${year}${am}&entries=none`),
    enabled: canRead && monthly,
    staleTime: 5 * 60_000,
  });
  const month = kpi?.months.find((item) => item.period === period);
  if (!canRead || !monthly || !month || (month.target_vnd === 0 && month.total_vnd === 0))
    return null;
  const ratio = month.target_vnd > 0 ? month.total_vnd / month.target_vnd : null;
  return (
    <Panel title={`KPI doanh thu tháng ${Number(period.slice(5, 7))}`}>
      <div className="flex items-end justify-between gap-2">
        <span className="text-2xl font-bold tracking-[-0.035em] text-tr-text tabular-nums">
          {formatVNDShort(month.total_vnd)}
        </span>
        <span className="pb-1 text-sm text-tr-subtle">
          / chỉ tiêu {formatVNDShort(month.target_vnd)}
          {ratio != null && ` · ${Math.round(ratio * 100)}%`}
        </span>
      </div>
      {ratio != null && (
        <span className="mt-2 block h-2 overflow-hidden rounded-full bg-tr-hover">
          <span
            className={`block h-full rounded-full ${ratio >= 1 ? 'bg-tr-success' : 'bg-tr-primary'}`}
            style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
          />
        </span>
      )}
      {month.pending_count > 0 && (
        <p className="mt-2 text-xs text-tr-muted">
          {month.pending_count} dòng doanh thu đang chờ đối soát — chưa tính vào KPI.
        </p>
      )}
    </Panel>
  );
}
