/**
 * Tab "Đánh giá" — khung Opportunity Assessment: 4 câu hỏi × 5 tiêu chí = 20 ô,
 * kết luận, nhận định AI và nhật ký quyết định Theo / Tạm dừng / Rút.
 *
 * Màn này là công cụ HỖ TRỢ tự đánh giá: không chặn giai đoạn, không đụng forecast.
 * 8 ô lấy thẳng từ 8 yếu tố BANT/4P (chấm ở tab Chấm điểm) để không phải chấm hai lần.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  CheckCircle2,
  CircleHelp,
  ListPlus,
  Loader2,
  Sparkles,
  Trash2,
  UserRound,
  XCircle,
} from 'lucide-react';
import { api } from '../../api/client';
import {
  Button,
  ColorBadge,
  DateInput,
  Field,
  FormError,
  Panel,
  Skeleton,
  Textarea,
  focusRing,
} from '../common/ui';
import {
  CELL_INFO,
  CRITERION_LABELS,
  CRITERION_RUBRICS,
  DECISION_COLORS,
  DECISION_LABELS,
  DERIVED_INFO,
  LEVEL_LABELS,
  QUESTION_INFO,
  VERDICT_INFO,
  WORTH_LEVEL_LABELS,
} from '../../i18n/assessment';
import { FACTOR_LABELS, QUADRANT_COLORS, QUADRANT_LABELS } from '../../i18n/scoring';
import { formatDate } from '../../lib/format';
import { usePermission } from '../../lib/permissions';
import { useMyContactId } from '../../stores/authStore';
import { useUiStore } from '../../stores/uiStore';
import { useDealStageMove } from '../../hooks/useDealStageMove';
import { closedStageKey } from '../../lib/crmConfig';
import type {
  AiAssessmentReview,
  AssessmentCell,
  AssessmentCriterion,
  AssessmentQuestion,
  Deal,
  DealAssessment as AssessmentData,
  DealDecisionEntry,
  DealDecisionKind,
  Factor,
  Stage,
} from '../../types';

const QUESTIONS: AssessmentQuestion[] = ['need', 'compete', 'close', 'worth'];

const LEVEL_STYLES: Record<AssessmentCell['level'], string> = {
  strong: 'border-tr-success/50 bg-tr-success/10',
  weak: 'border-tr-danger/50 bg-tr-danger/10',
  unknown: 'border-tr-border bg-tr-hover',
};

const TONE_STYLES = {
  success: 'border-tr-success/50 bg-tr-success/10',
  warning: 'border-tr-warning/50 bg-tr-warning/10',
  danger: 'border-tr-danger/50 bg-tr-danger/10',
  neutral: 'border-tr-border bg-tr-hover',
} as const;

function cellLabel(cell: AssessmentCell): string {
  return CELL_INFO[cell.no]?.label ?? cell.key;
}

export function DealAssessment({
  deal,
  onOpenFactor,
  onGoToCommittee,
}: {
  deal: Deal;
  /** Mở tab Chấm điểm, mở sẵn yếu tố BANT/4P nếu có. */
  onOpenFactor: (factor?: Factor) => void;
  onGoToCommittee: () => void;
}) {
  const dealId = deal.id;
  const queryClient = useQueryClient();
  const queryKey = ['deal', dealId, 'assessment'];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => api.get<AssessmentData>(`/api/deals/${dealId}/assessment`),
  });
  const [selected, setSelected] = useState<number | null>(null);

  const update = (next: AssessmentData) => queryClient.setQueryData(queryKey, next);

  if (isLoading || !data)
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 rounded-panel" />
        <Skeleton className="h-72 rounded-panel" />
      </div>
    );

  const selectedCell = data.grid.find((cell) => cell.no === selected) ?? null;

  return (
    <div className="space-y-4">
      <VerdictPanel data={data} deal={deal} onUpdate={update} />

      <Panel
        title={
          <span className="flex flex-wrap items-baseline gap-2">
            4 câu hỏi · 20 tiêu chí
            <span className="text-xs font-normal text-tr-muted">
              Bấm vào một ô để xem câu hỏi cần làm rõ
            </span>
          </span>
        }
        action={<Legend />}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
          {QUESTIONS.map((question) => (
            <QuestionColumn
              key={question}
              question={question}
              cells={data.grid.filter((cell) => cell.question === question)}
              selected={selected}
              onSelect={(no) => setSelected(selected === no ? null : no)}
            />
          ))}
        </div>

        {selectedCell && (
          <CellDetail
            key={selectedCell.no}
            cell={selectedCell}
            deal={deal}
            data={data}
            onUpdate={update}
            onOpenFactor={onOpenFactor}
            onGoToCommittee={onGoToCommittee}
          />
        )}
      </Panel>

      <DecisionPanel data={data} dealId={dealId} onUpdate={update} />
    </div>
  );
}

