import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRightLeft,
  CalendarPlus,
  Check,
  Copy,
  Lightbulb,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import { invalidateCalendar, invalidateCardViews } from '../../lib/queryKeys';
import { usePermission } from '../../lib/permissions';
import { useUiStore } from '../../stores/uiStore';
import { Button, FormError, Panel, focusRing } from '../common/ui';
import type { FocusData, FocusMode, FocusPlan } from './focusTypes';
import { useOpenItem } from './FocusItemRow';
import { dayMonth, weekdayShort } from './focusPeriod';

function Section({
  icon: Icon,
  title,
  tone = 'text-tr-primary',
  children,
}: {
  icon: typeof Target;
  title: string;
  tone?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-panel bg-tr-hover p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-tr-text">
        <Icon size={14} className={tone} aria-hidden="true" /> {title}
      </h3>
      {children}
    </section>
  );
}

export function FocusAiPanel({
  data,
  mode,
  plan,
  onPlan,
}: {
  data: FocusData;
  mode: FocusMode;
  /** Ket qua giu o FocusView theo tung ky — doi ky roi quay lai khong mat. */
  plan: FocusPlan | undefined;
  onPlan: (plan: FocusPlan) => void;
}) {
  const canUseAi = usePermission('ai', 'read');
  const canCreateEvent = usePermission('tasks', 'create');
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const openItem = useOpenItem();
  const [added, setAdded] = useState<Set<string>>(new Set());

  const generate = useMutation({
    mutationFn: (refresh: boolean) =>
      api.post<FocusPlan>('/api/ai/focus-plan', {
        from: data.range.from,
        to: data.range.to,
        mode,
        refresh,
      }),
    onSuccess: (result) => {
      setAdded(new Set());
      onPlan(result);
    },
  });

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: 'approve' | 'reject' }) =>
      api.post(`/api/ai/actions/${id}/${decision}`),
    onSuccess: (_result, { id, decision }) => {
      if (!plan) return;
      onPlan({
        ...plan,
        proposals: plan.proposals.map((p) =>
          p.id === id ? { ...p, status: decision === 'approve' ? 'executed' : 'rejected' } : p
        ),
      });
      if (decision === 'approve') {
        invalidateCardViews(queryClient);
        pushToast('Đã tạo công việc từ gợi ý AI', 'success');
      }
    },
    onError: (error) => pushToast(error instanceof Error ? error.message : 'Không thực hiện được'),
  });

  const addBlock = useMutation({
    mutationFn: (block: FocusPlan['schedule'][number]) =>
      api.post('/api/calendar/events', {
        title: block.title,
        event_type: 'task',
        start_at: `${block.date}T${block.start}`,
        end_at: `${block.date}T${block.end}`,
        description: 'Khung giờ làm việc tập trung do AI gợi ý từ màn Trọng tâm.',
      }),
    onSuccess: (_result, block) => {
      setAdded((current) => new Set(current).add(`${block.date}${block.start}`));
      invalidateCalendar(queryClient);
    },
    onError: (error) =>
      pushToast(error instanceof Error ? error.message : 'Không thêm được vào lịch'),
  });

  if (!canUseAi) return null;

  const itemByKey = new Map([...data.items, ...data.carry_over].map((item) => [item.key, item]));
  const copy = (text: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => pushToast('Đã sao chép tin nhắn', 'success'))
      .catch(() => pushToast('Trình duyệt không cho sao chép'));
  };

  if (!plan) {
    return (
      <Panel className="border-tr-primary/30 print:hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-base font-semibold text-tr-text">
              <Sparkles size={16} className="text-tr-primary" aria-hidden="true" /> AI phân tích kỳ
              này
            </h2>
            <p className="mt-0.5 text-sm text-tr-subtle">
              Xếp ưu tiên, chỉ ra rủi ro, gợi ý xếp lịch vào giờ trống, việc nên giao và việc mới
              nên tạo — bạn duyệt rồi mới thành việc.
            </p>
          </div>
          <Button
            variant="primary"
            className="shrink-0"
            disabled={generate.isPending}
            onClick={() => generate.mutate(false)}
          >
            <Sparkles size={14} aria-hidden="true" />
            {generate.isPending ? 'Đang phân tích…' : 'Phân tích'}
          </Button>
        </div>
        <FormError error={generate.error} />
      </Panel>
    );
  }

  const pendingProposals = plan.proposals.filter((p) => p.status === 'pending').length;
  const scheduleByDate = plan.schedule.reduce<Record<string, FocusPlan['schedule']>>(
    (acc, block) => {
      (acc[block.date] ??= []).push(block);
      return acc;
    },
    {}
  );

  return (
    <Panel
      className="border-tr-primary/30"
      title={
        <span className="flex items-center gap-1.5">
          <Sparkles size={16} className="text-tr-primary" aria-hidden="true" /> AI phân tích
        </span>
      }
      action={
        <span className="flex items-center gap-2 print:hidden">
          <span className="hidden text-xs text-tr-muted sm:inline">
            {plan.cached ? 'Kết quả đã lưu · ' : ''}
            {plan.meta.model}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={generate.isPending}
            onClick={() => generate.mutate(true)}
          >
            <RefreshCw
              size={13}
              className={generate.isPending ? 'animate-spin' : ''}
              aria-hidden="true"
            />
            {generate.isPending ? 'Đang phân tích…' : 'Phân tích lại'}
          </Button>
        </span>
      }
    >
      <p className="text-base font-semibold text-tr-text">{plan.headline}</p>
      {plan.summary && (
        <p className="mt-1 text-sm leading-relaxed text-tr-subtle">{plan.summary}</p>
      )}
      <FormError error={generate.error} />

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {plan.priorities.length > 0 && (
          <Section icon={Target} title="Ưu tiên">
            <ol className="space-y-1.5">
              {plan.priorities.map((p, index) => {
                const item = p.ref ? itemByKey.get(p.ref) : undefined;
                return (
                  <li key={`${index}-${p.title}`} className="flex gap-2 text-sm">
                    <span className="tr-rank flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-tr-primary/10 text-xs font-bold text-tr-primary">
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      {item ? (
                        <button
                          type="button"
                          onClick={() => openItem(item)}
                          className={`text-left font-medium text-tr-text hover:underline ${focusRing}`}
                        >
                          {p.title}
                        </button>
                      ) : (
                        <span className="font-medium text-tr-text">{p.title}</span>
                      )}
                      {p.reason && <span className="block text-xs text-tr-subtle">{p.reason}</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
          </Section>
        )}

        {plan.risks.length > 0 && (
          <Section icon={AlertTriangle} title="Rủi ro" tone="text-tr-warning">
            <ul className="space-y-1 text-sm text-tr-subtle">
              {plan.risks.map((risk) => (
                <li key={risk}>• {risk}</li>
              ))}
            </ul>
          </Section>
        )}

        {plan.schedule.length > 0 && (
          <Section icon={CalendarPlus} title="Gợi ý xếp lịch vào giờ trống">
            <div className="space-y-2">
              {Object.entries(scheduleByDate).map(([date, blocks]) => (
                <div key={date}>
                  <p className="text-xs font-semibold text-tr-subtle">
                    {weekdayShort(date)} {dayMonth(date)}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {blocks.map((block) => {
                      const key = `${block.date}${block.start}`;
                      return (
                        <li key={key} className="flex items-center gap-2 text-sm">
                          <span className="w-24 shrink-0 text-xs text-tr-muted tabular-nums">
                            {block.start}–{block.end}
                          </span>
                          <span
                            className="min-w-0 flex-1 truncate text-tr-text"
                            title={block.title}
                          >
                            {block.title}
                          </span>
                          {canCreateEvent &&
                            (added.has(key) ? (
                              <span className="flex items-center gap-1 text-xs text-tr-success">
                                <Check size={12} aria-hidden="true" /> Đã thêm
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={addBlock.isPending}
                                onClick={() => addBlock.mutate(block)}
                                className={`shrink-0 rounded-full border border-tr-border px-2 py-0.5 text-xs text-tr-subtle hover:border-tr-primary/40 hover:text-tr-primary print:hidden ${focusRing}`}
                                aria-label={`Thêm “${block.title}” vào lịch`}
                              >
                                Thêm vào lịch
                              </button>
                            ))}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </Section>
        )}

        {plan.delegate.length > 0 && (
          <Section icon={ArrowRightLeft} title="Nên giao / chuyển việc">
            <ul className="space-y-1.5 text-sm">
              {plan.delegate.map((d) => (
                <li key={d.title}>
                  <span className="font-medium text-tr-text">{d.title}</span>
                  {d.to && <span className="text-tr-subtle"> → {d.to}</span>}
                  {d.reason && <span className="block text-xs text-tr-subtle">{d.reason}</span>}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      {plan.proposals.length > 0 && (
        <div className="mt-3">
          <Section
            icon={Lightbulb}
            title={`Việc mới AI đề xuất${pendingProposals > 0 ? ` · ${pendingProposals} chờ duyệt` : ''}`}
            tone="text-tr-warning"
          >
            <ul className="divide-y divide-tr-border">
              {plan.proposals.map((proposal) => (
                <li key={proposal.id} className="flex flex-wrap items-start gap-2 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-tr-text">{proposal.title}</span>
                    {proposal.explanation && (
                      <span className="block text-xs text-tr-subtle">{proposal.explanation}</span>
                    )}
                  </span>
                  {proposal.status === 'pending' ? (
                    <span className="flex shrink-0 gap-1.5 print:hidden">
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={decide.isPending}
                        onClick={() => decide.mutate({ id: proposal.id, decision: 'approve' })}
                      >
                        <Check size={13} aria-hidden="true" /> Tạo việc
                      </Button>
                      <Button
                        size="sm"
                        disabled={decide.isPending}
                        onClick={() => decide.mutate({ id: proposal.id, decision: 'reject' })}
                        aria-label={`Bỏ qua: ${proposal.title}`}
                      >
                        <X size={13} aria-hidden="true" />
                      </Button>
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs text-tr-muted">
                      {proposal.status === 'rejected' ? 'Đã bỏ qua' : 'Đã tạo'}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      {plan.messages.length > 0 && (
        <div className="mt-3">
          <Section icon={MessageSquareText} title="Tin nhắn soạn sẵn">
            <ul className="space-y-2">
              {plan.messages.map((message, index) => (
                <li key={index} className="rounded-control bg-tr-panel p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-xs font-semibold text-tr-subtle">
                      Gửi {message.to || '…'}
                      {message.purpose ? ` · ${message.purpose}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => copy(message.text)}
                      className={`flex shrink-0 items-center gap-1 rounded-control px-1.5 py-0.5 text-xs text-tr-primary hover:bg-tr-hover print:hidden ${focusRing}`}
                    >
                      <Copy size={12} aria-hidden="true" /> Sao chép
                    </button>
                  </div>
                  <p className="mt-1 text-sm whitespace-pre-wrap text-tr-text">{message.text}</p>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      <p className="mt-3 text-xs text-tr-muted">
        AI chỉ đọc dữ liệu bạn được xem và có thể sai — kiểm tra trước khi làm theo.
      </p>
    </Panel>
  );
}
