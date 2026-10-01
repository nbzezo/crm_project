import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings2, TriangleAlert } from 'lucide-react';
import { api } from '../../api/client';
import { Combobox } from '../common/Combobox';
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
import { ServiceCatalog } from './ServiceCatalog';
import { CONTRACT_TERM_ORDER, SERVICE_STATUS_ORDER, t } from '../../i18n/vi';
import { formatVND } from '../../lib/format';
import { formatPeriod } from '../../lib/revenue';
import { invalidateRevenueViews } from '../../lib/queryKeys';
import { useCustomerOptions } from '../../lib/useCrmOptions';
import type {
  ContractKind,
  ContractTerm,
  Contract,
  RevenueAmOption,
  RevenueAnchorImpact,
  RevenueLine,
  Service,
  ServiceStatus,
} from '../../types';
import { useFormErrors, type FieldIssue } from '../../lib/useFormErrors';

/** Loại doanh thu trên form: Mới / Mở rộng là loại HĐ; Nền là mốc "toàn bộ là Nền". */
type RevenueKindChoice = ContractKind | 'base';

const KIND_CHOICES: { value: RevenueKindChoice; label: string }[] = [
  { value: 'new', label: 'Mới' },
  { value: 'expansion', label: 'Mở rộng' },
  { value: 'base', label: 'Nền (hợp đồng cũ)' },
];

