import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownUp,
  BriefcaseBusiness,
  ChevronRight,
  Clock3,
  Eye,
  Handshake,
  ListTodo,
  Phone,
  Plus,
  Search,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../api/client';
import { CustomerDrawer } from '../components/crm/CustomerDrawer';
import { CustomerForm } from '../components/crm/CustomerForm';
import { DealForm } from '../components/crm/DealForm';
import {
  customerInactiveDays,
  formatActionDate,
  formatRelativePast,
  getCustomerHealth,
  getNextCustomerAction,
  isStaleCustomer,
  needsFollowUp,
  type CustomerSmartView,
} from '../components/crm/customerInsights';
import {
  Button,
  ColorBadge,
  EmptyState,
  ErrorState,
  Input,
  Select,
  Skeleton,
  SkeletonRows,
  focusRing,
} from '../components/common/ui';
import { LabelChips } from '../components/labels/LabelChips';
import { labelsOf, useLabelMap } from '../components/labels/EntityLabels';
import {
  EMPTY_LABEL_FILTER,
  LabelFilter,
  matchLabelFilter,
  type LabelFilterState,
} from '../components/labels/LabelFilter';
import { ACCOUNT_STATUS_COLORS, t } from '../i18n/vi';
import { foldText, formatVND, formatVNDShort } from '../lib/format';
import type { Customer } from '../types';

type SortKey = 'name' | 'attention' | 'last-activity' | 'opportunities' | 'won';

const SMART_VIEWS: { value: CustomerSmartView; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'prospect', label: 'Tiềm năng' },
  { value: 'opportunity', label: 'Có cơ hội' },
  { value: 'follow-up', label: 'Cần follow-up' },
  { value: 'stale', label: 'Lâu chưa tương tác' },
];

