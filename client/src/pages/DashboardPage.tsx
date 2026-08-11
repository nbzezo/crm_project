import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  FileSignature,
  Layers,
  Scale,
  Target,
  TrendingUp,
} from 'lucide-react';
import { api } from '../api/client';
import { EmptyState, ErrorState, Panel, PriorityBadge, Skeleton } from '../components/common/ui';
import { OPEN_STAGES, STAGE_COLORS, t } from '../i18n/vi';
import { formatDate, formatDateTime, formatVND, formatVNDShort } from '../lib/format';
import { useUiStore } from '../stores/uiStore';
import type { Interaction, Reminder, Stage, TaskRow } from '../types';

interface AttentionDeal {
  id: number;
  title: string;
  stage: Stage;
  value_vnd: number;
  probability: number;
  expected_close_date: string | null;
  next_action: string | null;
  next_action_date: string | null;
  customer_name: string;
  days_idle: number;
}

interface ExpiringContract {
  id: number;
  name: string;
  number: string | null;
  value_vnd: number;
  end_date: string;
  days_left: number;
  customer_id: number;
  customer_name: string;
  renewal_followed: number;
}

interface DashboardData {
  kpi: {
    open_opportunity_count: number;
    pipeline_vnd: number;
    weighted_pipeline_vnd: number;
    closing_this_month_count: number;
    closing_this_month_vnd: number;
    overdue_task_count: number;
    expiring_contract_count: number;
  };
  task_counts: { overdue: number; today: number; tomorrow: number; week: number; open: number };
  tasks: { overdue: TaskRow[]; today: TaskRow[]; tomorrow: TaskRow[]; next7: TaskRow[] };
  pipeline_totals: Record<Stage, { count: number; sum_vnd: number; weighted_vnd: number }>;
  attention: {
    close_overdue: AttentionDeal[];
    no_next_action: AttentionDeal[];
    stale: AttentionDeal[];
    next_action_overdue: AttentionDeal[];
    top_value: AttentionDeal[];
  };
  expiring_contracts: { d30: ExpiringContract[]; d60: ExpiringContract[]; d90: ExpiringContract[] };
  upcoming_reminders: Reminder[];
  recent_interactions: Interaction[];
  recent_boards: { id: number; name: string; color: string; customer_name: string | null; card_count: number }[];
}

