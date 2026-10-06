import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  Activity,
  Award,
  CalendarClock,
  CheckSquare2,
  CircleDollarSign,
  FileSignature,
  FileText,
  Gift,
  History,
  ListPlus,
  MessageSquarePlus,
  Receipt,
  RefreshCcw,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../../api/client';
import { t } from '../../i18n/vi';
import { CARE_TIER_LABELS } from '../../lib/customerCare';
import { formatDate, formatDateTime, formatVND, formatVNDShort } from '../../lib/format';
import { useUiStore } from '../../stores/uiStore';
import type { CustomerFull, CustomerOverviewData, TimelineEntry } from '../../types';
import { Button, ErrorState, Panel, Skeleton } from '../common/ui';
import { CareAssistant } from './CareAssistant';
import { CustomerSuggestions } from './CustomerSuggestions';
import { StakeholderMap } from './StakeholderMap';
import { formatActionDate, getCustomerHealth, getNextCustomerAction } from './customerInsights';
import { isClosedStage, pickLabel, stageLabel } from '../../lib/crmConfig';

type GoTab = 'contacts' | 'interactions' | 'contracts' | 'services' | 'quotations' | 'tasks';

/**
 * Tab Tổng quan của hồ sơ khách hàng (v54) — một chỗ trả lời: khách đang ổn hay
 * có rủi ro, việc gì làm tiếp, ai quyết định, sắp có mốc gì, nên bán thêm gì.
 */
export function CustomerOverviewTab({
  customer,
  onGoTab,
  onCreateDeal,
}: {
  customer: CustomerFull;
  onGoTab: (tab: GoTab) => void;
  onCreateDeal: () => void;
}) {
  const openTaskComposer = useUiStore((s) => s.openTaskComposer);
  const [careOpen, setCareOpen] = useState(false);
  const overview = useQuery({
    queryKey: ['customer', customer.id, 'overview'],
    queryFn: () => api.get<CustomerOverviewData>(`/api/customers/${customer.id}/overview`),
  });

  if (overview.error) return <ErrorState onRetry={() => overview.refetch()} />;
  const data = overview.data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <HealthCard customer={customer} data={data} onAi={() => setCareOpen(true)} />
        <NextActionCard
          customer={customer}
          onLog={() => onGoTab('interactions')}
          onTask={() => openTaskComposer({ context: { customer_id: customer.id } })}
          onDeal={onCreateDeal}
        />
        <UpcomingCard data={data} onGoTab={onGoTab} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {data ? (
            <CustomerSuggestions
              customerId={customer.id}
              suggestions={data.suggestions}
              stats={data.suggestion_stats}
            />
          ) : (
            <Skeleton className="h-40 rounded-panel" />
          )}
        </div>
        <StakeholderMap
          contacts={customer.contacts}
          deals={customer.deals}
          onManage={() => onGoTab('contacts')}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {data ? <RevenueCard data={data} /> : <Skeleton className="h-48 rounded-panel" />}
        <div className="lg:col-span-2">
          {data ? (
            <TimelineCard entries={data.timeline} />
          ) : (
            <Skeleton className="h-48 rounded-panel" />
          )}
        </div>
      </div>

      <CareAssistant
        open={careOpen}
        onClose={() => setCareOpen(false)}
        customerId={customer.id}
        contacts={customer.contacts}
      />
    </div>
  );
}

/* ---------- Sức khỏe & chăm sóc ---------- */

const HEALTH_TONE = {
  good: 'bg-tr-success/10 text-tr-success',
  attention: 'bg-tr-warning/10 text-tr-warning',
  risk: 'bg-tr-danger/10 text-tr-danger',
  new: 'bg-tr-hover text-tr-subtle',
} as const;

const CHURN_TONE = {
  low: { label: 'Thấp', bar: 'bg-tr-success', text: 'text-tr-success' },
  medium: { label: 'Trung bình', bar: 'bg-tr-warning', text: 'text-tr-warning' },
  high: { label: 'Cao', bar: 'bg-tr-danger', text: 'text-tr-danger' },
} as const;

