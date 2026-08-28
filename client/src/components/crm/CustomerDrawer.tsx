import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarClock,
  CheckSquare2,
  CircleDollarSign,
  Globe2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
} from 'lucide-react';
import { Link } from 'react-router';
import { api } from '../../api/client';
import { ACCOUNT_STATUS_COLORS, STAGE_COLORS, t } from '../../i18n/vi';
import { formatDate, formatDateTime, formatVND, formatVNDShort, isOverdue } from '../../lib/format';
import type { Customer, CustomerFull } from '../../types';
import { Drawer } from '../common/Drawer';
import { Button, ColorBadge, ErrorState, Skeleton } from '../common/ui';
import { EntityLabels } from '../labels/EntityLabels';
import {
  formatActionDate,
  formatRelativePast,
  getCustomerHealth,
  getNextCustomerAction,
} from './customerInsights';

type Props = {
  customer: Customer | null;
  onClose: () => void;
  onEdit: (customer: Customer) => void;
  onCreateDeal: (customerId: number) => void;
};

export function CustomerDrawer({ customer, onClose, onEdit, onCreateDeal }: Props) {
  const {
    data: full,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['customer', customer?.id],
    queryFn: () => api.get<CustomerFull>(`/api/customers/${customer!.id}/full`),
    enabled: Boolean(customer),
  });

  const displayCustomer = full ?? customer;

  return (
    <Drawer
      open={Boolean(customer)}
      onClose={onClose}
      width="w-[min(34rem,100vw)]"
      title={
        displayCustomer ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate">{displayCustomer.name}</span>
            <ColorBadge color={ACCOUNT_STATUS_COLORS[displayCustomer.status]} small>
              {t.accountStatus[displayCustomer.status]}
            </ColorBadge>
          </div>
        ) : (
          'Hồ sơ khách hàng'
        )
      }
    >
      {isLoading || !displayCustomer ? (
        <DrawerSkeleton />
      ) : error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => onCreateDeal(displayCustomer.id)}>
              <Plus size={15} aria-hidden="true" /> Thêm cơ hội
            </Button>
            <Button onClick={() => onEdit(displayCustomer)}>
              <Pencil size={15} aria-hidden="true" /> Chỉnh sửa
            </Button>
            <Link
              to={`/customers/${displayCustomer.id}`}
              className="ml-auto inline-flex min-h-[44px] items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-medium text-tr-primary transition hover:bg-tr-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-primary fine:min-h-[32px]"
            >
              Hồ sơ đầy đủ <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </div>

          <section aria-labelledby="drawer-customer-contact">
            <div className="flex items-center justify-between gap-3">
              <h3
                id="drawer-customer-contact"
                className="text-xs font-semibold tracking-wide text-tr-subtle uppercase"
              >
                Thông tin chính
              </h3>
              <EntityLabels entityType="customer" entityId={displayCustomer.id} />
            </div>
            <div className="mt-2 grid gap-1.5 rounded-panel border border-tr-border bg-tr-surface/60 p-3 text-sm">
              <InfoLine
                icon={BriefcaseBusiness}
                label="Ngành nghề"
                value={displayCustomer.industry || '—'}
              />
              <InfoLine
                icon={Phone}
                label="Điện thoại"
                value={
                  displayCustomer.phone ? (
                    <a
                      className="text-tr-primary hover:underline"
                      href={`tel:${displayCustomer.phone}`}
                    >
                      {displayCustomer.phone}
                    </a>
                  ) : (
                    '—'
                  )
                }
              />
              <InfoLine
                icon={Mail}
                label="Email"
                value={
                  displayCustomer.email ? (
                    <a
                      className="break-all text-tr-primary hover:underline"
                      href={`mailto:${displayCustomer.email}`}
                    >
                      {displayCustomer.email}
                    </a>
                  ) : (
                    '—'
                  )
                }
              />
              <InfoLine
                icon={Globe2}
                label="Website"
                value={
                  displayCustomer.website ? (
                    <a
                      className="break-all text-tr-primary hover:underline"
                      href={absoluteUrl(displayCustomer.website)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {displayCustomer.website}
                    </a>
                  ) : (
                    '—'
                  )
                }
              />
              <InfoLine icon={MapPin} label="Địa chỉ" value={displayCustomer.address || '—'} />
            </div>
          </section>

          {full && <CustomerOverview customer={full} />}
        </div>
      )}
    </Drawer>
  );
}

