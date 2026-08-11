import { useEffect } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useUiStore } from '../../stores/uiStore';
import { t } from '../../i18n/vi';
import { focusRing } from './ui';

/**
 * Moi toast tu dem gio rieng. Truoc day chi toast dau hang co bo dem va bo dem
 * bi khoi tao lai moi khi danh sach doi, nen toast den sau co the song mai.
 */
function ToastItem({ id, duration }: { id: number; duration: number }) {
  const dismiss = useUiStore((s) => s.dismissToast);
  useEffect(() => {
    const timer = setTimeout(() => dismiss(id), duration);
    return () => clearTimeout(timer);
  }, [id, duration, dismiss]);
  return null;
}

export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);

  return (
    /* Vung song luon ton tai trong DOM — trinh doc man hinh chi thong bao
       noi dung them vao mot vung da co san, nen khong duoc unmount khi rong. */
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.kind === 'error' ? 'alert' : 'status'}
          className={`tr-anim-toast pointer-events-auto flex items-start gap-2 rounded-panel px-3 py-2.5 text-sm shadow-lg ${
            toast.kind === 'error'
              ? 'bg-tr-danger text-tr-on-danger'
              : 'bg-tr-success text-tr-on-success'
          }`}
        >
          <ToastItem id={toast.id} duration={toast.duration} />
          {toast.kind === 'error' ? (
            <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          )}
          <span className="flex-1">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.run();
                dismiss(toast.id);
              }}
              className={`shrink-0 rounded-control px-1.5 py-0.5 text-xs font-semibold underline underline-offset-2 hover:bg-black/10 ${focusRing}`}
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label={t.common.close}
            className={`shrink-0 rounded-control p-0.5 opacity-70 hover:opacity-100 ${focusRing}`}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
