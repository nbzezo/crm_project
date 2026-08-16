import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Modal } from '../common/Modal';
import {
  DateInput,
  Field,
  FormError,
  FormModalActions,
  Input,
  MoneyInput,
  Select,
  Textarea,
} from '../common/ui';
import { CustomerDealFields } from './CustomerDealFields';
import { DocumentPanel } from './DocumentUpload';
import { QUOTATION_STATUS_ORDER, t } from '../../i18n/vi';
import { invalidateCrmViews } from '../../lib/queryKeys';
import type { Quotation } from '../../types';

const EMPTY = {
  code: '',
  quote_date: null as string | null,
  value_vnd: 0,
  valid_until: null as string | null,
  status: 'draft',
  notes: '',
};

export function QuotationForm({
  open,
  onClose,
  quotation,
  defaultCustomerId,
  defaultDealId,
}: {
  open: boolean;
  onClose: () => void;
  quotation?: Quotation | null;
  defaultCustomerId?: number;
  defaultDealId?: number;
}) {
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [dealId, setDealId] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCustomerId(String(quotation?.customer_id ?? defaultCustomerId ?? ''));
    setDealId(String(quotation?.deal_id ?? defaultDealId ?? ''));
    setForm(
      quotation
        ? {
            code: quotation.code ?? '',
            quote_date: quotation.quote_date,
            value_vnd: quotation.value_vnd,
            valid_until: quotation.valid_until,
            status: quotation.status,
            notes: quotation.notes ?? '',
          }
        : EMPTY
    );
    setSubmitted(false);
    save.reset();
  }, [open, quotation?.id]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        customer_id: Number(customerId),
        deal_id: dealId === '' ? null : Number(dealId),
      };
      return quotation
        ? api.patch(`/api/quotations/${quotation.id}`, payload)
        : api.post('/api/quotations', payload);
    },
    onSuccess: () => {
      invalidateCrmViews(queryClient, Number(customerId));
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      onClose();
    },
  });

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const customerMissing = !customerId;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title={
        quotation
          ? `${t.common.edit}: ${quotation.code || 'báo giá'} v${quotation.version}`
          : t.quotation.newQuotation
      }
      footer={
        <FormModalActions
          onCancel={onClose}
          onSubmit={() => {
            setSubmitted(true);
            save.mutate();
          }}
          pending={save.isPending}
          disabled={customerMissing}
        />
      }
    >
      <FormError error={save.error} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t.quotation.code}>
          <Input
            autoFocus
            value={form.code}
            onChange={(e) => set('code', e.target.value)}
            placeholder="BG-2026-001"
          />
        </Field>
        <CustomerDealFields
          open={open}
          customerId={customerId}
          onCustomerChange={setCustomerId}
          dealId={dealId}
          onDealChange={setDealId}
          customerError={submitted && customerMissing ? t.common.required : undefined}
          dealHint={t.quotation.versionHint}
        />
        <Field label={t.customer.status}>
          <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
            {QUOTATION_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {t.quotationStatus[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.quotation.quoteDate}>
          <DateInput value={form.quote_date} onChange={(v) => set('quote_date', v)} />
        </Field>
        <Field label={t.quotation.validUntil}>
          <DateInput value={form.valid_until} onChange={(v) => set('valid_until', v)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Giá trị">
            <MoneyInput value={form.value_vnd} onChange={(v) => set('value_vnd', v)} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={t.customer.notes}>
            <Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>

        {quotation && (
          <div className="border-t border-tr-border pt-3 sm:col-span-2">
            <DocumentPanel links={{ quotation_id: quotation.id }} title="Tệp báo giá đính kèm" />
          </div>
        )}
      </div>
    </Modal>
  );
}