function CustomerOverview({ customer }: { customer: CustomerFull }) {
  const health = getCustomerHealth(customer);
  const nextAction = getNextCustomerAction(customer);
  const openDeals = customer.deals.filter((deal) => !['won', 'lost'].includes(deal.stage));
  const openTasks = customer.tasks.filter((task) => !task.is_done);

  return (
    <>
      <section aria-labelledby="drawer-customer-overview">
        <div className="flex items-center justify-between gap-3">
          <h3
            id="drawer-customer-overview"
            className="text-xs font-semibold tracking-wide text-tr-subtle uppercase"
          >
            Tổng quan vận hành
          </h3>
          <HealthPill level={health.level} label={health.label} reason={health.reason} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Metric label="Cơ hội mở" value={String(customer.open_deal_count ?? 0)} />
          <Metric
            label="Pipeline"
            value={formatVNDShort(customer.open_pipeline_vnd)}
            title={formatVND(customer.open_pipeline_vnd)}
          />
          <Metric label="Công việc mở" value={String(customer.open_task_count ?? 0)} />
          <Metric
            label="Quá hạn"
            value={String(customer.overdue_task_count ?? 0)}
            danger={(customer.overdue_task_count ?? 0) > 0}
          />
          <Metric
            label="Đã chốt"
            value={formatVNDShort(customer.total_won_vnd)}
            title={formatVND(customer.total_won_vnd)}
          />
          <Metric label="Tương tác cuối" value={formatRelativePast(customer.last_activity_at)} />
        </div>
      </section>

      <section aria-labelledby="drawer-next-action">
        <h3
          id="drawer-next-action"
          className="text-xs font-semibold tracking-wide text-tr-subtle uppercase"
        >
          Việc tiếp theo
        </h3>
        <div
          className={`mt-2 rounded-panel border p-3 ${nextAction?.overdue ? 'border-tr-danger/50 bg-tr-danger/10' : 'border-tr-border bg-tr-surface/60'}`}
        >
          {nextAction ? (
            <div className="flex items-start gap-2">
              <CalendarClock
                size={17}
                className={
                  nextAction.overdue
                    ? 'mt-0.5 shrink-0 text-tr-danger'
                    : 'mt-0.5 shrink-0 text-tr-primary'
                }
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="font-medium text-tr-text">{nextAction.title}</p>
                <p
                  className={
                    nextAction.overdue
                      ? 'mt-0.5 text-xs font-medium text-tr-danger'
                      : 'mt-0.5 text-xs text-tr-muted'
                  }
                >
                  {formatActionDate(nextAction.date)} ·{' '}
                  {nextAction.kind === 'deal'
                    ? 'Cơ hội'
                    : nextAction.kind === 'task'
                      ? 'Công việc'
                      : 'Nhắc hẹn'}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-tr-muted">
              {openDeals.length > 0
                ? 'Cơ hội đang mở chưa có Next Action.'
                : 'Chưa có việc tiếp theo.'}
            </p>
          )}
        </div>
      </section>

      {openDeals.length > 0 && (
        <section aria-labelledby="drawer-open-deals">
          <h3
            id="drawer-open-deals"
            className="text-xs font-semibold tracking-wide text-tr-subtle uppercase"
          >
            Cơ hội đang mở
          </h3>
          <div className="mt-2 divide-y divide-tr-border rounded-panel border border-tr-border">
            {openDeals.slice(0, 3).map((deal) => (
              <Link
                key={deal.id}
                to={`/deals/${deal.id}`}
                className="flex items-center gap-3 px-3 py-2.5 transition hover:bg-tr-hover"
              >
                <CircleDollarSign
                  size={16}
                  className="shrink-0 text-tr-primary"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-tr-text">{deal.title}</p>
                  <p className="text-xs text-tr-muted">{formatVND(deal.value_vnd)}</p>
                </div>
                <ColorBadge color={STAGE_COLORS[deal.stage]} small>
                  {t.stage[deal.stage]}
                </ColorBadge>
              </Link>
            ))}
          </div>
        </section>
      )}

      {openTasks.length > 0 && (
        <section aria-labelledby="drawer-open-tasks">
          <h3
            id="drawer-open-tasks"
            className="text-xs font-semibold tracking-wide text-tr-subtle uppercase"
          >
            Công việc đang mở
          </h3>
          <div className="mt-2 divide-y divide-tr-border rounded-panel border border-tr-border">
            {openTasks.slice(0, 3).map((task) => {
              const overdue = isOverdue(task.due_date, task.is_done);
              return (
                <div key={task.id} className="flex items-start gap-3 px-3 py-2.5">
                  <CheckSquare2
                    size={16}
                    className={
                      overdue ? 'mt-0.5 shrink-0 text-tr-danger' : 'mt-0.5 shrink-0 text-tr-muted'
                    }
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-tr-text">{task.title}</p>
                    <p
                      className={
                        overdue ? 'text-xs font-medium text-tr-danger' : 'text-xs text-tr-muted'
                      }
                    >
                      {task.due_date
                        ? `${overdue ? 'Quá hạn · ' : ''}${formatDate(task.due_date)}`
                        : 'Chưa đặt hạn'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="drawer-recent-activity">
        <h3
          id="drawer-recent-activity"
          className="text-xs font-semibold tracking-wide text-tr-subtle uppercase"
        >
          Hoạt động gần đây
        </h3>
        {customer.interactions.length > 0 ? (
          <ol className="mt-2 space-y-3 border-s border-tr-border ps-4">
            {customer.interactions.slice(0, 5).map((interaction) => (
              <li key={interaction.id} className="relative">
                <span
                  className="absolute top-1.5 -left-[1.2rem] h-2 w-2 rounded-full bg-tr-primary"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium text-tr-text">{interaction.summary}</p>
                <p className="mt-0.5 text-xs text-tr-muted">
                  {t.interactionType[interaction.type]} · {formatDateTime(interaction.occurred_at)}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 rounded-panel border border-dashed border-tr-border px-3 py-4 text-sm text-tr-muted">
            Chưa có tương tác nào được ghi nhận.
          </p>
        )}
      </section>
    </>
  );
}

function InfoLine({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Phone;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1rem_6rem_minmax(0,1fr)] items-start gap-2">
      <Icon size={15} className="mt-0.5 text-tr-muted" aria-hidden="true" />
      <span className="text-tr-muted">{label}</span>
      <span className="min-w-0 text-tr-text">{value}</span>
    </div>
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
    <div className="rounded-panel border border-tr-border bg-tr-panel p-2.5" title={title}>
      <p
        className={`truncate text-base font-semibold tabular-nums ${danger ? 'text-tr-danger' : 'text-tr-text'}`}
      >
        {value}
      </p>
      <p className="mt-0.5 truncate text-xs text-tr-muted">{label}</p>
    </div>
  );
}

function HealthPill({
  level,
  label,
  reason,
}: {
  level: 'good' | 'attention' | 'risk';
  label: string;
  reason: string;
}) {
  const styles = {
    good: 'bg-tr-success/10 text-tr-success',
    attention: 'bg-tr-warning/10 text-tr-warning',
    risk: 'bg-tr-danger/10 text-tr-danger',
  };
  return (
    <span
      className={`rounded-full px-2 py-1 text-xs font-medium ${styles[level]}`}
      title={reason}
      aria-label={`${label}: ${reason}`}
    >
      {label}
    </span>
  );
}

function DrawerSkeleton() {
  return (
    <div role="status" aria-label="Đang tải hồ sơ khách hàng" className="space-y-4">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-40 rounded-panel" />
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-16 rounded-panel" />
        ))}
      </div>
      <Skeleton className="h-24 rounded-panel" />
    </div>
  );
}

function absoluteUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}
