import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  anchor: HTMLElement | null;
  title: string;
  children: ReactNode;
  width?: number;
  onBack?: () => void;
}

/**
 * Popover neo vao nut bam — dung chung cho moi menu kieu Trello
 * (menu danh sach, chon nhan, chon ngay, doi nen bang…).
 */
export function Popover({ open, onClose, anchor, title, children, width = 304, onBack }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    let left = rect.left;
    if (left + width + margin > window.innerWidth) left = window.innerWidth - width - margin;
    if (left < margin) left = margin;
    setPos({ top: rect.bottom + 6, left });
  }, [open, anchor, width]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: MouseEvent) => {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node) &&
        anchor &&
        !anchor.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, onClose, anchor]);

  if (!open) return null;

  const maxHeight = Math.max(220, window.innerHeight - pos.top - 16);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={title}
      className="tr-popover-shadow tr-anim-pop fixed z-[70] overflow-hidden rounded-panel border border-tr-border bg-tr-panel"
      style={{ top: pos.top, left: pos.left, width }}
    >
      <div className="relative flex h-10 items-center justify-center border-b border-tr-border px-9">
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Quay lại"
            className="absolute left-1.5 rounded-control p-1.5 text-tr-muted transition hover:bg-tr-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-primary"
          >
            <ChevronLeft size={16} />
          </button>
        )}
        <span className="truncate text-sm font-semibold text-tr-subtle">{title}</span>
        <button
          onClick={onClose}
          className="absolute right-1.5 rounded-control p-1.5 text-tr-muted transition hover:bg-tr-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-primary"
          aria-label="Đóng"
        >
          <X size={16} />
        </button>
      </div>
      <div className="tr-scroll overflow-y-auto p-3" style={{ maxHeight }}>
        {children}
      </div>
    </div>
  );
}

/** Dong menu dang danh sach trong popover. */
export function PopoverItem({
  icon,
  children,
  onClick,
  danger,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mx-3 flex w-[calc(100%+1.5rem)] items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-tr-hover focus-visible:bg-tr-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-tr-primary sm:py-1.5 ${
        danger ? 'text-tr-danger' : 'text-tr-text'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * Quan ly trang thai mo/dong + phan tu neo cho mot popover.
 * Phai giu e.currentTarget ra bien truoc: React xoa no ngay sau khi handler chay,
 * nen doc trong ham cap nhat state se ra null.
 */
export function usePopover() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return {
    anchor,
    open: anchor !== null,
    toggle: (e: React.MouseEvent) => {
      const element = e.currentTarget as HTMLElement;
      setAnchor((prev) => (prev ? null : element));
    },
    show: (e: React.MouseEvent) => setAnchor(e.currentTarget as HTMLElement),
    /** Mo popover neo vao mot phan tu co san (dung khi chuyen tu popover khac sang). */
    showAt: (element: HTMLElement | null) => setAnchor(element),
    close: () => setAnchor(null),
  };
}
