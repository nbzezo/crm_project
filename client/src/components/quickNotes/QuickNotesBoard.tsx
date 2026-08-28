import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Filter, LayoutGrid, List, Pin, Plus, Search, StickyNote, X } from 'lucide-react';
import { Segmented, Skeleton, EmptyState, focusRing } from '../common/ui';
import { Popover, usePopover } from '../common/Popover';
import { useDialog } from '../common/useDialog';
import { useUiStore } from '../../stores/uiStore';
import { QuickNoteCard, QuickNoteEditorModal } from './QuickNoteCard';
import {
  useQuickNoteMutations,
  useQuickNotesList,
  useQuickNoteTags,
  type QuickNoteFilters,
} from './useQuickNotes';
import { buildDndAnnouncements } from '../../lib/dnd/announcements';
import type { QuickNote } from '../../types';

type Layout = 'grid' | 'list';

type ViewFilter = 'active' | 'archived' | 'trash';
type Toggle = 'pinned' | 'has_reminder' | 'has_attachment' | 'checklist' | 'linked';

const TOGGLES: { key: Toggle; label: string }[] = [
  { key: 'pinned', label: 'Đã ghim' },
  { key: 'has_reminder', label: 'Có nhắc' },
  { key: 'has_attachment', label: 'Có tệp' },
  { key: 'checklist', label: 'Có checklist' },
  { key: 'linked', label: 'Đã gắn CRM' },
];

/** Boc QuickNoteCard de keo-tha duoc — the trong luoi gio luon o dang xem truoc. */
function SortableQuickNoteCard({
  note,
  layout,
  onActivate,
}: {
  note: QuickNote;
  layout: Layout;
  onActivate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: note.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={isDragging ? 'opacity-40' : ''}
    >
      <QuickNoteCard note={note} layout={layout} onActivate={onActivate} />
    </div>
  );
}

