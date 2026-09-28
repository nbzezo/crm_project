import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Maximize2, Minus, Pin, PinOff, StickyNote, X } from 'lucide-react';
import { focusRing, Skeleton } from '../common/ui';
import { useDialog } from '../common/useDialog';
import { useThemeStore } from '../../stores/themeStore';
import { colorForNote } from './palette';
import { QuickNoteEditorSurface } from './QuickNoteCard';
import { useQuickNote } from './useQuickNotes';

export interface QuickNoteWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface QuickNoteWindowState {
  id: number;
  minimized: boolean;
  maximized: boolean;
  pinned: boolean;
  bounds: QuickNoteWindowBounds;
}

const STORAGE_PREFIX = 'workflow-quick-note-window:';
const EDGE = 8;
const DEFAULT_WIDTH = 528;
const DEFAULT_HEIGHT = 648;
const MIN_WIDTH = 280;
const MIN_HEIGHT = 260;
const RESIZE_COMMIT_DELAY_MS = 100;

function clampBounds(bounds: QuickNoteWindowBounds): QuickNoteWindowBounds {
  const maxWidth = Math.max(240, window.innerWidth - EDGE * 2);
  const maxHeight = Math.max(220, window.innerHeight - EDGE * 2);
  const width = Math.min(Math.max(MIN_WIDTH, bounds.width), maxWidth);
  const height = Math.min(Math.max(MIN_HEIGHT, bounds.height), maxHeight);
  return {
    width,
    height,
    x: Math.min(Math.max(EDGE, bounds.x), Math.max(EDGE, window.innerWidth - width - EDGE)),
    y: Math.min(Math.max(EDGE, bounds.y), Math.max(EDGE, window.innerHeight - height - EDGE)),
  };
}

function hasFiniteBounds(value: unknown): value is QuickNoteWindowBounds {
  if (!value || typeof value !== 'object') return false;
  const bounds = value as Partial<QuickNoteWindowBounds>;
  return [bounds.x, bounds.y, bounds.width, bounds.height].every(
    (part) => typeof part === 'number' && Number.isFinite(part)
  );
}

