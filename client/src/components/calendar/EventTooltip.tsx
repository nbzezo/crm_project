import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CalEvent } from './calendarModel';
import { t } from '../../i18n/vi';
import { formatDate } from '../../lib/format';

export interface TooltipTarget {
  item: CalEvent;
  x: number;
  y: number;
}

const DELAY_MS = 400;
const WIDTH = 260;

/**
 * The xem nhanh khi ro chuot len su kien (muc 44).
 *
 * `pointer-events-none` la bat buoc: neu the nhan duoc chuot, no se nam giua
 * con tro va su kien, sinh ra vong mouseenter/mouseleave nhap nhay lien tuc.
 * Khong bay focus va khong role dialog — day chi la lop bo tro, khong phai hop thoai.
 */
export function EventTooltip({ target }: { target: TooltipTarget | null }) {
  const [shown, setShown] = useState<TooltipTarget | null>(null);

  useEffect(() => {
    if (!target) {
      setShown(null);
      return;
    }
    const timer = setTimeout(() => setShown(target), DELAY_MS);
    return () => clearTimeout(timer);
  }, [target]);

  if (!shown) return null;

  const { item, x, y } = shown;
  // Kep trong khung nhin de the khong bi tran ra ngoai canh phai/duoi.
  const left = Math.min(Math.max(8, x + 12), window.innerWidth - WIDTH - 8);
  const top = Math.min(y + 16, window.innerHeight - 150);

  return createPortal(
    <div
      role="tooltip"
      style={{ top, left, width: WIDTH }}
      className="tr-popover-shadow tr-anim-fade pointer-events-none fixed z-tooltip rounded-panel border border-tr-border bg-tr-panel p-3 text-xs"
    >
      <div className="mb-1.5 flex items-start gap-2">
        <span
          aria-hidden="true"
          className="mt-0.5 h-3 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: item.bg }}
        />
        <span className="font-semibold text-tr-text">{item.title}</span>
      </div>

      <dl className="space-y-0.5 text-tr-muted">
        <div className="flex gap-1.5">
          <dt className="shrink-0">{t.calendar.fieldType}:</dt>
          <dd className="text-tr-subtle">{item.typeLabel}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="shrink-0">{t.calendar.fieldDate}:</dt>
          <dd className="text-tr-subtle">
            {formatDate(item.date)}
            {item.time ? ` · ${item.time}` : ` · ${t.calendar.allDay}`}
          </dd>
        </div>
        {item.subtitle && (
          <div className="flex gap-1.5">
            <dt className="shrink-0">{t.calendar.fieldRelated}:</dt>
            <dd className="truncate text-tr-subtle">{item.subtitle}</dd>
          </div>
        )}
      </dl>

      {item.overdue && !item.done && (
        <span className="tr-badge-overdue mt-2 inline-block rounded-control px-1.5 py-0.5 text-xs font-semibold">
          {t.common.overdue}
        </span>
      )}
    </div>,
    document.body
  );
}
