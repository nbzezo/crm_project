import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, ArrowRight, Building2, CalendarClock, RefreshCw, User } from 'lucide-react';
import { LabelChips } from '../labels/LabelChips';
import { t } from '../../i18n/vi';
import { QUADRANT_COLORS, QUADRANT_LABELS } from '../../i18n/scoring';
import { formatDateShort, formatVND, isOverdue, todayStr } from '../../lib/format';
import type { Deal, Label } from '../../types';

/** 14 ngày không có tương tác thì coi là nguội (FR-PIP-04). */
const STALE_DAYS = 14;

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
        className="rounded-lg bg-tr-hover-strong"
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
      className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-primary"
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
  const nextActionOverdue = Boolean(deal.next_action_date && deal.next_action_date < todayStr());
  const stale = (deal.days_idle ?? 0) >= STALE_DAYS && !closed;
  const noNextAction = !deal.next_action && !closed;
  /* V1/V2 luôn chặn forecast nên viền đỏ ở mọi vị trí trong ma trận (F-02). */
  const vetoed = !closed && Boolean(deal.v1_no_event || deal.v2_no_economic);

  return (
    <div
      className={`tr-card-shadow w-full cursor-pointer rounded-lg bg-tr-card p-2.5 text-left transition hover:ring-2 hover:ring-tr-primary ${
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
        <span className="text-sm font-semibold text-tr-success">{formatVND(deal.value_vnd)}</span>
        <span className="text-2xs text-tr-muted">{deal.probability}%</span>
        {/* Điểm chất lượng đứng cạnh xác suất theo giai đoạn — hai chỉ số độc lập,
            chênh lệch giữa chúng chính là mức thổi phồng pipeline (F-08). */}
        {deal.quadrant && (deal.bant_total || deal.p4_total) ? (
          <span
            title={`BANT ${deal.bant_total}/12 · 4P ${deal.p4_total}/12 — ${QUADRANT_LABELS[deal.quadrant]}`}
            className="inline-flex items-center gap-1 text-2xs tabular-nums"
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

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-tr-muted">
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
            className={`inline-flex items-center gap-1 rounded px-1 py-0.5 ${
              closeOverdue ? 'tr-badge-overdue' : ''
            }`}
            title={t.deal.expectedClose}
          >
            <CalendarClock size={12} />
            {formatDateShort(deal.expected_close_date)}
          </span>
        )}
      </div>

      {/* FR-PIP-01: Next Action luôn hiển thị nổi bật trên card */}
      {deal.next_action ? (
        <div
          className={`mt-2 flex items-center gap-1.5 rounded px-1.5 py-1 text-2xs ${
            nextActionOverdue ? 'tr-badge-overdue' : 'bg-tr-hover text-tr-subtle'
          }`}
        >
          <ArrowRight size={12} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{deal.next_action}</span>
          {deal.next_action_date && (
            <span className="shrink-0">{formatDateShort(deal.next_action_date)}</span>
          )}
        </div>
      ) : (
        noNextAction && (
          <div className="mt-2 flex items-center gap-1.5 rounded bg-tr-hover px-1.5 py-1 text-2xs text-tr-warning">
            <AlertTriangle size={12} /> Chưa có hành động tiếp theo
          </div>
        )
      )}

      {stale && (
        <div className="mt-1 text-2xs text-tr-warning">
          Không có tương tác {deal.days_idle} ngày
        </div>
      )}

      {deal.lost_reason && (
        <div className="mt-1 text-2xs text-tr-danger">
          Lý do: {t.lostReason[deal.lost_reason] ?? deal.lost_reason}
        </div>
      )}
    </div>
  );
}
