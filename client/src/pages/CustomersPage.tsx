import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Plus, Search } from 'lucide-react';
import { api, qs } from '../api/client';
import { CustomerForm } from '../components/crm/CustomerForm';
import {
  Button,
  ColorBadge,
  EmptyState,
  ErrorState,
  Input,
  Select,
  SkeletonRows,
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
import { formatVND } from '../lib/format';
import type { Customer } from '../types';


export default function CustomersPage() {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [labelFilter, setLabelFilter] = useState<LabelFilterState>(EMPTY_LABEL_FILTER);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(term), 300);
    return () => clearTimeout(id);
  }, [term]);

  const {
    data: allCustomers = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['customers', { q: debounced, status }],
    queryFn: () => api.get<Customer[]>(`/api/customers${qs({ q: debounced, status })}`),
  });

  // FR-TAG-21/22: lọc theo nhãn chạy ở phía giao diện nên không phải đổi API khách hàng
  const labelMap = useLabelMap('customer');
  const customers = allCustomers.filter((c) =>
    matchLabelFilter(
      labelsOf(labelMap, c.id).map((l) => l.id),
      labelFilter
    )
  );

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search
            size={15}
            aria-hidden="true"
            className="absolute top-1/2 left-2.5 -translate-y-1/2 text-tr-muted"
          />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Tìm khách hàng (không cần dấu)…"
            aria-label="Tìm khách hàng"
            className="pl-8"
          />
        </div>
        <div className="w-full sm:w-44">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label={t.customer.status}
          >
            <option value="">{t.common.all}</option>
            {Object.entries(t.accountStatus).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <LabelFilter scope="customer" value={labelFilter} onChange={setLabelFilter} />
        <Button variant="primary" className="ml-auto" onClick={() => setCreating(true)}>
          <Plus size={16} /> {t.customer.newCustomer}
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-modal border border-tr-border bg-tr-panel shadow-sm">
          <SkeletonRows rows={8} cols={5} />
        </div>
      ) : error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : customers.length === 0 ? (
        <EmptyState
          message={t.customer.noCustomers}
          hint={
            debounced || status || labelFilter.ids.length
              ? 'Không có khách hàng nào khớp bộ lọc hiện tại.'
              : 'Thêm khách hàng đầu tiên để bắt đầu theo dõi cơ hội và doanh thu.'
          }
          action={
            debounced || status || labelFilter.ids.length ? (
              <Button
                onClick={() => {
                  setTerm('');
                  setStatus('');
                  setLabelFilter(EMPTY_LABEL_FILTER);
                }}
              >
                {t.common.clearFilter}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus size={16} aria-hidden="true" /> {t.customer.newCustomer}
              </Button>
            )
          }
        />
      ) : (
        /* overflow-x-auto (khong phai overflow-hidden): bang 7 cot rong hon
           man hinh dien thoai, truoc day ba cot cuoi bi cat va khong the cuon toi. */
        <div className="tr-scroll overflow-x-auto rounded-modal border border-tr-border bg-tr-panel shadow-sm">
          <table className="w-full min-w-[52rem] text-sm">
            <caption className="sr-only">Danh sách khách hàng</caption>
            <thead className="bg-tr-surface text-left text-xs tracking-wide text-tr-subtle uppercase">
              <tr>
                <th scope="col" className="px-4 py-2.5">
                  {t.customer.name}
                </th>
                <th scope="col" className="px-4 py-2.5">
                  {t.customer.industry}
                </th>
                <th scope="col" className="px-4 py-2.5">
                  {t.customer.phone}
                </th>
                <th scope="col" className="px-4 py-2.5 text-right">
                  Cơ hội mở
                </th>
                <th scope="col" className="px-4 py-2.5 text-right">
                  Công việc
                </th>
                <th scope="col" className="px-4 py-2.5 text-right">
                  {t.customer.totalWon}
                </th>
                <th scope="col" className="px-4 py-2.5">
                  {t.customer.status}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tr-border">
              {customers.map((c) => (
                <tr key={c.id} className="transition hover:bg-tr-hover">
                  <th scope="row" className="px-4 py-2.5 text-left font-normal">
                    <Link
                      to={`/customers/${c.id}`}
                      className="font-medium text-tr-primary hover:underline"
                    >
                      {c.name}
                    </Link>
                    {/* FR-TAG-25: nhãn hiển thị ngay dưới tên, tối đa 3 rồi gom "+N" */}
                    <div className="mt-1 empty:hidden">
                      <LabelChips labels={labelsOf(labelMap, c.id)} max={3} small />
                    </div>
                  </th>
                  <td className="px-4 py-2.5 text-tr-subtle">{c.industry ?? '—'}</td>
                  <td className="px-4 py-2.5 text-tr-subtle">{c.phone ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right text-tr-subtle">{c.open_deal_count ?? 0}</td>
                  <td className="px-4 py-2.5 text-right text-tr-subtle">{c.open_task_count ?? 0}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-tr-success">
                    {formatVND(c.total_won_vnd)}
                  </td>
                  <td className="px-4 py-2.5">
                    <ColorBadge color={ACCOUNT_STATUS_COLORS[c.status]}>
                      {t.accountStatus[c.status]}
                    </ColorBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CustomerForm open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