/** Tao cua so lech tang dan; neu ghi chu da tung mo thi khoi phuc hinh hoc va trang thai ghim. */
export function createQuickNoteWindow(id: number, index: number): QuickNoteWindowState {
  const width = Math.min(DEFAULT_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - 32));
  const height = Math.min(DEFAULT_HEIGHT, Math.max(MIN_HEIGHT, window.innerHeight - 48));
  const fallback: QuickNoteWindowState = {
    id,
    minimized: false,
    maximized: false,
    pinned: false,
    bounds: clampBounds({
      x: (window.innerWidth - width) / 2 + (index % 6) * 24,
      y: (window.innerHeight - height) / 2 + (index % 6) * 20,
      width,
      height,
    }),
  };

  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${id}`);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Partial<QuickNoteWindowState>;
    if (!hasFiniteBounds(saved.bounds)) return fallback;
    /* Ban cu do content-box cua ResizeObserver roi ghi nguoc vao kich thuoc
       border-box, khien mot so cua so tu co dan den dung 280x260. Mot lan mo
       bang ban moi se dua nhung kich thuoc mac ket dung muc cu ve mac dinh. */
    const wasShrunkByLegacyObserver =
      saved.bounds.width <= MIN_WIDTH && saved.bounds.height <= MIN_HEIGHT;
    return {
      ...fallback,
      pinned: Boolean(saved.pinned),
      bounds: clampBounds(
        wasShrunkByLegacyObserver ? fallback.bounds : (saved.bounds as QuickNoteWindowBounds)
      ),
    };
  } catch {
    return fallback;
  }
}

interface LayerProps {
  windows: QuickNoteWindowState[];
  onChange: (id: number, patch: Partial<QuickNoteWindowState>) => void;
  onClose: (id: number) => void;
  onFocus: (id: number) => void;
}

export function QuickNoteWindowLayer({ windows, onChange, onClose, onFocus }: LayerProps) {
  const ordered = useMemo(
    () => [...windows.filter((item) => !item.pinned), ...windows.filter((item) => item.pinned)],
    [windows]
  );
  const minimized = windows.filter((item) => item.minimized);

  useEffect(() => {
    const onResize = () => {
      windows.forEach((item) => {
        if (!item.maximized) onChange(item.id, { bounds: clampBounds(item.bounds) });
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [windows, onChange]);

  return (
    <>
      {ordered.map((item) => (
        <QuickNoteFloatingWindow
          key={item.id}
          state={item}
          onChange={(patch) => onChange(item.id, patch)}
          onClose={() => onClose(item.id)}
          onFocus={() => onFocus(item.id)}
        />
      ))}
      <QuickNoteBubbleStack
        windows={minimized}
        onRestore={(id) => {
          onChange(id, { minimized: false });
          onFocus(id);
        }}
        onClose={onClose}
      />
    </>
  );
}

function QuickNoteFloatingWindow({
  state,
  onChange,
  onClose,
  onFocus,
}: {
  state: QuickNoteWindowState;
  onChange: (patch: Partial<QuickNoteWindowState>) => void;
  onClose: () => void;
  onFocus: () => void;
}) {
  const { data: note, isLoading, isError } = useQuickNote(state.id);
  const isDark = useThemeStore((store) => store.isDark());
  const color = note ? colorForNote(note.id, note.color) : null;
  const bg = color ? (isDark ? color.bgDark : color.bgLight) : undefined;
  const fg = color ? (isDark ? color.textDark : color.textLight) : undefined;
  const panelRef = useRef<HTMLDivElement>(null);
  const latestBoundsRef = useRef(state.bounds);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    latestBoundsRef.current = state.bounds;
  }, [state.bounds]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useDialog({
    open: !state.minimized,
    onClose,
    containerRef: panelRef,
    trapFocus: false,
    focusOnOpen: false,
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        `${STORAGE_PREFIX}${state.id}`,
        JSON.stringify({ bounds: state.bounds, pinned: state.pinned })
      );
    } catch {
      // Trinh duyet chan storage thi cua so van hoat dong binh thuong trong phien.
    }
  }, [state.id, state.bounds, state.pinned]);

  useEffect(() => {
    const node = panelRef.current;
    if (!node || state.maximized || state.minimized) return;
    let commitTimer: number | undefined;
    let pendingBounds: QuickNoteWindowBounds | null = null;
    const observer = new ResizeObserver(() => {
      /* getBoundingClientRect do border-box. `contentRect` nho hon 2px vi vien,
         ghi no vao CSS width/height se tao vong lap co dan den kich thuoc toi thieu. */
      const rect = node.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      const current = latestBoundsRef.current;
      if (Math.abs(width - current.width) < 2 && Math.abs(height - current.height) < 2) return;

      pendingBounds = clampBounds({ ...current, width, height });
      window.clearTimeout(commitTimer);
      commitTimer = window.setTimeout(() => {
        if (!pendingBounds) return;
        latestBoundsRef.current = pendingBounds;
        onChangeRef.current({ bounds: pendingBounds });
        pendingBounds = null;
      }, RESIZE_COMMIT_DELAY_MS);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      window.clearTimeout(commitTimer);
    };
  }, [state.maximized, state.minimized]);

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || state.maximized) return;
    if ((event.target as HTMLElement).closest('button')) return;
    event.preventDefault();
    onFocus();
    const node = panelRef.current;
    if (!node) return;
    const start = { clientX: event.clientX, clientY: event.clientY, ...state.bounds };
    let nextBounds = state.bounds;
    let animationFrame: number | null = null;

    node.style.willChange = 'transform';

    const renderPosition = () => {
      node.style.transform = `translate3d(${nextBounds.x - start.x}px, ${
        nextBounds.y - start.y
      }px, 0)`;
      animationFrame = null;
    };

    const move = (moveEvent: PointerEvent) => {
      nextBounds = clampBounds({
        ...state.bounds,
        x: start.x + moveEvent.clientX - start.clientX,
        y: start.y + moveEvent.clientY - start.clientY,
      });
      if (animationFrame === null) animationFrame = requestAnimationFrame(renderPosition);
    };
    const stop = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', stop);
      document.removeEventListener('pointercancel', stop);
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      node.style.transform = '';
      node.style.willChange = '';
      latestBoundsRef.current = nextBounds;
      if (nextBounds.x !== start.x || nextBounds.y !== start.y) onChange({ bounds: nextBounds });
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', stop, { once: true });
    document.addEventListener('pointercancel', stop, { once: true });
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={note?.title || 'Ghi chú không tiêu đề'}
      onMouseDown={onFocus}
      className={`fixed flex min-h-[260px] min-w-[280px] flex-col overflow-hidden rounded-xl border border-black/10 shadow-2xl ${
        state.maximized ? '' : '[resize:both]'
      }`}
      style={{
        display: state.minimized ? 'none' : 'flex',
        zIndex: state.pinned
          ? 'var(--z-index-quick-note-window-pinned)'
          : 'var(--z-index-quick-note-window)',
        left: state.maximized ? EDGE : state.bounds.x,
        top: state.maximized ? EDGE : state.bounds.y,
        right: state.maximized ? EDGE : undefined,
        bottom: state.maximized ? EDGE : undefined,
        width: state.maximized ? 'auto' : state.bounds.width,
        height: state.maximized ? 'auto' : state.bounds.height,
        maxWidth: `calc(100vw - ${EDGE * 2}px)`,
        maxHeight: `calc(100vh - ${EDGE * 2}px)`,
        backgroundColor: bg,
        color: fg,
      }}
    >
      <div
        onPointerDown={startDrag}
        className={`flex h-10 shrink-0 touch-none select-none items-center gap-2 border-b border-current/15 px-2 ${
          state.maximized ? 'cursor-default' : 'cursor-move'
        }`}
        style={{ backgroundColor: bg, color: fg }}
      >
        <StickyNote size={15} className="shrink-0 opacity-70" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
          {note?.title || 'Ghi chú không tiêu đề'}
        </span>
        <WindowButton
          label={state.pinned ? 'Bỏ ghim cửa sổ' : 'Ghim cửa sổ trên cùng'}
          onClick={() => onChange({ pinned: !state.pinned })}
        >
          {state.pinned ? <PinOff size={15} /> : <Pin size={15} />}
        </WindowButton>
        <WindowButton label="Thu nhỏ thành bong bóng" onClick={() => onChange({ minimized: true })}>
          <Minus size={16} />
        </WindowButton>
        <WindowButton
          label={state.maximized ? 'Khôi phục kích thước' : 'Phóng to cửa sổ'}
          onClick={() => onChange({ maximized: !state.maximized })}
        >
          <Maximize2 size={14} />
        </WindowButton>
        <WindowButton label="Đóng cửa sổ ghi chú" onClick={onClose}>
          <X size={16} />
        </WindowButton>
      </div>

      <div className="min-h-0 flex-1">
        {isLoading ? (
          <div className="h-full space-y-3 bg-tr-panel p-5">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : isError || !note ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-tr-panel p-6 text-center text-sm text-tr-muted">
            Không thể tải ghi chú này.
            <button type="button" onClick={onClose} className={`text-tr-primary ${focusRing}`}>
              Đóng cửa sổ
            </button>
          </div>
        ) : (
          <QuickNoteEditorSurface note={note} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function WindowButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition hover:bg-black/10 ${focusRing}`}
    >
      {children}
    </button>
  );
}

