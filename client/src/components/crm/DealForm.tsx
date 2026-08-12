import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Combobox } from '../common/Combobox';
import { Modal } from '../common/Modal';
import { EntityLabels } from '../labels/EntityLabels';
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
import {
  ACCOUNT_SOURCES,
  LOST_REASON_ORDER,
  NEXT_ACTIONS,
  STAGE_ORDER,
  STAGE_PROBABILITY,
  t,
} from '../../i18n/vi';
import { formatVND } from '../../lib/format';
import { invalidateCrmViews } from '../../lib/queryKeys';
import type { Contact, Customer, Deal, Stage } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  deal?: Deal | null;
  defaultCustomerId?: number;
  defaultStage?: Stage;
}

export function DealForm({ open, onClose, deal, defaultCustomerId, defaultStage }: Props) {
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [contactId, setContactId] = useState('');
  const [title, setTitle] = useState('');
  const [product, setProduct] = useState('');
  const [stage, setStage] = useState<Stage>('lead');
  const [probability, setProbability] = useState(10);
  const [value, setValue] = useState(0);
  const [expected, setExpected] = useState<string | null>(null);
  const [source, setSource] = useState('');
  const [need, setNeed] = useState('');
  const [competitor, setCompetitor] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextActionDate, setNextActionDate] = useState<string | null>(null);
  const [lostReason, setLostReason] = useState('');
  const [lostNote, setLostNote] = useState('');
  const [notes, setNotes] = useState('');
  /** Chi hien loi sau lan bam Luu dau tien — khong mang chu do khi vua mo form. */
  const [submitted, setSubmitted] = useState(false);

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', 'select'],
    queryFn: () => api.get<Customer[]>('/api/customers'),
    staleTime: 60_000,
    enabled: open,
  });

  const { data: customerFull } = useQuery({
    queryKey: ['customer', Number(customerId)],
    queryFn: () => api.get<{ contacts: Contact[] }>(`/api/customers/${customerId}/full`),
    enabled: open && customerId !== '',
  });
  const contacts = customerFull?.contacts ?? [];

  useEffect(() => {
    if (!open) return;
    setCustomerId(String(deal?.customer_id ?? defaultCustomerId ?? ''));
    setContactId(String(deal?.contact_id ?? ''));
    setTitle(deal?.title ?? '');
    setProduct(deal?.product ?? '');
    const s = deal?.stage ?? defaultStage ?? 'lead';
    setStage(s);
    setProbability(deal?.probability ?? STAGE_PROBABILITY[s]);
    setValue(deal?.value_vnd ?? 0);
    setExpected(deal?.expected_close_date ?? null);
    setSource(deal?.source ?? '');
    setNeed(deal?.need ?? '');
    setCompetitor(deal?.competitor ?? '');
    setNextAction(deal?.next_action ?? '');
    setNextActionDate(deal?.next_action_date ?? null);
    setLostReason(deal?.lost_reason ?? '');
    setLostNote(deal?.lost_note ?? '');
    setNotes(deal?.notes ?? '');
    setSubmitted(false);
    save.reset();
  }, [open, deal?.id]);

  /** BR-04/BR-05: đổi giai đoạn thì xác suất chạy theo gợi ý, người dùng vẫn sửa được. */
  const changeStage = (next: Stage) => {
    setStage(next);
    setProbability(STAGE_PROBABILITY[next]);
  };

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        customer_id: Number(customerId),
        contact_id: contactId === '' ? null : Number(contactId),
        title: title.trim(),
        product: product || null,
        stage,
        probability,
        value_vnd: value,
        expected_close_date: expected,
        source: source || null,
        need: need || null,
        competitor: competitor || null,
        next_action: nextAction || null,
        next_action_date: nextActionDate,
        lost_reason: stage === 'lost' ? lostReason || null : null,
        lost_note: stage === 'lost' ? lostNote || null : null,
        notes,
      };
      return deal ? api.patch(`/api/deals/${deal.id}`, payload) : api.post('/api/deals', payload);
    },
    onSuccess: () => {
      invalidateCrmViews(queryClient, Number(customerId));
      onClose();
    },
  });

  const titleMissing = !title.trim();
  const customerMissing = !customerId;
  const lostReasonMissing = stage === 'lost' && !lostReason;
  const invalid = titleMissing || customerMissing || lostReasonMissing;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title={deal ? `${t.common.edit}: ${deal.title}` : t.deal.newDeal}
      footer={
        <>
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button
            variant="primary"
            disabled={invalid || save.isPending}
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

      {/* FR-TAG-06: nhãn lưu ngay khi tick, không đi cùng nút Lưu của biểu mẫu —
          nên chỉ hiện khi cơ hội đã tồn tại. */}
      {deal && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-tr-subtle">{t.card.labels}</span>
          <EntityLabels entityType="deal" entityId={deal.id} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field
            label={t.deal.title}
            required
            error={submitted && titleMissing ? t.common.required : undefined}
          >
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
        </div>

        <Field
          label={t.card.customer}
          required
          error={submitted && customerMissing ? t.common.required : undefined}
        >
          <Combobox
            value={customerId === '' ? '' : Number(customerId)}
            onChange={(v) => {
              setCustomerId(v === '' ? '' : String(v));
              setContactId('');
            }}
            options={customers.map((c) => ({ id: c.id, label: c.name }))}
            placeholder={t.common.selectCustomer}
            searchPlaceholder="Tìm khách hàng…"
            emptyText="Không tìm thấy khách hàng."
            ariaLabel={t.card.customer}
          />
        </Field>
        <Field label="Người liên hệ chính">
          <Combobox
            value={contactId === '' ? '' : Number(contactId)}
            onChange={(v) => setContactId(v === '' ? '' : String(v))}
            options={contacts.map((c) => ({
              id: c.id,
              label: c.full_name + (c.title ? ` — ${c.title}` : ''),
            }))}
            placeholder={`— ${t.common.none} —`}
            searchPlaceholder="Tìm người liên hệ…"
            emptyText="Không tìm thấy người liên hệ."
            ariaLabel="Người liên hệ chính"
          />
        </Field>

        <Field label="Sản phẩm / dịch vụ">
          <Input value={product} onChange={(e) => setProduct(e.target.value)} />
        </Field>
        <Field label="Nguồn">
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">— {t.common.none} —</option>
            {ACCOUNT_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t.deal.stage}>
          <Select value={stage} onChange={(e) => changeStage(e.target.value as Stage)}>
            {STAGE_ORDER.map((s) => (
              <option key={s} value={s}>
                {t.stage[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Xác suất (%)" hint={`Gợi ý theo giai đoạn: ${STAGE_PROBABILITY[stage]}%`}>
          <Input
            type="number"
            min={0}
            max={100}
            value={probability}
            onChange={(e) => setProbability(Math.max(0, Math.min(100, Number(e.target.value))))}
          />
        </Field>

        <Field
          label={t.deal.value}
          hint={
            value > 0
              ? `Trọng số: ${formatVND(Math.round((value * probability) / 100))}`
              : undefined
          }
        >
          <MoneyInput value={value} onChange={setValue} />
        </Field>
        <Field label={t.deal.expectedClose}>
          <DateInput value={expected} onChange={setExpected} />
        </Field>

        <Field label="Hành động tiếp theo" hint="Giúp không quên follow-up">
          <Input
            list="next-action-suggestions"
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder="Gọi khách hàng, gửi báo giá…"
          />
          <datalist id="next-action-suggestions">
            {NEXT_ACTIONS.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Field>
        <Field label="Ngày thực hiện">
          <DateInput value={nextActionDate} onChange={setNextActionDate} />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Nhu cầu khách hàng">
            <Textarea rows={2} value={need} onChange={(e) => setNeed(e.target.value)} />
          </Field>
        </div>
        <Field label="Đối thủ">
          <Input value={competitor} onChange={(e) => setCompetitor(e.target.value)} />
        </Field>

        {stage === 'lost' && (
          <>
            <Field
              label={t.deal.lostReason}
              required
              error={submitted && lostReasonMissing ? t.common.required : undefined}
            >
              <Select value={lostReason} onChange={(e) => setLostReason(e.target.value)}>
                <option value="">{t.common.selectPlaceholder}</option>
                {LOST_REASON_ORDER.map((r) => (
                  <option key={r} value={r}>
                    {t.lostReason[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Ghi chú lý do thua">
                <Textarea rows={2} value={lostNote} onChange={(e) => setLostNote(e.target.value)} />
              </Field>
            </div>
          </>
        )}

        <div className="sm:col-span-2">
          <Field label={t.deal.notes}>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
