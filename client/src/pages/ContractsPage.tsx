import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  Eye,
  FileSignature,
  ListPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { api, qs } from '../api/client';
import { ContractForm } from '../components/crm/ContractForm';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Popover, PopoverItem } from '../components/common/Popover';
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
import { formatDate, formatVND, formatVNDShort } from '../lib/format';
import { useUiStore } from '../stores/uiStore';
import type { Contract } from '../types';

/** Màu cảnh báo theo số ngày còn lại (FR-CTR-04). Đỏ chỉ dùng cho hợp đồng đã quá hạn. */
function urgencyClass(days: number | null | undefined): string {
  if (days === null || days === undefined) return 'text-tr-muted';
  if (days < 0) return 'tr-badge-overdue rounded px-1.5 py-0.5';
  if (days <= 30) return 'tr-badge-warn rounded px-1.5 py-0.5';
  if (days <= 60) return 'tr-badge-soon rounded px-1.5 py-0.5';
  return 'text-tr-subtle';
}

type DeadlineFilter = '' | 'overdue' | 'expiring' | 'safe';

const DEADLINE_FILTERS: { value: DeadlineFilter; label: string }[] = [
  { value: '', label: 'Mọi thời hạn' },
  { value: 'overdue', label: 'Quá hạn' },
  { value: 'expiring', label: 'Sắp hết hạn (≤ 90 ngày)' },
  { value: 'safe', label: 'Còn hiệu lực dài' },
];

/** Lọc client-side dựa trên days_left đã có sẵn trên mỗi hợp đồng — không gọi thêm API. */
function matchesDeadline(contract: Contract, filter: DeadlineFilter): boolean {
  if (!filter) return true;
  const d = contract.days_left;
  if (filter === 'overdue') return d !== null && d !== undefined && d < 0;
  if (filter === 'expiring') return d !== null && d !== undefined && d >= 0 && d <= 90;
  return d === null || d === undefined || d > 90;
}