const EMPTY = {
  am_user_id: '',
  kind: 'new' as RevenueKindChoice,
  /** Tháng mốc nhập tay 'YYYY-MM'; '' = tự động theo tháng có doanh thu đầu tiên. */
  anchor_period: '',
  baseline: 0,
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
  year = new Date().getFullYear(),
}: {
  open: boolean;
  onClose: () => void;
  line?: RevenueLine | null;
  defaultCustomerId?: number;
  /** Năm nhận TB tháng năm trước khi tạo dòng Nền (mặc định năm hiện tại). */
  year?: number;
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
    queryFn: () => api.get<RevenueAmOption[]>('/api/revenues/ams'),
    enabled: open,
  });
  /** Đổi mốc phân nhóm khi sửa: xem trước số tháng đổi nhóm, bắt xác nhận. */
  const [anchorImpact, setAnchorImpact] = useState<RevenueAnchorImpact | null>(null);

  useEffect(() => {
    if (!open) return;
    setCustomerId(String(line?.customer_id ?? defaultCustomerId ?? ''));
    setServiceId(String(line?.service_id ?? ''));
    setContractId(String(line?.contract_id ?? ''));
    setForm(
      line
        ? {
            am_user_id: line.am_user_id ? String(line.am_user_id) : '',
            kind: line.anchor?.mode === 'base' ? 'base' : line.contract_kind,
            anchor_period: line.anchor?.mode === 'manual' ? (line.anchor.manual_period ?? '') : '',
            baseline: line.baseline_avg_vnd ?? 0,
            contract_kind: line.contract_kind,
            contract_term: line.contract_term,
            status: line.status,
            start_date: line.start_date,
            end_date: line.end_date,
            notes: line.notes ?? '',
          }
        : EMPTY
    );
    setAnchorImpact(null);
  }, [open, line?.id]);

  /** Mốc phân nhóm theo lựa chọn trên form. */
  const anchorBody =
    form.kind === 'base'
      ? { mode: 'base' as const, period: null }
      : form.anchor_period
        ? { mode: 'manual' as const, period: form.anchor_period }
        : { mode: 'auto' as const, period: null };
  const anchorChanged =
    !line ||
    (line.anchor?.mode ?? 'auto') !== anchorBody.mode ||
    (anchorBody.mode === 'manual' && line.anchor?.manual_period !== anchorBody.period);

  const save = useMutation({
    mutationFn: () => {
      const { am_user_id, kind, anchor_period: _period, baseline, ...rest } = form;
      const payload = {
        ...rest,
        am_user_id: am_user_id === '' ? null : Number(am_user_id),
        contract_kind: kind === 'base' ? (line?.contract_kind ?? 'new') : kind,
        ...(anchorChanged
          ? {
              revenue_anchor_mode: anchorBody.mode,
              revenue_anchor_period: anchorBody.period,
            }
          : {}),
        ...(!line && kind === 'base' && baseline > 0
          ? { baseline: { year, avg_monthly_vnd: baseline } }
          : {}),
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

  const { submitted, validate } = useFormErrors();

  const activeServices = services.filter((s) => s.is_active || String(s.id) === serviceId);

  const customerMissing = !customerId;
  const issues: FieldIssue[] = [];
  if (customerMissing) issues.push({ id: 'revenue-customer', label: t.card.customer });

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
            onSubmit={async () => {
              if (!validate(issues)) return;
              /* Sửa dòng đã có doanh thu mà đổi mốc: xem trước, hỏi lại một lần. */
              if (line && anchorChanged && !anchorImpact) {
                try {
                  const impact = await api.post<RevenueAnchorImpact>(
                    `/api/revenues/lines/${line.id}/anchor-preview`,
                    anchorBody
                  );
                  if (impact.moved_count > 0) {
                    setAnchorImpact(impact);
                    return;
                  }
                } catch {
                  /* Không xem trước được thì để lệnh lưu tự báo lỗi (cùng kiểm tra ở server). */
                }
              }
              save.mutate();
            }}
            submitLabel={anchorImpact ? 'Xác nhận đổi nhóm và lưu' : undefined}
            pending={save.isPending}
          />
        }
      >
        {submitted && issues.length > 0 && (
          <FormError
            takeFocus={false}
            error={new Error('Chưa lưu được — còn trường bắt buộc chưa điền.')}
            fields={issues}
          />
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label={t.card.customer}
            required
            error={submitted && customerMissing ? t.common.required : undefined}
          >
            <Combobox
              id="revenue-customer"
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
                  className="inline-flex items-center gap-1 text-xs font-medium text-tr-primary hover:underline"
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
          <Field
            label={t.revenue.am}
            hint={
              line?.am && !line.am_user_id
                ? `Dữ liệu cũ ghi "${line.am}" — chọn lại người dùng tương ứng`
                : 'Người dùng phụ trách khách hàng'
            }
          >
            <Select value={form.am_user_id} onChange={(e) => set('am_user_id', e.target.value)}>
              <option value="">— Chưa gán AM —</option>
              {ams.map((am) => (
                <option key={am.id} value={am.id}>
                  {am.name}
                  {am.is_active ? '' : ' (đã nghỉ)'}
                </option>
              ))}
            </Select>
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
          <Field
            label="Loại doanh thu"
            hint={
              form.kind === 'base'
                ? 'Hợp đồng cũ: mọi tháng tính là doanh thu Nền'
                : 'Tính là Mới / Mở rộng trong 12 tháng đầu, sau đó chuyển sang Nền'
            }
          >
            <Select
              value={form.kind}
              onChange={(e) => {
                set('kind', e.target.value as RevenueKindChoice);
                setAnchorImpact(null);
              }}
            >
              {KIND_CHOICES.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
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
          {form.kind === 'base' ? (
            line ? (
              <div className="text-xs text-tr-muted sm:col-span-2">
                TB tháng năm trước của dòng này nhập ở màn hình Doanh thu nền.
              </div>
            ) : (
              <Field
                label={`TB tháng năm ${year - 1}`}
                hint={`Mức so sánh doanh thu Nền năm ${year}; để 0 nếu chưa có`}
              >
                <MoneyInput value={form.baseline} onChange={(v) => set('baseline', v)} />
              </Field>
            )
          ) : (
            <Field
              label="Tháng phát sinh doanh thu đầu tiên"
              hint="Để trống: tự lấy tháng đầu tiên có doanh thu. Điền khi doanh thu trước đây chưa nhập vào hệ thống."
            >
              <Input
                type="month"
                value={form.anchor_period}
                onChange={(e) => {
                  set('anchor_period', e.target.value);
                  setAnchorImpact(null);
                }}
              />
            </Field>
          )}
          {anchorImpact && (
            <div
              role="alert"
              className="flex gap-2 rounded-control border border-tr-warning/40 bg-tr-warning/10 px-3 py-2 text-sm text-tr-text sm:col-span-2"
            >
              <TriangleAlert
                size={16}
                className="mt-0.5 shrink-0 text-tr-warning"
                aria-hidden="true"
              />
              <div>
                <p className="font-medium">
                  {anchorImpact.moved_count} tháng ({formatVND(anchorImpact.moved_amount_vnd)}) sẽ
                  đổi nhóm
                </p>
                <p className="text-xs text-tr-subtle">
                  {anchorImpact.after.base_from
                    ? `Sau khi lưu: Nền từ ${formatPeriod(anchorImpact.after.base_from)}. `
                    : anchorImpact.after.mode === 'base'
                      ? 'Sau khi lưu: toàn bộ là Nền. '
                      : ''}
                  Báo cáo doanh thu năm {anchorImpact.years.join(', ')} sẽ thay đổi theo. Bấm “Xác
                  nhận đổi nhóm và lưu” để tiếp tục.
                </p>
              </div>
            </div>
          )}
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
