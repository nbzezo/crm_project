import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Plus } from 'lucide-react';
import { api, qs } from '../../api/client';
import { RevenueLineForm } from './RevenueLineForm';
import { MonthlyRevenueModal } from './MonthlyRevenueModal';
import { RevenueLineActions } from './RevenueLineActions';
import { RevenueFunnelCards } from './RevenueFunnelCards';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Button, ColorBadge, EmptyState, Select, TableHead } from '../common/ui';
import { SERVICE_STATUS_COLORS, t } from '../../i18n/vi';
import { formatDate, formatVND } from '../../lib/format';
import { funnel, sumTotals } from '../../lib/revenue';
import type { RevenueLine, RevenueLinesResponse } from '../../types';

/** Tab "Dịch vụ sử dụng" trong hồ sơ khách hàng: quản lý dịch vụ + doanh thu theo năm. */
export function CustomerServices({ customerId }: { customerId: number }) {
  const queryClient = useQueryClient();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [form, setForm] = useState<{ open: boolean; line?: RevenueLine | null }>({ open: false });
  const [monthsFor, setMonthsFor] = useState<RevenueLine | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['revenues', 'lines', year, { customer_id: customerId }],
    queryFn: () =>
      api.get<RevenueLinesResponse>(`/api/revenues/lines${qs({ year, customer_id: customerId })}`),
  });
  const lines = data?.lines ?? [];

  const { data: years = [] } = useQuery({
    queryKey: ['revenues', 'years'],
    queryFn: () => api.get<number[]>('/api/revenues/years'),
  });
  const yearOptions = years.includes(year) ? years : [year, ...years];

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/revenues/lines/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['revenues'] });
      queryClient.invalidateQueries({ queryKey: ['customer', customerId] });
    },
  });

  const total = funnel(sumTotals(lines.map((l) => l.totals)));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-32">
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                Năm {y}
              </option>
            ))}
          </Select>
        </div>
        <Link to="/revenue" className="text-sm text-tr-primary hover:underline">
          Xem bảng doanh thu tổng hợp →
        </Link>
        <Button
          variant="primary"
          className="ml-auto"
          onClick={() => setForm({ open: true, line: null })}
        >
          <Plus size={15} /> Thêm dịch vụ sử dụng
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-tr-muted">{t.common.loading}</p>
      ) : lines.length === 0 ? (
        <EmptyState message="Khách hàng này chưa được gán dịch vụ nào." />
      ) : (
        <>
          <div className="mb-3">
            <RevenueFunnelCards total={total} />
          </div>

          <div className="overflow-x-auto rounded-lg border border-tr-border bg-tr-panel">
            <table className="w-full text-sm">
              <TableHead>
                <tr>
                  <th scope="col" className="px-4 py-2.5">
                    {t.revenue.service}
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    {t.revenue.am}
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    {t.revenue.contractKind}
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    {t.revenue.contractTerm}
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    Thời gian
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    {t.revenue.status}
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right whitespace-nowrap">
                    {t.revenue.forecast}
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right whitespace-nowrap">
                    {t.revenue.amount}
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right whitespace-nowrap">
                    {t.revenueStage.paid}
                  </th>
                  <th scope="col" className="px-4 py-2.5"></th>
                </tr>
              </TableHead>
              <tbody className="divide-y divide-tr-border">
                {lines.map((line) => (
                  <tr key={line.id} className="hover:bg-tr-hover">
                    <td className="px-4 py-2.5 font-medium text-tr-text">
                      {line.service_name || <span className="text-tr-muted">— chưa gán —</span>}
                      {line.contract_name && (
                        <div className="text-2xs text-tr-muted">{line.contract_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-tr-subtle">{line.am || '—'}</td>
                    <td className="px-4 py-2.5 text-tr-subtle">
                      {t.contractKind[line.contract_kind]}
                    </td>
                    <td className="px-4 py-2.5 text-tr-subtle">
                      {t.contractTerm[line.contract_term]}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-tr-subtle whitespace-nowrap">
                      {formatDate(line.start_date) || '—'} → {formatDate(line.end_date) || '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <ColorBadge color={SERVICE_STATUS_COLORS[line.status]} small>
                        {t.serviceStatus[line.status]}
                      </ColorBadge>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-tr-subtle">
                      {formatVND(line.totals.forecast_vnd)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                      {formatVND(line.totals.amount_vnd)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatVND(funnel(line.totals).paid)}
                    </td>
                    <td className="px-4 py-2.5">
                      <RevenueLineActions
                        line={line}
                        onMonths={setMonthsFor}
                        onEdit={(next) => setForm({ open: true, line: next })}
                        onDelete={(next) => setDeleteId(next.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-tr-muted">
            Số liệu trong bảng là tổng 12 tháng của năm {year}.
          </p>
        </>
      )}

      <RevenueLineForm
        open={form.open}
        line={form.line}
        defaultCustomerId={customerId}
        onClose={() => setForm({ open: false })}
      />
      <MonthlyRevenueModal
        open={monthsFor !== null}
        line={monthsFor}
        year={year}
        onClose={() => setMonthsFor(null)}
      />
      <ConfirmDialog
        open={deleteId !== null}
        message="Xóa dòng dịch vụ này? Toàn bộ doanh thu đã nhập của dòng sẽ bị xóa theo."
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) remove.mutate(deleteId);
          setDeleteId(null);
        }}
      />
    </div>
  );
}
