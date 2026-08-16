import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import {
  ArrowLeft,
  Building2,
  FileSignature,
  Globe,
  ListPlus,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Trash2,
} from 'lucide-react';
import { api } from '../api/client';
import { CustomerForm } from '../components/crm/CustomerForm';
import { ContactList } from '../components/crm/ContactList';
import { DealForm } from '../components/crm/DealForm';
import { ContractForm } from '../components/crm/ContractForm';
import { QuotationForm } from '../components/crm/QuotationForm';
import { DocumentPanel } from '../components/crm/DocumentUpload';
import { InteractionTimeline } from '../components/crm/InteractionTimeline';
import { AiBrief } from '../components/ai/AiBrief';
import { CustomerServices } from '../components/crm/CustomerServices';
import { TaskTree } from '../components/tasks/TaskTree';
import { EntityLabels } from '../components/labels/EntityLabels';
import { Modal } from '../components/common/Modal';
import { Tabs } from '../components/common/Tabs';
import {
  Button,
  ColorBadge,
  EmptyState,
  ErrorState,
  IconButton,
  Skeleton,
  TableHead,
} from '../components/common/ui';
import {
  ACCOUNT_STATUS_COLORS,
  CONTRACT_STATUS_COLORS,
  QUOTATION_STATUS_COLORS,
  STAGE_COLORS,
  t,
} from '../i18n/vi';
import { formatDate, formatVND } from '../lib/format';
import { useUiStore } from '../stores/uiStore';
import type { Contract, CustomerFull, Deal, Quotation } from '../types';

type Tab =
  | 'info'
  | 'contacts'
  | 'deals'
  | 'quotations'
  | 'contracts'
  | 'services'
  | 'documents'
  | 'interactions'
  | 'tasks';

