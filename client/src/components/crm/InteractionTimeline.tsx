import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarCheck,
  FileText,
  Mail,
  MessageCircle,
  MonitorPlay,
  MoreHorizontal,
  Phone,
  Plus,
  Sparkles,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { api } from '../../api/client';
import { ScoringPrompt } from './ScoringPrompt';
import { Combobox } from '../common/Combobox';
import {
  Button,
  DateInput,
  EmptyState,
  Field,
  FormError,
  Input,
  Select,
  Textarea,
} from '../common/ui';
import { NEXT_ACTIONS, t } from '../../i18n/vi';
import { formatDateTime, nowLocalInput } from '../../lib/format';
import { invalidateCrmViews } from '../../lib/queryKeys';
import { useUiStore } from '../../stores/uiStore';
import type { Contact, Deal, Interaction, InteractionType } from '../../types';

export const ICONS: Record<InteractionType, typeof Phone> = {
  call: Phone,
  email: Mail,
  meeting: CalendarCheck,
  demo: MonitorPlay,
  proposal: FileText,
  followup: ArrowRight,
  note: StickyNote,
  zalo: MessageCircle,
  other: MoreHorizontal,
};

export const COLORS: Record<InteractionType, string> = {
  call: 'bg-interaction-call-bg text-interaction-call-fg',
  email: 'bg-interaction-email-bg text-interaction-email-fg',
  meeting: 'bg-interaction-meeting-bg text-interaction-meeting-fg',
  demo: 'bg-interaction-demo-bg text-interaction-demo-fg',
  proposal: 'bg-interaction-proposal-bg text-interaction-proposal-fg',
  followup: 'bg-interaction-followup-bg text-interaction-followup-fg',
  note: 'bg-tr-hover text-tr-subtle',
  zalo: 'bg-interaction-zalo-bg text-interaction-zalo-fg',
  other: 'bg-tr-hover text-tr-subtle',
};