function Legend() {
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs text-tr-muted">
      {(['strong', 'weak', 'unknown'] as const).map((level) => (
        <span key={level} className="flex items-center gap-1">
          <span className={`h-3 w-3 rounded-sm border ${LEVEL_STYLES[level]}`} aria-hidden="true" />
          {LEVEL_LABELS[level]}
        </span>
      ))}
    </span>
  );
}

/* ---------- Kết luận ---------- */

function VerdictPanel({
  data,
  deal,
  onUpdate,
}: {
  data: AssessmentData;
  deal: Deal;
  onUpdate: (next: AssessmentData) => void;
}) {
  const dealId = deal.id;
  const canUseAi = usePermission('ai', 'create');
  const ai = useMutation({
    mutationFn: () =>
      api.post<{ assessment: AssessmentData }>(`/api/ai/assist/deal/${dealId}/assessment`),
    onSuccess: (result) => onUpdate(result.assessment),
  });
  const applyAll = useMutation({
    mutationFn: async () => {
      let latest = data;
      for (const row of data.criteria.filter((item) => item.status === 'suggested')) {
        latest = await api.post<AssessmentData>(
          `/api/deals/${dealId}/assessment/${row.criterion}/confirm`
        );
      }
      return latest;
    },
    onSuccess: onUpdate,
  });

  /* O ma tran chi co nghia khi DA CHAM ca hai truc: 4P con 0 thi luon ra "Loai" hoac
     "Tai dinh hinh" — noi vay voi mot co hoi moi cham BANT la sai. */
  const notScored = data.bant_total === 0 || data.p4_total === 0;
  const verdict = VERDICT_INFO[data.verdict];
  const counts = { strong: 0, weak: 0, unknown: 0 };
  for (const cell of data.grid) counts[cell.level] += 1;
  const latestAi = data.decisions.find((entry) => entry.author_kind === 'ai' && entry.payload);

  return (
    <Panel>
      <div className="flex flex-wrap items-start gap-4">
        <div
          className={`min-w-0 flex-1 rounded-control border px-3 py-2.5 ${
            notScored ? TONE_STYLES.neutral : TONE_STYLES[verdict.tone]
          }`}
        >
          <p className="text-xs font-semibold text-tr-subtle">Kết luận gợi ý</p>
          <p className="mt-0.5 text-lg font-semibold text-tr-text">
            {notScored ? 'Chưa đủ dữ liệu' : verdict.label}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-tr-subtle">
            {notScored
              ? `Cần chấm cả BANT (đang ${data.bant_total}/12) và 4P (đang ${data.p4_total}/12) ở tab Chấm điểm để hệ thống gợi ý nên theo hay rút. Trong lúc đó, xem các ô xám bên dưới để biết còn thiếu gì.`
              : verdict.advice}
          </p>
        </div>

        <dl className="grid min-w-[14rem] grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-tr-muted">Có thật không (BANT)</dt>
          <dd className="text-right font-semibold tabular-nums text-tr-text">
            {data.bant_total}/12
          </dd>
          <dt className="text-tr-muted">Lợi thế (4P)</dt>
          <dd className="text-right font-semibold tabular-nums text-tr-text">{data.p4_total}/12</dd>
          <dt className="text-tr-muted">Đáng đầu tư?</dt>
          <dd className="text-right font-semibold tabular-nums text-tr-text">
            {data.worth_total}/15
            <span className="ml-1 text-xs font-normal text-tr-muted">
              ({WORTH_LEVEL_LABELS[data.worth_level]})
            </span>
          </dd>
        </dl>
      </div>

      <details className="mt-3 rounded-control border border-tr-border px-3 py-2">
        <summary className={`cursor-pointer text-xs font-semibold text-tr-subtle ${focusRing}`}>
          Xem chi tiết
        </summary>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-tr-muted">Có thật không (BANT)</dt>
          <dd className="text-right font-semibold tabular-nums text-tr-text">
            {data.bant_total}/12
          </dd>
          <dt className="text-tr-muted">Lợi thế (4P)</dt>
          <dd className="text-right font-semibold tabular-nums text-tr-text">{data.p4_total}/12</dd>
          <dt className="text-tr-muted">Đáng đầu tư?</dt>
          <dd className="text-right font-semibold tabular-nums text-tr-text">
            {data.worth_total}/15 ({WORTH_LEVEL_LABELS[data.worth_level]})
          </dd>
          <dt className="text-tr-muted">Ô ma trận</dt>
          <dd className="text-right">
            <ColorBadge color={QUADRANT_COLORS[data.quadrant]} small>
              {QUADRANT_LABELS[data.quadrant]}
            </ColorBadge>
          </dd>
        </dl>
      </details>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-tr-muted">
        <span>
          <strong className="text-tr-success">{counts.strong}</strong> mạnh ·{' '}
          <strong className="text-tr-danger">{counts.weak}</strong> yếu ·{' '}
          <strong className="text-tr-text">{counts.unknown}</strong> chưa biết
        </span>
        {data.worth_level === 'unknown' && (
          <span>
            "Đáng đầu tư" cần chấm ít nhất 3/5 tiêu chí: Lợi nhuận, Tiếp nối, Chiến lược, Nguồn lực,
            Mức an toàn khi triển khai (đang có {data.worth_scored}).
          </span>
        )}
        {canUseAi && (
          <Button size="sm" className="ml-auto" disabled={ai.isPending} onClick={() => ai.mutate()}>
            {ai.isPending ? (
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles size={13} aria-hidden="true" />
            )}
            {ai.isPending ? 'AI đang đọc hồ sơ…' : 'AI đánh giá'}
          </Button>
        )}
      </div>
      <FormError error={ai.error} />

      {data.criteria.some((item) => item.status === 'suggested') && (
        <div className="mt-3">
          <Button size="sm" disabled={applyAll.isPending} onClick={() => applyAll.mutate()}>
            Áp dụng tất cả gợi ý của AI
          </Button>
          <FormError error={applyAll.error} />
        </div>
      )}

      {latestAi?.payload && <AiReviewCard entry={latestAi} review={latestAi.payload} deal={deal} />}
    </Panel>
  );
}

