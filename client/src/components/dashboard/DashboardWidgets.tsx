import { useState } from 'react';
import { Link } from 'react-router';
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronRight,
  Columns3,
  FileSignature,
  Layers,
  ListTodo,
  Scale,
  ShieldAlert,
  Target,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { ColorBadge, Panel, PriorityBadge, focusRing } from '../common/ui';
import {
  daysFromToday,
  getDeadlinePresentation,
  type DeadlineTone,
} from '../tasks/TaskPresentation';
import { OPEN_STAGES, STAGE_COLORS, t } from '../../i18n/vi';
import { formatDate, formatDateShort, formatVNDShort } from '../../lib/format';
import { AssigneeChip } from '../tasks/AssigneePicker';
import type { Interaction, OrgKind, Reminder, Stage, TaskRow } from '../../types';

export interface AttentionDeal {
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

export interface ExpiringContract {
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

export interface WorkloadRow {
  assignee_contact_id: number | null;
  assignee_name: string | null;
  assignee_org_id: number | null;
  assignee_org_name: string | null;
  assignee_org_kind: OrgKind | null;
  is_me: number | null;
  open_count: number;
  overdue_count: number;
  due_week_count: number;
}

export interface DashboardData {
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
  /** Việc đang mở gom theo người phụ trách; dòng `assignee_contact_id = null` là chưa giao. */
  workload: WorkloadRow[];
  pipeline_totals: Record<Stage, { count: number; sum_vnd: number; weighted_vnd: number }>;
  attention: {
    close_overdue: AttentionDeal[];
    no_next_action: AttentionDeal[];
    stale: AttentionDeal[];
    next_action_overdue: AttentionDeal[];
    top_value: AttentionDeal[];
    score_stale: AttentionDeal[];
    score_veto: AttentionDeal[];
    score_reshape: AttentionDeal[];
    event_near: (AttentionDeal & { event_date: string; event_description: string })[];
    stage_score_gap: (AttentionDeal & { bant_total: number })[];
  };
  expiring_contracts: {
    d30: ExpiringContract[];
    d60: ExpiringContract[];
    d90: ExpiringContract[];
    all?: ExpiringContract[];
  };
  upcoming_reminders: Reminder[];
  recent_interactions: Interaction[];
  recent_boards: {
    id: number;
    name: string;
    color: string;
    customer_name: string | null;
    card_count: number;
  }[];
}

type MetricTone = 'business' | 'danger' | 'warning';

interface MetricItem {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone: MetricTone;
  featured?: boolean;
  to?: string;
  onClick?: () => void;
}

export function KpiSummary({
  data,
  onOpenOverdueTasks,
}: {
  data: DashboardData;
  onOpenOverdueTasks: () => void;
}) {
  const metrics: MetricItem[] = [
    {
      icon: Layers,
      label: 'Tổng pipeline',
      value: formatVNDShort(data.kpi.pipeline_vnd),
      hint: `${data.kpi.open_opportunity_count} cơ hội đang mở`,
      tone: 'business',
      featured: true,
      to: '/pipeline',
    },
    {
      icon: Target,
      label: 'Cơ hội đang mở',
      value: String(data.kpi.open_opportunity_count),
      hint: 'Cơ hội',
      tone: 'business',
      to: '/pipeline',
    },
    {
      icon: Scale,
      label: 'Weighted pipeline',
      value: formatVNDShort(data.kpi.weighted_pipeline_vnd),
      hint: 'Theo xác suất',
      tone: 'business',
      to: '/pipeline',
    },
    {
      icon: TrendingUp,
      label: 'Dự kiến chốt tháng này',
      value: String(data.kpi.closing_this_month_count),
      hint: formatVNDShort(data.kpi.closing_this_month_vnd),
      tone: 'business',
      to: '/pipeline',
    },
    {
      icon: AlertTriangle,
      label: 'Công việc quá hạn',
      value: String(data.kpi.overdue_task_count),
      hint: data.kpi.overdue_task_count > 0 ? 'Cần xử lý ngay' : 'Đang kiểm soát tốt',
      tone: data.kpi.overdue_task_count > 0 ? 'danger' : 'business',
      onClick: onOpenOverdueTasks,
    },
    {
      icon: FileSignature,
      label: 'HĐ sắp hết hạn',
      value: String(data.kpi.expiring_contract_count),
      hint: 'Trong 90 ngày',
      tone: data.kpi.expiring_contract_count > 0 ? 'warning' : 'business',
      to: '/contracts',
    },
  ];

  return (
    <section aria-labelledby="kpi-summary-title">
      <h2 id="kpi-summary-title" className="sr-only">
        Tình hình kinh doanh và cảnh báo chính
      </h2>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-12">
        {metrics.map((metric) => (
          <Metric key={metric.label} {...metric} />
        ))}
      </div>
    </section>
  );
}

function Metric({ icon: Icon, label, value, hint, tone, featured, to, onClick }: MetricItem) {
  const toneClass = featured
    ? 'tr-bento-hero text-tr-text'
    : tone === 'danger'
      ? 'bg-tr-danger/10 text-tr-danger hover:bg-tr-danger/15'
      : tone === 'warning'
        ? 'bg-tr-warning/10 text-tr-warning hover:bg-tr-warning/15'
        : 'bg-tr-panel text-tr-text hover:bg-tr-hover';
  const gridClass = featured ? 'col-span-2 md:col-span-8 md:row-span-2' : 'md:col-span-4';
  const className = `tr-bento-card group flex min-w-0 flex-col justify-between rounded-panel border border-tr-border text-left ${
    featured ? 'min-h-[156px] p-4 sm:p-5' : 'min-h-[76px] p-3'
  } ${gridClass} ${toneClass} ${focusRing}`;
  const supportingTextClass = tone === 'business' ? 'text-tr-muted' : 'text-tr-subtle';
  const content = (
    <>
      <span
        className={`flex min-w-0 items-center gap-1.5 font-medium ${featured ? 'text-sm' : 'text-xs'} ${supportingTextClass}`}
        title={label}
      >
        <span
          className={`flex shrink-0 items-center justify-center rounded-full ${
            featured ? 'h-8 w-8 bg-tr-primary text-tr-on-primary' : 'h-6 w-6 bg-tr-hover'
          }`}
        >
          <Icon size={featured ? 16 : 13} aria-hidden="true" />
        </span>
        <span className="truncate">{label}</span>
      </span>
      <span
        className={`flex min-w-0 gap-1.5 ${featured ? 'mt-4 flex-col items-start' : 'mt-1.5 items-end justify-between'}`}
      >
        <span
          className={`truncate font-bold tracking-[-0.035em] tabular-nums ${
            featured ? 'text-3xl sm:text-4xl' : 'text-xl'
          }`}
        >
          {value}
        </span>
        {hint && (
          <span
            className={`truncate text-2xs font-medium ${
              featured
                ? 'rounded-full bg-[var(--tr-yellow-soft)] px-2.5 py-0.5 text-[var(--tr-on-yellow)]'
                : `pb-0.5 ${supportingTextClass}`
            }`}
          >
            {hint}
          </span>
        )}
      </span>
    </>
  );

  if (to)
    return (
      <Link to={to} className={className} aria-label={`${label}: ${value}`}>
        {content}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} className={className} aria-label={`${label}: ${value}`}>
      {content}
    </button>
  );
}

export type TaskBucketKey = 'overdue' | 'today' | 'tomorrow' | 'next7';

export type RecommendedAction =
  | {
      id: string;
      title: string;
      meta: string;
      tone: 'danger' | 'warning' | 'neutral';
      kind: 'task';
      cardId: number;
    }
  | {
      id: string;
      title: string;
      meta: string;
      tone: 'danger' | 'warning' | 'neutral';
      kind: 'link';
      to: string;
    };

export function buildRecommendedActions(data: DashboardData): RecommendedAction[] {
  const result: RecommendedAction[] = [];
  const seen = new Set<string>();
  const add = (item: RecommendedAction) => {
    if (result.length >= 3 || seen.has(item.id)) return;
    seen.add(item.id);
    result.push(item);
  };

  const urgentOverdue = data.tasks.overdue.find((task) => task.priority === 'urgent');
  if (urgentOverdue) {
    add({
      id: `task-${urgentOverdue.id}`,
      title: urgentOverdue.title,
      meta: `${getDeadlinePresentation(urgentOverdue.due_date, false).primary} · Khẩn cấp`,
      tone: 'danger',
      kind: 'task',
      cardId: urgentOverdue.id,
    });
  }

  const overdueAction = data.attention.next_action_overdue[0];
  if (overdueAction) {
    add({
      id: `deal-${overdueAction.id}`,
      title: overdueAction.next_action || overdueAction.title,
      meta: `${overdueAction.customer_name} · Next Action quá hạn`,
      tone: 'danger',
      kind: 'link',
      to: `/deals/${overdueAction.id}`,
    });
  }

  const riskyDeal = [
    ...data.attention.score_veto,
    ...data.attention.stage_score_gap,
    ...data.attention.close_overdue,
    ...data.attention.no_next_action,
  ].sort((a, b) => b.value_vnd - a.value_vnd)[0];
  if (riskyDeal) {
    add({
      id: `deal-${riskyDeal.id}`,
      title: riskyDeal.title,
      meta: `${riskyDeal.customer_name} · ${formatVNDShort(riskyDeal.value_vnd)} cần chú ý`,
      tone: 'warning',
      kind: 'link',
      to: `/deals/${riskyDeal.id}`,
    });
  }

  const contracts = flattenContracts(data.expiring_contracts);
  if (contracts[0]) {
    const contract = contracts[0];
    add({
      id: `contract-${contract.id}`,
      title: contract.name,
      meta: `${contract.customer_name} · ${contractCountdown(contract.days_left)}`,
      tone: contract.days_left <= 30 ? 'danger' : 'warning',
      kind: 'link',
      to: '/contracts',
    });
  }

  const overdueTask = data.tasks.overdue[0];
  if (overdueTask) {
    add({
      id: `task-${overdueTask.id}`,
      title: overdueTask.title,
      meta: `${getDeadlinePresentation(overdueTask.due_date, false).primary} · ${t.priority[overdueTask.priority]}`,
      tone: 'danger',
      kind: 'task',
      cardId: overdueTask.id,
    });
  }

  const todayTask = data.tasks.today[0];
  if (todayTask) {
    add({
      id: `task-${todayTask.id}`,
      title: todayTask.title,
      meta: `Hôm nay · ${t.priority[todayTask.priority]}`,
      tone: 'warning',
      kind: 'task',
      cardId: todayTask.id,
    });
  }

  const actionableReminder = data.upcoming_reminders.find(
    (reminder) => reminder.card_id || reminder.deal_id || reminder.customer_id
  );
  if (actionableReminder) {
    const to = actionableReminder.deal_id
      ? `/deals/${actionableReminder.deal_id}`
      : actionableReminder.customer_id
        ? `/customers/${actionableReminder.customer_id}`
        : null;
    if (actionableReminder.card_id) {
      add({
        id: `reminder-${actionableReminder.id}`,
        title: actionableReminder.title,
        meta: reminderPresentation(actionableReminder.due_at).label,
        tone: reminderPresentation(actionableReminder.due_at).tone,
        kind: 'task',
        cardId: actionableReminder.card_id,
      });
    } else if (to) {
      add({
        id: `reminder-${actionableReminder.id}`,
        title: actionableReminder.title,
        meta: reminderPresentation(actionableReminder.due_at).label,
        tone: reminderPresentation(actionableReminder.due_at).tone,
        kind: 'link',
        to,
      });
    }
  }

  return result;
}

export function ActionWidget({
  data,
  recommendations,
  onOpenTask,
  onShowTasks,
}: {
  data: DashboardData;
  recommendations: RecommendedAction[];
  onOpenTask: (id: number) => void;
  onShowTasks: (bucket: TaskBucketKey) => void;
}) {
  const futureCount = Math.max(
    0,
    data.task_counts.week - data.task_counts.today - data.task_counts.tomorrow
  );
  const buckets: Record<TaskBucketKey, { label: string; count: number; tasks: TaskRow[] }> = {
    overdue: { label: 'Quá hạn', count: data.task_counts.overdue, tasks: data.tasks.overdue },
    today: { label: 'Hôm nay', count: data.task_counts.today, tasks: data.tasks.today },
    tomorrow: { label: 'Ngày mai', count: data.task_counts.tomorrow, tasks: data.tasks.tomorrow },
    next7: { label: '7 ngày tới', count: futureCount, tasks: data.tasks.next7 },
  };
  const [active, setActive] = useState<TaskBucketKey>(
    () => (Object.keys(buckets) as TaskBucketKey[]).find((key) => buckets[key].count > 0) ?? 'today'
  );
  const selected = buckets[active];
  const recommendedTaskIds = new Set(
    recommendations.filter((item) => item.kind === 'task').map((item) => item.cardId)
  );
  const selectedTasks = selected.tasks.filter((task) => !recommendedTaskIds.has(task.id));

  return (
    <Panel
      title="Cần bạn xử lý"
      className="h-full border-tr-primary/30"
      action={
        <button
          type="button"
          onClick={() => onShowTasks(active)}
          className={`inline-flex items-center gap-1 text-xs font-medium text-tr-primary hover:underline ${focusRing}`}
        >
          Xem tất cả <ChevronRight size={13} aria-hidden="true" />
        </button>
      }
    >
      {recommendations.length > 0 && (
        <div className="mb-3 rounded-panel bg-tr-hover p-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-2xs font-bold tracking-wide text-tr-subtle uppercase">
            <ShieldAlert size={13} className="text-tr-warning" aria-hidden="true" /> Nên ưu tiên
          </div>
          <ol className="grid gap-1 sm:grid-cols-3">
            {recommendations.map((item, index) => (
              <li key={item.id} className="min-w-0">
                <RecommendationItem item={item} index={index + 1} onOpenTask={onOpenTask} />
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Mốc thời gian công việc">
        {(Object.keys(buckets) as TaskBucketKey[]).map((key) => {
          const bucket = buckets[key];
          const selectedBucket = active === key;
          const alert = key === 'overdue' && bucket.count > 0;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={selectedBucket}
              onClick={() => setActive(key)}
              className={`min-h-9 rounded-full border px-3 text-xs font-medium transition sm:min-h-0 sm:py-1.5 ${focusRing} ${
                selectedBucket
                  ? alert
                    ? 'border-tr-danger bg-tr-danger text-tr-on-danger'
                    : 'border-tr-primary bg-tr-primary text-tr-on-primary'
                  : alert
                    ? 'border-tr-danger/30 bg-tr-danger/10 text-tr-danger hover:bg-tr-danger/15'
                    : 'border-tr-border bg-tr-panel text-tr-subtle hover:bg-tr-hover'
              }`}
            >
              {bucket.label}
              {bucket.count > 0 && (
                <span className="ml-1.5 tabular-nums" aria-label={`${bucket.count} công việc`}>
                  {bucket.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedTasks.length === 0 ? (
        <CompactSuccess
          message={
            selected.tasks.length > 0
              ? 'Các công việc ở mốc này đã được đưa vào mục Nên ưu tiên.'
              : `Không có công việc ${selected.label.toLocaleLowerCase('vi')}.`
          }
        />
      ) : (
        <ul className="divide-y divide-tr-border" aria-label={`Công việc ${selected.label}`}>
          {selectedTasks.slice(0, 6).map((task) => (
            <TaskItem key={task.id} task={task} onOpen={onOpenTask} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RecommendationItem({
  item,
  index,
  onOpenTask,
}: {
  item: RecommendedAction;
  index: number;
  onOpenTask: (id: number) => void;
}) {
  const className = `group flex w-full min-w-0 items-start gap-2 rounded-control p-1.5 text-left transition hover:bg-tr-hover-strong ${focusRing}`;
  const content = (
    <>
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-2xs font-bold ${
          item.tone === 'danger'
            ? 'bg-tr-danger/15 text-tr-danger'
            : item.tone === 'warning'
              ? 'bg-tr-warning/15 text-tr-warning'
              : 'bg-tr-primary/10 text-tr-primary'
        }`}
      >
        {index}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-tr-text" title={item.title}>
          {item.title}
        </span>
        <span className="block truncate text-2xs text-tr-subtle">{item.meta}</span>
      </span>
    </>
  );
  return item.kind === 'task' ? (
    <button type="button" onClick={() => onOpenTask(item.cardId)} className={className}>
      {content}
    </button>
  ) : (
    <Link to={item.to} className={className}>
      {content}
    </Link>
  );
}

const deadlineToneClasses: Record<DeadlineTone, string> = {
  danger: 'text-tr-danger',
  warning: 'text-tr-warning',
  soon: 'text-tr-warning',
  normal: 'text-tr-muted',
  done: 'text-tr-muted',
};

function TaskItem({ task, onOpen }: { task: TaskRow; onOpen: (id: number) => void }) {
  const deadline = getDeadlinePresentation(task.due_date, Boolean(task.is_done));
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        className={`group flex min-h-11 w-full min-w-0 items-center gap-2 rounded-control px-1 py-2 text-left transition hover:bg-tr-hover sm:min-h-0 sm:py-1.5 ${focusRing}`}
        aria-label={`Mở công việc ${task.title}`}
      >
        <PriorityBadge priority={task.priority} small />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-tr-text" title={task.title}>
            {task.title}
          </span>
          <span className="block truncate text-2xs text-tr-muted">
            {task.board_name}
            {task.customer_name ? ` · ${task.customer_name}` : ''}
          </span>
        </span>
        {task.due_date && (
          <span
            className={`shrink-0 text-xs font-medium tabular-nums ${deadlineToneClasses[deadline.tone]}`}
          >
            {deadline.primary}
          </span>
        )}
        <ChevronRight
          size={14}
          className="shrink-0 text-tr-muted opacity-0 group-hover:opacity-100"
          aria-hidden="true"
        />
      </button>
    </li>
  );
}

interface ReminderPresentation {
  label: string;
  tone: 'danger' | 'warning' | 'neutral';
  missed: boolean;
}

function reminderPresentation(value: string): ReminderPresentation {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { label: value, tone: 'neutral', missed: false };
  const now = new Date();
  const differenceMs = date.getTime() - now.getTime();
  const missed = differenceMs < 0;
  const minutes = Math.max(1, Math.round(Math.abs(differenceMs) / 60_000));
  const dayDifference = daysFromToday(value) ?? 0;
  const time = date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  if (missed) {
    if (dayDifference < 0)
      return { label: `Quá ${Math.abs(dayDifference)} ngày`, tone: 'danger', missed: true };
    if (minutes >= 60)
      return { label: `Quá ${Math.floor(minutes / 60)} giờ`, tone: 'danger', missed: true };
    return { label: `Quá ${minutes} phút`, tone: 'danger', missed: true };
  }
  if (dayDifference === 0) return { label: `Hôm nay · ${time}`, tone: 'warning', missed: false };
  if (dayDifference === 1) return { label: `Ngày mai · ${time}`, tone: 'warning', missed: false };
  return {
    label: `${formatDateShort(value)} · ${time}`,
    tone: differenceMs <= 48 * 60 * 60 * 1000 ? 'warning' : 'neutral',
    missed: false,
  };
}

export function ReminderWidget({
  reminders,
  onOpenTask,
  excludedIds = new Set<number>(),
}: {
  reminders: Reminder[];
  onOpenTask: (id: number) => void;
  excludedIds?: Set<number>;
}) {
  const items = reminders
    .filter((reminder) => !excludedIds.has(reminder.id))
    .slice(0, 5)
    .map((reminder) => ({
      reminder,
      presentation: reminderPresentation(reminder.due_at),
    }));
  const missed = items.filter((item) => item.presentation.missed);
  const upcoming = items.filter((item) => !item.presentation.missed);

  return (
    <Panel title="Nhắc hẹn" className="tr-bento-dark h-full">
      {items.length === 0 ? (
        <CompactSuccess message="Không có nhắc hẹn đang chờ." />
      ) : (
        <div className="space-y-3">
          {missed.length > 0 && (
            <ReminderGroup label="Đã lỡ" items={missed} onOpenTask={onOpenTask} danger />
          )}
          {upcoming.length > 0 && (
            <ReminderGroup label="Sắp tới" items={upcoming} onOpenTask={onOpenTask} />
          )}
        </div>
      )}
    </Panel>
  );
}

function ReminderGroup({
  label,
  items,
  onOpenTask,
  danger,
}: {
  label: string;
  items: { reminder: Reminder; presentation: ReminderPresentation }[];
  onOpenTask: (id: number) => void;
  danger?: boolean;
}) {
  return (
    <section>
      <h3
        className={`mb-1 text-2xs font-bold tracking-wide uppercase ${danger ? 'text-tr-danger' : 'text-tr-subtle'}`}
      >
        {label} <span className="font-normal text-tr-muted">{items.length}</span>
      </h3>
      <ul className="space-y-0.5">
        {items.map(({ reminder, presentation }) => (
          <li key={reminder.id}>
            <ReminderItem reminder={reminder} presentation={presentation} onOpenTask={onOpenTask} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReminderItem({
  reminder,
  presentation,
  onOpenTask,
}: {
  reminder: Reminder;
  presentation: ReminderPresentation;
  onOpenTask: (id: number) => void;
}) {
  const className = `group flex min-h-10 w-full min-w-0 items-start gap-2 rounded-control px-1.5 py-1.5 text-left transition hover:bg-tr-hover sm:min-h-0 sm:py-1 ${focusRing}`;
  const content = (
    <>
      <Bell
        size={14}
        className={`mt-0.5 shrink-0 ${
          presentation.tone === 'danger'
            ? 'text-tr-danger'
            : presentation.tone === 'warning'
              ? 'text-tr-warning'
              : 'text-tr-muted'
        }`}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-tr-text" title={reminder.title}>
          {reminder.title}
        </span>
        <span
          className={`block truncate text-2xs ${
            presentation.tone === 'danger'
              ? 'font-semibold text-tr-danger'
              : presentation.tone === 'warning'
                ? 'font-medium text-tr-warning'
                : 'text-tr-muted'
          }`}
        >
          {presentation.label}
          {reminder.customer_name ? ` · ${reminder.customer_name}` : ''}
        </span>
      </span>
      {(reminder.card_id || reminder.deal_id || reminder.customer_id) && (
        <ChevronRight
          size={14}
          className="mt-0.5 shrink-0 text-tr-muted opacity-0 group-hover:opacity-100"
          aria-hidden="true"
        />
      )}
    </>
  );

  if (reminder.card_id)
    return (
      <button type="button" onClick={() => onOpenTask(reminder.card_id!)} className={className}>
        {content}
      </button>
    );
  if (reminder.deal_id)
    return (
      <Link to={`/deals/${reminder.deal_id}`} className={className}>
        {content}
      </Link>
    );
  if (reminder.customer_id)
    return (
      <Link to={`/customers/${reminder.customer_id}`} className={className}>
        {content}
      </Link>
    );
  return <div className={className}>{content}</div>;
}

export function PipelineWidget({ data }: { data: DashboardData }) {
  const maxStage = Math.max(
    1,
    ...OPEN_STAGES.map((stage) => data.pipeline_totals[stage]?.sum_vnd ?? 0)
  );
  const hasPipeline = OPEN_STAGES.some((stage) => (data.pipeline_totals[stage]?.count ?? 0) > 0);
  return (
    <Panel
      title="Cơ hội theo giai đoạn"
      className="h-full"
      action={
        <Link
          to="/pipeline"
          className={`inline-flex items-center gap-1 text-xs font-medium text-tr-primary hover:underline ${focusRing}`}
        >
          Mở pipeline <ChevronRight size={13} aria-hidden="true" />
        </Link>
      }
    >
      {!hasPipeline ? (
        <CompactSuccess message="Chưa có cơ hội đang mở trong pipeline." neutral />
      ) : (
        <ul className="space-y-2.5">
          {OPEN_STAGES.map((stage) => {
            const item = data.pipeline_totals[stage] ?? { count: 0, sum_vnd: 0, weighted_vnd: 0 };
            const width = Math.round((item.sum_vnd / maxStage) * 100);
            return (
              <li key={stage}>
                <Link
                  to="/pipeline"
                  className={`group grid min-w-0 grid-cols-[7.25rem_minmax(0,1fr)] items-center gap-x-3 rounded-control py-1 transition hover:bg-tr-hover sm:grid-cols-[8rem_minmax(0,1fr)_6.75rem] ${focusRing}`}
                  aria-label={`${t.stage[stage]}: ${item.count} cơ hội, ${formatVNDShort(item.sum_vnd)}`}
                >
                  <span className="truncate text-xs font-medium text-tr-subtle">
                    {t.stage[stage]}
                  </span>
                  <span
                    className="h-2.5 min-w-0 overflow-hidden rounded-full bg-tr-hover-strong"
                    aria-hidden="true"
                  >
                    <span
                      className="block h-full rounded-full transition-[width] duration-300"
                      style={{ width: `${width}%`, backgroundColor: STAGE_COLORS[stage] }}
                    />
                  </span>
                  <span className="col-start-2 mt-0.5 truncate text-right text-2xs text-tr-muted tabular-nums sm:col-start-auto sm:mt-0 sm:text-xs">
                    <strong className="font-semibold text-tr-text">
                      {formatVNDShort(item.sum_vnd)}
                    </strong>{' '}
                    · {item.count}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

interface AttentionReason {
  label: string;
  group: 'immediate' | 'quality';
}

interface AttentionItem {
  deal: AttentionDeal;
  reasons: AttentionReason[];
  group: 'immediate' | 'quality';
}

function attentionItems(data: DashboardData): AttentionItem[] {
  const map = new Map<number, AttentionItem>();
  const add = (deals: AttentionDeal[], reason: AttentionReason) => {
    for (const deal of deals) {
      const existing = map.get(deal.id);
      if (existing) {
        existing.reasons.push(reason);
        if (reason.group === 'immediate') existing.group = 'immediate';
      } else {
        map.set(deal.id, { deal, reasons: [reason], group: reason.group });
      }
    }
  };

  add(data.attention.next_action_overdue, { label: 'Next Action quá hạn', group: 'immediate' });
  add(data.attention.no_next_action, { label: 'Chưa có hành động tiếp theo', group: 'immediate' });
  add(data.attention.close_overdue, { label: 'Quá ngày dự kiến chốt', group: 'immediate' });
  add(data.attention.stale, { label: 'Không tương tác >14 ngày', group: 'immediate' });
  add(data.attention.score_veto, { label: 'Bị chặn khỏi forecast', group: 'quality' });
  add(data.attention.score_stale, { label: 'Điểm quá hạn', group: 'quality' });
  add(data.attention.score_reshape, { label: 'Cần tái định hình', group: 'quality' });
  add(data.attention.event_near, { label: 'Sự kiện bắt buộc sắp tới', group: 'quality' });
  add(data.attention.stage_score_gap, { label: 'Giai đoạn cao, BANT thấp', group: 'quality' });

  return [...map.values()].sort((a, b) => {
    if (a.group !== b.group) return a.group === 'immediate' ? -1 : 1;
    return b.deal.value_vnd - a.deal.value_vnd;
  });
}

export function AttentionWidget({
  data,
  excludedDealIds = new Set<number>(),
}: {
  data: DashboardData;
  excludedDealIds?: Set<number>;
}) {
  const items = attentionItems(data).filter((item) => !excludedDealIds.has(item.deal.id));
  const immediate = items.filter((item) => item.group === 'immediate');
  const quality = items.filter((item) => item.group === 'quality');
  const shownImmediate = immediate.slice(0, 6);
  const remainingSlots = Math.max(0, 8 - shownImmediate.length);
  const shownQuality = quality.slice(0, remainingSlots);

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          Cơ hội cần chú ý
          {items.length > 0 && (
            <span className="rounded-full bg-tr-warning/15 px-2 py-0.5 text-2xs font-bold text-tr-warning tabular-nums">
              {items.length}
            </span>
          )}
        </span>
      }
      action={
        <Link
          to="/pipeline-health"
          className={`inline-flex items-center gap-1 text-xs font-medium text-tr-primary hover:underline ${focusRing}`}
        >
          Sức khỏe pipeline <ChevronRight size={13} aria-hidden="true" />
        </Link>
      }
    >
      {items.length === 0 ? (
        <CompactSuccess message="Không có cảnh báo cơ hội cần xử lý." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {shownImmediate.length > 0 && (
            <AttentionGroup title="Cần xử lý ngay" items={shownImmediate} danger />
          )}
          {shownQuality.length > 0 && (
            <AttentionGroup title="Rủi ro chất lượng" items={shownQuality} />
          )}
        </div>
      )}
    </Panel>
  );
}

function AttentionGroup({
  title,
  items,
  danger,
}: {
  title: string;
  items: AttentionItem[];
  danger?: boolean;
}) {
  return (
    <section className="min-w-0">
      <h3
        className={`mb-1.5 flex items-center gap-1.5 text-2xs font-bold tracking-wide uppercase ${danger ? 'text-tr-danger' : 'text-tr-warning'}`}
      >
        {danger ? (
          <AlertTriangle size={13} aria-hidden="true" />
        ) : (
          <ShieldAlert size={13} aria-hidden="true" />
        )}
        {title} <span className="font-normal text-tr-muted">{items.length}</span>
      </h3>
      <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {items.map(({ deal, reasons }) => (
          <li key={deal.id} className="min-w-0">
            <Link
              to={`/deals/${deal.id}`}
              className={`group block min-w-0 rounded-control border border-tr-border px-2.5 py-2 transition hover:border-tr-primary/40 hover:bg-tr-hover ${focusRing}`}
            >
              <span className="flex min-w-0 items-start gap-2">
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-sm font-semibold text-tr-text"
                    title={deal.title}
                  >
                    {deal.title}
                  </span>
                  <span className="block truncate text-2xs text-tr-muted">
                    {deal.customer_name} · {formatVNDShort(deal.value_vnd)}
                  </span>
                </span>
                <ColorBadge color={STAGE_COLORS[deal.stage]} small>
                  {t.stage[deal.stage]}
                </ColorBadge>
              </span>
              <span className="mt-1.5 flex min-w-0 items-center gap-1 overflow-hidden">
                {reasons.slice(0, 2).map((reason) => (
                  <span
                    key={reason.label}
                    className={`truncate rounded-full border px-1.5 py-0.5 text-2xs font-medium ${
                      reason.group === 'immediate'
                        ? 'border-tr-danger/25 bg-tr-danger/10 text-tr-danger'
                        : 'border-tr-warning/25 bg-tr-warning/10 text-tr-warning'
                    }`}
                    title={reason.label}
                  >
                    {reason.label}
                  </span>
                ))}
                {reasons.length > 2 && (
                  <span className="shrink-0 text-2xs text-tr-muted">+{reasons.length - 2}</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function flattenContracts(groups: DashboardData['expiring_contracts']): ExpiringContract[] {
  const contracts = groups.all ?? [...groups.d30, ...groups.d60, ...groups.d90];
  return [...new Map(contracts.map((contract) => [contract.id, contract])).values()].sort(
    (a, b) => a.days_left - b.days_left
  );
}

function contractCountdown(daysLeft: number): string {
  if (daysLeft < 0) return `Quá hạn ${Math.abs(daysLeft)} ngày`;
  if (daysLeft === 0) return 'Hết hạn hôm nay';
  return `Còn ${daysLeft} ngày`;
}

/**
 * Việc đang mở nằm ở ai — sắp theo số việc quá hạn giảm dần, nên dòng đầu tiên
 * luôn là người cần nhắc trước.
 *
 * Dòng "Chưa giao" cố ý không bị lọc bỏ: một việc không có ai chịu trách nhiệm là
 * rủi ro lớn hơn một việc trễ hạn có người theo.
 */
export function WorkloadWidget({
  data,
  onSelectAssignee,
}: {
  data: DashboardData;
  onSelectAssignee: (assignee: number | 'none') => void;
}) {
  const rows = data.workload ?? [];
  const totalOpen = rows.reduce((sum, row) => sum + row.open_count, 0);

  return (
    <Panel
      title="Việc theo người phụ trách"
      className="h-full"
      action={
        <Link
          to="/tasks"
          className={`inline-flex items-center gap-1 text-xs font-medium text-tr-primary hover:underline ${focusRing}`}
        >
          Xem tất cả <ChevronRight size={13} aria-hidden="true" />
        </Link>
      }
    >
      {rows.length === 0 ? (
        <CompactSuccess message="Không có việc nào đang mở." />
      ) : (
        <ul className="space-y-1">
          {rows.slice(0, 6).map((row) => (
            <li key={row.assignee_contact_id ?? 'unassigned'}>
              <button
                type="button"
                onClick={() => onSelectAssignee(row.assignee_contact_id ?? 'none')}
                aria-label={`${row.assignee_name ?? t.card.unassigned}: ${row.open_count} việc đang mở, ${row.overdue_count} quá hạn`}
                className={`group flex min-h-11 w-full items-center gap-2 rounded-control px-1.5 py-2 text-left transition hover:bg-tr-hover sm:min-h-0 sm:py-1.5 ${focusRing}`}
              >
                <span className="min-w-0 flex-1 truncate text-sm">
                  {row.assignee_name ? (
                    <AssigneeChip
                      name={row.assignee_name}
                      orgKind={row.assignee_org_kind}
                      orgName={row.assignee_org_name}
                    />
                  ) : (
                    <span className="text-tr-muted italic">{t.card.unassigned}</span>
                  )}
                </span>
                {row.overdue_count > 0 && (
                  <span className="shrink-0 rounded-full bg-tr-danger/15 px-2 py-0.5 text-2xs font-semibold text-tr-danger">
                    {row.overdue_count} quá hạn
                  </span>
                )}
                {row.due_week_count > 0 && (
                  <span className="shrink-0 rounded-full bg-tr-warning/15 px-2 py-0.5 text-2xs font-medium text-tr-warning">
                    {row.due_week_count} tuần này
                  </span>
                )}
                <span className="shrink-0 text-sm font-semibold tabular-nums text-tr-text">
                  {row.open_count}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 6 && (
        <p className="mt-2 text-xs text-tr-muted">
          Còn {rows.length - 6} người khác · tổng {totalOpen} việc đang mở.
        </p>
      )}
    </Panel>
  );
}

export function ContractsWidget({ data }: { data: DashboardData }) {
  const contracts = flattenContracts(data.expiring_contracts);
  return (
    <Panel
      title="Hợp đồng sắp hết hạn"
      className="h-full"
      action={
        <Link
          to="/contracts"
          className={`inline-flex items-center gap-1 text-xs font-medium text-tr-primary hover:underline ${focusRing}`}
        >
          Xem tất cả <ChevronRight size={13} aria-hidden="true" />
        </Link>
      }
    >
      {contracts.length === 0 ? (
        <CompactSuccess message="Không có hợp đồng hết hạn trong 90 ngày tới." />
      ) : (
        <ul className="space-y-1">
          {contracts.slice(0, 5).map((contract) => {
            const urgent = contract.days_left <= 30;
            const warning = contract.days_left > 30 && contract.days_left <= 60;
            return (
              <li key={contract.id}>
                <Link
                  to="/contracts"
                  className={`group flex min-h-11 min-w-0 items-start gap-2 rounded-control px-1.5 py-2 transition hover:bg-tr-hover sm:min-h-0 sm:py-1.5 ${focusRing}`}
                  aria-label={`${contract.name}, ${contractCountdown(contract.days_left)}`}
                >
                  <span
                    className={`w-[4.75rem] shrink-0 rounded-control px-1.5 py-1 text-center text-2xs font-bold tabular-nums ${
                      urgent
                        ? 'bg-tr-danger/10 text-tr-danger'
                        : warning
                          ? 'bg-tr-warning/10 text-tr-warning'
                          : 'bg-tr-hover text-tr-subtle'
                    }`}
                  >
                    {contractCountdown(contract.days_left)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-sm font-medium text-tr-text"
                      title={contract.name}
                    >
                      {contract.name}
                    </span>
                    <span className="block truncate text-2xs text-tr-muted">
                      {contract.customer_name} · {formatDate(contract.end_date)}
                    </span>
                  </span>
                  <ChevronRight
                    size={14}
                    className="mt-0.5 shrink-0 text-tr-muted opacity-0 group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function activityWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const dayDifference = daysFromToday(value);
  const time = date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  if (dayDifference === 0) return time;
  if (dayDifference === -1) return `Hôm qua · ${time}`;
  return `${formatDateShort(value)} · ${time}`;
}

export function RecentActivityWidget({ interactions }: { interactions: Interaction[] }) {
  return (
    <Panel title="Hoạt động gần đây" className="h-full">
      {interactions.length === 0 ? (
        <CompactSuccess message="Chưa có hoạt động gần đây." neutral />
      ) : (
        <ul className="space-y-0.5">
          {interactions.slice(0, 4).map((item) => (
            <li key={item.id}>
              <Link
                to={`/customers/${item.customer_id}`}
                className={`group flex min-h-11 min-w-0 items-start gap-2 rounded-control px-1.5 py-2 transition hover:bg-tr-hover sm:min-h-0 sm:py-1.5 ${focusRing}`}
              >
                <Activity
                  size={14}
                  className="mt-0.5 shrink-0 text-tr-primary"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5 text-2xs text-tr-muted">
                    <span className="shrink-0 font-medium text-tr-subtle">
                      {activityWhen(item.occurred_at)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{t.interactionType[item.type]}</span>
                  </span>
                  <span className="block truncate text-sm font-semibold text-tr-text">
                    {item.customer_name}
                  </span>
                  <span className="block truncate text-xs text-tr-subtle" title={item.summary}>
                    {item.summary}
                  </span>
                </span>
                <ChevronRight
                  size={14}
                  className="mt-0.5 shrink-0 text-tr-muted opacity-0 group-hover:opacity-100"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function BoardSummaryWidget({ boards }: { boards: DashboardData['recent_boards'] }) {
  return (
    <Panel
      title="Bảng công việc"
      className="h-full"
      action={
        <Link
          to="/boards"
          className={`inline-flex items-center gap-1 text-xs font-medium text-tr-primary hover:underline ${focusRing}`}
        >
          Xem tất cả <ChevronRight size={13} aria-hidden="true" />
        </Link>
      }
    >
      {boards.length === 0 ? (
        <CompactSuccess message={t.board.noBoards} neutral />
      ) : (
        <ul className="space-y-1">
          {boards.slice(0, 4).map((board) => (
            <li key={board.id}>
              <Link
                to={`/boards/${board.id}`}
                className={`group flex min-h-11 min-w-0 items-center gap-2.5 rounded-control px-1.5 py-2 transition hover:bg-tr-hover sm:min-h-0 sm:py-1.5 ${focusRing}`}
              >
                <span
                  className="h-8 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: board.color }}
                  aria-hidden="true"
                />
                <Columns3 size={15} className="shrink-0 text-tr-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-sm font-semibold text-tr-text"
                    title={board.name}
                  >
                    {board.name}
                  </span>
                  <span className="block truncate text-2xs text-tr-muted">
                    {board.card_count > 0 ? (
                      <>{board.card_count} việc đang mở</>
                    ) : (
                      <span className="text-tr-success">Không có việc đang mở</span>
                    )}
                    {board.customer_name ? ` · ${board.customer_name}` : ''}
                  </span>
                </span>
                <ChevronRight
                  size={14}
                  className="shrink-0 text-tr-muted opacity-0 group-hover:opacity-100"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function CompactSuccess({ message, neutral }: { message: string; neutral?: boolean }) {
  return (
    <div
      className={`flex min-h-20 items-center justify-center gap-2 rounded-control px-3 py-4 text-center text-sm ${neutral ? 'text-tr-muted' : 'text-tr-success'}`}
    >
      {neutral ? (
        <ListTodo size={16} aria-hidden="true" />
      ) : (
        <CheckCircle2 size={16} aria-hidden="true" />
      )}
      <span>{message}</span>
    </div>
  );
}
