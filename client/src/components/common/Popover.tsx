import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, X } from 'lucide-react';
import { useDialog } from './useDialog';

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
  const [pos, setPos] = useState({
    left: 0,
    top: 0,
    bottom: null as number | null,
    maxHeight: 220,
  });
  useDialog({ open, onClose, containerRef: ref, trapFocus: false, focusOnOpen: true });

  /**
   * Neo mac dinh o DUOI nut bam, nhung lat len TREN khi khong du cho — vd. nut
   * "..." nam trong QuickNoteEditorModal co the o gan day man hinh, neu luon co
   * dinh phia duoi popover se bi cat mat (khong co overflow-x-auto de cuu).
   */
  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    let left = rect.left;
    if (left + width + margin > window.innerWidth) left = window.innerWidth - width - margin;
    if (left < margin) left = margin;

    const spaceBelow = window.innerHeight - rect.bottom - margin - 6;
    const spaceAbove = rect.top - margin - 6;
    const placeAbove = spaceBelow < 220 && spaceAbove > spaceBelow;

    if (placeAbove) {
      setPos({
        left,
        top: 0,
        bottom: window.innerHeight - rect.top + 6,
        maxHeight: Math.max(160, spaceAbove),
      });
    } else {
      setPos({ left, top: rect.bottom + 6, bottom: null, maxHeight: Math.max(160, spaceBelow) });
    }
  }, [open, anchor, width]);

  useEffect(() => {
    if (!open) return;
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
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, onClose, anchor]);

  if (!open) return null;

  /* Portal ra <body>: mo tu ben trong vung `overflow-auto`/`tr-app-shell` (overflow:
     hidden) se cat/lech phan tu `fixed` neu khong portal — cung van de nhu Drawer.tsx. */
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      /* Popover co the chua mot Combobox, ma Combobox lai portal popover con ra
         body. Chan mousedown noi bo noi bot len document de popover cha khong
         dong va unmount lua chon con truoc khi su kien click kip chay. */
      onMouseDown={(event) => event.stopPropagation()}
      className="tr-popover tr-popover-shadow tr-anim-pop fixed z-popover flex flex-col overflow-hidden rounded-panel border border-tr-border bg-tr-panel"
      style={{
        left: pos.left,
        top: pos.bottom == null ? pos.top : undefined,
        bottom: pos.bottom ?? undefined,
        width: Math.min(width, window.innerWidth - 16),
        maxHeight: pos.maxHeight,
      }}
    >
      <div className="relative flex h-10 shrink-0 items-center justify-center border-b border-tr-border px-9">
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
      <div className="tr-scroll min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </div>,
    document.body
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
      className={`tr-popover-item -mx-3 flex w-[calc(100%+1.5rem)] items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-tr-hover focus-visible:bg-tr-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-tr-primary fine:py-1.5 ${
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
