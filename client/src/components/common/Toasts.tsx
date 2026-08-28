import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useUiStore } from '../../stores/uiStore';
import { t } from '../../i18n/vi';
import { focusRing } from './ui';

/**
 * Moi toast tu dem gio rieng. Truoc day chi toast dau hang co bo dem va bo dem
 * bi khoi tao lai moi khi danh sach doi, nen toast den sau co the song mai.
 *
 * `paused` dung bo dem lai khi con tro dang o tren vung toast hoac khi focus ban
 * phim dang o trong do. Toast xoa co nut "Hoan tac": neu no van tu tat trong luc
 * nguoi dung dang voi tay toi nut thi hanh dong hoan tac bien mat giua chung —
 * nguoi dung dung ban phim hoac doc man hinh gan nhu khong bao gio kip.
 */
function ToastItem({ id, duration, paused }: { id: number; duration: number; paused: boolean }) {
  const dismiss = useUiStore((s) => s.dismissToast);
  // Giu phan thoi gian con lai de lan tam dung khong lam bo dem chay lai tu dau.
  const remainingRef = useRef(duration);
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (paused) return;
    startedAtRef.current = Date.now();
    const timer = setTimeout(() => dismiss(id), remainingRef.current);
    return () => {
      clearTimeout(timer);
      remainingRef.current = Math.max(
        0,
        remainingRef.current - (Date.now() - startedAtRef.current)
      );
    };
  }, [id, paused, dismiss]);

  return null;
}

export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  const [paused, setPaused] = useState(false);

  const hold = useCallback(() => setPaused(true), []);
  const release = useCallback(() => setPaused(false), []);

  return (
    /* Vung song luon ton tai trong DOM — trinh doc man hinh chi thong bao
       noi dung them vao mot vung da co san, nen khong duoc unmount khi rong. */
    <div
      aria-live="polite"
      aria-atomic="false"
      onMouseEnter={hold}
      onMouseLeave={release}
      onFocusCapture={hold}
      onBlurCapture={release}
      className="pointer-events-none fixed right-4 bottom-4 z-toast flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.kind === 'error' ? 'alert' : 'status'}
          className={`tr-toast tr-anim-toast pointer-events-auto flex items-start gap-2 rounded-panel px-3 py-2.5 text-sm shadow-lg ${
            toast.kind === 'error'
              ? 'bg-tr-danger text-tr-on-danger'
              : 'bg-tr-success text-tr-on-success'
          }`}
        >
          <ToastItem id={toast.id} duration={toast.duration} paused={paused} />
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
              /* Toi thieu 24x24 CSS px — WCAG 2.2 tieu chi 2.5.8 (Target Size
                 Minimum). Truoc day nut nay cao khoang 20px. */
              className={`inline-flex min-h-6 shrink-0 items-center rounded-control px-2 text-xs font-semibold underline underline-offset-2 hover:bg-black/10 ${focusRing}`}
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label={t.common.close}
            /* 24x24 — WCAG 2.2 tieu chi 2.5.8; truoc day chi 18px. */
            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-control opacity-70 hover:opacity-100 ${focusRing}`}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
