import { memo, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  CalendarClock,
  ChevronsLeftRight,
  Clock3,
  Copy,
  MoreHorizontal,
  GripVertical,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { CardItem } from './CardItem';
import { Popover, PopoverItem, usePopover } from '../common/Popover';
import { Button, focusRing } from '../common/ui';
import { t } from '../../i18n/vi';
import type { Card, Label, List } from '../../types';

export type SortBy = 'created_desc' | 'created_asc' | 'due' | 'title' | 'priority';

interface Props {
  list: List;
  cards: Card[];
  hiddenCount: number;
  labels: Label[];
  onCardClick: (id: number) => void;
  onAddCard: (listId: number, title: string) => void;
  onRenameList: (listId: number, name: string) => void;
  onDeleteList: (listId: number) => void;
  onCopyList: (listId: number) => void;
  onSortList: (listId: number, by: SortBy) => void;
  onCollapseList: (listId: number, collapsed: boolean) => void;
}

export const ListColumn = memo(function ListColumn({
  list,
  cards,
  hiddenCount,
  labels,
  onCardClick,
  onAddCard,
  onRenameList,
  onDeleteList,
  onCopyList,
  onSortList,
  onCollapseList,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(list.name);
  const menu = usePopover();
  const [sortMenu, setSortMenu] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `list-${list.id}`,
    data: { type: 'list', listId: list.id },
  });

  /* Vung tha rieng cho than cot: cot rong van nhan duoc the, va co the
     to sang vien khi the dang o tren de nguoi dung biet se tha vao dau. */
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `list-drop-${list.id}`,
    data: { type: 'list', listId: list.id },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    touchAction: 'none' as const,
  };

  const submitCard = () => {
    const title = draft.trim();
    if (!title) return;
    onAddCard(list.id, title);
    setDraft('');
    // Trello giu composer mo de go tiep the ke tiep
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  if (list.is_collapsed) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex h-full max-h-full w-11 shrink-0 flex-col items-center gap-3 rounded-modal bg-tr-list py-2"
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          className={`flex h-11 w-11 cursor-grab items-center justify-center rounded-control text-tr-muted active:cursor-grabbing sm:h-8 ${focusRing}`}
          aria-label={`Di chuyển danh sách ${list.name}`}
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onCollapseList(list.id, false)}
          className="rounded-control p-1.5 text-tr-subtle transition hover:bg-tr-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-primary"
          aria-label={`Mở rộng danh sách ${list.name}`}
        >
          <ChevronsLeftRight size={16} aria-hidden="true" />
        </button>
        <span className="rounded bg-tr-hover px-1.5 text-xs text-tr-subtle">{cards.length}</span>
        <span
          className="text-sm font-semibold whitespace-nowrap text-tr-text"
          style={{ writingMode: 'vertical-rl' }}
        >
          {list.name}
        </span>
      </div>
    );
  }

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        role="group"
        aria-label={`Danh sách ${list.name}`}
        className={`flex max-h-full w-[272px] shrink-0 flex-col rounded-modal bg-tr-list transition-[box-shadow] ${
          isOver ? 'ring-2 ring-tr-primary' : ''
        }`}
      >
        <header className="flex items-start gap-1 px-2 pt-2.5 pb-1.5">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className={`flex h-11 w-11 shrink-0 cursor-grab items-center justify-center rounded-control text-tr-muted active:cursor-grabbing sm:h-8 sm:w-7 ${focusRing}`}
            aria-label={`Di chuyển danh sách ${list.name}`}
          >
            <GripVertical size={15} aria-hidden="true" />
          </button>
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => {
                setEditingName(false);
                if (nameDraft.trim() && nameDraft !== list.name)
                  onRenameList(list.id, nameDraft.trim());
                else setNameDraft(list.name);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') {
                  setNameDraft(list.name);
                  setEditingName(false);
                }
              }}
              aria-label="Tên danh sách"
              className="w-full rounded-control border-2 border-tr-primary bg-tr-panel px-2 py-1 text-sm font-semibold text-tr-text outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              aria-label={`Đổi tên danh sách ${list.name}`}
              className="flex-1 truncate rounded-control px-2 py-1 text-left text-sm font-semibold text-tr-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-tr-primary"
            >
              {list.name}
              <span className="ml-1.5 text-xs font-normal text-tr-muted">
                {hiddenCount > 0 ? `${cards.length}/${cards.length + hiddenCount}` : cards.length}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={menu.toggle}
            className="rounded-control p-1.5 text-tr-subtle transition hover:bg-tr-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-primary"
            aria-label={`Thao tác với danh sách ${list.name}`}
            aria-haspopup="dialog"
            aria-expanded={menu.open}
          >
            <MoreHorizontal size={16} aria-hidden="true" />
          </button>
        </header>

        <div
          ref={setDropRef}
          className="tr-scroll min-h-[2.5rem] flex-1 space-y-2 overflow-y-auto px-2 pb-1"
        >
          <SortableContext
            items={cards.map((c) => `card-${c.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {cards.map((card) => (
              <CardItem
                key={card.id}
                card={card}
                labels={labels}
                onClick={() => onCardClick(card.id)}
              />
            ))}
          </SortableContext>

          {adding && (
            <div>
              <textarea
                ref={composerRef}
                autoFocus
                rows={3}
                value={draft}
                placeholder="Nhập tiêu đề cho thẻ này…"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submitCard();
                  }
                  if (e.key === 'Escape') {
                    setDraft('');
                    setAdding(false);
                  }
                }}
                aria-label={t.board.addCard}
                className="tr-card-shadow w-full resize-none rounded-panel border-2 border-tr-primary bg-tr-card px-3 py-2 text-sm text-tr-text outline-none"
              />
              <div className="mt-1 flex items-center gap-1">
                <Button variant="primary" onClick={submitCard}>
                  {t.board.addCard}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft('');
                    setAdding(false);
                  }}
                  aria-label={t.common.cancel}
                  className={`rounded-control p-1.5 text-tr-subtle transition hover:bg-tr-hover ${focusRing}`}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </div>

        {!adding && (
          <footer className="p-2">
            <button
              type="button"
              onClick={() => setAdding(true)}
              className={`flex min-h-[44px] w-full items-center gap-1.5 rounded-panel px-2 text-sm text-tr-text transition hover:bg-tr-hover sm:min-h-0 sm:py-1.5 ${focusRing}`}
            >
              <Plus size={16} aria-hidden="true" /> {t.board.addCard}
            </button>
          </footer>
        )}
      </div>

      <Popover
        open={menu.open && !sortMenu}
        anchor={menu.anchor}
        onClose={menu.close}
        title="Thao tác với danh sách"
      >
        <PopoverItem
          icon={<Plus size={15} />}
          onClick={() => {
            menu.close();
            setAdding(true);
          }}
        >
          {t.board.addCard}
        </PopoverItem>
        <PopoverItem icon={<Copy size={15} />} onClick={() => (menu.close(), onCopyList(list.id))}>
          Sao chép danh sách
        </PopoverItem>
        <PopoverItem icon={<ArrowDownWideNarrow size={15} />} onClick={() => setSortMenu(true)}>
          Sắp xếp thẻ…
        </PopoverItem>
        <PopoverItem
          icon={<ChevronsLeftRight size={15} />}
          onClick={() => (menu.close(), onCollapseList(list.id, true))}
        >
          Thu gọn danh sách
        </PopoverItem>
        <div className="my-2 border-t border-tr-border" />
        <PopoverItem
          icon={<Trash2 size={15} />}
          danger
          onClick={() => (menu.close(), onDeleteList(list.id))}
        >
          Xóa danh sách
        </PopoverItem>
      </Popover>

      <Popover
        open={menu.open && sortMenu}
        anchor={menu.anchor}
        onClose={() => (setSortMenu(false), menu.close())}
        onBack={() => setSortMenu(false)}
        title="Sắp xếp thẻ"
      >
        {(
          [
            ['created_desc', 'Ngày tạo (mới nhất trước)', <Clock3 size={15} key="a" />],
            ['created_asc', 'Ngày tạo (cũ nhất trước)', <Clock3 size={15} key="b" />],
            ['due', 'Hạn hoàn thành', <CalendarClock size={15} key="c" />],
            ['title', 'Tên thẻ (A → Z)', <ArrowDownAZ size={15} key="d" />],
            ['priority', 'Mức độ ưu tiên', <ArrowDownWideNarrow size={15} key="e" />],
          ] as [SortBy, string, React.ReactNode][]
        ).map(([by, label, icon]) => (
          <PopoverItem
            key={by}
            icon={icon}
            onClick={() => {
              onSortList(list.id, by);
              setSortMenu(false);
              menu.close();
            }}
          >
            {label}
          </PopoverItem>
        ))}
      </Popover>
    </>
  );
});
