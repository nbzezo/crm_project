import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialog } from './useDialog';
import { Button, focusRing } from './ui';
import { t } from '../../i18n/vi';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  width?: string;
  footer?: ReactNode;
  /**
   * Dat true khi biu mau dang co thay doi chua luu — Escape / bam nen / nut dong
   * se hoi lai thay vi dong ngay va lam mat du lieu nguoi dung vua go.
   */
  dirty?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 'max-w-2xl',
  footer,
  dirty = false,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);
  const titleId = useId();

  const requestClose = useCallback(() => {
    if (dirty) setConfirming(true);
    else onClose();
  }, [dirty, onClose]);

  useDialog({ open, onClose: requestClose, containerRef: panelRef });
  useDialog({
    open: open && confirming,
    onClose: () => setConfirming(false),
    containerRef: confirmRef,
  });

  if (!open) return null;

  /* Portal ra <body>: mo tu ben trong vung `overflow-auto` cua noi dung trang hoac
     `tr-app-shell` (overflow: hidden) se cat/lech phan tu `fixed` neu khong portal —
     xem giai thich chi tiet hon trong Drawer.tsx, cung mot van de. */
  return createPortal(
    <div
      className="tr-anim-fade fixed inset-0 z-modal flex items-start justify-center overflow-y-auto bg-tr-overlay p-4 sm:p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={`tr-modal tr-anim-pop w-full ${width} rounded-modal bg-tr-panel shadow-2xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-tr-border px-5 py-4">
          <div id={titleId} className="min-w-0 flex-1 text-lg font-semibold text-tr-text">
            {title}
          </div>
          <button
            type="button"
            onClick={requestClose}
            className={`rounded-panel p-1.5 text-tr-muted transition hover:bg-tr-hover hover:text-tr-text ${focusRing}`}
            aria-label={t.common.close}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-tr-border px-5 py-3">
            {footer}
          </div>
        )}
      </div>

      {/* Hoi lai truoc khi bo thay doi. Dung lop rieng thay vi ConfirmDialog
          de tranh vong nhap khau ConfirmDialog -> Modal -> ConfirmDialog. */}
      {confirming && (
        <div
          className="tr-anim-fade fixed inset-0 z-modal-nested flex items-center justify-center bg-tr-overlay p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirming(false);
          }}
        >
          <div
            ref={confirmRef}
            role="alertdialog"
            aria-modal="true"
            aria-label={t.common.unsavedTitle}
            className="tr-modal tr-anim-pop w-full max-w-sm rounded-modal bg-tr-panel p-5 shadow-2xl"
          >
            <h2 className="text-base font-semibold text-tr-text">{t.common.unsavedTitle}</h2>
            <p className="mt-2 text-sm text-tr-subtle">{t.common.unsavedBody}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={() => setConfirming(false)}>{t.common.keepEditing}</Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirming(false);
                  onClose();
                }}
              >
                {t.common.discard}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