export default function CustomersPage() {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<'' | Customer['status']>('');
  const [industry, setIndustry] = useState('');
  const [labelFilter, setLabelFilter] = useState<LabelFilterState>(EMPTY_LABEL_FILTER);
  const [smartView, setSmartView] = useState<CustomerSmartView>('all');
  const [sort, setSort] = useState<SortKey>('name');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [dealCustomerId, setDealCustomerId] = useState<number | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(term), 180);
    return () => window.clearTimeout(id);
  }, [term]);

  const {
    data: allCustomers = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get<Customer[]>('/api/customers'),
  });

  const labelMap = useLabelMap('customer');

  const industries = useMemo(
    () =>
      Array.from(
        new Set(
          allCustomers
            .map((customer) => customer.industry?.trim())
            .filter((value): value is string => Boolean(value))
        )
      ).sort((a, b) => a.localeCompare(b, 'vi')),
    [allCustomers]
  );

  const summary = useMemo(
    () => ({
      total: allCustomers.length,
      prospects: allCustomers.filter((customer) => customer.status === 'prospect').length,
      opportunities: allCustomers.filter((customer) => (customer.open_deal_count ?? 0) > 0).length,
      followUp: allCustomers.filter(needsFollowUp).length,
      stale: allCustomers.filter(isStaleCustomer).length,
    }),
    [allCustomers]
  );

  const customers = useMemo(() => {
    const query = foldText(debounced.trim());
    return allCustomers
      .filter((customer) => {
        const searchable = foldText(
          [
            customer.name,
            customer.short_name,
            customer.industry,
            customer.phone,
            customer.email,
            customer.tax_code,
            customer.notes,
          ]
            .filter(Boolean)
            .join(' ')
        );
        if (query && !searchable.includes(query)) return false;
        if (status && customer.status !== status) return false;
        if (industry && customer.industry !== industry) return false;
        if (
          !matchLabelFilter(
            labelsOf(labelMap, customer.id).map((label) => label.id),
            labelFilter
          )
        )
          return false;
        if (smartView === 'prospect' && customer.status !== 'prospect') return false;
        if (smartView === 'opportunity' && (customer.open_deal_count ?? 0) === 0) return false;
        if (smartView === 'follow-up' && !needsFollowUp(customer)) return false;
        if (smartView === 'stale' && !isStaleCustomer(customer)) return false;
        return true;
      })
      .sort(customerComparator(sort));
  }, [allCustomers, debounced, industry, labelFilter, labelMap, smartView, sort, status]);

  const hasFilters = Boolean(
    term || status || industry || labelFilter.ids.length || smartView !== 'all'
  );

  const clearFilters = () => {
    setTerm('');
    setStatus('');
    setIndustry('');
    setLabelFilter(EMPTY_LABEL_FILTER);
    setSmartView('all');
  };

  const activateSummary = (view: CustomerSmartView) => {
    if (view === 'all') {
      clearFilters();
      return;
    }
    setSmartView(view);
    setStatus('');
  };

  const closeCustomerForm = () => {
    setCreating(false);
    setEditing(null);
  };

  return (
    <div className="mx-auto w-full max-w-[112rem] p-4 sm:p-6">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-tr-text">Khách hàng</h1>
          <p className="mt-1 text-sm text-tr-muted">
            Quản lý khách hàng, cơ hội và hoạt động chăm sóc
          </p>
        </div>
        <Button variant="primary" className="shrink-0" onClick={() => setCreating(true)}>
          <Plus size={16} aria-hidden="true" />
          <span className="hidden sm:inline">Thêm khách hàng</span>
          <span className="sm:hidden">Thêm</span>
        </Button>
      </header>

      {isLoading ? (
        <CustomerWorkspaceSkeleton />
      ) : error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <>
          <section
            aria-label="Tổng quan khách hàng"
            className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-5"
          >
            <SummaryItem
              icon={Users}
              value={summary.total}
              label="Tổng khách hàng"
              active={smartView === 'all' && !hasFilters}
              onClick={() => activateSummary('all')}
            />
            <SummaryItem
              icon={Handshake}
              value={summary.prospects}
              label="Tiềm năng"
              active={smartView === 'prospect'}
              onClick={() => activateSummary('prospect')}
            />
            <SummaryItem
              icon={BriefcaseBusiness}
              value={summary.opportunities}
              label="Có cơ hội mở"
              active={smartView === 'opportunity'}
              onClick={() => activateSummary('opportunity')}
            />
            <SummaryItem
              icon={ListTodo}
              value={summary.followUp}
              label="Cần follow-up"
              tone="warning"
              active={smartView === 'follow-up'}
              onClick={() => activateSummary('follow-up')}
            />
            <SummaryItem
              icon={Clock3}
              value={summary.stale}
              label="Không tương tác >30 ngày"
              tone="danger"
              active={smartView === 'stale'}
              onClick={() => activateSummary('stale')}
              className="col-span-2 lg:col-span-1"
            />
          </section>

          <section
            aria-label="Bộ lọc khách hàng"
            className="mb-3 rounded-panel border border-tr-border bg-tr-panel p-3 shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full md:w-72">
                <Search
                  size={15}
                  aria-hidden="true"
                  className="absolute top-1/2 left-2.5 -translate-y-1/2 text-tr-muted"
                />
                <Input
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="Tìm khách hàng…"
                  aria-label="Tìm khách hàng"
                  className="pr-9 pl-8"
                />
                {term && (
                  <button
                    type="button"
                    onClick={() => setTerm('')}
                    aria-label="Xóa nội dung tìm kiếm"
                    className={`absolute top-1/2 right-1.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-control text-tr-muted transition hover:bg-tr-hover hover:text-tr-text ${focusRing}`}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                )}
              </div>

              <div className="w-[calc(50%-0.25rem)] sm:w-40">
                <Select
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value as '' | Customer['status']);
                    setSmartView('all');
                  }}
                  aria-label="Lọc theo trạng thái"
                >
                  <option value="">Trạng thái</option>
                  {Object.entries(t.accountStatus).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="w-[calc(50%-0.25rem)] sm:w-44">
                <Select
                  value={industry}
                  onChange={(event) => setIndustry(event.target.value)}
                  aria-label="Lọc theo ngành nghề"
                >
                  <option value="">Ngành nghề</option>
                  {industries.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              </div>

              <LabelFilter scope="customer" value={labelFilter} onChange={setLabelFilter} />

              <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
                <ArrowDownUp size={14} className="text-tr-muted" aria-hidden="true" />
                <Select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortKey)}
                  aria-label="Sắp xếp khách hàng"
                  className="min-w-44"
                >
                  <option value="name">Tên khách hàng</option>
                  <option value="attention">Cần chăm sóc trước</option>
                  <option value="last-activity">Tương tác gần nhất</option>
                  <option value="opportunities">Cơ hội nhiều nhất</option>
                  <option value="won">Giá trị đã chốt</option>
                </Select>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Chế độ xem nhanh">
              {SMART_VIEWS.map((view) => (
                <button
                  key={view.value}
                  type="button"
                  aria-pressed={smartView === view.value}
                  onClick={() => {
                    setSmartView(view.value);
                    if (view.value !== 'all') setStatus('');
                  }}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${focusRing} ${smartView === view.value ? 'bg-tr-primary text-tr-on-primary' : 'bg-tr-hover text-tr-subtle hover:bg-tr-hover-strong hover:text-tr-text'}`}
                >
                  {view.label}
                </button>
              ))}
            </div>
          </section>

          {hasFilters && (
            <div
              className="mb-3 flex flex-wrap items-center gap-1.5"
              aria-label="Bộ lọc đang áp dụng"
            >
              <span className="mr-1 text-xs text-tr-muted">Đang lọc:</span>
              {smartView !== 'all' && (
                <FilterChip
                  label={`Chế độ xem: ${SMART_VIEWS.find((view) => view.value === smartView)?.label}`}
                  onRemove={() => setSmartView('all')}
                />
              )}
              {status && (
                <FilterChip
                  label={`Trạng thái: ${t.accountStatus[status]}`}
                  onRemove={() => setStatus('')}
                />
              )}
              {industry && (
                <FilterChip label={`Ngành nghề: ${industry}`} onRemove={() => setIndustry('')} />
              )}
              {labelFilter.ids.length > 0 && (
                <FilterChip
                  label={`Nhãn: ${labelFilter.ids.length} đã chọn`}
                  onRemove={() => setLabelFilter(EMPTY_LABEL_FILTER)}
                />
              )}
              <button
                type="button"
                onClick={clearFilters}
                className={`rounded-control px-2 py-1 text-xs font-medium text-tr-primary hover:bg-tr-hover ${focusRing}`}
              >
                Xóa bộ lọc
              </button>
            </div>
          )}

          {customers.length === 0 ? (
            <EmptyState
              message={hasFilters ? 'Không tìm thấy khách hàng' : 'Chưa có khách hàng'}
              hint={
                hasFilters
                  ? 'Không có khách hàng nào khớp bộ lọc hiện tại.'
                  : 'Thêm khách hàng đầu tiên để bắt đầu quản lý cơ hội và hoạt động.'
              }
              action={
                hasFilters ? (
                  <Button onClick={clearFilters}>Xóa bộ lọc</Button>
                ) : (
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    <Plus size={16} aria-hidden="true" /> Thêm khách hàng
                  </Button>
                )
              }
            />
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between gap-3 text-xs text-tr-muted">
                <span>
                  Hiển thị {customers.length} / {allCustomers.length} khách hàng
                </span>
                <span className="hidden sm:inline">
                  Chọn tên khách hàng để xem nhanh mà không rời danh sách
                </span>
              </div>
              <CustomerTable
                customers={customers}
                labelMap={labelMap}
                onSelect={setSelectedCustomer}
              />
              <CustomerMobileList
                customers={customers}
                labelMap={labelMap}
                onSelect={setSelectedCustomer}
              />
            </>
          )}
        </>
      )}

      <CustomerDrawer
        customer={selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
        onEdit={setEditing}
        onCreateDeal={setDealCustomerId}
      />
      <CustomerForm
        open={creating || Boolean(editing)}
        onClose={closeCustomerForm}
        customer={editing ?? undefined}
      />
      <DealForm
        open={dealCustomerId !== null}
        onClose={() => setDealCustomerId(null)}
        defaultCustomerId={dealCustomerId ?? undefined}
      />
    </div>
  );
}

function CustomerTable({
  customers,
  labelMap,
  onSelect,
}: {
  customers: Customer[];
  labelMap: ReturnType<typeof useLabelMap>;
  onSelect: (customer: Customer) => void;
}) {
  return (
    <div className="tr-scroll hidden overflow-x-auto rounded-modal border border-tr-border bg-tr-panel shadow-sm lg:block">
      <table className="w-full min-w-[62rem] table-fixed text-sm">
        <caption className="sr-only">Danh sách khách hàng và các tín hiệu cần chăm sóc</caption>
        <thead className="sticky top-0 z-10 bg-tr-surface text-left text-2xs tracking-wide text-tr-subtle uppercase shadow-[0_1px_0_var(--tr-border)]">
          <tr>
            <th scope="col" className="w-[22%] px-4 py-3">
              Khách hàng
            </th>
            <th scope="col" className="w-[9%] px-3 py-3">
              Trạng thái
            </th>
            <th scope="col" className="w-[11%] px-3 py-3">
              Sức khỏe
            </th>
            <th scope="col" className="w-[10%] px-3 py-3 text-right">
              Cơ hội
            </th>
            <th scope="col" className="w-[8%] px-3 py-3 text-right">
              Công việc
            </th>
            <th scope="col" className="w-[11%] px-3 py-3">
              Tương tác cuối
            </th>
            <th scope="col" className="w-[16%] px-3 py-3">
              Việc tiếp theo
            </th>
            <th scope="col" className="w-[9%] px-3 py-3 text-right">
              Đã chốt
            </th>
            <th scope="col" className="w-[4%] px-2 py-3">
              <span className="sr-only">Thao tác</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-tr-border">
          {customers.map((customer) => {
            const health = getCustomerHealth(customer);
            const nextAction = getNextCustomerAction(customer);
            const stale = isStaleCustomer(customer);
            const labels = labelsOf(labelMap, customer.id);
            return (
              <tr
                key={customer.id}
                className="group transition-colors hover:bg-tr-hover focus-within:bg-tr-hover"
              >
                <th scope="row" className="px-4 py-3 text-left font-normal">
                  <button
                    type="button"
                    onClick={() => onSelect(customer)}
                    title={customer.name}
                    className={`block max-w-full truncate text-left font-semibold text-tr-text hover:text-tr-primary hover:underline ${focusRing}`}
                  >
                    {customer.name}
                  </button>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-tr-muted">
                    <span className="truncate">{customer.industry || 'Chưa có ngành nghề'}</span>
                    {customer.phone && (
                      <>
                        <span aria-hidden="true">·</span>
                        <a
                          href={`tel:${customer.phone}`}
                          onClick={(event) => event.stopPropagation()}
                          className="shrink-0 hover:text-tr-primary hover:underline"
                        >
                          {customer.phone}
                        </a>
                      </>
                    )}
                  </div>
                  {labels.length > 0 && (
                    <div className="mt-1.5">
                      <LabelChips labels={labels} max={2} small />
                    </div>
                  )}
                </th>
                <td className="px-3 py-3 align-top">
                  <ColorBadge color={ACCOUNT_STATUS_COLORS[customer.status]} small>
                    {t.accountStatus[customer.status]}
                  </ColorBadge>
                </td>
                <td className="px-3 py-3 align-top">
                  <HealthBadge health={health} />
                </td>
                <td className="px-3 py-3 text-right align-top">
                  <button
                    type="button"
                    onClick={() => onSelect(customer)}
                    className={`rounded-control px-1 text-right hover:bg-tr-hover-strong ${focusRing}`}
                    aria-label={`Xem ${customer.open_deal_count ?? 0} cơ hội của ${customer.name}`}
                  >
                    <span className="block font-semibold text-tr-text">
                      {customer.open_deal_count ?? 0} cơ hội
                    </span>
                    <span
                      className="block text-xs text-tr-muted"
                      title={formatVND(customer.open_pipeline_vnd)}
                    >
                      {formatVNDShort(customer.open_pipeline_vnd)}
                    </span>
                  </button>
                </td>
                <td className="px-3 py-3 text-right align-top">
                  <button
                    type="button"
                    onClick={() => onSelect(customer)}
                    className={`rounded-control px-1 text-right hover:bg-tr-hover-strong ${focusRing}`}
                    aria-label={`Xem công việc của ${customer.name}`}
                  >
                    <span className="block font-semibold text-tr-text">
                      {customer.open_task_count ?? 0} mở
                    </span>
                    {(customer.overdue_task_count ?? 0) > 0 && (
                      <span className="block text-xs font-medium text-tr-danger">
                        {customer.overdue_task_count} quá hạn
                      </span>
                    )}
                  </button>
                </td>
                <td className="px-3 py-3 align-top">
                  <span
                    className={`text-sm ${stale ? 'font-medium text-tr-warning' : 'text-tr-subtle'}`}
                  >
                    {formatRelativePast(customer.last_activity_at)}
                  </span>
                  {!customer.last_activity_at && (
                    <span className="mt-0.5 block text-2xs text-tr-muted">
                      Tạo {formatRelativePast(customer.created_at).toLowerCase()}
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 align-top">
                  <NextActionCell
                    action={nextAction}
                    hasOpenDeals={(customer.open_deal_count ?? 0) > 0}
                  />
                </td>
                <td
                  className="px-3 py-3 text-right align-top font-semibold text-tr-success"
                  title={formatVND(customer.total_won_vnd)}
                >
                  {formatVNDShort(customer.total_won_vnd)}
                </td>
                <td className="px-2 py-3 align-top">
                  <div className="flex justify-end gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                    {customer.phone && (
                      <a
                        href={`tel:${customer.phone}`}
                        aria-label={`Gọi ${customer.name}`}
                        title={`Gọi ${customer.phone}`}
                        className={`flex h-8 w-8 items-center justify-center rounded-control text-tr-muted hover:bg-tr-hover-strong hover:text-tr-primary ${focusRing}`}
                      >
                        <Phone size={14} aria-hidden="true" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => onSelect(customer)}
                      aria-label={`Xem nhanh ${customer.name}`}
                      title="Xem nhanh"
                      className={`flex h-8 w-8 items-center justify-center rounded-control text-tr-muted hover:bg-tr-hover-strong hover:text-tr-primary ${focusRing}`}
                    >
                      <Eye size={15} aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CustomerMobileList({
  customers,
  labelMap,
  onSelect,
}: {
  customers: Customer[];
  labelMap: ReturnType<typeof useLabelMap>;
  onSelect: (customer: Customer) => void;
}) {
  return (
    <div className="space-y-2 lg:hidden">
      {customers.map((customer) => {
        const health = getCustomerHealth(customer);
        const nextAction = getNextCustomerAction(customer);
        const labels = labelsOf(labelMap, customer.id);
        return (
          <article
            key={customer.id}
            className="rounded-panel border border-tr-border bg-tr-panel p-3 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onSelect(customer)}
                  title={customer.name}
                  className={`block max-w-full truncate text-left font-semibold text-tr-text hover:text-tr-primary ${focusRing}`}
                >
                  {customer.name}
                </button>
                <p className="mt-0.5 truncate text-xs text-tr-muted">
                  {[customer.industry, customer.phone].filter(Boolean).join(' · ') ||
                    'Chưa có thông tin liên hệ'}
                </p>
              </div>
              <ColorBadge color={ACCOUNT_STATUS_COLORS[customer.status]} small>
                {t.accountStatus[customer.status]}
              </ColorBadge>
            </div>
            {labels.length > 0 && (
              <div className="mt-2">
                <LabelChips labels={labels} max={2} small />
              </div>
            )}
            <div className="mt-3 grid grid-cols-3 gap-2 border-y border-tr-border py-2.5">
              <MobileMetric
                label="Cơ hội"
                value={String(customer.open_deal_count ?? 0)}
                detail={formatVNDShort(customer.open_pipeline_vnd)}
              />
              <MobileMetric
                label="Công việc"
                value={String(customer.open_task_count ?? 0)}
                detail={
                  (customer.overdue_task_count ?? 0) > 0
                    ? `${customer.overdue_task_count} quá hạn`
                    : undefined
                }
                danger={(customer.overdue_task_count ?? 0) > 0}
              />
              <MobileMetric label="Đã chốt" value={formatVNDShort(customer.total_won_vnd)} />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-2xs font-semibold tracking-wide text-tr-muted uppercase">
                  Sức khỏe
                </p>
                <div className="mt-1">
                  <HealthBadge health={health} />
                </div>
              </div>
              <div>
                <p className="text-2xs font-semibold tracking-wide text-tr-muted uppercase">
                  Việc tiếp theo
                </p>
                <div className="mt-1">
                  <NextActionCell
                    action={nextAction}
                    hasOpenDeals={(customer.open_deal_count ?? 0) > 0}
                  />
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span
                className={
                  isStaleCustomer(customer)
                    ? 'text-xs font-medium text-tr-warning'
                    : 'text-xs text-tr-muted'
                }
              >
                {formatRelativePast(customer.last_activity_at)}
              </span>
              <Button size="sm" variant="ghost" onClick={() => onSelect(customer)}>
                Xem nhanh <ChevronRight size={14} aria-hidden="true" />
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function SummaryItem({
  icon: Icon,
  value,
  label,
  active,
  tone = 'neutral',
  onClick,
  className = '',
}: {
  icon: LucideIcon;
  value: number;
  label: string;
  active: boolean;
  tone?: 'neutral' | 'warning' | 'danger';
  onClick: () => void;
  className?: string;
}) {
  const iconTone =
    tone === 'danger'
      ? 'text-tr-danger bg-tr-danger/10'
      : tone === 'warning'
        ? 'text-tr-warning bg-tr-warning/10'
        : 'text-tr-primary bg-tr-primary/10';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group flex min-h-20 items-center gap-3 rounded-panel border bg-tr-panel px-3 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-tr-primary/50 hover:shadow ${active ? 'border-tr-primary ring-1 ring-tr-primary/25' : 'border-tr-border'} ${focusRing} ${className}`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-panel ${iconTone}`}
      >
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <strong className="block text-xl leading-none font-semibold tabular-nums text-tr-text">
          {value}
        </strong>
        <span className="mt-1 block text-xs leading-snug text-tr-muted">{label}</span>
      </span>
    </button>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-tr-border bg-tr-panel py-1 pr-1 pl-2.5 text-xs text-tr-subtle">
      <span className="max-w-64 truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Xóa ${label}`}
        className={`flex h-5 w-5 items-center justify-center rounded-full text-tr-muted hover:bg-tr-hover-strong hover:text-tr-text ${focusRing}`}
      >
        <X size={12} aria-hidden="true" />
      </button>
    </span>
  );
}