export default function ContractsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const pushToast = useUiStore((s) => s.pushToast);
  const openTaskComposer = useUiStore((s) => s.openTaskComposer);
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const [deadline, setDeadline] = useState<DeadlineFilter>('');
  const [form, setForm] = useState<{ open: boolean; contract?: Contract | null }>({ open: false });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [menuFor, setMenuFor] = useState<{ id: number; anchor: HTMLElement } | null>(null);
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
    { label: 'Dưới 30 ngày', items: expiring.filter((c) => (c.days_left ?? 0) <= 30) },
    {
      label: '30 – 60 ngày',
      items: expiring.filter((c) => (c.days_left ?? 0) > 30 && (c.days_left ?? 0) <= 60),
    },
    { label: '60 – 90 ngày', items: expiring.filter((c) => (c.days_left ?? 0) > 60) },
  ];

  const filteredContracts = useMemo(
    () => contracts.filter((c) => matchesDeadline(c, deadline)),
    [contracts, deadline]
  );
  const totalValue = useMemo(
    () => filteredContracts.reduce((sum, c) => sum + (c.value_vnd ?? 0), 0),
    [filteredContracts]
  );
  const hasActiveFilters = Boolean(term || status || deadline);
  const menuTarget = menuFor ? (contracts.find((c) => c.id === menuFor.id) ?? null) : null;

  return (
    <div className="space-y-4 p-6">
      {/* FR-REN-01: danh sách hợp đồng sắp hết hạn theo 3 mốc — panel gọn, ưu tiên mật độ thông tin */}
      <Panel
        title="Sắp hết hạn — cần gia hạn"
        action={
          expiring.length > 0 ? (
            <span className="text-xs font-normal text-tr-muted">
              {expiring.length} hợp đồng cần theo dõi
            </span>
          ) : undefined
        }
      >
        {expiring.length === 0 ? (
          <p className="py-2 text-center text-sm text-tr-muted">
            Không có hợp đồng nào hết hạn trong 90 ngày tới.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {buckets.map((bucket) => (
                <span
                  key={bucket.label}
                  className={`inline-flex items-center gap-1.5 rounded-control border px-2.5 py-1 text-xs font-medium ${
                    bucket.items.length > 0
                      ? 'border-tr-border bg-tr-hover text-tr-text'
                      : 'border-dashed border-tr-border/60 text-tr-muted'
                  }`}
                >
                  {bucket.label}
                  <span className={bucket.items.length > 0 ? 'font-bold' : ''}>
                    {bucket.items.length}
                  </span>
                </span>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {expiring.map((c) => (
                <RenewalCard
                  key={c.id}
                  contract={c}
                  onRenew={() => renew.mutate(c.id)}
                  pending={renew.isPending}
                />
              ))}
            </div>
          </div>
        )}
      </Panel>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-base font-bold text-tr-text">Hợp đồng</p>
        {!isLoading && !error && (
          <p className="text-xs text-tr-muted">
            {filteredContracts.length} hợp đồng · Tổng giá trị {formatVNDShort(totalValue)} ·{' '}
            {expiring.length} sắp hết hạn
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-tr-border bg-tr-panel p-2.5">
        <div className="min-w-[220px] flex-1 sm:max-w-xs">
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Tìm theo tên hoặc số hợp đồng…"
            aria-label="Tìm hợp đồng"
          />
        </div>
        <div className="w-40">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Trạng thái"
          >
            <option value="">{t.common.all}</option>
            {CONTRACT_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {t.contractStatus[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-52">
          <Select
            value={deadline}
            onChange={(e) => setDeadline(e.target.value as DeadlineFilter)}
            aria-label="Thời hạn"
          >
            {DEADLINE_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
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
          <SkeletonRows rows={6} cols={6} />
        </div>
      ) : error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : filteredContracts.length === 0 && !hasActiveFilters ? (
        <EmptyState
          message="Chưa có hợp đồng nào"
          hint="Bạn chưa có hợp đồng nào trong danh sách này."
          action={
            <Button variant="primary" onClick={() => setForm({ open: true })}>
              <Plus size={16} /> Thêm hợp đồng
            </Button>
          }
        />
      ) : filteredContracts.length === 0 ? (
        <EmptyState
          message="Không tìm thấy hợp đồng"
          hint="Thử thay đổi từ khóa hoặc bộ lọc."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setTerm('');
                setStatus('');
                setDeadline('');
              }}
            >
              Xóa bộ lọc
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-tr-border bg-tr-panel shadow-sm">
          <table className="w-full min-w-[880px] text-sm">
            <TableHead>
              <tr>
                <th scope="col" className="px-4 py-2">
                  Hợp đồng
                </th>
                <th scope="col" className="px-4 py-2">
                  Khách hàng
                </th>
                <th scope="col" className="px-4 py-2 text-right">
                  Giá trị
                </th>
                <th scope="col" className="px-4 py-2">
                  Hiệu lực
                </th>
                <th scope="col" className="px-4 py-2">
                  Còn lại
                </th>
                <th scope="col" className="px-4 py-2">
                  Trạng thái
                </th>
                <th scope="col" className="px-4 py-2"></th>
              </tr>
            </TableHead>
            <tbody className="divide-y divide-tr-border">
              {filteredContracts.map((c) => (
                <tr key={c.id} className="transition hover:bg-tr-hover">
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => setForm({ open: true, contract: c })}
                      className="group flex items-center gap-2 text-left"
                    >
                      <FileSignature
                        size={14}
                        className="shrink-0 text-tr-muted"
                        aria-hidden="true"
                      />
                      <span className="truncate font-semibold text-tr-text group-hover:text-tr-primary group-hover:underline">
                        {c.name}
                      </span>
                    </button>
                    {c.number && (
                      <div className="mt-0.5 pl-[22px] text-xs text-tr-muted">Số {c.number}</div>
                    )}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <Link
                      to={`/customers/${c.customer_id}`}
                      className="text-tr-primary hover:underline"
                    >
                      {c.customer_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums whitespace-nowrap">
                    {formatVND(c.value_vnd)}
                  </td>
                  <td className="px-4 py-2 text-xs whitespace-nowrap text-tr-muted">
                    {formatDate(c.start_date) || '—'} → {formatDate(c.end_date) || '—'}
                  </td>
                  <td className="px-4 py-2 text-xs whitespace-nowrap">
                    {c.days_left === null || c.days_left === undefined ? (
                      <span className="text-tr-muted">—</span>
                    ) : (
                      <span className={urgencyClass(c.days_left)}>
                        {c.days_left < 0
                          ? `Quá hạn ${-c.days_left} ngày`
                          : `Còn ${c.days_left} ngày`}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <ColorBadge color={CONTRACT_STATUS_COLORS[c.status]}>
                      {`● ${t.contractStatus[c.status]}`}
                    </ColorBadge>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setForm({ open: true, contract: c })}
                      >
                        <Eye size={13} /> Xem
                      </Button>
                      <IconButton
                        onClick={(e) => setMenuFor({ id: c.id, anchor: e.currentTarget })}
                        label={`Thao tác khác: ${c.name}`}
                      >
                        <MoreHorizontal size={16} aria-hidden="true" />
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
      {menuFor && menuTarget && (
        <Popover
          open
          onClose={() => setMenuFor(null)}
          anchor={menuFor.anchor}
          title={menuTarget.name}
          width={232}
        >
          <PopoverItem
            icon={<Pencil size={15} aria-hidden="true" />}
            onClick={() => {
              setForm({ open: true, contract: menuTarget });
              setMenuFor(null);
            }}
          >
            {t.common.edit}
          </PopoverItem>
          <PopoverItem
            icon={<ListPlus size={15} aria-hidden="true" />}
            onClick={() => {
              openTaskComposer({ context: { contract_id: menuTarget.id } });
              setMenuFor(null);
            }}
          >
            Tạo công việc
          </PopoverItem>
          {menuTarget.status === 'active' && (
            <PopoverItem
              icon={<RefreshCw size={15} aria-hidden="true" />}
              onClick={() => {
                renew.mutate(menuTarget.id);
                setMenuFor(null);
              }}
            >
              Tạo cơ hội gia hạn
            </PopoverItem>
          )}
          <div className="my-1 -mx-3 border-t border-tr-border" />
          <PopoverItem
            icon={<Trash2 size={15} aria-hidden="true" />}
            danger
            onClick={() => {
              setDeleteId(menuTarget.id);
              setMenuFor(null);
            }}
          >
            Xóa hợp đồng
          </PopoverItem>
        </Popover>
      )}
    </div>
  );
}

/** Card gọn cho hợp đồng cần gia hạn — tên, khách hàng, số ngày còn lại, giá trị, CTA. */
function RenewalCard({
  contract,
  onRenew,
  pending,
}: {
  contract: Contract;
  onRenew: () => void;
  pending: boolean;
}) {
  return (
    <div className="tr-card-shadow flex flex-col gap-1.5 rounded-lg border border-tr-border bg-tr-card p-2.5 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-tr-text">{contract.name}</div>
          <Link
            to={`/customers/${contract.customer_id}`}
            className="block truncate text-xs text-tr-primary hover:underline"
          >
            {contract.customer_name}
          </Link>
        </div>
        <span className={`shrink-0 text-xs font-medium ${urgencyClass(contract.days_left)}`}>
          {contract.days_left! < 0
            ? `Quá hạn ${-contract.days_left!} ngày`
            : `Còn ${contract.days_left} ngày`}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold tabular-nums text-tr-text">
          {formatVND(contract.value_vnd)}
        </span>
        <div className="flex items-center gap-2">
          {!!contract.renewal_followed && (
            <span className="text-2xs whitespace-nowrap text-tr-success">Đã theo dõi</span>
          )}
          <Button
            variant={contract.renewal_followed ? 'secondary' : 'primary'}
            onClick={onRenew}
            disabled={pending}
            className="px-2 py-1 text-xs whitespace-nowrap"
          >
            <RefreshCw size={13} />
            Tạo cơ hội gia hạn
          </Button>
        </div>
      </div>
    </div>
  );
}
