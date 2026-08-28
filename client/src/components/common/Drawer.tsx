import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialog } from './useDialog';
import { focusRing } from './ui';
import { t } from '../../i18n/vi';

/**
 * Ngan keo truot tu canh phai — dung chung.
 *
 * Render qua portal ra thang <body>: ngan keo co the duoc mo tu ben trong mot
 * vung `overflow-auto` (tab Lich trong Bang) va tuong lai co the la mot to
 * to tien co `transform` — ca hai deu cat mat phan tu `fixed` neu khong portal.
 *
 * Bay focus / Escape / khoa cuon deu do `useDialog` lo — no giu mot ngan xep
 * rieng nen Modal mo chong len ngan keo van dong dung lop tren cung truoc.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'w-[min(26rem,100vw)]',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useDialog({ open, onClose, containerRef: panelRef });

  if (!open) return null;

  return createPortal(
    <div
      className="tr-anim-fade fixed inset-0 z-modal flex justify-end bg-tr-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`tr-anim-slide-right flex h-full flex-col border-s border-tr-border bg-tr-panel shadow-2xl ${width}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-tr-border px-4 py-3">
          <div id={titleId} className="min-w-0 flex-1 text-base font-semibold text-tr-text">
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className={`-me-1 shrink-0 rounded-panel p-1.5 text-tr-muted transition hover:bg-tr-hover hover:text-tr-text ${focusRing}`}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="tr-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>

        {footer && (
          <div className="flex flex-wrap gap-2 border-t border-tr-border px-4 py-3">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
}