function HealthBadge({ health }: { health: ReturnType<typeof getCustomerHealth> }) {
  const styles = {
    good: 'bg-tr-success/10 text-tr-success',
    attention: 'bg-tr-warning/10 text-tr-warning',
    risk: 'bg-tr-danger/10 text-tr-danger',
  };
  return (
    <span
      className={`inline-flex max-w-full flex-col rounded-panel px-2 py-1 text-left ${styles[health.level]}`}
      title={health.reason}
    >
      <span className="text-xs font-semibold">{health.label}</span>
      <span className="truncate text-2xs opacity-90">{health.reason}</span>
    </span>
  );
}

function NextActionCell({
  action,
  hasOpenDeals,
}: {
  action: ReturnType<typeof getNextCustomerAction>;
  hasOpenDeals: boolean;
}) {
  if (!action)
    return (
      <span
        className={hasOpenDeals ? 'text-xs font-medium text-tr-warning' : 'text-xs text-tr-muted'}
      >
        {hasOpenDeals ? 'Thiếu Next Action' : 'Chưa có việc tiếp theo'}
      </span>
    );
  return (
    <div className="min-w-0" title={action.title}>
      <p className="truncate text-sm font-medium text-tr-text">{action.title}</p>
      <p
        className={
          action.overdue
            ? 'mt-0.5 text-xs font-semibold text-tr-danger'
            : 'mt-0.5 text-xs text-tr-muted'
        }
      >
        {formatActionDate(action.date)} ·{' '}
        {action.kind === 'deal' ? 'Cơ hội' : action.kind === 'task' ? 'Công việc' : 'Nhắc hẹn'}
      </p>
    </div>
  );
}

