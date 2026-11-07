import { createContext, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../../common/ui';

/**
 * Ma trang dang soan — khoi so do can no de goi AI tao so do
 * (/api/ai/assist/meeting-note/:id/diagram). MeetingNoteBody boc BlockNoteView
 * trong Provider; khoi so do nam trong cay React cua BlockNoteView (portal) nen
 * doc duoc. null = khong co trang (an nut AI).
 */
export const DiagramNoteContext = createContext<number | null>(null);

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Khung sua so do toan man hinh — giong Lark: trong trang chi hien ban xem
 * truoc, bam "Chỉnh sửa" moi mo khung ve lon.
 *
 * KHONG dung useDialog/Modal: useDialog bat Escape va Tab o pha capture cua
 * document, trong khi Excalidraw (Escape bo chon) va mind-elixir (Tab them
 * nhanh con, Escape thoat sua nhanh) can chinh cac phim do. Dong bang nut "Xong".
 */
export function DiagramFullscreen({
  title,
  toolbar,
  onDone,
  children,
}: {
  title: string;
  toolbar?: ReactNode;
  onDone: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const { body } = document;
    const saved = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = saved;
    };
  }, []);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="tr-anim-fade fixed inset-0 z-modal flex flex-col bg-tr-panel"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-tr-border px-3 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <div className="mr-auto text-sm font-semibold text-tr-text">{title}</div>
        {toolbar}
        <Button variant="primary" size="sm" onClick={onDone}>
          Xong
        </Button>
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>,
    document.body
  );
}