function AiReviewCard({
  entry,
  review,
  deal,
}: {
  entry: DealDecisionEntry;
  review: AiAssessmentReview;
  deal: Deal;
}) {
  const openTaskComposer = useUiStore((s) => s.openTaskComposer);

  const createTask = (title: string, description = '') =>
    openTaskComposer({
      context: { deal_id: deal.id, customer_id: deal.customer_id },
      draft: { title, description },
    });

  return (
    <div className="mt-3 rounded-control border border-tr-border p-3 text-sm">
      <p className="flex flex-wrap items-center gap-2 text-xs text-tr-muted">
        <Bot size={14} aria-hidden="true" />
        Nhận định AI · {formatDate(entry.created_at.slice(0, 10))}
        <ColorBadge color={DECISION_COLORS[review.recommendation]} small>
          AI gợi ý: {DECISION_LABELS[review.recommendation]}
        </ColorBadge>
      </p>
      <p className="mt-1.5 leading-relaxed text-tr-text">{review.summary}</p>

      {review.risks.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-tr-subtle">Rủi ro lớn</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-tr-text">
            {review.risks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </div>
      )}

      {review.actions.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-tr-subtle">Việc nên làm</p>
          <ul className="mt-0.5 space-y-0.5">
            {review.actions.map((action) => (
              <li key={action} className="flex flex-wrap items-start gap-1.5 text-tr-text">
                <span className="min-w-0 flex-1">• {action}</span>
                <TaskButton onClick={() => createTask(action)} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {review.unknowns.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-tr-subtle">Điều còn chưa biết — nên hỏi khách</p>
          <ul className="mt-0.5 space-y-0.5">
            {review.unknowns.map((item) => (
              <li
                key={`${item.cell}-${item.question}`}
                className="flex flex-wrap items-start gap-1.5"
              >
                <span className="min-w-0 flex-1 text-tr-text">
                  <span className="text-xs text-tr-muted">{CELL_INFO[item.cell]?.label}:</span>{' '}
                  {item.question}
                </span>
                <TaskButton
                  onClick={() =>
                    createTask(`Làm rõ: ${CELL_INFO[item.cell]?.label ?? ''}`, item.question)
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {review.factors.length > 0 && (
        <details className="mt-2">
          <summary className={`cursor-pointer text-xs font-semibold text-tr-subtle ${focusRing}`}>
            AI tham khảo cho 8 yếu tố Có thật không/Lợi thế (không tự ghi điểm)
          </summary>
          <ul className="mt-1 space-y-0.5 text-xs text-tr-muted">
            {review.factors.map((factor) => (
              <li key={factor.key}>
                <strong className="text-tr-text">
                  {FACTOR_LABELS[factor.key as Factor] ?? factor.key}: {factor.score}
                </strong>{' '}
                — {factor.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function TaskButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs text-tr-primary hover:bg-tr-hover fine:min-h-0 ${focusRing}`}
    >
      <ListPlus size={12} aria-hidden="true" /> Tạo việc
    </button>
  );
}

/* ---------- Lưới 20 ô ---------- */

function QuestionColumn({
  question,
  cells,
  selected,
  onSelect,
}: {
  question: AssessmentQuestion;
  cells: AssessmentCell[];
  selected: number | null;
  onSelect: (no: number) => void;
}) {
  const info = QUESTION_INFO[question];
  const strong = cells.filter((cell) => cell.level === 'strong').length;
  const unknown = cells.filter((cell) => cell.level === 'unknown').length;

  return (
    <section className="rounded-control border border-tr-border p-2.5">
      <header className="mb-2">
        <p className="text-xs font-semibold text-tr-muted">Câu {info.no}</p>
        <h3 className="text-sm font-semibold text-tr-text">{info.question}</h3>
        <p className="mt-0.5 text-xs text-tr-muted">
          {strong}/5 mạnh{unknown > 0 ? ` · ${unknown} chưa biết` : ''}
          {strong >= 4 && <span className="text-tr-success"> · {info.pass}</span>}
        </p>
      </header>
      <ul className="space-y-1.5">
        {cells.map((cell) => (
          <li key={cell.no}>
            <button
              type="button"
              onClick={() => onSelect(cell.no)}
              aria-expanded={selected === cell.no}
              className={`flex min-h-11 w-full items-center gap-2 rounded-control border px-2 py-1.5 text-left text-sm fine:min-h-0 ${
                LEVEL_STYLES[cell.level]
              } ${selected === cell.no ? 'ring-2 ring-tr-primary' : ''} ${focusRing}`}
            >
              <span className="min-w-0 flex-1 text-tr-text">{cellLabel(cell)}</span>
              {cell.suggested_score !== null && (
                <span className="shrink-0 rounded bg-tr-panel px-1 text-xs text-tr-warning">
                  AI {cell.suggested_score}
                </span>
              )}
              <LevelIcon level={cell.level} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LevelIcon({ level }: { level: AssessmentCell['level'] }) {
  if (level === 'strong')
    return <CheckCircle2 size={15} className="shrink-0 text-tr-success" aria-label="Mạnh" />;
  if (level === 'weak')
    return <XCircle size={15} className="shrink-0 text-tr-danger" aria-label="Yếu" />;
  return <CircleHelp size={15} className="shrink-0 text-tr-muted" aria-label="Chưa biết" />;
}

/* ---------- Chi tiết một ô ---------- */

function CellDetail({
  cell,
  deal,
  data,
  onUpdate,
  onOpenFactor,
  onGoToCommittee,
}: {
  cell: AssessmentCell;
  deal: Deal;
  data: AssessmentData;
  onUpdate: (next: AssessmentData) => void;
  onOpenFactor: (factor?: Factor) => void;
  onGoToCommittee: () => void;
}) {
  const openTaskComposer = useUiStore((s) => s.openTaskComposer);
  const info = CELL_INFO[cell.no];

  return (
    <div className="mt-4 rounded-control border border-tr-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 text-sm font-semibold text-tr-text">
          {info?.label}
          <span className="ml-2 text-xs font-normal text-tr-muted">
            {QUESTION_INFO[cell.question].question}
          </span>
        </h3>
        <span className="flex items-center gap-1 text-xs text-tr-subtle">
          <LevelIcon level={cell.level} /> {LEVEL_LABELS[cell.level]}
          {cell.score !== null && ` (${cell.score}/3)`}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold text-tr-subtle">Câu hỏi cần làm rõ</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-tr-text">
            {info?.questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
          {cell.level !== 'strong' && (
            <Button
              size="sm"
              className="mt-2"
              onClick={() =>
                openTaskComposer({
                  context: { deal_id: deal.id, customer_id: deal.customer_id },
                  draft: {
                    title: `Làm rõ: ${info?.label ?? ''} — ${deal.title}`,
                    description: info?.questions.map((q) => `- ${q}`).join('\n'),
                  },
                })
              }
            >
              <ListPlus size={13} aria-hidden="true" /> Tạo việc tìm hiểu
            </Button>
          )}
        </div>

        <div>
          {cell.kind === 'criterion' && (
            <CriterionEditor
              key={`${cell.key}-${data.criteria.find((c) => c.criterion === cell.key)?.updated_at ?? ''}`}
              criterion={cell.key as AssessmentCriterion}
              data={data}
              onUpdate={onUpdate}
            />
          )}
          {cell.kind === 'factor' && (
            <div className="text-sm text-tr-subtle">
              <p>
                Ô này lấy từ yếu tố{' '}
                <strong className="text-tr-text">{FACTOR_LABELS[cell.key as Factor]}</strong> đã
                chấm ở tab Chấm điểm (cần bằng chứng), nên không chấm lại ở đây.
              </p>
              <Button size="sm" className="mt-2" onClick={() => onOpenFactor(cell.key as Factor)}>
                Chấm {FACTOR_LABELS[cell.key as Factor]}
              </Button>
            </div>
          )}
          {cell.kind === 'derived' && (
            <div className="text-sm text-tr-subtle">
              <p>{DERIVED_INFO[cell.key]}</p>
              {cell.key === 'influence' && (
                <Button size="sm" className="mt-2" onClick={onGoToCommittee}>
                  Mở tab Nhóm quyết định
                </Button>
              )}
              {cell.key === 'win_likelihood' && (
                <Button size="sm" className="mt-2" onClick={() => onOpenFactor()}>
                  Chấm 4P
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Chấm một tiêu chí bổ sung — dùng lại ở tab Nhóm quyết định cho ô #13. */
export function CriterionEditor({
  criterion,
  data,
  onUpdate,
}: {
  criterion: AssessmentCriterion;
  data: AssessmentData;
  onUpdate: (next: AssessmentData) => void;
}) {
  const row = data.criteria.find((item) => item.criterion === criterion);
  const [draft, setDraft] = useState(row?.score ?? 0);
  const [note, setNote] = useState(row?.note ?? '');
  const refresh = onUpdate;
  const save = useMutation({
    mutationFn: () =>
      api.put<AssessmentData>(`/api/deals/${data.deal_id}/assessment/${criterion}`, {
        score: draft,
        note,
      }),
    onSuccess: refresh,
  });
  const confirm = useMutation({
    mutationFn: () =>
      api.post<AssessmentData>(`/api/deals/${data.deal_id}/assessment/${criterion}/confirm`),
    onSuccess: refresh,
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-xs font-semibold text-tr-subtle">
          {CRITERION_LABELS[criterion]}
          {row?.status === 'suggested' && (
            <span className="ml-1.5 rounded bg-tr-hover px-1 py-0.5 text-tr-warning">
              AI đề xuất
            </span>
          )}
        </p>
        <div className="flex gap-0.5" role="group" aria-label={CRITERION_LABELS[criterion]}>
          {[0, 1, 2, 3].map((value) => (
            <button
              key={value}
              type="button"
              disabled={data.locked}
              title={CRITERION_RUBRICS[criterion][value]}
              aria-pressed={draft === value}
              onClick={() => setDraft(value)}
              className={`h-7 w-7 rounded text-xs font-semibold ${focusRing} ${
                draft === value
                  ? 'bg-tr-primary text-white'
                  : 'bg-tr-hover text-tr-subtle hover:text-tr-text'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-1 text-xs text-tr-muted">0 Chưa biết · 1 Yếu · 2 Khá · 3 Tốt</p>
      <p className="rounded bg-tr-hover px-2 py-1.5 text-xs text-tr-subtle">
        <strong>{draft} điểm:</strong> {CRITERION_RUBRICS[criterion][draft]}
      </p>
      <Textarea
        rows={2}
        value={note}
        disabled={data.locked}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Căn cứ, điều đã biết (không bắt buộc)…"
        aria-label={`Ghi chú ${CRITERION_LABELS[criterion]}`}
      />
      <FormError error={save.error ?? confirm.error} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={data.locked || save.isPending}
          onClick={() => save.mutate()}
        >
          Lưu
        </Button>
        {row?.status === 'suggested' && (
          <Button size="sm" disabled={data.locked} onClick={() => confirm.mutate()}>
            Xác nhận điểm AI ({row.score})
          </Button>
        )}
        {row?.updated_by_name && row.status === 'confirmed' && (
          <span className="text-xs text-tr-muted">
            {row.updated_by_name} · {formatDate(row.updated_at.slice(0, 10))}
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------- Quyết định ---------- */

export function DecisionPanel({
  data,
  dealId,
  onUpdate,
}: {
  data: AssessmentData;
  dealId: number;
  onUpdate: (next: AssessmentData) => void;
}) {
  const myContactId = useMyContactId();
  const [decision, setDecision] = useState<DealDecisionKind | null>(null);
  const [reason, setReason] = useState('');
  const [reviewDate, setReviewDate] = useState<string | null>(null);
  const [remind, setRemind] = useState(true);

  const add = useMutation({
    mutationFn: () =>
      api.post<AssessmentData>(`/api/deals/${dealId}/decisions`, {
        decision,
        reason,
        review_date: reviewDate,
        remind: remind && Boolean(reviewDate),
      }),
    onSuccess: (next) => {
      onUpdate(next);
      setDecision(null);
      setReason('');
      setReviewDate(null);
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del<AssessmentData>(`/api/deals/${dealId}/decisions/${id}`),
    onSuccess: onUpdate,
  });
  const queryClient = useQueryClient();
  /* Chuyen sang That bai doi giai doan va khoa danh gia — tai lai ca co hoi lan danh sach. */
  const { move, dialogs } = useDealStageMove({
    invalidate: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
    },
  });

  return (
    <Panel
      title={
        <span className="flex flex-wrap items-baseline gap-2">
          Quyết định & nhận xét
          <span className="text-xs font-normal text-tr-muted">
            Không bắt buộc — ghi lại để tự xem lại hoặc để lãnh đạo nắm
          </span>
        </span>
      }
    >
      {!data.locked && (
        <div className="space-y-2 rounded-control border border-tr-border p-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Quyết định">
            {(Object.keys(DECISION_LABELS) as DealDecisionKind[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={decision === key}
                onClick={() => setDecision(key)}
                className={`min-h-11 rounded-control border px-3 py-1 text-sm fine:min-h-8 ${focusRing} ${
                  decision === key
                    ? 'border-tr-primary bg-tr-primary text-white'
                    : 'border-tr-border text-tr-text hover:bg-tr-hover'
                }`}
              >
                {DECISION_LABELS[key]}
              </button>
            ))}
          </div>
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Vì sao? Điều kiện để xem lại?"
            aria-label="Lý do"
          />
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Ngày xem lại">
              <DateInput value={reviewDate} onChange={setReviewDate} />
            </Field>
            <label className="flex min-h-11 items-center gap-1.5 text-sm text-tr-subtle fine:min-h-8">
              <input
                type="checkbox"
                checked={remind}
                disabled={!reviewDate}
                onChange={(e) => setRemind(e.target.checked)}
              />
              Nhắc tôi ngày đó
            </label>
            <Button
              variant="primary"
              className="ml-auto"
              disabled={!decision || add.isPending}
              onClick={() => add.mutate()}
            >
              Ghi quyết định
            </Button>
          </div>
          <FormError error={add.error} />
          <p className="text-xs text-tr-muted">
            Chỉ ghi nhận để xem lại, không đổi giai đoạn của cơ hội.
          </p>
          {decision === 'withdraw' && (
            <Button
              variant="danger"
              onClick={() =>
                move({
                  dealId,
                  stage: closedStageKey('lost') as Stage,
                  beforeId: null,
                  afterId: null,
                })
              }
            >
              Chuyển cơ hội sang Thất bại
            </Button>
          )}
        </div>
      )}

      {data.decisions.length === 0 ? (
        <p className="mt-3 text-sm text-tr-muted">Chưa có quyết định hay nhận định nào.</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {data.decisions.map((entry) => (
            <li key={entry.id} className="rounded-control border border-tr-border px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-tr-muted">
                {entry.author_kind === 'ai' ? (
                  <Bot size={13} aria-hidden="true" />
                ) : (
                  <UserRound size={13} aria-hidden="true" />
                )}
                <span className="font-medium text-tr-text">
                  {entry.author_kind === 'ai'
                    ? `AI${entry.author_name ? ` (do ${entry.author_name} yêu cầu)` : ''}`
                    : (entry.author_name ?? 'Không rõ')}
                </span>
                <span>{formatDate(entry.created_at.slice(0, 10))}</span>
                <ColorBadge color={DECISION_COLORS[entry.decision]} small>
                  {entry.author_kind === 'ai' ? 'Gợi ý: ' : ''}
                  {DECISION_LABELS[entry.decision]}
                </ColorBadge>
                {entry.review_date && <span>Xem lại {formatDate(entry.review_date)}</span>}
                {(entry.author_kind === 'ai' || entry.author_contact_id === myContactId) && (
                  <button
                    type="button"
                    onClick={() => remove.mutate(entry.id)}
                    className={`ml-auto rounded p-1 text-tr-muted hover:text-tr-danger ${focusRing}`}
                    aria-label="Xóa mục này"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              {entry.reason && (
                <p className="mt-1 text-sm whitespace-pre-wrap text-tr-text">{entry.reason}</p>
              )}
            </li>
          ))}
        </ol>
      )}
      <FormError error={remove.error} />
      {dialogs}
    </Panel>
  );
}