export default function DashboardPage() {
  const openCard = useUiStore((s) => s.openCard);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/api/views/dashboard'),
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
            <Skeleton key={i} className="h-56 rounded-panel" />
          ))}
        </div>
      </div>
    );

  const maxStage = Math.max(1, ...OPEN_STAGES.map((s) => data.pipeline_totals[s]?.sum_vnd ?? 0));

  return (
    <div className="space-y-4 p-6">
      {/* FR-DSH-01: 6 chỉ số đầu trang */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat icon={Target} label="Cơ hội đang mở" value={String(data.kpi.open_opportunity_count)} />
        <Stat icon={Layers} label="Tổng pipeline" value={formatVNDShort(data.kpi.pipeline_vnd)} />
        <Stat
          icon={Scale}
          label="Weighted pipeline"
          value={formatVNDShort(data.kpi.weighted_pipeline_vnd)}
          hint="Σ giá trị × xác suất"
        />
        <Stat
          icon={TrendingUp}
          label="Dự kiến chốt tháng này"
          value={String(data.kpi.closing_this_month_count)}
          hint={formatVNDShort(data.kpi.closing_this_month_vnd)}
        />
        <Stat
          icon={AlertTriangle}
          label="Công việc quá hạn"
          value={String(data.kpi.overdue_task_count)}
          tone={data.kpi.overdue_task_count > 0 ? 'danger' : undefined}
        />
        <Stat
          icon={FileSignature}
          label="HĐ sắp hết hạn"
          value={String(data.kpi.expiring_contract_count)}
          tone={data.kpi.expiring_contract_count > 0 ? 'warn' : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* FR-DSH-04: việc cần làm hôm nay */}
        <Panel title="Việc cần làm" className="lg:col-span-2">
          <div className="space-y-4">
            <TaskBucket
              label={`${t.common.overdue} (${data.task_counts.overdue})`}
              tasks={data.tasks.overdue}
              danger
              onOpen={openCard}
            />
            <TaskBucket
              label={`Hôm nay (${data.task_counts.today})`}
              tasks={data.tasks.today}
              onOpen={openCard}
            />
            <TaskBucket
              label={`Ngày mai (${data.task_counts.tomorrow})`}
              tasks={data.tasks.tomorrow}
              onOpen={openCard}
            />
            <TaskBucket label="7 ngày tới" tasks={data.tasks.next7} onOpen={openCard} />
            {data.task_counts.open === 0 && (
              <p className="py-4 text-center text-sm text-tr-muted">Không còn việc nào đang mở.</p>
            )}
          </div>
        </Panel>

        <Panel title={t.reminder.reminders}>
          {data.upcoming_reminders.length === 0 ? (
            <p className="py-6 text-center text-sm text-tr-muted">{t.reminder.noReminders}</p>
          ) : (
            <ul className="space-y-2">
              {data.upcoming_reminders.map((r) => (
                <li key={r.id} className="flex items-start gap-2">
                  <Bell size={14} className="mt-0.5 shrink-0 text-tr-warning" />
                  <div className="min-w-0">
                    <div className="truncate text-sm text-tr-text">{r.title}</div>
                    <div className="text-xs text-tr-muted">{formatDateTime(r.due_at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* FR-DSH-03: pipeline theo giai đoạn */}
      <Panel title={`${t.nav.pipeline} theo giai đoạn`}>
        <ul className="space-y-2">
          {OPEN_STAGES.map((stage) => {
            const item = data.pipeline_totals[stage] ?? { count: 0, sum_vnd: 0, weighted_vnd: 0 };
            return (
              <li key={stage} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0 text-tr-subtle">{t.stage[stage]}</span>
                <span className="w-8 shrink-0 text-xs text-tr-muted tabular-nums">{item.count}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-tr-hover">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${Math.round((item.sum_vnd / maxStage) * 100)}%`,
                      backgroundColor: STAGE_COLORS[stage],
                    }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right font-medium text-tr-text tabular-nums">
                  {formatVND(item.sum_vnd)}
                </span>
                <span className="w-24 shrink-0 text-right text-xs text-tr-muted tabular-nums">
                  {formatVNDShort(item.weighted_vnd)}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex justify-end gap-2 text-xs text-tr-muted">
          <span className="w-28 text-right">Giá trị</span>
          <span className="w-24 text-right">Trọng số</span>
        </div>
      </Panel>

      {/* FR-DSH-05: deal cần chú ý */}
      <Panel title="Cơ hội cần chú ý">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <AttentionList
            title="Quá ngày dự kiến chốt"
            deals={data.attention.close_overdue}
            render={(d) => formatDate(d.expected_close_date)}
          />
          <AttentionList
            title="Chưa có hành động tiếp theo"
            deals={data.attention.no_next_action}
            render={(d) => formatVNDShort(d.value_vnd)}
          />
          <AttentionList
            title="Quá hạn Next Action"
            deals={data.attention.next_action_overdue}
            render={(d) => `${d.next_action ?? ''} · ${formatDate(d.next_action_date)}`}
          />
          <AttentionList
            title="Không tương tác > 14 ngày"
            deals={data.attention.stale}
            render={(d) => `${d.days_idle} ngày`}
          />
        </div>
      </Panel>

      {/* FR-DSH-06: hợp đồng sắp hết hạn */}
      <Panel
        title="Hợp đồng sắp hết hạn"
        action={
          <Link to="/contracts" className="text-xs text-tr-primary hover:underline">
            Xem tất cả
          </Link>
        }
      >
        {data.kpi.expiring_contract_count === 0 ? (
          <p className="py-4 text-center text-sm text-tr-muted">
            Không có hợp đồng nào hết hạn trong 90 ngày tới.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {(
              [
                ['Trong 30 ngày', data.expiring_contracts.d30],
                ['30 – 60 ngày', data.expiring_contracts.d60],
                ['60 – 90 ngày', data.expiring_contracts.d90],
              ] as [string, ExpiringContract[]][]
            ).map(([label, items]) => (
              <div key={label}>
                <h3 className="mb-1.5 text-xs font-semibold text-tr-subtle">
                  {label} <span className="font-normal text-tr-muted">({items.length})</span>
                </h3>
                <ul className="space-y-1.5">
                  {items.map((c) => (
                    <li key={c.id} className="text-sm">
                      <Link to="/contracts" className="text-tr-text hover:text-tr-primary">
                        {c.name}
                      </Link>
                      <div className="text-xs text-tr-muted">
                        {c.customer_name} · {formatDate(c.end_date)} · còn {c.days_left} ngày
                      </div>
                    </li>
                  ))}
                  {items.length === 0 && <li className="text-xs text-tr-muted">—</li>}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title={t.customer.interactions}>
          {data.recent_interactions.length === 0 ? (
            <p className="py-6 text-center text-sm text-tr-muted">{t.interaction.noInteractions}</p>
          ) : (
            <ul className="space-y-2">
              {data.recent_interactions.map((item) => (
                <li key={item.id} className="text-sm">
                  <Link
                    to={`/customers/${item.customer_id}`}
                    className="font-medium text-tr-primary hover:underline"
                  >
                    {item.customer_name}
                  </Link>
                  <span className="text-tr-muted">
                    {' '}
                    · {t.interactionType[item.type]} · {formatDateTime(item.occurred_at)}
                  </span>
                  <div className="truncate text-tr-subtle">{item.summary}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={t.nav.boards}>
          {data.recent_boards.length === 0 ? (
            <EmptyState message={t.board.noBoards} />
          ) : (
            <ul className="space-y-2">
              {data.recent_boards.map((board) => (
                <li key={board.id}>
                  <Link
                    to={`/boards/${board.id}`}
                    className="flex items-center gap-2 rounded-lg p-1.5 transition hover:bg-tr-hover"
                  >
                    <span
                      className="h-8 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: board.color }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-tr-text">
                        {board.name}
                      </span>
                      <span className="block truncate text-xs text-tr-muted">
                        {board.card_count} thẻ đang mở
                        {board.customer_name ? ` · ${board.customer_name}` : ''}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Bell;
  label: string;
  value: string;
  hint?: string;
  tone?: 'danger' | 'warn';
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-tr-danger'
      : tone === 'warn'
        ? 'text-tr-warning'
        : 'text-tr-text';
  return (
    <div className="rounded-lg border border-tr-border bg-tr-panel p-3 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs text-tr-muted">
        <Icon size={13} />
        <span className="truncate">{label}</span>
      </div>
      <div className={`mt-1 text-xl font-semibold ${toneClass}`}>{value}</div>
      {hint && <div className="text-xs text-tr-muted">{hint}</div>}
    </div>
  );
}

function TaskBucket({
  label,
  tasks,
  danger,
  onOpen,
}: {
  label: string;
  tasks: TaskRow[];
  danger?: boolean;
  onOpen: (id: number) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <div>
      <h3 className={`mb-1 text-xs font-semibold ${danger ? 'text-tr-danger' : 'text-tr-subtle'}`}>
        {label}
      </h3>
      <ul className="divide-y divide-tr-border">
        {tasks.map((task) => (
          <li key={task.id}>
            <button
              onClick={() => onOpen(task.id)}
              className="flex w-full items-center gap-3 py-1.5 text-left transition hover:bg-tr-hover"
            >
              <PriorityBadge priority={task.priority} small />
              <span className="min-w-0 flex-1 truncate text-sm text-tr-text">{task.title}</span>
              <span className="shrink-0 text-xs text-tr-muted">{task.board_name}</span>
              {task.due_date && (
                <span
                  className={`shrink-0 text-xs ${danger ? 'font-medium text-tr-danger' : 'text-tr-muted'}`}
                >
                  {formatDate(task.due_date)}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AttentionList({
  title,
  deals,
  render,
}: {
  title: string;
  deals: AttentionDeal[];
  render: (deal: AttentionDeal) => string;
}) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold text-tr-subtle">
        {title} <span className="font-normal text-tr-muted">({deals.length})</span>
      </h3>
      {deals.length === 0 ? (
        <p className="text-xs text-tr-muted">—</p>
      ) : (
        <ul className="space-y-1.5">
          {deals.slice(0, 5).map((d) => (
            <li key={d.id} className="text-sm">
              <Link to="/pipeline" className="text-tr-text hover:text-tr-primary">
                {d.title}
              </Link>
              <div className="truncate text-xs text-tr-muted">
                {d.customer_name} · {render(d)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
