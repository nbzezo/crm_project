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
import { Combobox } from '../common/Combobox';
import { CustomerDealFields } from './CustomerDealFields';
import { CONTRACT_STATUS_ORDER, t } from '../../i18n/vi';
import { invalidateCrmViews } from '../../lib/queryKeys';
import { useProjectOptions } from '../../lib/useCrmOptions';
import type { Contract } from '../../types';
import { useFormErrors, type FieldIssue } from '../../lib/useFormErrors';

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
  /** v27: dự án mà hợp đồng này tài trợ — nguồn của "Giá trị hợp đồng đã ký". */
  const [projectId, setProjectId] = useState('');
  const [form, setForm] = useState(EMPTY);
  const { submitted, validate, reset: resetErrors } = useFormErrors();
  const { data: projects = [] } = useProjectOptions(open);

  useEffect(() => {
    if (!open) return;
    setCustomerId(String(contract?.customer_id ?? defaultCustomerId ?? ''));
    setDealId(String(contract?.deal_id ?? ''));
    setProjectId(contract?.project_id ? String(contract.project_id) : '');
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
    resetErrors();
    save.reset();
  }, [open, contract?.id]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        customer_id: Number(customerId),
        deal_id: dealId === '' ? null : Number(dealId),
        project_id: projectId === '' ? null : Number(projectId),
      };
      return contract
        ? api.patch(`/api/contracts/${contract.id}`, payload)
        : api.post('/api/contracts', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      invalidateCrmViews(queryClient, Number(customerId));
      // Giá trị hợp đồng và ngưỡng phân loại A/B của dự án đều đọc từ đây.
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project'] });
      onClose();
    },
  });

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const nameMissing = !form.name.trim();
  const customerMissing = !customerId;

  const issues: FieldIssue[] = [];
  if (nameMissing) issues.push({ id: 'contract-name', label: t.contract.name });
  if (customerMissing) issues.push({ id: 'contract-customer', label: t.card.customer });

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title={contract ? `${t.common.edit}: ${contract.name}` : t.contract.newContract}
      footer={
        <FormModalActions
          onCancel={onClose}
          onSubmit={() => {
            if (!validate(issues)) return;
            save.mutate();
          }}
          pending={save.isPending}
        />
      }
    >
      <FormError error={save.error} />
      {submitted && issues.length > 0 && (
        <FormError
          takeFocus={false}
          error={new Error('Chưa lưu được — còn trường bắt buộc chưa điền.')}
          fields={issues}
        />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field
            label={t.contract.name}
            required
            error={submitted && nameMissing ? t.common.required : undefined}
          >
            <Input
              id="contract-name"
              autoFocus
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
        </div>
        <Field label={t.contract.number}>
          <Input value={form.number} onChange={(e) => set('number', e.target.value)} />
        </Field>
        <CustomerDealFields
          open={open}
          customerId={customerId}
          onCustomerChange={setCustomerId}
          dealId={dealId}
          onDealChange={setDealId}
          customerFieldId="contract-customer"
          customerError={submitted && customerMissing ? t.common.required : undefined}
          dealHint={t.common.optional}
          /* Chon co hoi xong thi dien san nhung gi he thong da biet. Chi dien vao
             o dang TRONG — khong de len thu nguoi dung da go, va moi o van sua
             duoc binh thuong. Luong "keo deal sang Thành công" da lam dung viec
             nay tu truoc (useDealStageMove -> WonDialog); form thu cong thi chua. */
          onDealSelected={(deal) => {
            if (!deal) return;
            setForm((f) => ({
              ...f,
              name: f.name.trim() ? f.name : deal.title,
              value_vnd: f.value_vnd || deal.value_vnd,
            }));
            if (projectId === '' && deal.project_id) setProjectId(String(deal.project_id));
          }}
        />
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
          <Field
            label="Dự án triển khai"
            hint="Gắn để giá trị hợp đồng được tính vào dự án — cũng là một tiêu chí phân loại quy mô."
          >
            <Combobox
              value={projectId === '' ? '' : Number(projectId)}
              onChange={(v) => setProjectId(v === '' ? '' : String(v))}
              options={projects.map((p) => ({
                id: p.id,
                label: p.name,
                sublabel:
                  [p.code, p.customer_name].filter(Boolean).join(' · ') ||
                  t.projectStatus[p.status],
              }))}
              placeholder={`— ${t.common.none} —`}
              searchPlaceholder="Tìm dự án…"
              emptyText="Không tìm thấy dự án."
              ariaLabel="Dự án triển khai"
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