export default function CustomerDetailPage() {
  const { customerId } = useParams();
  const id = Number(customerId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>('info');
  const [editing, setEditing] = useState(false);
  const [dealForm, setDealForm] = useState<{ open: boolean; deal?: Deal | null }>({ open: false });
  const [contractForm, setContractForm] = useState<{ open: boolean; contract?: Contract | null }>({
    open: false,
  });
  const [quoteForm, setQuoteForm] = useState<{ open: boolean; quotation?: Quotation | null }>({
    open: false,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const openTaskComposer = useUiStore((s) => s.openTaskComposer);

  const {
    data: customer,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api.get<CustomerFull>(`/api/customers/${id}/full`),
    enabled: Number.isFinite(id),
  });

  /** BR-09: cho biết sẽ xóa theo bao nhiêu bản ghi liên quan. */
  const { data: impact } = useQuery({
    queryKey: ['customer', id, 'impact'],
    queryFn: () => api.get<Record<string, number>>(`/api/customers/${id}/impact`),
    enabled: confirmDelete,
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/api/customers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      navigate('/customers');
    },
  });

  if (error)
    return (
      <div className="p-6">
        <ErrorState onRetry={() => refetch()} />
      </div>
    );
  if (isLoading)
    return (
      <div role="status" aria-label={t.common.loading} className="space-y-4 p-6">
        <Skeleton className="h-24 rounded-panel" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-panel" />
          ))}
        </div>
      </div>
    );
  if (!customer) return <p className="p-6 text-sm text-tr-danger">Không tìm thấy khách hàng.</p>;

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'info', label: t.customer.info },
    { key: 'contacts', label: t.customer.contacts, count: customer.contacts.length },
    { key: 'deals', label: t.customer.deals, count: customer.deals.length },
    { key: 'quotations', label: 'Báo giá', count: customer.quotations?.length ?? 0 },
    { key: 'contracts', label: 'Hợp đồng', count: customer.contracts?.length ?? 0 },
    { key: 'services', label: t.revenue.service, count: customer.services?.length ?? 0 },
    { key: 'documents', label: 'Tài liệu', count: customer.documents?.length ?? 0 },
    { key: 'interactions', label: t.customer.interactions },
    { key: 'tasks', label: t.customer.tasks, count: customer.tasks.length },
  ];

  return (
    <div className="p-6">
      <div className="mb-4 flex items-start gap-3">
        <Link to="/customers" className="mt-1 rounded p-1 text-tr-muted hover:bg-tr-hover">
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-tr-text">{customer.name}</h2>
            {customer.short_name && (
              <span className="text-sm text-tr-muted">({customer.short_name})</span>
            )}
            <ColorBadge color={ACCOUNT_STATUS_COLORS[customer.status]}>
              {t.accountStatus[customer.status]}
            </ColorBadge>
            {customer.industry && (
              <span className="text-sm text-tr-muted">{customer.industry}</span>
            )}
            {customer.size && (
              <span className="rounded bg-tr-hover px-1.5 py-0.5 text-xs text-tr-subtle">
                {customer.size}
              </span>
            )}
          </div>
          {/* FR-TAG-06: gắn/gỡ nhãn ngay trên hồ sơ, không cần mở biểu mẫu sửa */}
          <div className="mt-1.5">
            <EntityLabels entityType="customer" entityId={id} />
          </div>
          <div className="mt-1 flex flex-wrap gap-4 text-sm text-tr-muted">
            <span>
              {t.customer.totalWon}:{' '}
              <strong className="text-tr-success">{formatVND(customer.total_won_vnd)}</strong>
            </span>
            <span>
              {t.customer.openPipeline}:{' '}
              <strong className="text-tr-primary">{formatVND(customer.open_pipeline_vnd)}</strong>
            </span>
            {!!customer.active_contract_count && (
              <span>
                Hợp đồng hiệu lực: <strong>{customer.active_contract_count}</strong>
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setEditing(true)}>
            <Pencil size={15} /> {t.common.edit}
          </Button>
          <Button variant="ghost" className="text-tr-danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={15} />
          </Button>
        </div>
      </div>

      <div className="mb-4">
        <AiBrief contextType="customer" contextId={id} compact />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        items={TABS.map((item) => ({
          value: item.key,
          label: item.label,
          count: item.count,
        }))}
        ariaLabel="Nội dung khách hàng"
        idPrefix="custab"
        className="mb-4"
      >
        {tab === 'info' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-tr-border bg-tr-panel p-4 text-sm">
              <InfoRow icon={Building2} label={t.customer.taxCode} value={customer.tax_code} />
              <InfoRow icon={Phone} label={t.customer.phone} value={customer.phone} />
              <InfoRow icon={Mail} label={t.customer.email} value={customer.email} />
              <InfoRow icon={Globe} label={t.customer.website} value={customer.website} />
              <InfoRow icon={MapPin} label={t.customer.address} value={customer.address} />
              <InfoRow icon={Building2} label="Nguồn" value={customer.source} />
            </div>
            <div className="rounded-lg border border-tr-border bg-tr-panel p-4">
              <h3 className="mb-2 text-sm font-semibold text-tr-subtle">{t.customer.notes}</h3>
              <p className="text-sm whitespace-pre-wrap text-tr-text">{customer.notes || '—'}</p>
              {customer.boards.length > 0 && (
                <>
                  <h3 className="mt-4 mb-2 text-sm font-semibold text-tr-subtle">{t.nav.boards}</h3>
                  <div className="flex flex-wrap gap-2">
                    {customer.boards.map((b) => (
                      <Link
                        key={b.id}
                        to={`/boards/${b.id}`}
                        className="rounded-md px-2 py-1 text-xs font-medium text-white"
                        style={{ backgroundColor: b.color }}
                      >
                        {b.name}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'contacts' && <ContactList customerId={id} contacts={customer.contacts} />}

        {tab === 'deals' && (
          <TableSection
            onAdd={() => setDealForm({ open: true, deal: null })}
            addLabel={t.deal.newDeal}
            empty={t.deal.noDeals}
            isEmpty={customer.deals.length === 0}
            headers={[
              'Tên cơ hội',
              'Giai đoạn',
              'Xác suất',
              'Giá trị',
              'Dự kiến chốt',
              'Next Action',
              '',
            ]}
          >
            {customer.deals.map((d) => (
              <tr key={d.id} className="hover:bg-tr-hover">
                <td className="px-4 py-2.5 font-medium text-tr-text">{d.title}</td>
                <td className="px-4 py-2.5">
                  <ColorBadge color={STAGE_COLORS[d.stage]}>{t.stage[d.stage]}</ColorBadge>
                </td>
                <td className="px-4 py-2.5 text-tr-subtle tabular-nums">{d.probability}%</td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                  {formatVND(d.value_vnd)}
                </td>
                <td className="px-4 py-2.5 text-tr-subtle">
                  {formatDate(d.expected_close_date) || '—'}
                </td>
                <td className="px-4 py-2.5 text-xs text-tr-subtle">
                  {d.next_action
                    ? `${d.next_action}${d.next_action_date ? ` · ${formatDate(d.next_action_date)}` : ''}`
                    : '—'}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <IconButton
                    onClick={() => setDealForm({ open: true, deal: d })}
                    label={`${t.common.edit}: ${d.title}`}
                  >
                    <Pencil size={13} aria-hidden="true" />
                  </IconButton>
                </td>
              </tr>
            ))}
          </TableSection>
        )}

        {tab === 'quotations' && (
          <TableSection
            onAdd={() => setQuoteForm({ open: true, quotation: null })}
            addLabel="Thêm báo giá"
            empty="Chưa có báo giá nào."
            isEmpty={(customer.quotations?.length ?? 0) === 0}
            headers={[
              'Mã / phiên bản',
              'Cơ hội',
              'Ngày báo giá',
              'Giá trị',
              'Hiệu lực đến',
              'Trạng thái',
              '',
            ]}
          >
            {customer.quotations?.map((q) => (
              <tr key={q.id} className="hover:bg-tr-hover">
                <td className="px-4 py-2.5 font-medium text-tr-text">
                  {q.code || 'Không mã'} <span className="text-xs text-tr-muted">v{q.version}</span>
                </td>
                <td className="px-4 py-2.5 text-tr-subtle">{q.deal_title ?? '—'}</td>
                <td className="px-4 py-2.5 text-tr-subtle">{formatDate(q.quote_date) || '—'}</td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                  {formatVND(q.value_vnd)}
                </td>
                <td className="px-4 py-2.5 text-tr-subtle">{formatDate(q.valid_until) || '—'}</td>
                <td className="px-4 py-2.5">
                  <ColorBadge color={QUOTATION_STATUS_COLORS[q.status]}>
                    {t.quotationStatus[q.status]}
                  </ColorBadge>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1">
                    <IconButton
                      onClick={() => openTaskComposer({ context: { quotation_id: q.id } })}
                      label={`Tạo công việc cho báo giá ${q.code || q.id}`}
                    >
                      <ListPlus size={13} aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      onClick={() => setQuoteForm({ open: true, quotation: q })}
                      label={`${t.common.edit}: ${q.code || 'báo giá'}`}
                    >
                      <Pencil size={13} aria-hidden="true" />
                    </IconButton>
                  </div>
                </td>
              </tr>
            ))}
          </TableSection>
        )}

        {tab === 'contracts' && (
          <TableSection
            onAdd={() => setContractForm({ open: true, contract: null })}
            addLabel="Thêm hợp đồng"
            empty="Chưa có hợp đồng nào."
            isEmpty={(customer.contracts?.length ?? 0) === 0}
            headers={['Hợp đồng', 'Giá trị', 'Hiệu lực', 'Còn lại', 'Trạng thái', '']}
          >
            {customer.contracts?.map((c) => (
              <tr key={c.id} className="hover:bg-tr-hover">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2 font-medium text-tr-text">
                    <FileSignature size={14} className="text-tr-muted" />
                    {c.name}
                  </div>
                  {c.number && <div className="text-xs text-tr-muted">Số {c.number}</div>}
                </td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                  {formatVND(c.value_vnd)}
                </td>
                <td className="px-4 py-2.5 text-xs text-tr-subtle">
                  {formatDate(c.start_date) || '—'} → {formatDate(c.end_date) || '—'}
                </td>
                <td className="px-4 py-2.5 text-xs text-tr-subtle">
                  {c.days_left === null || c.days_left === undefined
                    ? '—'
                    : c.days_left < 0
                      ? `Quá ${-c.days_left} ngày`
                      : `${c.days_left} ngày`}
                </td>
                <td className="px-4 py-2.5">
                  <ColorBadge color={CONTRACT_STATUS_COLORS[c.status]}>
                    {t.contractStatus[c.status]}
                  </ColorBadge>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <IconButton
                    onClick={() => setContractForm({ open: true, contract: c })}
                    label={`${t.common.edit}: ${c.name}`}
                  >
                    <Pencil size={13} aria-hidden="true" />
                  </IconButton>
                </td>
              </tr>
            ))}
          </TableSection>
        )}

        {tab === 'services' && <CustomerServices customerId={id} />}

        {tab === 'documents' && <DocumentPanel links={{ customer_id: id }} />}

        {tab === 'interactions' && (
          <InteractionTimeline
            customerId={id}
            interactions={customer.interactions}
            contacts={customer.contacts}
            deals={customer.deals}
          />
        )}

        {tab === 'tasks' && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button
                variant="primary"
                onClick={() => openTaskComposer({ context: { customer_id: id } })}
              >
                <Plus size={15} /> Tạo công việc
              </Button>
            </div>
            <TaskTree
              tasks={customer.tasks}
              columns={{ customer: false }}
              emptyMessage="Chưa có công việc nào gắn với khách hàng này."
              onChanged={() => queryClient.invalidateQueries({ queryKey: ['customer', id] })}
            />
          </div>
        )}
      </Tabs>

      <CustomerForm open={editing} onClose={() => setEditing(false)} customer={customer} />
      <DealForm
        open={dealForm.open}
        deal={dealForm.deal}
        defaultCustomerId={id}
        onClose={() => setDealForm({ open: false })}
      />
      <ContractForm
        open={contractForm.open}
        contract={contractForm.contract}
        defaultCustomerId={id}
        onClose={() => setContractForm({ open: false })}
      />
      <QuotationForm
        open={quoteForm.open}
        quotation={quoteForm.quotation}
        defaultCustomerId={id}
        onClose={() => setQuoteForm({ open: false })}
      />

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Xóa khách hàng"
        width="max-w-md"
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>{t.common.cancel}</Button>
            <Button variant="danger" onClick={() => remove.mutate()}>
              {t.common.delete}
            </Button>
          </>
        }
      >
        <p className="text-sm text-tr-subtle">
          Xóa <strong className="text-tr-text">{customer.name}</strong> sẽ xóa theo:
        </p>
        {impact && (
          <ul className="mt-2 space-y-0.5 text-sm text-tr-subtle">
            {[
              ['contacts', 'người liên hệ'],
              ['deals', 'cơ hội'],
              ['contracts', 'hợp đồng'],
              ['quotations', 'báo giá'],
              ['documents', 'tài liệu'],
              ['services', 'dòng dịch vụ & doanh thu'],
              ['interactions', 'tương tác'],
            ].map(([key, label]) =>
              impact[key] ? (
                <li key={key}>
                  • {impact[key]} {label}
                </li>
              ) : null
            )}
            {impact.tasks ? <li>• {impact.tasks} công việc sẽ bị gỡ liên kết</li> : null}
          </ul>
        )}
      </Modal>
    </div>
  );
}

function TableSection({
  headers,
  children,
  onAdd,
  addLabel,
  empty,
  isEmpty,
}: {
  headers: string[];
  children: React.ReactNode;
  onAdd: () => void;
  addLabel: string;
  empty: string;
  isEmpty: boolean;
}) {
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button variant="primary" onClick={onAdd}>
          <Plus size={15} /> {addLabel}
        </Button>
      </div>
      {isEmpty ? (
        <EmptyState message={empty} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-tr-border bg-tr-panel">
          <table className="w-full text-sm">
            <TableHead>
              <tr>
                {headers.map((h, i) => (
                  <th scope="col" key={i} className="px-4 py-2.5 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </TableHead>
            <tbody className="divide-y divide-tr-border">{children}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Phone;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={15} className="mt-0.5 shrink-0 text-tr-muted" />
      <span className="w-28 shrink-0 text-tr-muted">{label}</span>
      <span className="min-w-0 flex-1 break-words text-tr-text">{value || '—'}</span>
    </div>
  );
}
