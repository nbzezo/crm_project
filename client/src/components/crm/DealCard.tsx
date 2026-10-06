import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { STALE_DAYS } from '@workflow/contracts';
import { Building2, CalendarClock, RefreshCw, User } from 'lucide-react';
import { LabelChips } from '../labels/LabelChips';
import { t } from '../../i18n/vi';
import { QUADRANT_COLORS, QUADRANT_LABELS } from '../../i18n/scoring';
import { formatDateShort, formatVND, isOverdue, todayStr } from '../../lib/format';
import type { Deal, Label } from '../../types';
import { pickLabel } from '../../lib/crmConfig';

/**
 * Dưới ngưỡng này thì tuổi giai đoạn chưa nói lên điều gì.
 *
 * Hiện "ở giai đoạn này 2 ngày" trên mọi thẻ chỉ làm loãng thẻ; con số chỉ đáng
 * đọc khi nó bắt đầu bất thường.
 */
const STAGE_AGE_DAYS = 21;

export function SortableDealCard({
  deal,
  labels,
  onClick,
}: {
  deal: Deal;
  labels?: Label[];
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `deal-${deal.id}`,
    data: { type: 'deal', dealId: deal.id, stage: deal.stage },
  });

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform), transition }}
        className="rounded-panel bg-tr-hover-strong"
      >
        <div className="invisible">
          <DealCardBody deal={deal} labels={labels} onClick={() => {}} />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onClick}
      onKeyDown={(event) => {
        listeners?.onKeyDown?.(event);
        if (!event.defaultPrevented && event.key === 'Enter') onClick();
      }}
      aria-label={`${deal.title}, ${deal.customer_name ?? 'chưa gán khách hàng'}, ${formatVND(deal.value_vnd)}`}
      className="rounded-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-primary"
    >
      <DealCardBody deal={deal} labels={labels} onClick={onClick} />
    </div>
  );
}

