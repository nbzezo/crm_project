import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, X } from 'lucide-react';
import { useDialog } from './useDialog';
import { focusRing } from './ui';

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  onBack,
  closeLabel = 'Đóng',
  className = '',
  contentClassName = 'p-4',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  onBack?: () => void;
  closeLabel?: string;
  className?: string;
  contentClassName?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog({ open, onClose, containerRef: panelRef });

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-modal md:hidden" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-tr-overlay"
        onClick={onClose}
        aria-label={closeLabel}
      />
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`tr-anim-slide-up absolute inset-x-0 bottom-[var(--tr-keyboard-inset)] flex max-h-[min(85dvh,var(--tr-vvh))] flex-col overflow-hidden rounded-t-modal border-t border-tr-border bg-tr-panel pb-[var(--tr-safe-bottom)] shadow-xl ${className}`}
      >
        <div
          className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-tr-border"
          aria-hidden="true"
        />
        <header className="relative flex min-h-14 shrink-0 items-center justify-center border-b border-tr-border px-14">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className={`absolute left-2 flex h-11 w-11 items-center justify-center rounded-control text-tr-muted hover:bg-tr-hover ${focusRing}`}
              aria-label="Quay lại"
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
          )}
          <h2 id={titleId} className="truncate text-base font-semibold text-tr-text">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={`absolute right-2 flex h-11 w-11 items-center justify-center rounded-control text-tr-muted hover:bg-tr-hover ${focusRing}`}
            aria-label={closeLabel}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className={`tr-scroll min-h-0 flex-1 overflow-y-auto ${contentClassName}`}>
          {children}
        </div>
      </section>
    </div>,
    document.body
  );
}
