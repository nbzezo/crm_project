/**
 * F-01 — Scorecard 8 yếu tố (4 BANT + 4P).
 *
 * Ba điều tuyệt đối không được làm trong màn này, vì chúng phá chính phương pháp luận:
 * - không cho lưu điểm ≥ 1 mà không có bằng chứng;
 * - không cho chấm quá trần mà dữ liệu cho phép (BR-SCR-01…08) — thay vào đó chỉ rõ
 *   việc cần làm để gỡ trần;
 * - không đụng vào `probability` của cơ hội.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CircleHelp,
  History,
  Link2,
  Lock,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { api } from '../../api/client';
import { EvidencePicker, evidenceFrom } from './EvidencePicker';
import { Button, ColorBadge, FormError, Panel, Skeleton, Textarea, focusRing } from '../common/ui';
import {
  AXIS_LABELS,
  BLOCKED_REASONS,
  CHALLENGE_PROMPTS,
  DISCOVERY_QUESTIONS,
  FACTOR_LABELS,
  QUADRANT_ACTIONS,
  QUADRANT_COLORS,
  QUADRANT_LABELS,
  RECOMMENDATION_TEXT,
  RUBRICS,
  VETO_LABELS,
} from '../../i18n/scoring';
import { formatDate } from '../../lib/format';
import type {
  EvidenceSource,
  Factor,
  Scorecard as ScorecardData,
  ScoreHistoryEntry,
  ScoreItem,
} from '../../types';

const EVIDENCE_MIN = 20;

export function Scorecard({
  dealId,
  onGoToCommittee,
  focusFactor,
}: {
  dealId: number;
  onGoToCommittee: () => void;
  /** Yếu tố cần mở sẵn — dùng khi nhảy từ dải chấm điểm sau hoạt động (F-12). */
  focusFactor?: Factor | null;
}) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['deal', dealId, 'scorecard'],
    queryFn: () => api.get<ScorecardData>(`/api/deals/${dealId}/scorecard`),
  });

  const { data: history } = useQuery({
    queryKey: ['deal', dealId, 'score-history'],
    queryFn: () => api.get<ScoreHistoryEntry[]>(`/api/deals/${dealId}/score-history`),
  });

  /** F-15: ghi đề xuất thẳng vào Next Action đã có — không tạo trường mới. */
  const setNextAction = useMutation({
    mutationFn: (text: string) => api.patch(`/api/deals/${dealId}`, { next_action: text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
    },
  });

  const [open, setOpen] = useState<Factor | null>(focusFactor ?? null);

  if (isLoading || !data)
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-panel" />
        <Skeleton className="h-64 rounded-panel" />
      </div>
    );

  const bant = data.items.filter((i) => i.axis === 'bant');
  const p4 = data.items.filter((i) => i.axis === 'p4');

  return (
    <div className="space-y-4">
      <ScoreSummary
        card={data}
        history={history}
        onSetNextAction={data.locked ? undefined : (text) => setNextAction.mutate(text)}
      />

      {data.locked && (
        <p className="flex items-center gap-2 rounded-panel border border-tr-border bg-tr-hover px-3 py-2 text-sm text-tr-subtle">
          <Lock size={14} aria-hidden="true" />
          Cơ hội đã chốt nên điểm được khóa, chỉ đọc. Điểm lúc chốt đã được lưu lại để phân tích
          thắng/thua.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <AxisPanel
          axis="bant"
          total={data.bant_total}
          items={bant}
          dealId={dealId}
          locked={data.locked}
          challengeRequired={false}
          open={open}
          setOpen={setOpen}
          onGoToCommittee={onGoToCommittee}
        />
        <AxisPanel
          axis="p4"
          total={data.p4_total}
          items={p4}
          dealId={dealId}
          locked={data.locked}
          challengeRequired={data.challenge_required}
          open={open}
          setOpen={setOpen}
          onGoToCommittee={onGoToCommittee}
        />
      </div>
    </div>
  );
}

/* ---------- Đầu trang: tổng, ô ma trận, veto, đề xuất ---------- */

export function ScoreSummary({
  card,
  history,
  onSetNextAction,
}: {
  card: ScorecardData;
  history?: ScoreHistoryEntry[];
  onSetNextAction?: (text: string) => void;
}) {
  const boundaryHint = (distance: number) =>
    distance >= 0
      ? `vượt ranh giới ${distance} điểm`
      : `còn thiếu ${Math.abs(distance)} điểm để qua ranh giới`;

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <ScoreDial
          label={AXIS_LABELS.bant.name}
          question={AXIS_LABELS.bant.question}
          total={card.bant_total}
          hint={boundaryHint(card.distance_to_boundary.bant)}
        />
        <ScoreDial
          label={AXIS_LABELS.p4.name}
          question={AXIS_LABELS.p4.question}
          total={card.p4_total}
          hint={boundaryHint(card.distance_to_boundary.p4)}
        />

        <div className="min-w-0 flex-1">
          <ColorBadge color={QUADRANT_COLORS[card.quadrant]}>
            {QUADRANT_LABELS[card.quadrant]}
          </ColorBadge>
          <p className="mt-1.5 text-xs leading-relaxed text-tr-muted">
            {QUADRANT_ACTIONS[card.quadrant]}
          </p>
        </div>

        <div className="text-right text-xs text-tr-muted">
          <p>
            Đã chấm <strong className="text-tr-text">{card.scored_count}/8</strong> yếu tố
          </p>
          <p>
            Độ tin cậy{' '}
            <strong className="text-tr-text">
              {card.confidence === null ? '—' : `${Math.round(card.confidence * 100)}%`}
            </strong>{' '}
            ({card.verified_count} yếu tố có nguồn)
          </p>
          <p className={card.stale ? 'text-tr-warning' : ''}>
            {card.score_age_days === null
              ? 'Chưa chấm lần nào'
              : `Chấm cách đây ${card.score_age_days} ngày${card.stale ? ' — điểm quá hạn' : ''}`}
          </p>
        </div>
      </div>

      {card.veto.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {card.veto.map((flag) => (
            <li
              key={flag.code}
              className={`flex items-start gap-2 rounded-control border px-3 py-2 text-sm ${
                flag.blocking
                  ? 'border-tr-danger/50 bg-tr-danger/10'
                  : 'border-tr-warning/50 bg-tr-warning/10'
              }`}
            >
              {flag.blocking ? (
                <ShieldAlert
                  size={15}
                  className="mt-0.5 shrink-0 text-tr-danger"
                  aria-hidden="true"
                />
              ) : (
                <AlertTriangle
                  size={15}
                  className="mt-0.5 shrink-0 text-tr-warning"
                  aria-hidden="true"
                />
              )}
              <span>
                <strong>{VETO_LABELS[flag.code].title}</strong> — {VETO_LABELS[flag.code].message}
                {!flag.blocking && (
                  <em className="ml-1 text-xs text-tr-muted">
                    (cảnh báo, không chặn forecast — trục 4P đã đo vị thế cạnh tranh)
                  </em>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-tr-muted">
        Forecast:{' '}
        {card.forecast_eligible ? (
          <strong className="text-tr-success">được tính vào forecast đã lọc</strong>
        ) : (
          <strong className="text-tr-danger">bị loại khỏi forecast đã lọc</strong>
        )}
      </p>

      {card.recommendations.length > 0 && !card.locked && (
        <div className="mt-3 border-t border-tr-border pt-3">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-tr-subtle">
            <Sparkles size={13} aria-hidden="true" /> Việc nên làm tiếp
          </h3>
          <ol className="space-y-1 text-sm text-tr-text">
            {card.recommendations.map((rec, index) => {
              const text =
                rec.code === 'veto' && rec.veto_code
                  ? RECOMMENDATION_TEXT.veto(VETO_LABELS[rec.veto_code].title)
                  : rec.code === 'lift_factor' && rec.factor
                    ? RECOMMENDATION_TEXT.lift_factor(rec.factor)
                    : rec.factor
                      ? RECOMMENDATION_TEXT.reverify(rec.factor)
                      : '';
              return (
                <li key={index} className="flex flex-wrap items-start gap-1.5">
                  <ArrowRight
                    size={13}
                    className="mt-1 shrink-0 text-tr-muted"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">{text}</span>
                  {/* F-15: cầu nối duy nhất giữa điểm số và Next Action đã có sẵn */}
                  {onSetNextAction && (
                    <button
                      type="button"
                      onClick={() => onSetNextAction(text)}
                      className={`shrink-0 rounded px-1.5 py-0.5 text-xs text-tr-primary hover:bg-tr-hover ${focusRing}`}
                    >
                      Đặt làm Next Action
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* F-18: đường điểm theo thời gian — F-07 cảnh báo yếu tố tụt ≥ 2 bậc thì
          phải có chỗ nhìn thấy diễn biến. */}
      {history && history.length >= 2 && <ScoreTrend history={history} />}
    </Panel>
  );
}

/**
 * F-18 — đường điểm theo thời gian.
 *
 * Dựng lại tổng hai trục theo từng lần ghi trong `deal_score_history`. Không có màn này
 * thì cảnh báo "một yếu tố giảm ≥ 2 bậc" của F-07 không có chỗ nào nhìn thấy diễn biến.
 */
function ScoreTrend({ history }: { history: ScoreHistoryEntry[] }) {
  const BANT: Factor[] = ['budget', 'authority', 'need', 'timeline'];
  const current: Partial<Record<string, number>> = {};
  const series: { at: string; bant: number; p4: number }[] = [];

  for (const entry of history) {
    if (entry.new_score === null) continue; // dòng ghi đè cổng giai đoạn, không phải điểm
    current[entry.factor] = entry.new_score;
    let bant = 0;
    let p4 = 0;
    for (const [factor, score] of Object.entries(current)) {
      if (BANT.includes(factor as Factor)) bant += score ?? 0;
      else p4 += score ?? 0;
    }
    series.push({ at: entry.changed_at, bant, p4 });
  }
  if (series.length < 2) return null;

  const path = (key: 'bant' | 'p4') =>
    series
      .map((point, index) => {
        const x = (index / (series.length - 1)) * 100;
        const y = 24 - (point[key] / 12) * 24;
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  const last = series[series.length - 1];
  const first = series[0];
  const delta = last.bant + last.p4 - (first.bant + first.p4);

  return (
    <div className="mt-3 flex items-center gap-3 border-t border-tr-border pt-3">
      <svg viewBox="0 0 100 24" className="h-10 w-40" role="img" aria-label="Diễn biến điểm">
        <path d={path('bant')} fill="none" stroke="var(--color-tr-primary)" strokeWidth={1.5} />
        <path
          d={path('p4')}
          fill="none"
          stroke="var(--color-tr-success)"
          strokeWidth={1.5}
          strokeDasharray="3 2"
        />
      </svg>
      <p className="text-xs text-tr-muted">
        Diễn biến qua {series.length} lần chấm · <span className="text-tr-primary">BANT</span> /{' '}
        <span className="text-tr-success">4P</span> ·{' '}
        <strong className={delta < 0 ? 'text-tr-warning' : 'text-tr-text'}>
          {delta >= 0 ? '+' : ''}
          {delta} điểm
        </strong>{' '}
        so với lần chấm đầu
      </p>
    </div>
  );
}

function ScoreDial({
  label,
  question,
  total,
  hint,
}: {
  label: string;
  question: string;
  total: number;
  hint: string;
}) {
  return (
    <div title={question}>
      <p className="text-xs font-semibold text-tr-subtle">{label}</p>
      <p className="text-2xl font-semibold tabular-nums text-tr-text">
        {total}
        <span className="text-sm font-normal text-tr-muted">/12</span>
      </p>
      <p className="text-xs text-tr-muted">{hint}</p>
    </div>
  );
}

/* ---------- Một trục ---------- */

function AxisPanel({
  axis,
  total,
  items,
  dealId,
  locked,
  challengeRequired,
  open,
  setOpen,
  onGoToCommittee,
}: {
  axis: 'bant' | 'p4';
  total: number;
  items: ScoreItem[];
  dealId: number;
  locked: boolean;
  challengeRequired: boolean;
  open: Factor | null;
  setOpen: (factor: Factor | null) => void;
  onGoToCommittee: () => void;
}) {
  return (
    <Panel
      title={
        <span className="flex items-baseline gap-2">
          {AXIS_LABELS[axis].name}
          <span className="text-xs font-normal text-tr-muted">{AXIS_LABELS[axis].question}</span>
        </span>
      }
      action={<span className="text-sm font-semibold tabular-nums text-tr-text">{total}/12</span>}
    >
      <ul className="space-y-1.5">
        {items.map((item) => (
          <FactorRow
            key={item.factor}
            item={item}
            dealId={dealId}
            locked={locked}
            challengeRequired={challengeRequired}
            expanded={open === item.factor}
            onToggle={() => setOpen(open === item.factor ? null : item.factor)}
            onGoToCommittee={onGoToCommittee}
          />
        ))}
      </ul>
    </Panel>
  );
}

/* ---------- Một yếu tố ---------- */

function FactorRow({
  item,
  dealId,
  locked,
  challengeRequired,
  expanded,
  onToggle,
  onGoToCommittee,
}: {
  item: ScoreItem;
  dealId: number;
  locked: boolean;
  challengeRequired: boolean;
  expanded: boolean;
  onToggle: () => void;
  onGoToCommittee: () => void;
}) {
  const queryClient = useQueryClient();
  const [evidence, setEvidence] = useState(item.evidence);
  const [challenge, setChallenge] = useState(item.challenge);
  const [draft, setDraft] = useState(item.score);
  const [picking, setPicking] = useState(false);
  const [source, setSource] = useState<{ type: string; id: number } | null>(
    item.source_id ? { type: item.source_type ?? 'manual', id: item.source_id } : null
  );

  const save = useMutation({
    mutationFn: (score: number) =>
      api.put(`/api/deals/${dealId}/scores/${item.factor}`, {
        score,
        evidence,
        challenge,
        source_type: source?.type ?? null,
        source_id: source?.id ?? null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const confirm = useMutation({
    mutationFn: () => api.post(`/api/deals/${dealId}/scores/${item.factor}/confirm`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deal', dealId] }),
  });

  const blocked = item.blocked_by ? BLOCKED_REASONS[item.blocked_by] : null;
  const needChallenge = challengeRequired && item.axis === 'p4';

  return (
    <li className="rounded-control border border-tr-border">
      <div className="flex flex-wrap items-center gap-2 px-2.5 py-2">
        <button
          type="button"
          onClick={onToggle}
          className={`min-w-0 flex-1 text-left text-sm font-medium text-tr-text ${focusRing}`}
          aria-expanded={expanded}
        >
          {FACTOR_LABELS[item.factor]}
          {item.status === 'suggested' && (
            <span className="ml-1.5 rounded bg-tr-hover px-1 py-0.5 text-xs text-tr-warning">
              AI đề xuất
            </span>
          )}
        </button>

        {item.verified === 1 ? (
          <BadgeCheck size={14} className="shrink-0 text-tr-success" aria-label="Đã xác thực" />
        ) : (
          item.score >= 1 && (
            <CircleHelp
              size={14}
              className="shrink-0 text-tr-warning"
              aria-label="Chưa xác thực bằng hoạt động"
            />
          )
        )}

        <div className="flex shrink-0 gap-0.5" role="group" aria-label={FACTOR_LABELS[item.factor]}>
          {[0, 1, 2, 3].map((value) => {
            const overCeiling = value > item.max_allowed;
            return (
              <button
                key={value}
                type="button"
                disabled={locked || overCeiling}
                title={
                  overCeiling
                    ? `Chưa đủ dữ liệu để chấm ${value} điểm`
                    : RUBRICS[item.factor][value]
                }
                onClick={() => {
                  setDraft(value);
                  if (!expanded) onToggle();
                }}
                className={`h-7 w-7 rounded text-xs font-semibold transition ${focusRing} ${
                  draft === value
                    ? 'bg-tr-primary text-white'
                    : overCeiling
                      ? 'cursor-not-allowed bg-tr-hover text-tr-muted opacity-40'
                      : 'bg-tr-hover text-tr-subtle hover:text-tr-text'
                }`}
              >
                {value}
              </button>
            );
          })}
        </div>
      </div>

      {blocked && (
        <p className="flex items-start gap-1.5 border-t border-tr-border px-2.5 py-1.5 text-xs text-tr-warning">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {blocked.text}
            {blocked.tab === 'committee' && (
              <button
                type="button"
                onClick={onGoToCommittee}
                className={`ml-1 underline ${focusRing}`}
              >
                Mở tab Nhóm quyết định
              </button>
            )}
          </span>
        </p>
      )}

      {expanded && (
        <div className="space-y-2 border-t border-tr-border p-2.5">
          <p className="rounded bg-tr-hover px-2 py-1.5 text-xs text-tr-subtle">
            <strong>{draft} điểm:</strong> {RUBRICS[item.factor][draft]}
          </p>

          <FormError error={save.error} />

          <Textarea
            rows={3}
            value={evidence}
            disabled={locked}
            onChange={(e) => {
              setEvidence(e.target.value);
              setSource(null);
            }}
            placeholder="Bằng chứng trích dẫn được — ai nói, khi nào, con số cụ thể…"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-tr-muted">
            <span
              className={
                evidence.trim().length < EVIDENCE_MIN && draft >= 1 ? 'text-tr-danger' : ''
              }
            >
              {evidence.trim().length}/{EVIDENCE_MIN} ký tự tối thiểu
            </span>
            {item.source_id && source && (
              <span className="flex items-center gap-1 text-tr-success">
                <Link2 size={11} aria-hidden="true" /> đã gắn nguồn
              </span>
            )}
            {item.scored_at && (
              <span className="flex items-center gap-1">
                <History size={11} aria-hidden="true" /> {formatDate(item.scored_at.slice(0, 10))}
              </span>
            )}
          </div>

          {needChallenge && draft >= 2 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-tr-subtle">
                Câu phản biện bắt buộc (deal lớn — F-13)
              </p>
              <p className="mb-1 text-xs text-tr-muted">{CHALLENGE_PROMPTS[item.factor]}</p>
              <Textarea
                rows={2}
                value={challenge}
                disabled={locked}
                onChange={(e) => setChallenge(e.target.value)}
                placeholder="Trả lời thẳng, kể cả khi câu trả lời làm điểm thấp đi…"
              />
            </div>
          )}

          {draft <= 1 && (
            <details className="rounded bg-tr-hover px-2 py-1.5">
              <summary
                className={`cursor-pointer text-xs font-semibold text-tr-subtle ${focusRing}`}
              >
                Câu hỏi khám phá để nâng điểm
              </summary>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-tr-muted">
                {DISCOVERY_QUESTIONS[item.factor].map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={locked || save.isPending}
              onClick={() => save.mutate(draft)}
            >
              Lưu điểm
            </Button>
            <Button disabled={locked} onClick={() => setPicking(true)}>
              <Link2 size={14} /> Chọn bằng chứng từ hoạt động
            </Button>
            {item.status === 'suggested' && (
              <Button variant="primary" disabled={locked} onClick={() => confirm.mutate()}>
                Xác nhận điểm đề xuất
              </Button>
            )}
          </div>
        </div>
      )}

      <EvidencePicker
        dealId={dealId}
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(picked: EvidenceSource) => {
          setEvidence(evidenceFrom(picked));
          setSource({ type: picked.source_type, id: picked.id });
        }}
      />
    </li>
  );
}