/** FR12: cac bo loc phu — View (Active/Archived/Trash) va Tim kiem da nam thang o thanh tren. */
function FilterPopover({
  toggles,
  onChange,
  activeTag,
  onTagChange,
}: {
  toggles: Record<Toggle, boolean>;
  onChange: (next: Record<Toggle, boolean>) => void;
  activeTag: string | null;
  onTagChange: (tag: string | null) => void;
}) {
  const popover = usePopover();
  const { data: tags = [] } = useQuickNoteTags();
  const activeCount = Object.values(toggles).filter(Boolean).length + (activeTag ? 1 : 0);

  return (
    <>
      <button
        type="button"
        onClick={popover.toggle}
        aria-label="Lọc ghi chú nhanh"
        className={`relative flex h-9 items-center gap-1.5 rounded-full border border-tr-border px-3 text-sm transition hover:bg-tr-hover ${
          activeCount > 0 ? 'border-tr-primary text-tr-primary' : 'text-tr-subtle'
        } ${focusRing}`}
      >
        <Filter size={14} aria-hidden="true" />
        Lọc
        {activeCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-tr-primary px-1 text-xs font-semibold text-tr-on-primary">
            {activeCount}
          </span>
        )}
      </button>
      <Popover
        open={popover.open}
        onClose={popover.close}
        anchor={popover.anchor}
        title="Lọc ghi chú nhanh"
        width={240}
      >
        <div className="space-y-1">
          {TOGGLES.map((toggle) => (
            <label
              key={toggle.key}
              className="flex items-center gap-2 rounded-control px-1 py-1.5 text-sm text-tr-text hover:bg-tr-hover"
            >
              <input
                type="checkbox"
                checked={toggles[toggle.key]}
                onChange={(e) => onChange({ ...toggles, [toggle.key]: e.target.checked })}
                className="h-4 w-4"
              />
              {toggle.label}
            </label>
          ))}
        </div>

        {tags.length > 0 && (
          <div className="mt-2 border-t border-tr-border pt-2">
            <div className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-tr-muted uppercase">
              Tag
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={activeTag === tag}
                  onClick={() => onTagChange(activeTag === tag ? null : tag)}
                  className={`rounded-full px-2.5 py-1 text-xs transition ${
                    activeTag === tag
                      ? 'bg-tr-primary text-tr-on-primary'
                      : 'bg-tr-hover text-tr-text hover:bg-tr-hover-strong'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </Popover>
    </>
  );
}

/**
 * Bang Ghi chu nhanh — mo nhu Sticky Notes cua Microsoft: mot cua so noi len
 * TREN man hinh hien tai, khong dieu huong sang trang khac. Mount mot lan o
 * App.tsx (cung mau CardModal/TaskFormDialog), dieu khien qua uiStore.
 */
export function QuickNotesBoard() {
  const open = useUiStore((s) => s.quickNotesBoardOpen);
  const focusId = useUiStore((s) => s.quickNotesFocusId);
  const autoCreate = useUiStore((s) => s.quickNotesAutoCreate);
  const requestId = useUiStore((s) => s.quickNotesRequestId);
  const closeBoard = useUiStore((s) => s.closeQuickNotesBoard);
  const clearIntent = useUiStore((s) => s.clearQuickNotesIntent);
  const queryClient = useQueryClient();

  const [activeId, setActiveId] = useState<number | null>(null);
  const [view, setView] = useState<ViewFilter>('active');
  const [layout, setLayout] = useState<Layout>('grid');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [toggles, setToggles] = useState<Record<Toggle, boolean>>({
    pinned: false,
    has_reminder: false,
    has_attachment: false,
    checklist: false,
    linked: false,
  });
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Cung 250ms voi SearchBox.tsx — o nhap phan hoi ngay, truy van thi cho go xong.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(id);
  }, [q]);

  const { create, move } = useQuickNoteMutations();
  const filters: QuickNoteFilters = {
    view,
    q: debouncedQ.trim() || undefined,
    ...toggles,
    tag: activeTag ?? undefined,
  };
  const queryKey = ['quick-notes', 'list', filters] as const;
  const { data: notes, isLoading } = useQuickNotesList(filters);
  const activeNote = notes?.find((n) => n.id === activeId) ?? null;
  const pinnedNotes = notes?.filter((n) => n.is_pinned) ?? [];
  const otherNotes = notes?.filter((n) => !n.is_pinned) ?? [];
  const sortStrategy = layout === 'list' ? verticalListSortingStrategy : rectSortingStrategy;
  const groupClass =
    layout === 'list'
      ? 'flex flex-col gap-2'
      : 'grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] items-start gap-3';

  const renderGroup = (items: QuickNote[]) => (
    <SortableContext items={items.map((n) => n.id)} strategy={sortStrategy}>
      <div className={groupClass}>
        {items.map((note) => (
          <SortableQuickNoteCard
            key={note.id}
            note={note}
            layout={layout}
            onActivate={() => setActiveId(note.id)}
          />
        ))}
      </div>
    </SortableContext>
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  /* Ghi chu khong dat tieu de thi doc theo vi tri, vi "ghi chu khong ten" lap
     lai nhieu lan trong mot cau thong bao thi khong phan biet duoc. */
  const announcements = useMemo(
    () =>
      buildDndAnnouncements({
        itemNoun: 'ghi chú',
        resolve: (id) => {
          const index = notes?.findIndex((n) => String(n.id) === id) ?? -1;
          if (index < 0) return null;
          const title = notes?.[index]?.title?.trim();
          return title ? `ghi chú ${title}` : `ghi chú thứ ${index + 1}`;
        },
      }),
    [notes]
  );

  useDialog({ open, onClose: closeBoard, containerRef: panelRef });

  /**
   * Tieu thu "y dinh" mo bang (tao san mot ghi chu rong, hoac mo san mot ghi
   * chu cu the) MOT LAN moi yeu cau — phu thuoc `requestId` (tang moi lan
   * `openQuickNotesBoard` duoc goi), KHONG phai `open`: Bang co the DA dang mo
   * luc mot y dinh moi toi (vd. bam ket qua Quick Note khac tu SearchBox trong
   * luc Bang van mo), luc do `open` khong doi tu false->true nen se bo lo neu
   * dung no lam dependency.
   */
  useEffect(() => {
    if (!open) return;
    if (autoCreate) {
      setView('active');
      create.mutate({}, { onSuccess: (note) => setActiveId(note.id) });
    } else {
      setActiveId(focusId);
      if (focusId) setView('active');
    }
    clearIntent();
  }, [requestId]);

  /**
   * Keo tha sap xep tay (v33) — chi cho phep trong CUNG nhom da ghim/chua
   * ghim (server tu choi khac nhom, xem moveQuickNote). Cap nhat lac quan
   * ngay khi tha de cam giac muot nhu keo the Kanban, `move` mutation se lam
   * moi lai danh sach that su sau do.
   */
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !notes || active.id === over.id) return;

    const fromIndex = notes.findIndex((n) => n.id === active.id);
    const toIndex = notes.findIndex((n) => n.id === over.id);
    if (fromIndex < 0 || toIndex < 0) return;
    if (notes[fromIndex].is_pinned !== notes[toIndex].is_pinned) return;

    const reordered = arrayMove(notes, fromIndex, toIndex);
    queryClient.setQueryData(queryKey, reordered);

    const idx = reordered.findIndex((n) => n.id === active.id);
    move.mutate({
      id: active.id as number,
      beforeId:
        idx > 0 && reordered[idx - 1].is_pinned === reordered[idx].is_pinned
          ? reordered[idx - 1].id
          : null,
      afterId:
        idx < reordered.length - 1 && reordered[idx + 1].is_pinned === reordered[idx].is_pinned
          ? reordered[idx + 1].id
          : null,
    });
  }

  if (!open) return null;

  return createPortal(
    <div
      className="tr-anim-fade fixed inset-0 z-modal flex items-start justify-center bg-tr-overlay p-3 sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeBoard();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Ghi chú nhanh"
        className="tr-anim-pop flex h-[min(92vh,880px)] w-[min(96vw,1280px)] flex-col overflow-hidden rounded-modal bg-tr-panel shadow-2xl"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-tr-border px-4 py-3">
          <StickyNote size={18} className="shrink-0 text-tr-primary" aria-hidden="true" />
          <h2 className="mr-2 text-base font-semibold text-tr-text">Ghi chú nhanh</h2>

          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className="relative w-full max-w-56">
              <Search
                size={14}
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-tr-muted"
                aria-hidden="true"
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm ghi chú nhanh…"
                aria-label="Tìm ghi chú nhanh"
                className={`w-full rounded-full border border-tr-border bg-tr-list py-1.5 pr-3 pl-8 text-sm text-tr-text outline-none placeholder:text-tr-muted focus:border-tr-primary ${focusRing}`}
              />
            </div>
            <Segmented
              value={view}
              onChange={setView}
              label="Chế độ xem"
              options={[
                { value: 'active', label: 'Tất cả' },
                { value: 'archived', label: 'Lưu trữ' },
                { value: 'trash', label: 'Thùng rác' },
              ]}
            />
            {view === 'active' && (
              <FilterPopover
                toggles={toggles}
                onChange={setToggles}
                activeTag={activeTag}
                onTagChange={setActiveTag}
              />
            )}
          </div>

          <div className="flex shrink-0 items-center rounded-full border border-tr-border p-0.5">
            <button
              type="button"
              onClick={() => setLayout('grid')}
              aria-label="Xem dạng lưới"
              aria-pressed={layout === 'grid'}
              className={`rounded-full p-1.5 transition ${
                layout === 'grid'
                  ? 'bg-tr-primary text-tr-on-primary'
                  : 'text-tr-subtle hover:bg-tr-hover'
              }`}
            >
              <LayoutGrid size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setLayout('list')}
              aria-label="Xem dạng danh sách"
              aria-pressed={layout === 'list'}
              className={`rounded-full p-1.5 transition ${
                layout === 'list'
                  ? 'bg-tr-primary text-tr-on-primary'
                  : 'text-tr-subtle hover:bg-tr-hover'
              }`}
            >
              <List size={14} aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => create.mutate({}, { onSuccess: (note) => setActiveId(note.id) })}
            disabled={create.isPending}
            aria-label="Ghi chú mới"
            title="Ghi chú mới"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tr-primary text-tr-on-primary transition hover:bg-tr-primary-hover disabled:opacity-60 ${focusRing}`}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={closeBoard}
            aria-label="Đóng"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-tr-muted transition hover:bg-tr-hover hover:text-tr-text ${focusRing}`}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="tr-scroll flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] items-start gap-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-32 rounded-lg" />
              ))}
            </div>
          ) : !notes || notes.length === 0 ? (
            <EmptyState
              message="Chưa có ghi chú nhanh nào."
              hint="Ghi lại ý tưởng, thông tin hoặc việc cần nhớ."
            />
          ) : (
            <DndContext
              sensors={sensors}
              accessibility={{ announcements }}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              {pinnedNotes.length > 0 && (
                <>
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-tr-muted uppercase">
                    <Pin size={12} aria-hidden="true" /> Đã ghim
                  </div>
                  {renderGroup(pinnedNotes)}
                </>
              )}
              {otherNotes.length > 0 && (
                <>
                  {pinnedNotes.length > 0 && (
                    <div className="mt-4 mb-2 text-xs font-semibold tracking-wide text-tr-muted uppercase">
                      Ghi chú khác
                    </div>
                  )}
                  {renderGroup(otherNotes)}
                </>
              )}
            </DndContext>
          )}
        </div>
      </div>

      {activeNote && <QuickNoteEditorModal note={activeNote} onClose={() => setActiveId(null)} />}
    </div>,
    document.body
  );
}
