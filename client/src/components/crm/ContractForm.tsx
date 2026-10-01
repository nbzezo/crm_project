import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { api, ApiError } from '../../api/client';
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
import {
  ContractFilePanel,
  type ContractExtraction,
  type FilePanelStatus,
} from './ContractFilePanel';
import { CONTRACT_STATUS_ORDER, t } from '../../i18n/vi';
import { invalidateCrmViews } from '../../lib/queryKeys';
import { useProjectOptions } from '../../lib/useCrmOptions';
import type { Contract } from '../../types';
import { useUiStore } from '../../stores/uiStore';
import { useFormErrors, type FieldIssue } from '../../lib/useFormErrors';

/** Khách hàng chưa có trong sổ — lấy từ hợp đồng, tạo cùng lúc khi lưu. */
const EMPTY_NEW_CUSTOMER = {
  name: '',
  tax_code: '',
  address: '',
  phone: '',
  email: '',
  representative: '',
  representative_title: '',
  create_contact: true,
};

type AiField =
  | 'name'
  | 'number'
  | 'value_vnd'
  | 'sign_date'
  | 'start_date'
  | 'end_date'
  | 'status'
  | 'payment_terms';

/** Nhãn nhỏ đánh dấu ô do AI điền, để người dùng biết chỗ nào cần soát. */
function AiTag({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-tr-hover px-1 text-[10px] font-medium text-tr-primary">
      <Sparkles size={10} aria-hidden="true" /> AI
    </span>
  );
}

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
  startWithUpload,
}: {
  open: boolean;
  onClose: () => void;
  contract?: Contract | null;
  defaultCustomerId?: number;
  /** Mở từ nút "Tải hợp đồng": khung tải tệp hiện lớn, nổi bật. */
  startWithUpload?: boolean;
}) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const [customerId, setCustomerId] = useState('');
  const [dealId, setDealId] = useState('');
  /** v27: dự án mà hợp đồng này tài trợ — nguồn của "Giá trị hợp đồng đã ký". */
  const [projectId, setProjectId] = useState('');
  const [form, setForm] = useState(EMPTY);
  const { submitted, validate, reset: resetErrors } = useFormErrors();
  const { data: projects = [] } = useProjectOptions(open);

  /* ---- Tệp hợp đồng + AI ---- */
  const [file, setFile] = useState<File | null>(null);
  const [fileStatus, setFileStatus] = useState<FilePanelStatus>('idle');
  const [fileError, setFileError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ContractExtraction | null>(null);
  const [aiFilled, setAiFilled] = useState<Set<AiField>>(new Set());
  const [newCustomer, setNewCustomer] = useState<typeof EMPTY_NEW_CUSTOMER | null>(null);
  const [summaryAppended, setSummaryAppended] = useState(false);
  /** Bỏ qua kết quả của lần đọc cũ khi người dùng đổi/bỏ tệp giữa chừng. */
  const readToken = useRef(0);
  const isCreate = !contract;
  const { data: aiStatus } = useQuery({
    queryKey: ['contracts', 'ai-status'],
    queryFn: () => api.get<{ available: boolean }>('/api/contracts/ai-status'),
    staleTime: 30_000,
    enabled: open && isCreate,
  });

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
    readToken.current += 1;
    setFile(null);
    setFileStatus('idle');
    setFileError(null);
    setExtraction(null);
    setAiFilled(new Set());
    setNewCustomer(null);
    setSummaryAppended(false);
  }, [open, contract?.id]);

  /** Điền vào ô còn TRỐNG — không đè thứ người dùng đã gõ. */
  const applyExtraction = (ex: ContractExtraction) => {
    const filled = new Set<AiField>();
    setForm((f) => {
      const next = { ...f };
      const fillText = (key: 'name' | 'number' | 'payment_terms', value: string) => {
        if (!f[key].trim() && value) {
          next[key] = value;
          filled.add(key);
        }
      };
      const fillDate = (key: 'sign_date' | 'start_date' | 'end_date', value: string | null) => {
        if (!f[key] && value) {
          next[key] = value;
          filled.add(key);
        }
      };
      fillText('name', ex.contract.name);
      fillText('number', ex.contract.number);
      fillText('payment_terms', ex.contract.payment_terms);
      fillDate('sign_date', ex.contract.sign_date);
      fillDate('start_date', ex.contract.start_date);
      fillDate('end_date', ex.contract.end_date);
      if (!f.value_vnd && ex.contract.value_vnd) {
        next.value_vnd = ex.contract.value_vnd;
        filled.add('value_vnd');
      }
      if (f.status === 'draft' && ex.contract.status !== 'draft') {
        next.status = ex.contract.status;
        filled.add('status');
      }
      return next;
    });
    setAiFilled(filled);

    // Khách hàng: chỉ đụng vào khi người dùng chưa tự chọn.
    if (!customerId) {
      if (ex.customer_match) {
        setCustomerId(String(ex.customer_match.id));
        setNewCustomer(null);
        if (ex.suggested_deal_id && !dealId) setDealId(String(ex.suggested_deal_id));
      } else if (ex.customer.name || ex.customer.tax_code) {
        setNewCustomer({
          ...EMPTY_NEW_CUSTOMER,
          ...ex.customer,
          create_contact: Boolean(ex.customer.representative),
        });
      }
    }
  };

  const readFile = async (picked: File) => {
    const token = ++readToken.current;
    setFileError(null);
    if (aiStatus && !aiStatus.available) {
      setFileStatus('no-ai');
      return;
    }
    setFileStatus('reading');
    try {
      const body = new FormData();
      body.append('file', picked);
      const ex = await api.postForm<ContractExtraction>('/api/contracts/extract', body);
      if (token !== readToken.current) return;
      setExtraction(ex);
      applyExtraction(ex);
      setFileStatus('done');
    } catch (error) {
      if (token !== readToken.current) return;
      // 409 not_configured: AI vừa bị tắt — quay về nhập tay chứ không coi là lỗi.
      if (error instanceof ApiError && error.details.code === 'not_configured') {
        setFileStatus('no-ai');
        return;
      }
      setFileError(error instanceof Error ? error.message : null);
      setFileStatus('error');
    }
  };

  const pickFile = (picked: File) => {
    if (picked.size > 25 * 1024 * 1024) {
      setFile(null);
      setFileStatus('error');
      setFileError('Tệp lớn hơn 25 MB.');
      return;
    }
    setFile(picked);
    setExtraction(null);
    setAiFilled(new Set());
    setSummaryAppended(false);
    void readFile(picked);
  };

  const clearFile = () => {
    readToken.current += 1;
    setFile(null);
    setFileStatus('idle');
    setFileError(null);
    setExtraction(null);
    setAiFilled(new Set());
  };

  const appendSummary = () => {
    if (!extraction) return;
    const lines = [
      extraction.summary,
      ...extraction.key_points.map((k) => `• ${k}`),
      ...extraction.risks.map((k) => `⚠ ${k}`),
    ].filter(Boolean);
    setForm((f) => ({
      ...f,
      notes: [f.notes.trim(), `Tóm tắt AI:\n${lines.join('\n')}`].filter(Boolean).join('\n\n'),
    }));
    setSummaryAppended(true);
  };

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        customer_id: Number(customerId),
        deal_id: dealId === '' ? null : Number(dealId),
        project_id: projectId === '' ? null : Number(projectId),
      };
      // Có tệp (hoặc khách hàng mới) → một lệnh duy nhất tạo khách hàng + hợp đồng + đính kèm tệp.
      if (!contract && (file || newCustomer)) {
        const { customer_id, ...rest } = payload;
        const body = new FormData();
        if (file) body.append('file', file);
        body.append(
          'payload',
          JSON.stringify({
            contract: { ...rest, customer_id: newCustomer ? null : customer_id },
            new_customer: newCustomer
              ? {
                  name: newCustomer.name.trim(),
                  tax_code: newCustomer.tax_code.trim() || null,
                  address: newCustomer.address.trim() || null,
                  phone: newCustomer.phone.trim() || null,
                  email: newCustomer.email.trim() || null,
                }
              : null,
            new_contact:
              newCustomer?.create_contact && newCustomer.representative.trim()
                ? {
                    full_name: newCustomer.representative.trim(),
                    title: newCustomer.representative_title.trim() || null,
                  }
                : null,
          })
        );
        return api.postForm<{ document_error: string | null; customer_created: boolean }>(
          '/api/contracts/from-file',
          body
        );
      }
      return contract
        ? api.patch(`/api/contracts/${contract.id}`, payload)
        : api.post('/api/contracts', payload);
    },
    onSuccess: (saved) => {
      const result = saved as { document_error?: string | null; customer_created?: boolean };
      if (result?.customer_created) {
        queryClient.invalidateQueries({ queryKey: ['customers'] });
        pushToast('Đã tạo khách hàng mới từ hợp đồng', 'success');
      }
      if (result?.document_error) {
        pushToast(
          `Đã lưu hợp đồng nhưng chưa đính kèm được tệp: ${result.document_error}`,
          'error'
        );
      }
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
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
  const customerMissing = !customerId && !newCustomer;
  const newCustomerNameMissing = Boolean(newCustomer) && !newCustomer?.name.trim();

  const issues: FieldIssue[] = [];
  if (nameMissing) issues.push({ id: 'contract-name', label: t.contract.name });
  if (customerMissing) issues.push({ id: 'contract-customer', label: t.card.customer });
  if (newCustomerNameMissing)
    issues.push({ id: 'contract-new-customer-name', label: 'Tên khách hàng mới' });

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

      {isCreate && (
        <div className="mb-3">
          <ContractFilePanel
            file={file}
            status={fileStatus}
            error={fileError}
            extraction={extraction}
            large={startWithUpload && !file}
            onPick={pickFile}
            onClear={clearFile}
            onRetry={() => file && void readFile(file)}
            onAppendSummary={appendSummary}
            summaryAppended={summaryAppended}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field
            label={
              <>
                {t.contract.name}
                <AiTag show={aiFilled.has('name')} />
              </>
            }
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
        <Field
          label={
            <>
              {t.contract.number}
              <AiTag show={aiFilled.has('number')} />
            </>
          }
        >
          <Input value={form.number} onChange={(e) => set('number', e.target.value)} />
        </Field>
        {newCustomer ? (
          <div className="space-y-2 rounded-panel border border-tr-primary/40 bg-tr-hover/40 p-3 sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-tr-text">
                <Sparkles size={13} className="text-tr-primary" aria-hidden="true" />
                Khách hàng chưa có trong hệ thống — sẽ được tạo khi lưu hợp đồng
              </p>
              <button
                type="button"
                className="text-xs text-tr-primary hover:underline"
                onClick={() => setNewCustomer(null)}
              >
                Chọn khách hàng có sẵn
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field
                label="Tên khách hàng"
                required
                error={submitted && newCustomerNameMissing ? t.common.required : undefined}
              >
                <Input
                  id="contract-new-customer-name"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                />
              </Field>
              <Field label="Mã số thuế">
                <Input
                  value={newCustomer.tax_code}
                  onChange={(e) => setNewCustomer({ ...newCustomer, tax_code: e.target.value })}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Địa chỉ">
                  <Input
                    value={newCustomer.address}
                    onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Điện thoại">
                <Input
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                />
              </Field>
              <Field label="Email">
                <Input
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                />
              </Field>
              <Field label="Người đại diện ký">
                <Input
                  value={newCustomer.representative}
                  onChange={(e) =>
                    setNewCustomer({ ...newCustomer, representative: e.target.value })
                  }
                />
              </Field>
              <Field label="Chức vụ">
                <Input
                  value={newCustomer.representative_title}
                  onChange={(e) =>
                    setNewCustomer({ ...newCustomer, representative_title: e.target.value })
                  }
                />
              </Field>
            </div>
            {newCustomer.representative.trim() && (
              <label className="flex items-center gap-2 text-xs text-tr-subtle">
                <input
                  type="checkbox"
                  checked={newCustomer.create_contact}
                  onChange={(e) =>
                    setNewCustomer({ ...newCustomer, create_contact: e.target.checked })
                  }
                />
                Tạo luôn người đại diện thành người liên hệ chính
              </label>
            )}
          </div>
        ) : (
          <>
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
            {extraction?.customer_match && customerId === String(extraction.customer_match.id) && (
              <p className="text-xs text-tr-subtle sm:col-span-2">
                <Sparkles size={11} className="mr-1 inline text-tr-primary" aria-hidden="true" />
                AI khớp khách hàng “{extraction.customer_match.name}” theo{' '}
                {extraction.customer_match.reason === 'tax_code' ? 'mã số thuế' : 'tên'}.
              </p>
            )}
            {extraction && !customerId && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-tr-subtle sm:col-span-2">
                {extraction.customer_candidates.length > 0 && <span>Có phải là:</span>}
                {extraction.customer_candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="rounded-control border border-tr-border px-2 py-0.5 text-tr-text hover:bg-tr-hover"
                    onClick={() => setCustomerId(String(c.id))}
                  >
                    {c.name}
                  </button>
                ))}
                {(extraction.customer.name || extraction.customer.tax_code) && (
                  <button
                    type="button"
                    className="text-tr-primary hover:underline"
                    onClick={() =>
                      setNewCustomer({
                        ...EMPTY_NEW_CUSTOMER,
                        ...extraction.customer,
                        create_contact: Boolean(extraction.customer.representative),
                      })
                    }
                  >
                    + Tạo khách hàng mới “{extraction.customer.name || extraction.customer.tax_code}
                    ”
                  </button>
                )}
              </div>
            )}
          </>
        )}
        <Field
          label={
            <>
              Giá trị
              <AiTag show={aiFilled.has('value_vnd')} />
            </>
          }
        >
          <MoneyInput value={form.value_vnd} onChange={(v) => set('value_vnd', v)} />
        </Field>
        <Field
          label={
            <>
              {t.contract.signDate}
              <AiTag show={aiFilled.has('sign_date')} />
            </>
          }
        >
          <DateInput value={form.sign_date} onChange={(v) => set('sign_date', v)} />
        </Field>
        <Field
          label={
            <>
              {t.contract.startDate}
              <AiTag show={aiFilled.has('start_date')} />
            </>
          }
        >
          <DateInput value={form.start_date} onChange={(v) => set('start_date', v)} />
        </Field>
        <Field
          label={
            <>
              {t.contract.endDate}
              <AiTag show={aiFilled.has('end_date')} />
            </>
          }
          hint="Dùng để nhắc gia hạn 90/60/30/7 ngày"
        >
          <DateInput value={form.end_date} onChange={(v) => set('end_date', v)} />
        </Field>
        <Field
          label={
            <>
              {t.customer.status}
              <AiTag show={aiFilled.has('status')} />
            </>
          }
        >
          <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
            {CONTRACT_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {t.contractStatus[s]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field
            label={
              <>
                {t.contract.paymentTerms}
                <AiTag show={aiFilled.has('payment_terms')} />
              </>
            }
          >
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