function careLine(data: CustomerOverviewData): { text: string; danger: boolean } {
  const { care } = data;
  if (care.state === 'never')
    return { text: `Chưa có tương tác nào — cần liên hệ ngay`, danger: true };
  if (care.state === 'overdue')
    return { text: `Quá nhịp ${care.days_overdue} ngày — cần liên hệ`, danger: true };
  if (care.state === 'due_soon')
    return {
      text:
        care.days_overdue === 0
          ? 'Đến hạn liên hệ hôm nay'
          : `Đến hạn liên hệ sau ${-care.days_overdue} ngày`,
      danger: false,
    };
  return { text: `Lần liên hệ tới: ${formatDate(care.next_contact_due)}`, danger: false };
}

/**
 * Sức khỏe chung dùng ngưỡng cố định 14/30 ngày; hồ sơ 360 biết nhịp riêng của
 * khách (VIP 14 ngày, Ít ưu tiên 90 ngày…). Quá nhịp thì ít nhất "Cần chú ý", quá
 * nửa nhịp trở lên thì "Rủi ro" — để nhãn không mâu thuẫn với dòng nhịp ngay dưới.
 */
export function healthWithCadence(
  health: ReturnType<typeof getCustomerHealth>,
  data: CustomerOverviewData | undefined
): ReturnType<typeof getCustomerHealth> {
  if (!data) return health;
  const { care } = data;
  const onlyInactivity = /ngày chưa tương tác$/.test(health.reason);
  if (care.state !== 'overdue' && care.state !== 'never') {
    /* Trong nhịp: ngưỡng chung 14/30 ngày không được hạ khách ít ưu tiên (nhịp 90). */
    return onlyInactivity
      ? { level: 'good', label: 'Tốt', reason: 'Đang trong nhịp chăm sóc' }
      : health;
  }
  if (health.level === 'risk' && !onlyInactivity) return health;
  const reason = care.last_contact_at
    ? `Quá nhịp liên hệ ${care.days_overdue} ngày (nhịp ${care.cadence_days} ngày)`
    : 'Chưa tương tác lần nào';
  return care.days_overdue * 2 >= care.cadence_days || care.state === 'never'
    ? { level: 'risk', label: 'Rủi ro', reason }
    : { level: 'attention', label: 'Cần chú ý', reason };
}

