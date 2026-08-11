import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Modal } from '../common/Modal';
import {
  Button,
  DateInput,
  Field,
  FormError,
  Input,
  MoneyInput,
  Select,
  Textarea,
} from '../common/ui';
import { CONTRACT_STATUS_ORDER, t } from '../../i18n/vi';
import { invalidateCrmViews } from '../../lib/queryKeys';
import type { Contract, Customer, DealsResponse } from '../../types';

const EMPTY = {
  name: '',
  number: '',
  value_vnd: 0,
  sign_date: null as string | null,
  start_date: null as string | null,
  end_date: null as string | null,
  status: 'draft',
  payment_terms: '',
  notes: '',
};

export function ContractForm({
  open,
  onClose,
  contract,
  defaultCustomerId,
}: {
  open: boolean;
  onClose: () => void;
  contract?: Contract | null;
  defaultCustomerId?: number;
}) {
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [dealId, setDealId] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [submitted, setSubmitted] = useState(false);

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', 'select'],
    queryFn: () => api.get<Customer[]>('/api/customers'),
    staleTime: 60_000,
    enabled: open,
  });

  const { data: dealsData } = useQuery({
    queryKey: ['deals', 'byCustomer', customerId],
    queryFn: () => api.get<DealsResponse>(`/api/deals?customer_id=${customerId}`),
    enabled: open && customerId !== '',
  });
  const deals = dealsData ? Object.values(dealsData.stages).flat() : [];

  useEffect(() => {
    if (!open) return;
    setCustomerId(String(contract?.customer_id ?? defaultCustomerId ?? ''));
    setDealId(String(contract?.deal_id ?? ''));
    setForm(
      contract
        ? {
            name: contract.name,
            number: contract.number ?? '',
            value_vnd: contract.value_vnd,
            sign_date: contract.sign_date,
            start_date: contract.start_date,
            end_date: contract.end_date,
            status: contract.status,
            payment_terms: contract.payment_terms ?? '',
            notes: contract.notes ?? '',
          }
        : EMPTY
    );
    setSubmitted(false);
    save.reset();
  }, [open, contract?.id]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        customer_id: Number(customerId),
        deal_id: dealId === '' ? null : Number(dealId),
      };
      return contract
        ? api.patch(`/api/contracts/${contract.id}`, payload)
        : api.post('/api/contracts', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      invalidateCrmViews(queryClient, Number(customerId));
      onClose();
    },
  });

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const nameMissing = !form.name.trim();
  const customerMissing = !customerId;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title={contract ? `${t.common.edit}: ${contract.name}` : t.contract.newContract}
      footer={
        <>
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button
            variant="primary"
            disabled={nameMissing || customerMissing || save.isPending}
            onClick={() => {
              setSubmitted(true);
              save.mutate();
            }}
          >
            {save.isPending ? t.common.saving : t.common.save}
          </Button>
        </>
      }
    >
      <FormError error={save.error} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field
            label={t.contract.name}
            required
            error={submitted && nameMissing ? t.common.required : undefined}
          >
            <Input autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
        </div>
        <Field label={t.contract.number}>
          <Input value={form.number} onChange={(e) => set('number', e.target.value)} />
        </Field>
        <Field
          label={t.card.customer}
          required
          error={submitted && customerMissing ? t.common.required : undefined}
        >
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">{t.common.selectCustomer}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.contract.relatedDeal} hint={t.common.optional}>
          <Select value={dealId} onChange={(e) => setDealId(e.target.value)}>
            <option value="">— {t.common.none} —</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Giá trị">
          <MoneyInput value={form.value_vnd} onChange={(v) => set('value_vnd', v)} />
        </Field>
        <Field label={t.contract.signDate}>
          <DateInput value={form.sign_date} onChange={(v) => set('sign_date', v)} />
        </Field>
        <Field label={t.contract.startDate}>
          <DateInput value={form.start_date} onChange={(v) => set('start_date', v)} />
        </Field>
        <Field label={t.contract.endDate} hint="Dùng để nhắc gia hạn 90/60/30/7 ngày">
          <DateInput value={form.end_date} onChange={(v) => set('end_date', v)} />
        </Field>
        <Field label={t.customer.status}>
          <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
            {CONTRACT_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {t.contractStatus[s]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label={t.contract.paymentTerms}>
            <Input
              value={form.payment_terms}
              onChange={(e) => set('payment_terms', e.target.value)}
              placeholder="50% tạm ứng, 50% khi nghiệm thu…"
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={t.customer.notes}>
            <Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