function MobileMetric({
  label,
  value,
  detail,
  danger,
}: {
  label: string;
  value: string;
  detail?: string;
  danger?: boolean;
}) {
  return (
    <div className="min-w-0 text-center">
      <p
        className={`truncate text-sm font-semibold tabular-nums ${danger ? 'text-tr-danger' : 'text-tr-text'}`}
      >
        {value}
      </p>
      <p className="truncate text-2xs text-tr-muted">{detail ? `${label} · ${detail}` : label}</p>
    </div>
  );
}

function CustomerWorkspaceSkeleton() {
  return (
    <div role="status" aria-label="Đang tải danh sách khách hàng">
      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton
            key={index}
            className={`h-20 rounded-panel ${index === 4 ? 'col-span-2 lg:col-span-1' : ''}`}
          />
        ))}
      </div>
      <Skeleton className="mb-3 h-24 rounded-panel" />
      <div className="rounded-modal border border-tr-border bg-tr-panel shadow-sm">
        <SkeletonRows rows={8} cols={7} />
      </div>
    </div>
  );
}

function customerComparator(sort: SortKey): (a: Customer, b: Customer) => number {
  if (sort === 'attention')
    return (a, b) => attentionScore(b) - attentionScore(a) || a.name.localeCompare(b.name, 'vi');
  if (sort === 'last-activity')
    return (a, b) =>
      (b.last_activity_at ?? '').localeCompare(a.last_activity_at ?? '') ||
      a.name.localeCompare(b.name, 'vi');
  if (sort === 'opportunities')
    return (a, b) =>
      (b.open_deal_count ?? 0) - (a.open_deal_count ?? 0) ||
      (b.open_pipeline_vnd ?? 0) - (a.open_pipeline_vnd ?? 0) ||
      a.name.localeCompare(b.name, 'vi');
  if (sort === 'won')
    return (a, b) =>
      (b.total_won_vnd ?? 0) - (a.total_won_vnd ?? 0) || a.name.localeCompare(b.name, 'vi');
  return (a, b) => a.name.localeCompare(b.name, 'vi');
}

function attentionScore(customer: Customer): number {
  const health = getCustomerHealth(customer);
  return (
    (health.level === 'risk' ? 1_000 : health.level === 'attention' ? 500 : 0) +
    (customer.overdue_task_count ?? 0) * 25 +
    (customer.deals_without_next_action_count ?? 0) * 10 +
    Math.min(customerInactiveDays(customer), 100)
  );
}
