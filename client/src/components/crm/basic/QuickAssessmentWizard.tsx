import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import {
  ANSWER_LABELS,
  QUICK_GROUP_LABELS,
  QUICK_QUESTION_TEXT,
} from '../../../i18n/quickAssessment';
import { Button, FormError, Panel, Skeleton, Textarea, focusRing } from '../../common/ui';
import { usePermission } from '../../../lib/permissions';
import { DecisionPanel } from '../DealAssessment';
import type {
  Deal,
  DealAssessment,
  QuickAnswer,
  QuickAssessment,
  QuickAssistResult,
  QuickQuestion,
} from '../../../types';

export type QuickDraft = Record<
  QuickQuestion,
  { answer: QuickAnswer | null; note: string; source: 'user' | 'ai' | 'derived' | null }
>;
const questions = Object.keys(QUICK_QUESTION_TEXT) as QuickQuestion[];
export function buildQuickPayload(
  draft: QuickDraft,
  aiSuggestions: Partial<Record<QuickQuestion, QuickAnswer>> = {}
) {
  return questions.map((question) => {
    const item = draft[question];
    const answer = item.answer ?? 'unsure';
    const keptAi = aiSuggestions[question] === answer && item.source === 'ai';
    return {
      question,
      answer,
      ...(item.note ? { note: item.note } : {}),
      source: keptAi ? ('ai' as const) : ('user' as const),
    };
  });
}
function emptyDraft(items: QuickAssessment['items']): QuickDraft {
  return Object.fromEntries(
    items.map((item) => [
      item.question,
      { answer: item.answer, note: item.note ?? '', source: item.source },
    ])
  ) as QuickDraft;
}
export function QuickAssessmentWizard({ deal, onDone }: { deal: Deal; onDone: () => void }) {
  const qc = useQueryClient();
  const canAi = usePermission('ai', 'create');
  const { data: quick, isLoading } = useQuery({
    queryKey: ['deal', deal.id, 'quick-assessment'],
    queryFn: () => api.get<QuickAssessment>(`/api/deals/${deal.id}/quick-assessment`),
  });
  const { data: assessment } = useQuery({
    queryKey: ['deal', deal.id, 'assessment'],
    queryFn: () => api.get<DealAssessment>(`/api/deals/${deal.id}/assessment`),
  });
  const [draft, setDraft] = useState<QuickDraft | null>(null);
  const [step, setStep] = useState<number | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [story, setStory] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState<Partial<Record<QuickQuestion, QuickAnswer>>>(
    {}
  );
  const [aiReasons, setAiReasons] = useState<Partial<Record<QuickQuestion, string>>>({});
  const [aiError, setAiError] = useState<unknown>(null);
  useEffect(() => {
    if (quick && step === null) setStep(quick.answered_at ? questions.length : 0);
  }, [quick, step]);
  const current = quick && (draft ?? emptyDraft(quick.items));
  const save = useMutation({
    mutationFn: () =>
      api.put<QuickAssessment>(`/api/deals/${deal.id}/quick-assessment`, {
        answers: buildQuickPayload(current!, aiSuggestions),
      }),
    onSuccess: (next) => {
      qc.setQueryData(['deal', deal.id, 'quick-assessment'], next);
      onDone();
    },
  });
  const assist = useMutation({
    mutationFn: () =>
      api.post<QuickAssistResult>(`/api/ai/assist/deal/${deal.id}/quick-assessment`, { story }),
    onSuccess: (result) => {
      const suggestions = Object.fromEntries(result.answers.map((a) => [a.question, a.answer]));
      setAiSuggestions(suggestions);
      setAiReasons(Object.fromEntries(result.answers.map((a) => [a.question, a.reason])));
      setDraft((prev) => {
        const next = prev ?? emptyDraft(quick!.items);
        return Object.fromEntries(
          questions.map((q) => [
            q,
            {
              ...next[q],
              answer: suggestions[q] ?? next[q].answer,
              source: suggestions[q] ? 'ai' : next[q].source,
            },
          ])
        ) as QuickDraft;
      });
      setAiError(null);
    },
    onError: setAiError,
  });
  if (isLoading || !quick || !current || step === null)
    return <Skeleton className="h-64 rounded-panel" />;
  if (quick.locked)
    return (
      <Panel title="Đánh giá nhanh">
        <p className="text-sm text-tr-muted">Cơ hội đã chốt nên chỉ xem được.</p>
        <Review draft={current} onEdit={() => undefined} />
      </Panel>
    );
  if (step >= questions.length)
    return (
      <div className="space-y-4">
        <Panel title="Xem lại">
          <Review draft={current} onEdit={(i) => setStep(i)} />
          <div className="mt-4 flex gap-2">
            <Button onClick={() => setStep(0)}>Làm lại từ câu 1</Button>
            <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
              Lưu đánh giá
            </Button>
          </div>
          <FormError error={save.error} />
        </Panel>
        {assessment && (
          <DecisionPanel
            data={assessment}
            dealId={deal.id}
            onUpdate={(next) => qc.setQueryData(['deal', deal.id, 'assessment'], next)}
          />
        )}
      </div>
    );
  const q = questions[step];
  const item = current[q];
  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex items-center justify-between text-sm text-tr-muted">
          <span>Câu {step + 1}/10</span>
          <span>
            {QUICK_GROUP_LABELS[quick.items.find((i) => i.question === q)?.group ?? 'real']}
          </span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-tr-hover">
          <div
            className="h-2 rounded-full bg-tr-primary"
            style={{ width: `${((step + 1) / 10) * 100}%` }}
          />
        </div>
        {item.source === 'derived' && (
          <p className="mt-4 text-xs text-tr-muted">Gợi ý từ đánh giá chi tiết</p>
        )}
        {item.source === 'ai' && (
          <p className="mt-4 text-xs text-tr-primary">
            AI gợi ý: {aiReasons[q] ?? 'câu trả lời này chưa được lưu'}
          </p>
        )}
        <h2 className="mt-3 text-xl font-semibold text-tr-text">{QUICK_QUESTION_TEXT[q].text}</h2>
        <p className="mt-2 text-sm text-tr-subtle">{QUICK_QUESTION_TEXT[q].hint}</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          {(['yes', 'unsure', 'no'] as QuickAnswer[]).map((answer) => (
            <button
              key={answer}
              type="button"
              aria-pressed={item.answer === answer}
              className={`min-h-12 rounded-control border px-4 text-left text-base ${focusRing} ${item.answer === answer ? 'border-tr-primary bg-tr-primary/10' : 'border-tr-border hover:bg-tr-hover'}`}
              onClick={() => {
                const next = {
                  ...current,
                  [q]: { ...item, answer, source: aiSuggestions[q] === answer ? 'ai' : 'user' },
                };
                setDraft(next);
                setTimeout(() => setStep(step + 1), 0);
              }}
            >
              {ANSWER_LABELS[answer]}
            </button>
          ))}
        </div>
        {noteOpen ? (
          <Textarea
            className="mt-3"
            rows={3}
            value={item.note}
            onChange={(e) => setDraft({ ...current, [q]: { ...item, note: e.target.value } })}
            placeholder="Ghi chú thêm"
          />
        ) : (
          <Button className="mt-3" size="sm" onClick={() => setNoteOpen(true)}>
            Thêm ghi chú
          </Button>
        )}
        <div className="mt-4 flex justify-between">
          <Button disabled={step === 0} onClick={() => setStep(step - 1)}>
            Quay lại
          </Button>
          <Button onClick={() => setStep(step + 1)}>Bỏ qua</Button>
        </div>
      </Panel>
      {canAi && (
        <Panel>
          <details>
            <summary className={`cursor-pointer text-sm font-semibold text-tr-text ${focusRing}`}>
              Kể cho AI — AI điền giúp 10 câu
            </summary>
            <p className="mt-2 text-xs text-tr-muted">
              Kể vài câu về khách: họ cần gì, ai quyết, có tiền chưa, đối thủ là ai… Trên điện
              thoại, bấm biểu tượng micro trên bàn phím để nói thay vì gõ. AI chỉ gợi ý, bạn xem lại
              rồi mới lưu.
            </p>
            <Textarea
              className="mt-2"
              rows={3}
              value={story}
              onChange={(e) => setStory(e.target.value)}
              aria-label="Kể cho AI về cơ hội này"
            />
            <Button className="mt-2" disabled={assist.isPending} onClick={() => assist.mutate()}>
              {assist.isPending ? 'AI đang đọc…' : 'AI gợi ý câu trả lời'}
            </Button>
            <FormError error={aiError} />
          </details>
        </Panel>
      )}
    </div>
  );
}
function Review({ draft, onEdit }: { draft: QuickDraft; onEdit: (index: number) => void }) {
  return (
    <ol className="space-y-2">
      {questions.map((q, i) => (
        <li key={q}>
          <button
            type="button"
            className="flex w-full justify-between rounded-control border border-tr-border p-2 text-left text-sm"
            onClick={() => onEdit(i)}
          >
            <span>
              {i + 1}. {QUICK_QUESTION_TEXT[q].text}
            </span>
            <strong>{ANSWER_LABELS[draft[q].answer ?? 'unsure']}</strong>
          </button>
        </li>
      ))}
    </ol>
  );
}