export function DealCardBody({
  deal,
  labels = [],
  dragging,
}: {
  deal: Deal;
  labels?: Label[];
  onClick: () => void;
  dragging?: boolean;
}) {
  const closed = deal.stage === 'won' || deal.stage === 'lost';
  const closeOverdue = isOverdue(deal.expected_close_date, closed);
  /* V1/V2 luôn chặn forecast nên viền đỏ ở mọi vị trí trong ma trận (F-02). */
  const vetoed = !closed && Boolean(deal.v1_no_event || deal.v2_no_economic);
  const signal = pickDealSignal(deal);

  return (
    <div
      className={`tr-card-shadow w-full cursor-pointer rounded-panel bg-tr-card p-2.5 text-left transition hover:ring-2 hover:ring-tr-primary ${
        dragging ? 'rotate-3 shadow-lg' : ''
      } ${vetoed ? 'ring-1 ring-tr-danger' : ''}`}
    >
      <div className="flex items-start gap-1.5">
        <span className="flex-1 text-sm leading-snug font-medium text-tr-text">{deal.title}</span>
        {!!deal.is_renewal && (
          <span title="Cơ hội gia hạn" className="mt-0.5 shrink-0 text-tr-muted">
            <RefreshCw size={13} />
          </span>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-semibold text-tr-text">{formatVND(deal.value_vnd)}</span>
        <span className="text-xs text-tr-muted">{deal.probability}%</span>
        {/* Điểm chất lượng đứng cạnh xác suất theo giai đoạn — hai chỉ số độc lập,
            chênh lệch giữa chúng chính là mức thổi phồng pipeline (F-08). */}
        {deal.quadrant && (deal.bant_total || deal.p4_total) ? (
          <span
            title={`BANT ${deal.bant_total}/12 · 4P ${deal.p4_total}/12 — ${QUADRANT_LABELS[deal.quadrant]}`}
            className="inline-flex items-center gap-1 text-xs tabular-nums"
            style={{ color: QUADRANT_COLORS[deal.quadrant] }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: 'currentColor' }}
            />
            {deal.bant_total}/{deal.p4_total}
          </span>
        ) : null}
      </div>

      {/* FR-TAG-26: card cơ hội chỉ hiện vài nhãn đầu, phần còn lại gom "+N" */}
      <LabelChips labels={labels} max={3} small className="mt-1.5" />

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-tr-muted">
        {deal.customer_name && (
          <span className="inline-flex max-w-[11rem] items-center gap-1 truncate">
            <Building2 size={12} />
            {deal.customer_name}
          </span>
        )}
        {deal.contact_name && (
          <span className="inline-flex max-w-[8rem] items-center gap-1 truncate">
            <User size={12} />
            {deal.contact_name}
          </span>
        )}
        {deal.expected_close_date && (
          <span
            className={`inline-flex items-center gap-1 rounded-compact px-1 py-0.5 ${
              closeOverdue ? 'tr-badge-overdue' : ''
            }`}
            title={t.deal.expectedClose}
          >
            <CalendarClock size={12} />
            {formatDateShort(deal.expected_close_date)}
          </span>
        )}
      </div>

      {signal && (
        <div
          className={`mt-2 rounded-compact px-1.5 py-1 text-xs ${signal.kind === 'veto' ? 'tr-badge-overdue' : 'bg-tr-hover text-tr-subtle'}`}
          title={signal.others.length ? [signal.text, ...signal.others].join(' · ') : signal.text}
        >
          {signal.text}
          {signal.others.length > 0 && (
            <span className="ml-1 text-tr-muted">+{signal.others.length} cảnh báo</span>
          )}
        </div>
      )}
    </div>
  );
}

export type DealSignal = { kind: string; text: string; tone: string; others: string[] };

export function pickDealSignal(deal: Deal): DealSignal | null {
  const closed = deal.stage === 'won' || deal.stage === 'lost';
  const signals: DealSignal[] = [];
  if (!closed && (deal.v1_no_event || deal.v2_no_economic))
    signals.push({ kind: 'veto', text: 'Loại khỏi dự báo', tone: 'danger', others: [] });
  if (deal.on_hold) signals.push({ kind: 'hold', text: 'Tạm dừng', tone: 'muted', others: [] });
  if (deal.next_action && deal.next_action_date && deal.next_action_date < todayStr())
    signals.push({
      kind: 'next-overdue',
      text: `Việc kế tiếp quá hạn: ${deal.next_action}`,
      tone: 'danger',
      others: [],
    });
  else if (deal.next_action)
    signals.push({
      kind: 'next',
      text: `Việc kế tiếp: ${deal.next_action}`,
      tone: 'muted',
      others: [],
    });
  else if (!closed)
    signals.push({
      kind: 'missing-next',
      text: 'Chưa có việc kế tiếp',
      tone: 'warning',
      others: [],
    });
  if (!closed && (deal.days_idle ?? 0) >= STALE_DAYS)
    signals.push({
      kind: 'idle',
      text: `Không có tương tác ${deal.days_idle} ngày`,
      tone: 'warning',
      others: [],
    });
  if (!closed && (deal.days_in_stage ?? 0) >= STAGE_AGE_DAYS)
    signals.push({
      kind: 'stage-age',
      text: `Ở giai đoạn này ${deal.days_in_stage} ngày`,
      tone: 'muted',
      others: [],
    });
  if (deal.stage === 'won' && !deal.handover_ready)
    signals.push({ kind: 'handover', text: 'Chờ bàn giao', tone: 'warning', others: [] });
  if (deal.lost_reason)
    signals.push({
      kind: 'lost',
      text: `Lý do: ${pickLabel('lost_reason', deal.lost_reason)}`,
      tone: 'danger',
      others: [],
    });
  const [first, ...rest] = signals;
  return first ? { ...first, others: rest.map((item) => item.text) } : null;
}
