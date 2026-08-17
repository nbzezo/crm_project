import { ChevronRight } from 'lucide-react';
import { REVENUE_STAGE_COLORS, t } from '../../i18n/vi';
import { formatShare, formatVND, formatVNDShort } from '../../lib/format';
import type { RevenueStage } from '../../types';

export interface RevenueFunnelTotal {
  amount: number;
  forecast: number;
  reconciled: number;
  invoiced: number;
  paid: number;
}

interface RevenueFunnelCardsProps {
  total: RevenueFunnelTotal;
  detailed?: boolean;
  lineCount?: number;
  year?: number;
}

/** Thẻ KPI phễu doanh thu dùng chung cho tổng quan và hồ sơ khách hàng. */
export function RevenueFunnelCards({
  total,
  detailed = false,
  lineCount = 0,
  year,
}: RevenueFunnelCardsProps) {
  const variance = total.amount - total.forecast;
  const remaining = Math.max(total.amount - total.paid, 0);

  const stageCards: {
    key: RevenueStage | 'amount';
    label: string;
    value: number;
    color?: string;
    hint?: string;
  }[] = [
    { key: 'amount', label: t.revenueFunnel.amount, value: total.amount },
    {
      key: 'reconciled',
      label: t.revenueFunnel.reconciled,
      value: total.reconciled,
      color: REVENUE_STAGE_COLORS.reconciled,
      hint: t.revenueFunnelHint.reconciled,
    },
    {
      key: 'invoiced',
      label: t.revenueFunnel.invoiced,
      value: total.invoiced,
      color: REVENUE_STAGE_COLORS.invoiced,
      hint: t.revenueFunnelHint.invoiced,
    },
    {
      key: 'paid',
      label: t.revenueFunnel.paid,
      value: total.paid,
      color: REVENUE_STAGE_COLORS.paid,
    },
  ];

  if (!detailed) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stageCards.map((card) => (
          <div key={card.key} className="rounded-lg border border-tr-border bg-tr-panel p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-tr-subtle">
              {card.color && (
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: card.color }}
                  aria-hidden="true"
                />
              )}
              {card.label}
            </div>
            <div className="mt-1 font-semibold tabular-nums text-tr-text">
              {formatVND(card.value)}
            </div>
            {card.key === 'amount' && (
              <div className="mt-1 text-xs text-tr-muted">
                {t.revenue.forecast} {formatVNDShort(total.forecast)}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  /** Doanh thu → đối soát → xuất hóa đơn → thu tiền → còn phải thu, thể hiện như một tiến trình. */
  const cards: {
    key: RevenueStage | 'amount' | 'remaining';
    label: string;
    value: number;
    color?: string;
    hint?: string;
  }[] = [...stageCards, { key: 'remaining', label: t.revenue.remaining, value: remaining }];

  return (
    <div>
      <div className="mb-2 text-xs text-tr-muted">
        {lineCount} dòng dịch vụ{year ? ` · năm ${year}` : ''}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map((card, i) => {
          const isAmount = card.key === 'amount';
          const isRemaining = card.key === 'remaining';
          return (
            <div
              key={card.key}
              className="relative rounded-lg border border-tr-border bg-tr-panel p-3"
            >
              {i < cards.length - 1 && (
                <ChevronRight
                  size={14}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 -right-[9px] z-10 hidden -translate-y-1/2 text-tr-muted/40 lg:block"
                />
              )}
              <div
                className="flex items-center gap-1.5 text-xs font-medium text-tr-subtle"
                title={card.hint}
              >
                {isRemaining ? (
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm bg-tr-warning"
                    aria-hidden="true"
                  />
                ) : (
                  card.color && (
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: card.color }}
                      aria-hidden="true"
                    />
                  )
                )}
                {card.label}
              </div>
              <div
                className={`mt-1 text-lg font-semibold tabular-nums ${isRemaining ? 'text-tr-warning' : 'text-tr-text'}`}
              >
                {formatVND(card.value)}
              </div>
              {isAmount ? (
                <div className="mt-1 space-y-0.5 text-xs text-tr-muted">
                  {variance !== 0 && (
                    <div className={variance > 0 ? 'text-tr-success' : 'text-tr-danger'}>
                      {variance > 0 ? '↑' : '↓'} {formatVND(Math.abs(variance))} so với kế hoạch
                    </div>
                  )}
                  <div>Kế hoạch: {formatVND(total.forecast)}</div>
                </div>
              ) : isRemaining ? (
                <div className="mt-1 text-xs text-tr-muted">
                  {formatShare(remaining, total.amount)} doanh thu chưa thu
                </div>
              ) : (
                <div className="mt-1 text-xs text-tr-muted">
                  {formatShare(card.value, total.amount)} tổng doanh thu
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