export function InteractionTimeline({
  customerId,
  interactions,
  contacts,
  deals,
  defaultDealId,
}: {
  customerId: number;
  interactions: Interaction[];
  contacts: Contact[];
  deals: Deal[];
  /** Khi mở từ trang Cơ hội: chọn sẵn cơ hội và bật dải chấm điểm sau khi ghi (F-12). */
  defaultDealId?: number;
}) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<InteractionType>('call');
  const [occurredAt, setOccurredAt] = useState(nowLocalInput);
  const [summary, setSummary] = useState('');
  const [result, setResult] = useState('');
  const [contactId, setContactId] = useState('');
  const [dealId, setDealId] = useState(defaultDealId ? String(defaultDealId) : '');
  /** F-12: hoạt động vừa ghi, dùng làm bằng chứng gợi ý cho 8 yếu tố. */
  const [justLogged, setJustLogged] = useState<{ dealId: number; summary: string } | null>(null);
  const [nextAction, setNextAction] = useState('');
  const [nextActionDate, setNextActionDate] = useState<string | null>(null);
  const [createTask, setCreateTask] = useState(true);

  const assist = useMutation({
    mutationFn: () =>
      api.post<{
        summary: string;
        result: string;
        next_action: string;
        next_action_date: string | null;
        confidence: number;
      }>('/api/ai/assist/interaction', {
        customer_id: customerId,
        deal_id: dealId === '' ? null : Number(dealId),
        raw_notes: summary,
      }),
    onSuccess: (suggestion) => {
      setSummary(suggestion.summary);
      setResult(suggestion.result);
      setNextAction(suggestion.next_action);
      setNextActionDate(suggestion.next_action_date);
      pushToast('AI đã hoàn thiện bản nháp — hãy kiểm tra trước khi lưu', 'success');
    },
  });

  const refresh = () => invalidateCrmViews(queryClient, customerId);

  const create = useMutation({
    mutationFn: () =>
      api.post<{ created_task_id: number | null }>('/api/interactions', {
        customer_id: customerId,
        type,
        occurred_at: occurredAt,
        summary: summary.trim(),
        result: result.trim() || null,
        contact_id: contactId === '' ? null : Number(contactId),
        deal_id: dealId === '' ? null : Number(dealId),
        next_action: nextAction.trim() || null,
        next_action_date: nextActionDate,
        create_task: createTask && Boolean(nextAction.trim()),
      }),
    onSuccess: (created) => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
      if (created?.created_task_id) pushToast('Đã tạo công việc tiếp theo', 'success');
      // F-12: chỉ hoạt động thực tế mới làm thay đổi điểm (Mục 3.6) — hỏi ngay tại đây,
      // thay vì để người dùng chấm dồn một lần trước kỳ báo cáo.
      if (dealId !== '') setJustLogged({ dealId: Number(dealId), summary: summary.trim() });
      setSummary('');
      setResult('');
      setNextAction('');
      setNextActionDate(null);
      setAdding(false);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/interactions/${id}`),
    onSuccess: refresh,
  });

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button variant="primary" onClick={() => setAdding((v) => !v)}>
          <Plus size={15} /> {t.interaction.newInteraction}
        </Button>
      </div>

      {justLogged && (
        <ScoringPrompt
          dealId={justLogged.dealId}
          summary={justLogged.summary}
          onDismiss={() => setJustLogged(null)}
        />
      )}

      {adding && <FormError error={create.error ?? assist.error} />}
      {adding && (
        <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-tr-border bg-tr-panel p-4 sm:grid-cols-2">
          <Field label="Loại">
            <Select value={type} onChange={(e) => setType(e.target.value as InteractionType)}>
              {(Object.keys(t.interactionType) as InteractionType[]).map((k) => (
                <option key={k} value={k}>
                  {t.interactionType[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.interaction.occurredAt}>
            <Input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </Field>
          <Field label={t.interaction.relatedContact}>
            <Combobox
              value={contactId === '' ? '' : Number(contactId)}
              onChange={(v) => setContactId(v === '' ? '' : String(v))}
              options={contacts.map((c) => ({ id: c.id, label: c.full_name }))}
              placeholder={`— ${t.common.none} —`}
              searchPlaceholder="Tìm người liên hệ…"
              emptyText="Không tìm thấy người liên hệ."
              ariaLabel={t.interaction.relatedContact}
            />
          </Field>
          <Field label={t.interaction.relatedDeal}>
            <Combobox
              value={dealId === '' ? '' : Number(dealId)}
              onChange={(v) => setDealId(v === '' ? '' : String(v))}
              options={deals.map((d) => ({ id: d.id, label: d.title }))}
              placeholder={`— ${t.common.none} —`}
              searchPlaceholder="Tìm cơ hội…"
              emptyText="Không tìm thấy cơ hội."
              ariaLabel={t.interaction.relatedDeal}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t.interaction.summary}>
              <Textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} />
            </Field>
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                disabled={summary.trim().length < 10 || assist.isPending}
                onClick={() => assist.mutate()}
              >
                <Sparkles size={14} />{' '}
                {assist.isPending ? 'AI đang xử lý…' : 'AI hoàn thiện ghi chú'}
              </Button>
            </div>
          </div>
          <div className="sm:col-span-2">
            <Field label="Kết quả" hint={t.common.optional}>
              <Input
                value={result}
                onChange={(e) => setResult(e.target.value)}
                placeholder="Khách đồng ý demo, cần gửi lại báo giá…"
              />
            </Field>
          </div>

          {/* FR-ACT-04: tạo ngay việc tiếp theo sau khi ghi nhận tương tác */}
          <Field label="Hành động tiếp theo" hint="Sẽ cập nhật Next Action của cơ hội">
            <Input
              list="interaction-next-actions"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
            />
            <datalist id="interaction-next-actions">
              {NEXT_ACTIONS.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </Field>
          <Field label="Ngày thực hiện">
            <DateInput value={nextActionDate} onChange={setNextActionDate} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-tr-subtle sm:col-span-2">
            <input
              type="checkbox"
              checked={createTask}
              disabled={!nextAction.trim()}
              onChange={(e) => setCreateTask(e.target.checked)}
              className="h-4 w-4 rounded border-tr-border"
            />
            Tạo luôn công việc cho hành động tiếp theo
          </label>

          <div className="flex gap-2 sm:col-span-2">
            <Button
              variant="primary"
              disabled={!summary.trim() || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? t.common.saving : t.common.save}
            </Button>
            <Button onClick={() => setAdding(false)}>{t.common.cancel}</Button>
          </div>
        </div>
      )}

      {interactions.length === 0 ? (
        <EmptyState message={t.interaction.noInteractions} />
      ) : (
        <ol className="relative space-y-3 border-l border-tr-border pl-6">
          {interactions.map((item) => {
            const Icon = ICONS[item.type] ?? MoreHorizontal;
            return (
              <li key={item.id} className="group relative">
                <span
                  className={`absolute -left-[2.15rem] flex h-6 w-6 items-center justify-center rounded-full ${COLORS[item.type] ?? COLORS.other}`}
                >
                  <Icon size={13} />
                </span>
                <div className="rounded-lg border border-tr-border bg-tr-panel p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs text-tr-muted">
                      {t.interactionType[item.type]} · {formatDateTime(item.occurred_at)}
                      {item.contact_name && ` · ${item.contact_name}`}
                      {item.deal_title && ` · ${item.deal_title}`}
                    </div>
                    <button
                      onClick={() => remove.mutate(item.id)}
                      className="rounded p-1 text-tr-muted opacity-0 transition group-hover:opacity-100 hover:bg-tr-hover hover:text-tr-danger"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-tr-text">
                    {item.summary}
                  </p>
                  {item.result && (
                    <p className="mt-1 text-xs text-tr-subtle">
                      <span className="font-medium">Kết quả:</span> {item.result}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
