import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings2 } from 'lucide-react';
import { api } from '../../api/client';
import { Combobox } from '../common/Combobox';
import { Modal } from '../common/Modal';
import { DateInput, Field, FormModalActions, Input, Select, Textarea } from '../common/ui';
import { ServiceCatalog } from './ServiceCatalog';
import { CONTRACT_KIND_ORDER, CONTRACT_TERM_ORDER, SERVICE_STATUS_ORDER, t } from '../../i18n/vi';
import { invalidateRevenueViews } from '../../lib/queryKeys';
import { useCustomerOptions } from '../../lib/useCrmOptions';
import type {
  ContractKind,
  ContractTerm,
  Contract,
  RevenueLine,
  Service,
  ServiceStatus,
} from '../../types';

const EMPTY = {
  am: '',
  contract_kind: 'new' as ContractKind,
  contract_term: 'long' as ContractTerm,
  status: 'using' as ServiceStatus,
  start_date: null as string | null,
  end_date: null as string | null,
  notes: '',
};

/** Thêm / sửa một dòng "khách hàng × dịch vụ" trong bảng doanh thu. */
export function RevenueLineForm({
  open,
  onClose,
  line,
  defaultCustomerId,
}: {
  open: boolean;
  onClose: () => void;
  line?: RevenueLine | null;
  defaultCustomerId?: number;
}) {
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [contractId, setContractId] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const { data: customers = [] } = useCustomerOptions(open);

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.get<Service[]>('/api/services'),
    enabled: open,
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ['contracts', 'byCustomer', customerId],
    queryFn: () => api.get<Contract[]>(`/api/contracts?customer_id=${customerId}`),
    enabled: open && customerId !== '',
  });

  const { data: ams = [] } = useQuery({
    queryKey: ['revenues', 'ams'],
    queryFn: () => api.get<string[]>('/api/revenues/ams'),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setCustomerId(String(line?.customer_id ?? defaultCustomerId ?? ''));
    setServiceId(String(line?.service_id ?? ''));
    setContractId(String(line?.contract_id ?? ''));
    setForm(
      line
        ? {
            am: line.am ?? '',
            contract_kind: line.contract_kind,
            contract_term: line.contract_term,
            status: line.status,
            start_date: line.start_date,
            end_date: line.end_date,
            notes: line.notes ?? '',
          }
        : EMPTY
    );
  }, [open, line?.id]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        am: form.am.trim() || null,
        customer_id: Number(customerId),
        service_id: serviceId === '' ? null : Number(serviceId),
        contract_id: contractId === '' ? null : Number(contractId),
      };
      return line
        ? api.patch(`/api/revenues/lines/${line.id}`, payload)
        : api.post('/api/revenues/lines', payload);
    },
    onSuccess: () => {
      invalidateRevenueViews(queryClient, Number(customerId));
      onClose();
    },
  });

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const activeServices = services.filter((s) => s.is_active || String(s.id) === serviceId);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        width="max-w-2xl"
        title={line ? `${t.common.edit}: ${line.customer_name}` : t.revenue.newLine}
        footer={
          <FormModalActions
            onCancel={onClose}
            onSubmit={() => save.mutate()}
            pending={save.isPending}
            disabled={!customerId}
          />
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t.card.customer}>
            <Combobox
              value={customerId === '' ? '' : Number(customerId)}
              onChange={(v) => setCustomerId(v === '' ? '' : String(v))}
              options={customers.map((c) => ({ id: c.id, label: c.name }))}
              placeholder="— chọn khách hàng —"
              searchPlaceholder="Tìm khách hàng…"
              emptyText="Không tìm thấy khách hàng."
              ariaLabel={t.card.customer}
            />
          </Field>
          <Field
            label={
              <span className="flex items-center justify-between gap-2">
                {t.revenue.service}
                <button
                  type="button"
                  onClick={() => setCatalogOpen(true)}
                  className="inline-flex items-center gap-1 text-2xs font-medium text-tr-primary hover:underline"
                >
                  <Settings2 size={12} /> {t.service.manage}
                </button>
              </span>
            }
          >
            <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="">— {t.common.none} —</option>
              {activeServices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.revenue.am} hint="Người phụ trách khách hàng">
            <Input
              list="revenue-am-list"
              value={form.am}
              onChange={(e) => set('am', e.target.value)}
              placeholder="Nhập tên AM…"
            />
            <datalist id="revenue-am-list">
              {ams.map((am) => (
                <option key={am} value={am} />
              ))}
            </datalist>
          </Field>
          <Field label="Hợp đồng liên quan" hint={t.common.optional}>
            <Select
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
              disabled={!customerId}
            >
              <option value="">— {t.common.none} —</option>
              {contracts.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                  {k.number ? ` (${k.number})` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.revenue.contractKind} hint="Khách mới hay mở rộng trên khách hiện hữu">
            <Select
              value={form.contract_kind}
              onChange={(e) => set('contract_kind', e.target.value as ContractKind)}
            >
              {CONTRACT_KIND_ORDER.map((k) => (
                <option key={k} value={k}>
                  {t.contractKind[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.revenue.contractTerm}>
            <Select
              value={form.contract_term}
              onChange={(e) => set('contract_term', e.target.value as ContractTerm)}
            >
              {CONTRACT_TERM_ORDER.map((k) => (
                <option key={k} value={k}>
                  {t.contractTerm[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.revenue.status}>
            <Select
              value={form.status}
              onChange={(e) => set('status', e.target.value as ServiceStatus)}
            >
              {SERVICE_STATUS_ORDER.map((k) => (
                <option key={k} value={k}>
                  {t.serviceStatus[k]}
                </option>
              ))}
            </Select>
          </Field>
          <div />
          <Field label="Bắt đầu sử dụng">
            <DateInput value={form.start_date} onChange={(v) => set('start_date', v)} />
          </Field>
          <Field label="Kết thúc / ngừng">
            <DateInput value={form.end_date} onChange={(v) => set('end_date', v)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t.customer.notes}>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </Field>
          </div>
        </div>
      </Modal>

      <ServiceCatalog open={catalogOpen} onClose={() => setCatalogOpen(false)} />
    </>
  );
}
