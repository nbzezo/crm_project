import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Pencil, Plus, Table2, Trash2 } from 'lucide-react';
import { api, qs } from '../../api/client';
import { RevenueLineForm } from './RevenueLineForm';
import { MonthlyRevenueModal } from './MonthlyRevenueModal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Button, ColorBadge, EmptyState, Select } from '../common/ui';
import { REVENUE_STAGE_COLORS, SERVICE_STATUS_COLORS, t } from '../../i18n/vi';
import { formatDate, formatVND, formatVNDShort } from '../../lib/format';
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
  const CARDS = [
    { key: 'amount', label: t.revenueFunnel.amount, value: total.amount, color: undefined },
    {
      key: 'reconciled',
      label: t.revenueFunnel.reconciled,
      value: total.reconciled,
      color: REVENUE_STAGE_COLORS.reconciled,
    },
    {
      key: 'invoiced',
      label: t.revenueFunnel.invoiced,
      value: total.invoiced,
      color: REVENUE_STAGE_COLORS.invoiced,
    },
    {
      key: 'paid',
      label: t.revenueFunnel.paid,
      value: total.paid,
      color: REVENUE_STAGE_COLORS.paid,
    },
  ];

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
          <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {CARDS.map((card) => (
              <div key={card.key} className="rounded-lg border border-tr-border bg-tr-panel p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-tr-subtle">
                  {card.color && (
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: card.color }}
                    />
                  )}
                  {card.label}
                </div>
                <div className="mt-1 font-semibold tabular-nums text-tr-text">
                  {formatVND(card.value)}
                </div>
                {card.key === 'amount' && (
                  <div className="mt-1 text-xs text-tr-muted">
                    {t.revenue.forecast} {formatVNDShort(total.forecast)}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-tr-border bg-tr-panel">
            <table className="w-full text-sm">
              <thead className="bg-tr-surface text-left text-xs tracking-wide text-tr-subtle uppercase">
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
              </thead>
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
                      <div className="flex justify-end gap-0.5">
                        <button
                          onClick={() => setMonthsFor(line)}
                          title={t.revenue.enterMonths}
                          aria-label={t.revenue.enterMonths}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control sm:h-8 sm:w-8 text-tr-muted transition hover:bg-tr-hover hover:text-tr-primary"
                        >
                          <Table2 size={14} />
                        </button>
                        <button
                          onClick={() => setForm({ open: true, line })}
                          title={t.common.edit}
                          aria-label={t.common.edit}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control sm:h-8 sm:w-8 text-tr-muted transition hover:bg-tr-hover hover:text-tr-text"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteId(line.id)}
                          title={t.common.delete}
                          aria-label={t.common.delete}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control sm:h-8 sm:w-8 text-tr-muted transition hover:bg-tr-hover hover:text-tr-danger"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
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