function QuickNoteBubbleStack({
  windows,
  onRestore,
  onClose,
}: {
  windows: QuickNoteWindowState[];
  onRestore: (id: number) => void;
  onClose: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const trayRef = useRef<HTMLDivElement>(null);
  if (windows.length === 0) return null;

  return (
    <div
      ref={trayRef}
      role="region"
      aria-label={`${windows.length} ghi chú đang thu nhỏ`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocusCapture={() => setExpanded(true)}
      onBlurCapture={(event) => {
        if (!trayRef.current?.contains(event.relatedTarget as Node | null)) setExpanded(false);
      }}
      className="fixed right-5 bottom-24 z-[var(--z-index-quick-note-bubbles)] w-14"
      style={{ height: 56 + Math.max(0, windows.length - 1) * (expanded ? 58 : 13) }}
    >
      {windows.map((item, index) => (
        <QuickNoteBubble
          key={item.id}
          id={item.id}
          index={index}
          expanded={expanded}
          total={windows.length}
          onRestore={() => onRestore(item.id)}
          onClose={() => onClose(item.id)}
        />
      ))}
    </div>
  );
}

function QuickNoteBubble({
  id,
  index,
  expanded,
  total,
  onRestore,
  onClose,
}: {
  id: number;
  index: number;
  expanded: boolean;
  total: number;
  onRestore: () => void;
  onClose: () => void;
}) {
  const { data: note } = useQuickNote(id);
  const isDark = useThemeStore((store) => store.isDark());
  const color = note ? colorForNote(note.id, note.color) : null;
  const bg = color ? (isDark ? color.bgDark : color.bgLight) : 'var(--tr-panel)';
  const fg = color ? (isDark ? color.textDark : color.textLight) : 'var(--tr-text)';
  const title = note?.title || 'Ghi chú không tiêu đề';

  return (
    <div
      className="absolute right-0 bottom-0 transition-transform duration-200"
      style={{
        transform: `translateY(-${index * (expanded ? 58 : 13)}px)`,
        zIndex: total - index,
      }}
    >
      <button
        type="button"
        onClick={onRestore}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
        aria-label={`Khôi phục ${title}`}
        title={`${title} · Nhấp phải để đóng`}
        className={`flex h-14 w-14 items-center justify-center rounded-full border border-black/10 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl ${focusRing}`}
        style={{ backgroundColor: bg, color: fg }}
      >
        <StickyNote size={22} aria-hidden="true" />
      </button>
    </div>
  );
}
