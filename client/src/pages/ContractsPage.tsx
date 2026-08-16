import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { FileSignature, ListPlus, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api, qs } from '../api/client';
import { ContractForm } from '../components/crm/ContractForm';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import {
  Button,
  ColorBadge,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Panel,
  Select,
  SkeletonRows,
  TableHead,
} from '../components/common/ui';
import { CONTRACT_STATUS_COLORS, CONTRACT_STATUS_ORDER, t } from '../i18n/vi';
import { formatDate, formatVND } from '../lib/format';
import { useUiStore } from '../stores/uiStore';
import type { Contract } from '../types';

/** Màu cảnh báo theo số ngày còn lại (FR-CTR-04). */
function urgencyClass(days: number | null | undefined): string {
  if (days === null || days === undefined) return 'text-tr-muted';
  if (days < 0) return 'tr-badge-overdue rounded px-1.5 py-0.5';
  if (days <= 30) return 'tr-badge-overdue rounded px-1.5 py-0.5';
  if (days <= 60) return 'tr-badge-soon rounded px-1.5 py-0.5';
  return 'text-tr-subtle';
}

export default function ContractsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const pushToast = useUiStore((s) => s.pushToast);
  const openTaskComposer = useUiStore((s) => s.openTaskComposer);
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const [form, setForm] = useState<{ open: boolean; contract?: Contract | null }>({ open: false });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const focusId = Number(searchParams.get('focus')) || null;

  const {
    data: contracts = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['contracts', { q: term, status }],
    queryFn: () => api.get<Contract[]>(`/api/contracts${qs({ q: term, status })}`),
  });

  const { data: expiring = [] } = useQuery({
    queryKey: ['contracts', 'expiring'],
    queryFn: () => api.get<Contract[]>('/api/contracts/expiring?within=90'),
  });

  useEffect(() => {
    if (!focusId || contracts.length === 0) return;
    const contract = contracts.find((item) => item.id === focusId);
    if (!contract) return;
    setForm({ open: true, contract });
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('focus');
        return next;
      },
      { replace: true }
    );
  }, [contracts, focusId, setSearchParams]);

  const renew = useMutation({
    mutationFn: (id: number) => api.post<{ id: number }>(`/api/contracts/${id}/renew`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      pushToast('Đã tạo cơ hội gia hạn trong pipeline', 'success');
      navigate('/pipeline');
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/contracts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contracts'] }),
  });

  const buckets = [
    { label: 'Còn dưới 30 ngày', items: expiring.filter((c) => (c.days_left ?? 0) <= 30) },
    {
      label: '30 – 60 ngày',
      items: expiring.filter((c) => (c.days_left ?? 0) > 30 && (c.days_left ?? 0) <= 60),
    },
    { label: '60 – 90 ngày', items: expiring.filter((c) => (c.days_left ?? 0) > 60) },
  ];

  return (
    <div className="space-y-4 p-6">
      {/* FR-REN-01: danh sách hợp đồng sắp hết hạn theo 3 mốc */}
      <Panel title="Sắp hết hạn — cần gia hạn">
        {expiring.length === 0 ? (
          <p className="py-4 text-center text-sm text-tr-muted">
            Không có hợp đồng nào hết hạn trong 90 ngày tới.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {buckets.map((bucket) => (
              <div key={bucket.label}>
                <h3 className="mb-2 text-xs font-semibold text-tr-subtle">
                  {bucket.label}{' '}
                  <span className="font-normal text-tr-muted">({bucket.items.length})</span>
                </h3>
                <ul className="space-y-2">
                  {bucket.items.map((c) => (
                    <li key={c.id} className="tr-card-shadow rounded-lg bg-tr-card p-2.5 text-sm">
                      <div className="font-medium text-tr-text">{c.name}</div>
                      <Link
                        to={`/customers/${c.customer_id}`}
                        className="text-xs text-tr-primary hover:underline"
                      >
                        {c.customer_name}
                      </Link>
                      <div className="mt-1 flex items-center justify-between text-xs">
                        <span className={urgencyClass(c.days_left)}>
                          {c.days_left! < 0
                            ? `Quá hạn ${-c.days_left!} ngày`
                            : `Còn ${c.days_left} ngày`}
                        </span>
                        <span className="text-tr-subtle">{formatVND(c.value_vnd)}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          variant={c.renewal_followed ? 'secondary' : 'primary'}
                          onClick={() => renew.mutate(c.id)}
                          className="px-2 py-1 text-xs"
                        >
                          <RefreshCw size={13} />
                          {c.renewal_followed ? 'Tạo lại cơ hội' : 'Tạo cơ hội gia hạn'}
                        </Button>
                        {!!c.renewal_followed && (
                          <span className="text-2xs text-tr-success">Đã theo dõi</span>
                        )}
                      </div>
                    </li>
                  ))}
                  {bucket.items.length === 0 && <li className="text-xs text-tr-muted">—</li>}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-72">
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Tìm hợp đồng (không cần dấu)…"
          />
        </div>
        <div className="w-48">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t.common.all}</option>
            {CONTRACT_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {t.contractStatus[s]}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="primary" className="ml-auto" onClick={() => setForm({ open: true })}>
          <Plus size={16} /> Thêm hợp đồng
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-panel border border-tr-border bg-tr-panel">
          <SkeletonRows rows={6} cols={5} />
        </div>
      ) : error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : contracts.length === 0 ? (
        <EmptyState
          message="Chưa có hợp đồng nào."
          action={
            <Button variant="primary" onClick={() => setForm({ open: true })}>
              <Plus size={16} /> Thêm hợp đồng
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-tr-border bg-tr-panel shadow-sm">
          <table className="w-full text-sm">
            <TableHead>
              <tr>
                <th scope="col" className="px-4 py-2.5">
                  Hợp đồng
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Khách hàng
                </th>
                <th scope="col" className="px-4 py-2.5 text-right">
                  Giá trị
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Hiệu lực
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Còn lại
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Trạng thái
                </th>
                <th scope="col" className="px-4 py-2.5"></th>
              </tr>
            </TableHead>
            <tbody className="divide-y divide-tr-border">
              {contracts.map((c) => (
                <tr key={c.id} className="transition hover:bg-tr-hover">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2 font-medium text-tr-text">
                      <FileSignature size={14} className="text-tr-muted" />
                      {c.name}
                    </div>
                    {c.number && <div className="text-xs text-tr-muted">Số {c.number}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      to={`/customers/${c.customer_id}`}
                      className="text-tr-primary hover:underline"
                    >
                      {c.customer_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                    {formatVND(c.value_vnd)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-tr-subtle">
                    {formatDate(c.start_date) || '—'} → {formatDate(c.end_date) || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {c.days_left === null || c.days_left === undefined ? (
                      <span className="text-tr-muted">—</span>
                    ) : (
                      <span className={urgencyClass(c.days_left)}>
                        {c.days_left < 0 ? `Quá ${-c.days_left} ngày` : `${c.days_left} ngày`}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <ColorBadge color={CONTRACT_STATUS_COLORS[c.status]}>
                      {t.contractStatus[c.status]}
                    </ColorBadge>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <IconButton
                        onClick={() => setForm({ open: true, contract: c })}
                        label={`${t.common.edit}: ${c.name}`}
                      >
                        <Pencil size={14} aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        onClick={() => openTaskComposer({ context: { contract_id: c.id } })}
                        label={`Tạo công việc cho hợp đồng ${c.name}`}
                      >
                        <ListPlus size={14} aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        onClick={() => setDeleteId(c.id)}
                        label={`${t.common.delete}: ${c.name}`}
                        tone="danger"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ContractForm
        open={form.open}
        contract={form.contract}
        onClose={() => setForm({ open: false })}
      />
      <ConfirmDialog
        open={deleteId !== null}
        message="Xóa hợp đồng này? Tài liệu đính kèm sẽ mất liên kết."
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) remove.mutate(deleteId);
          setDeleteId(null);
        }}
      />
    </div>
  );
}
