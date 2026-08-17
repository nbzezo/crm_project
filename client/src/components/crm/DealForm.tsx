import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Combobox } from '../common/Combobox';
import { Modal } from '../common/Modal';
import { EntityLabels } from '../labels/EntityLabels';
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
import { useCustomerOptions, useProjectOptions } from '../../lib/useCrmOptions';
import type { Contact, Deal, Stage } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  deal?: Deal | null;
  defaultCustomerId?: number;
  defaultStage?: Stage;
}

export function DealForm({ open, onClose, deal, defaultCustomerId, defaultStage }: Props) {
  const queryClient = useQueryClient();
  const handoverManaged = (deal?.handover_count ?? 0) > 0;
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
  /** v23: dự án triển khai sinh ra từ cơ hội này, và cổng kiểm soát bàn giao. */
  const [projectId, setProjectId] = useState('');
  const [handoverReady, setHandoverReady] = useState(false);
  /** v27: hồ sơ PoC và trạng thái tạm dừng. */
  const [pocScope, setPocScope] = useState('');
  const [pocStart, setPocStart] = useState<string | null>(null);
  const [pocEnd, setPocEnd] = useState<string | null>(null);
  const [pocCriteria, setPocCriteria] = useState('');
  const [pocResult, setPocResult] = useState('');
  const [onHold, setOnHold] = useState(false);
  const [onHoldReason, setOnHoldReason] = useState('');
  const [onHoldReview, setOnHoldReview] = useState<string | null>(null);
  /** Chi hien loi sau lan bam Luu dau tien — khong mang chu do khi vua mo form. */
  const [submitted, setSubmitted] = useState(false);

  const { data: customers = [] } = useCustomerOptions(open);
  const { data: projects = [] } = useProjectOptions(open);

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
    setProjectId(deal?.project_id ? String(deal.project_id) : '');
    setHandoverReady(Boolean(deal?.handover_ready));
    setPocScope(deal?.poc_scope ?? '');
    setPocStart(deal?.poc_start_date ?? null);
    setPocEnd(deal?.poc_end_date ?? null);
    setPocCriteria(deal?.poc_criteria ?? '');
    setPocResult(deal?.poc_result ?? '');
    setOnHold(Boolean(deal?.on_hold));
    setOnHoldReason(deal?.on_hold_reason ?? '');
    setOnHoldReview(deal?.on_hold_review_date ?? null);
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
        project_id: projectId === '' ? null : Number(projectId),
        ...(handoverManaged ? {} : { handover_ready: handoverReady }),
      };
      if (!deal) return api.post('/api/deals', payload);

      /* PoC và tạm dừng chỉ sửa được sau khi cơ hội đã tồn tại — máy chủ cũng chỉ
         nhận chúng ở PATCH, nên gửi kèm lúc tạo sẽ bị bỏ lặng lẽ. */
      return api.patch(`/api/deals/${deal.id}`, {
        ...payload,
        poc_scope: pocScope || null,
        poc_start_date: pocStart,
        poc_end_date: pocEnd,
        poc_criteria: pocCriteria || null,
        poc_result: pocResult || null,
        on_hold: onHold,
        on_hold_reason: onHold ? onHoldReason || null : null,
        on_hold_review_date: onHold ? onHoldReview : null,
      });
    },
    onSuccess: () => {
      invalidateCrmViews(queryClient, Number(customerId));
      // Gắn/gỡ dự án đổi cả trang dự án — nơi cơ hội nguồn được hiển thị.
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    },
  });

  const titleMissing = !title.trim();
  const customerMissing = !customerId;
  const lostReasonMissing = stage === 'lost' && !lostReason;
  /* S08: tạm dừng phải kèm lý do và ngày xem xét lại — máy chủ cũng từ chối nếu
     thiếu, nhưng chặn ngay ở đây thì người dùng không phải gửi rồi mới biết. */
  const onHoldIncomplete = onHold && (!onHoldReason.trim() || !onHoldReview);
  const invalid = titleMissing || customerMissing || lostReasonMissing || onHoldIncomplete;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title={deal ? `${t.common.edit}: ${deal.title}` : t.deal.newDeal}
      footer={
        <FormModalActions
          onCancel={onClose}
          onSubmit={() => {
            setSubmitted(true);
            save.mutate();
          }}
          pending={save.isPending}
          disabled={invalid}
        />
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

        {/* Hồ sơ PoC — chỉ hiện đúng ở giai đoạn đang thử nghiệm (đặc tả S03). */}
        {deal && stage === 'poc' && (
          <div className="sm:col-span-2 grid grid-cols-1 gap-3 rounded-control border border-tr-border bg-tr-hover/40 p-3 sm:grid-cols-2">
            <p className="sm:col-span-2 text-xs text-tr-muted">
              Điều kiện để một cơ hội ở giai đoạn PoC: có <b>phạm vi</b>, <b>thời gian</b> và{' '}
              <b>tiêu chí thành công</b> rõ ràng.
            </p>
            <div className="sm:col-span-2">
              <Field label="Phạm vi PoC">
                <Textarea
                  rows={2}
                  value={pocScope}
                  onChange={(e) => setPocScope(e.target.value)}
                  placeholder="Thử nghiệm luồng nào, trên hệ thống nào, giới hạn tới đâu…"
                />
              </Field>
            </div>
            <Field label="Bắt đầu PoC">
              <DateInput value={pocStart} onChange={setPocStart} />
            </Field>
            <Field label="Kết thúc PoC">
              <DateInput value={pocEnd} onChange={setPocEnd} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Tiêu chí thành công">
                <Textarea
                  rows={2}
                  value={pocCriteria}
                  onChange={(e) => setPocCriteria(e.target.value)}
                  placeholder="Đo bằng gì thì coi là PoC đạt…"
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Kết quả PoC">
                <Textarea
                  rows={2}
                  value={pocResult}
                  onChange={(e) => setPocResult(e.target.value)}
                  placeholder="Điền sau khi PoC kết thúc"
                />
              </Field>
            </div>
          </div>
        )}

        {/* Tạm dừng — một cờ chồng lên giai đoạn hiện tại, không thay thế nó. */}
        {deal && stage !== 'won' && stage !== 'lost' && (
          <div className="sm:col-span-2 grid grid-cols-1 gap-3 border-t border-tr-border pt-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-tr-text">
                <input
                  type="checkbox"
                  checked={onHold}
                  onChange={(e) => setOnHold(e.target.checked)}
                  className="h-4 w-4 rounded border-tr-border"
                />
                Tạm dừng cơ hội này
              </label>
              <p className="mt-1 text-xs text-tr-muted">
                Cơ hội vẫn ở giai đoạn <b>{t.stage[stage]}</b> và không bị đóng — chỉ được đánh dấu
                là đang dừng. Chuyển giai đoạn sẽ tự bỏ đánh dấu này.
              </p>
            </div>
            {onHold && (
              <>
                <div className="sm:col-span-2">
                  <Field
                    label="Lý do tạm dừng"
                    required
                    error={submitted && !onHoldReason.trim() ? t.common.required : undefined}
                  >
                    <Input
                      value={onHoldReason}
                      onChange={(e) => setOnHoldReason(e.target.value)}
                      placeholder="Khách hoãn ngân sách sang quý sau…"
                    />
                  </Field>
                </div>
                <Field
                  label="Ngày xem xét lại"
                  required
                  error={submitted && !onHoldReview ? t.common.required : undefined}
                >
                  <DateInput value={onHoldReview} onChange={setOnHoldReview} />
                </Field>
              </>
            )}
          </div>
        )}

        {/*
          Cầu nối sang triển khai. Đặt cuối biểu mẫu vì phần lớn cơ hội chưa cần
          tới nó — chỉ cơ hội sắp thắng hoặc đã thắng mới dùng đến.
        */}
        <div className="sm:col-span-2 grid grid-cols-1 gap-3 border-t border-tr-border pt-3 sm:grid-cols-2">
          <Field
            label="Dự án triển khai"
            hint="Mỗi cơ hội gắn được tối đa một dự án. Bỏ trống nếu chưa triển khai."
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

          {stage === 'won' && (
            <Field
              label="Bàn giao"
              hint={
                handoverManaged
                  ? 'Trạng thái này được tính tự động từ checklist trong tab Bàn giao.'
                  : 'Hợp đồng/PO, phạm vi, tiêu chí nghiệm thu và đầu mối đã đủ để đội triển khai tiếp nhận.'
              }
            >
              <label className="flex h-9 items-center gap-2 text-sm text-tr-text">
                <input
                  type="checkbox"
                  checked={handoverReady}
                  onChange={(e) => setHandoverReady(e.target.checked)}
                  disabled={handoverManaged}
                  className="h-4 w-4 rounded border-tr-border"
                />
                Hồ sơ bàn giao đã đủ
              </label>
            </Field>
          )}
        </div>

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
