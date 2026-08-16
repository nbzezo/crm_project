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
  const collectRate = total.amount > 0 ? Math.round((total.paid / total.amount) * 100) : 0;
  const cards: {
    key: RevenueStage | 'amount';
    label: string;
    value: number;
    color?: string;
  }[] = [
    { key: 'amount', label: t.revenueFunnel.amount, value: total.amount },
    {
      key: 'reconciled',
      label: t.revenueFunnel.reconciled,
      value: total.reconciled,
      color: REVENUE_STAGE_COLORS.reconciled,
    },
    {
      key: 'invoiced',
      label: t.revenueFunnel.invoiced,
      value: total.invoiced,
      color: REVENUE_STAGE_COLORS.invoiced,
    },
    {
      key: 'paid',
      label: t.revenueFunnel.paid,
      value: total.paid,
      color: REVENUE_STAGE_COLORS.paid,
    },
  ];

  return (
    <div className={`grid grid-cols-2 gap-3 ${detailed ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
      {cards.map((card) => (
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
          <div
            className={`${detailed ? 'text-lg' : ''} mt-1 font-semibold tabular-nums text-tr-text`}
          >
            {formatVND(card.value)}
          </div>
          {card.key === 'amount' ? (
            <div className="mt-1 text-xs text-tr-muted">
              {t.revenue.forecast} {formatVNDShort(total.forecast)}
              {detailed && variance !== 0 && (
                <span className={variance > 0 ? 'text-tr-success' : 'text-tr-danger'}>
                  {' '}
                  ({variance > 0 ? '+' : ''}
                  {formatVNDShort(variance)})
                </span>
              )}
            </div>
          ) : detailed ? (
            <div className="mt-1 text-xs text-tr-muted">
              {formatShare(card.value, total.amount)} tổng doanh thu
            </div>
          ) : null}
        </div>
      ))}
      {detailed && (
        <div className="rounded-lg border border-tr-border bg-tr-panel p-3">
          <div className="text-xs font-medium text-tr-subtle">{t.revenue.collectRate}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-tr-text">{collectRate}%</div>
          <div className="mt-1 text-xs text-tr-muted">
            {lineCount} dòng dịch vụ{year ? ` · năm ${year}` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