function HealthCard({
  customer,
  data,
  onAi,
}: {
  customer: CustomerFull;
  data: CustomerOverviewData | undefined;
  onAi: () => void;
}) {
  const health = healthWithCadence(getCustomerHealth(customer), data);
  const line = data ? careLine(data) : null;
  const churn = data ? CHURN_TONE[data.churn.level] : null;
  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          <Activity size={16} aria-hidden="true" /> Sức khỏe khách hàng
        </span>
      }
      action={
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${HEALTH_TONE[health.level]}`}
          title={health.reason}
        >
          {health.label}
        </span>
      }
    >
      <p className="text-sm text-tr-subtle">{health.reason}</p>
      {data && line && churn ? (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-xs text-tr-muted">Hạng chăm sóc</dt>
              <dd className="font-medium text-tr-text">
                {CARE_TIER_LABELS[data.care.tier]} · {data.care.cadence_days} ngày
                {data.care.cadence_source === 'custom' && ' (đặt riêng)'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-tr-muted">Liên hệ gần nhất</dt>
              <dd className="font-medium text-tr-text">
                {data.care.last_contact_at ? formatDate(data.care.last_contact_at) : '—'}
              </dd>
            </div>
          </dl>
          <p
            className={`mt-2 text-sm font-medium ${line.danger ? 'text-tr-danger' : 'text-tr-text'}`}
          >
            {line.text}
          </p>
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-tr-muted">Nguy cơ mất khách</span>
              <span className={`font-semibold ${churn.text}`}>
                {churn.label} · {data.churn.score}/100
              </span>
            </div>
            <div
              className="mt-1 h-1.5 overflow-hidden rounded-full bg-tr-hover"
              role="meter"
              aria-label="Nguy cơ mất khách"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={data.churn.score}
            >
              <div
                className={`h-full rounded-full ${churn.bar}`}
                style={{ width: `${Math.max(4, data.churn.score)}%` }}
              />
            </div>
            {data.churn.factors.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-tr-subtle">
                {data.churn.factors.map((f) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <Skeleton className="mt-3 h-24" />
      )}
      <Button size="sm" className="mt-3" onClick={onAi}>
        <Sparkles size={14} className="text-tr-primary" aria-hidden="true" /> AI soạn tin chăm sóc
      </Button>
    </Panel>
  );
}

/* ---------- Việc tiếp theo ---------- */

function NextActionCard({
  customer,
  onLog,
  onTask,
  onDeal,
}: {
  customer: CustomerFull;
  onLog: () => void;
  onTask: () => void;
  onDeal: () => void;
}) {
  const next = getNextCustomerAction(customer);
  const openDeals = customer.deals.filter((d) => !isClosedStage(d.stage));
  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          <CalendarClock size={16} aria-hidden="true" /> Việc tiếp theo
        </span>
      }
    >
      <div
        className={`rounded-control border p-3 ${next?.overdue ? 'border-tr-danger/50 bg-tr-danger/10' : 'border-tr-border'}`}
      >
        {next ? (
          <>
            <p className="font-medium text-tr-text">{next.title}</p>
            <p
              className={`mt-0.5 text-xs ${next.overdue ? 'font-medium text-tr-danger' : 'text-tr-muted'}`}
            >
              {formatActionDate(next.date)} ·{' '}
              {next.kind === 'deal' ? 'Cơ hội' : next.kind === 'task' ? 'Công việc' : 'Nhắc hẹn'}
            </p>
          </>
        ) : (
          <p className="text-sm text-tr-muted">
            {openDeals.length > 0
              ? 'Cơ hội đang mở chưa có Next Action.'
              : 'Chưa có việc tiếp theo.'}
          </p>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Metric label="Cơ hội mở" value={String(openDeals.length)} />
        <Metric
          label="Pipeline"
          value={formatVNDShort(customer.open_pipeline_vnd)}
          title={formatVND(customer.open_pipeline_vnd)}
        />
        <Metric
          label="Việc quá hạn"
          value={String(customer.overdue_task_count ?? 0)}
          danger={(customer.overdue_task_count ?? 0) > 0}
        />
      </dl>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button size="sm" variant="primary" onClick={onLog}>
          <MessageSquarePlus size={14} aria-hidden="true" /> Ghi tương tác
        </Button>
        <Button size="sm" onClick={onTask}>
          <ListPlus size={14} aria-hidden="true" /> Tạo việc
        </Button>
        <Button size="sm" onClick={onDeal}>
          <CircleDollarSign size={14} aria-hidden="true" /> Tạo cơ hội
        </Button>
      </div>
    </Panel>
  );
}

function Metric({
  label,
  value,
  title,
  danger,
}: {
  label: string;
  value: string;
  title?: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-control border border-tr-border p-2" title={title}>
      <dd
        className={`truncate text-base font-semibold tabular-nums ${danger ? 'text-tr-danger' : 'text-tr-text'}`}
      >
        {value}
      </dd>
      <dt className="truncate text-xs text-tr-muted">{label}</dt>
    </div>
  );
}

/* ---------- Sắp tới: hết hạn + sinh nhật / kỷ niệm ---------- */

const EXPIRING_META: Record<
  CustomerOverviewData['expiring'][number]['kind'],
  { icon: LucideIcon; label: string; tab: GoTab }
> = {
  contract: { icon: FileSignature, label: 'Hợp đồng hết hạn', tab: 'contracts' },
  service: { icon: RefreshCcw, label: 'Dịch vụ đến hạn', tab: 'services' },
  quotation: { icon: Receipt, label: 'Báo giá hết hiệu lực', tab: 'quotations' },
};

function UpcomingCard({
  data,
  onGoTab,
}: {
  data: CustomerOverviewData | undefined;
  onGoTab: (tab: GoTab) => void;
}) {
  const items = data
    ? [
        ...data.expiring.map((e) => ({
          key: `${e.kind}-${e.id}`,
          date: e.end_date,
          icon: EXPIRING_META[e.kind].icon,
          title: e.name,
          meta: `${EXPIRING_META[e.kind].label} · còn ${e.days_left} ngày`,
          danger: e.days_left <= 30,
          onClick: () => onGoTab(EXPIRING_META[e.kind].tab),
        })),
        ...data.upcoming.map((u) => ({
          key: `${u.kind}-${u.contact_id ?? u.contract_id}-${u.date}`,
          date: u.date,
          icon: u.kind === 'birthday' ? Gift : Award,
          title: u.title,
          meta: u.kind === 'birthday' ? 'Gửi lời chúc' : 'Gửi lời cảm ơn / tri ân',
          danger: false,
          onClick: () => onGoTab(u.kind === 'birthday' ? 'contacts' : 'contracts'),
        })),
      ].sort((a, b) => a.date.localeCompare(b.date))
    : null;

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          <CalendarClock size={16} aria-hidden="true" /> Sắp tới
        </span>
      }
    >
      {!items ? (
        <Skeleton className="h-28" />
      ) : items.length === 0 ? (
        <p className="text-sm text-tr-muted">
          Không có hợp đồng, dịch vụ, báo giá hết hạn trong 90 ngày hay sinh nhật / kỷ niệm trong 60
          ngày tới.
        </p>
      ) : (
        <ul className="space-y-1">
          {items.slice(0, 8).map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={item.onClick}
                  className="flex w-full items-start gap-2 rounded-control px-1.5 py-1.5 text-left hover:bg-tr-hover"
                >
                  <Icon
                    size={15}
                    className={`mt-0.5 shrink-0 ${item.danger ? 'text-tr-danger' : 'text-tr-primary'}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-tr-text">
                      {item.title}
                    </span>
                    <span className="block text-xs text-tr-muted">
                      {formatDate(item.date)} · {item.meta}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ---------- Doanh thu ---------- */

function RevenueCard({ data }: { data: CustomerOverviewData }) {
  const { by_year, won_by_year, by_service } = data.revenue;
  const years = [...new Set([...by_year.map((y) => y.year), ...won_by_year.map((y) => y.year)])]
    .sort()
    .reverse()
    .slice(0, 5);
  const rows = years.map((year) => ({
    year,
    revenue: by_year.find((y) => y.year === year)?.amount_vnd ?? 0,
    paid: by_year.find((y) => y.year === year)?.paid_vnd ?? 0,
    won: won_by_year.find((y) => y.year === year)?.won_vnd ?? 0,
  }));
  const max = Math.max(1, ...rows.map((r) => r.revenue));
  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          <TrendingUp size={16} aria-hidden="true" /> Doanh thu theo năm
        </span>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-tr-muted">Chưa có doanh thu dịch vụ hay cơ hội thắng.</p>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">
            Doanh thu dịch vụ, đã thu và giá trị cơ hội thắng theo năm
          </caption>
          <thead className="text-xs text-tr-muted">
            <tr>
              <th scope="col" className="pb-1 text-left font-medium">
                Năm
              </th>
              <th scope="col" className="pb-1 text-left font-medium">
                Doanh thu dịch vụ
              </th>
              <th scope="col" className="pb-1 text-right font-medium">
                Cơ hội thắng
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.year}
                title={`${r.year}: doanh thu ${formatVND(r.revenue)}, đã thu ${formatVND(r.paid)}, cơ hội thắng ${formatVND(r.won)}`}
              >
                <th
                  scope="row"
                  className="py-1 pr-2 text-left font-medium text-tr-text tabular-nums"
                >
                  {r.year}
                </th>
                <td className="py-1 pr-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-tr-hover">
                      <div
                        className="h-full rounded-full bg-tr-primary"
                        style={{ width: `${(r.revenue / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-xs text-tr-subtle tabular-nums">
                      {formatVNDShort(r.revenue)}
                    </span>
                  </div>
                </td>
                <td className="py-1 text-right text-xs text-tr-subtle tabular-nums">
                  {formatVNDShort(r.won)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {by_service.length > 0 && (
        <>
          <h3 className="mt-4 mb-1 text-xs font-semibold text-tr-subtle">Theo dịch vụ</h3>
          <ul className="space-y-1 text-sm">
            {by_service.slice(0, 6).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-tr-text">
                  {s.service_name}
                  {s.status !== 'using' && (
                    <span className="ml-1 text-xs text-tr-muted">
                      ({t.serviceStatus[s.status] ?? s.status})
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-tr-subtle tabular-nums">
                  {formatVNDShort(s.amount_vnd)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

/* ---------- Dòng thời gian gộp ---------- */

const TIMELINE_META: Record<TimelineEntry['kind'], { icon: LucideIcon; label: string }> = {
  interaction: { icon: MessageSquarePlus, label: 'Tương tác' },
  deal_created: { icon: CircleDollarSign, label: 'Tạo cơ hội' },
  deal_stage: { icon: TrendingUp, label: 'Đổi giai đoạn' },
  quotation: { icon: Receipt, label: 'Báo giá' },
  contract: { icon: FileSignature, label: 'Hợp đồng' },
  task_done: { icon: CheckSquare2, label: 'Hoàn thành việc' },
  document: { icon: FileText, label: 'Tài liệu' },
};

function timelineMeta(entry: TimelineEntry): string {
  switch (entry.kind) {
    case 'interaction':
      return [pickLabel('interaction_type', entry.sub_type ?? '') || 'Tương tác', entry.meta]
        .filter(Boolean)
        .join(' · ');
    case 'deal_stage': {
      const [from, to] = entry.meta.split('→');
      return `${from ? stageLabel(from) : '—'} → ${stageLabel(to)}`;
    }
    case 'quotation':
      return t.quotationStatus[entry.meta as keyof typeof t.quotationStatus] ?? entry.meta;
    case 'contract':
      return t.contractStatus[entry.meta as keyof typeof t.contractStatus] ?? entry.meta;
    case 'document':
      return pickLabel('doc_type', entry.meta);
    default:
      return '';
  }
}

function TimelineCard({ entries }: { entries: TimelineEntry[] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? entries : entries.slice(0, 12);
  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          <History size={16} aria-hidden="true" /> Dòng thời gian
        </span>
      }
    >
      {entries.length === 0 ? (
        <p className="text-sm text-tr-muted">Chưa có hoạt động nào được ghi nhận.</p>
      ) : (
        <>
          <ol className="space-y-3 border-s border-tr-border ps-4">
            {shown.map((entry, index) => {
              const meta = TIMELINE_META[entry.kind];
              const Icon = meta.icon;
              return (
                <li key={`${entry.kind}-${entry.at}-${index}`} className="relative">
                  <span
                    className="absolute top-0.5 -left-[1.6rem] flex h-5 w-5 items-center justify-center rounded-full border border-tr-border bg-tr-panel"
                    aria-hidden="true"
                  >
                    <Icon size={11} className="text-tr-primary" />
                  </span>
                  <p className="text-sm font-medium text-tr-text">
                    {entry.deal_id && entry.kind !== 'interaction' ? (
                      <Link to={`/deals/${entry.deal_id}`} className="hover:underline">
                        {entry.title}
                      </Link>
                    ) : (
                      entry.title
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-tr-muted">
                    <span className="font-medium text-tr-subtle">{meta.label}</span>
                    {[timelineMeta(entry), formatDateTime(entry.at)]
                      .filter(Boolean)
                      .map((part) => ` · ${part}`)
                      .join('')}
                  </p>
                </li>
              );
            })}
          </ol>
          {entries.length > 12 && (
            <Button size="sm" className="mt-3" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Thu gọn' : `Xem thêm ${entries.length - 12} hoạt động`}
            </Button>
          )}
        </>
      )}
    </Panel>
  );
}
