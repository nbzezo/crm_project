import { useCallback, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { ListColumn, type SortBy } from './ListColumn';
import { CardBody } from './CardItem';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Button, focusRing } from '../common/ui';
import { api } from '../../api/client';
import { t } from '../../i18n/vi';
import { addDays, todayStr } from '../../lib/format';
import { useUiStore, type BoardFilters } from '../../stores/uiStore';
import { invalidateCardViews } from '../../lib/queryKeys';
import { foldText } from '../../lib/format';
import { undoableDelete } from '../../lib/undo';
import { cloneBoard, locateCard } from '../../lib/dnd/board';
import type { BoardFull, Card } from '../../types';

/** Ap dung bo loc cua thanh "Bộ lọc" len mot the. */
export function matchesFilters(card: Card, f: BoardFilters): boolean {
  if (f.q && !foldText(`${card.title} ${card.description ?? ''}`).includes(foldText(f.q)))
    return false;
  // FR-TAG-22: 'and' = phai co du moi nhan da chon; 'or' (mac dinh) = co it nhat mot
  if (f.labelIds.length > 0) {
    const ids = card.label_ids ?? [];
    const matched =
      f.labelMode === 'and'
        ? f.labelIds.every((id) => ids.includes(id))
        : f.labelIds.some((id) => ids.includes(id));
    if (!matched) return false;
  }
  if (f.priorities.length > 0 && !f.priorities.includes(card.priority)) return false;
  if (f.status === 'open' && card.is_done) return false;
  if (f.status === 'done' && !card.is_done) return false;
  if (f.customerId !== '' && card.customer_id !== f.customerId) return false;

  if (f.due) {
    const today = todayStr();
    if (f.due === 'none' && card.due_date) return false;
    if (f.due === 'overdue' && !(card.due_date && card.due_date < today && !card.is_done))
      return false;
    if (f.due === 'today' && card.due_date !== today) return false;
    if (f.due === 'week') {
      const limit = addDays(today, 7);
      if (!card.due_date || card.due_date > limit) return false;
    }
  }
  return true;
}

export function BoardView({ board }: { board: BoardFull }) {
  const queryClient = useQueryClient();
  const openCard = useUiStore((s) => s.openCard);
  const filters = useUiStore((s) => s.boardFilters);
  const pushToast = useUiStore((s) => s.pushToast);
  const boardKey = useMemo(() => ['board', board.id], [board.id]);

  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [activeListName, setActiveListName] = useState<string | null>(null);
  const dragSnapshot = useRef<BoardFull | null>(null);
  const [addingList, setAddingList] = useState(false);
  const [listDraft, setListDraft] = useState('');
  const [deleteListId, setDeleteListId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Cham giu 200ms moi bat dau keo — duoi nguong do van la thao tac cuon.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const setBoard = useCallback(
    (next: BoardFull) => queryClient.setQueryData(boardKey, next),
    [queryClient, boardKey]
  );
  const refetchBoard = useCallback(
    () => queryClient.invalidateQueries({ queryKey: boardKey }),
    [queryClient, boardKey]
  );
  const restoreDragSnapshot = useCallback(() => {
    if (dragSnapshot.current) setBoard(dragSnapshot.current);
    dragSnapshot.current = null;
  }, [setBoard]);

  /**
   * Keo tha that bai truoc day chi lang le refetch: the nhay ve cho cu ma khong
   * mot loi nao. onError o cap mutation ghi de onError mac dinh trong main.tsx,
   * nen phai tu bao loi o day.
   */
  const revertWithToast = useCallback(
    (error: unknown) => {
      pushToast(error instanceof Error ? error.message : t.common.saveError);
      restoreDragSnapshot();
      refetchBoard();
    },
    [pushToast, refetchBoard, restoreDragSnapshot]
  );

  const moveCard = useMutation({
    mutationFn: (vars: {
      cardId: number;
      listId: number;
      beforeId: number | null;
      afterId: number | null;
    }) =>
      api.patch(`/api/cards/${vars.cardId}/move`, {
        list_id: vars.listId,
        beforeId: vars.beforeId,
        afterId: vars.afterId,
      }),
    onError: revertWithToast,
    onSuccess: () => {
      dragSnapshot.current = null;
      invalidateCardViews(queryClient);
    },
  });

  const moveList = useMutation({
    mutationFn: (vars: { listId: number; beforeId: number | null; afterId: number | null }) =>
      api.patch(`/api/lists/${vars.listId}/move`, {
        beforeId: vars.beforeId,
        afterId: vars.afterId,
      }),
    onError: revertWithToast,
    onSuccess: () => {
      dragSnapshot.current = null;
    },
  });

  const addCard = useMutation({
    mutationFn: (vars: { listId: number; title: string }) =>
      api.post('/api/cards', { list_id: vars.listId, title: vars.title }),
    onSuccess: () => {
      refetchBoard();
      invalidateCardViews(queryClient, board.id);
    },
  });

  const addList = useMutation({
    mutationFn: (name: string) => api.post('/api/lists', { board_id: board.id, name }),
    onSuccess: refetchBoard,
  });

  const patchList = useMutation({
    mutationFn: (vars: { listId: number; patch: Record<string, unknown> }) =>
      api.patch(`/api/lists/${vars.listId}`, vars.patch),
    onSuccess: refetchBoard,
  });

  const copyList = useMutation({
    mutationFn: (listId: number) => api.post(`/api/lists/${listId}/copy`),
    onSuccess: () => {
      refetchBoard();
      invalidateCardViews(queryClient, board.id);
    },
  });

  const sortList = useMutation({
    mutationFn: (vars: { listId: number; by: SortBy }) =>
      api.patch(`/api/lists/${vars.listId}/sort`, { by: vars.by }),
    onSuccess: refetchBoard,
  });

  const deleteList = useMutation({
    mutationFn: (listId: number) => api.del(`/api/lists/${listId}`),
    onSuccess: () => {
      refetchBoard();
      invalidateCardViews(queryClient, board.id);
    },
  });

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    dragSnapshot.current = cloneBoard(board);
    if (data?.type === 'card') {
      const found = locateCard(board, data.cardId as number);
      if (found) setActiveCard(board.lists[found.listIdx].cards[found.cardIdx]);
    } else if (data?.type === 'list') {
      setActiveListName(board.lists.find((l) => l.id === data.listId)?.name ?? null);
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.data.current?.type !== 'card') return;

    const cardId = active.data.current.cardId as number;
    const overData = over.data.current;
    const targetListId =
      overData?.type === 'card' || overData?.type === 'list' ? (overData.listId as number) : null;
    if (targetListId == null) return;

    const next = cloneBoard(board);
    const from = locateCard(next, cardId);
    if (!from) return;
    if (next.lists[from.listIdx].id === targetListId) return;

    const toIdx = next.lists.findIndex((l) => l.id === targetListId);
    if (toIdx < 0) return;

    const [moved] = next.lists[from.listIdx].cards.splice(from.cardIdx, 1);
    moved.list_id = targetListId;
    const overCardIdx =
      overData?.type === 'card'
        ? next.lists[toIdx].cards.findIndex((c) => c.id === overData.cardId)
        : -1;
    next.lists[toIdx].cards.splice(
      overCardIdx >= 0 ? overCardIdx : next.lists[toIdx].cards.length,
      0,
      moved
    );
    setBoard(next);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveCard(null);
    setActiveListName(null);
    if (!over) {
      restoreDragSnapshot();
      return;
    }

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData?.type === 'list' && overData?.type === 'list') {
      const listId = activeData.listId as number;
      const overListId = overData.listId as number;
      if (listId === overListId) {
        dragSnapshot.current = null;
        return;
      }

      const next = cloneBoard(board);
      const oldIdx = next.lists.findIndex((l) => l.id === listId);
      const newIdx = next.lists.findIndex((l) => l.id === overListId);
      next.lists = arrayMove(next.lists, oldIdx, newIdx);
      setBoard(next);

      moveList.mutate({
        listId,
        beforeId: newIdx > 0 ? next.lists[newIdx - 1].id : null,
        afterId: newIdx < next.lists.length - 1 ? next.lists[newIdx + 1].id : null,
      });
      return;
    }

    if (activeData?.type !== 'card') {
      restoreDragSnapshot();
      return;
    }
    const cardId = activeData.cardId as number;
    const targetListId =
      overData?.type === 'card' || overData?.type === 'list' ? (overData.listId as number) : null;
    if (targetListId == null) {
      restoreDragSnapshot();
      return;
    }

    const next = cloneBoard(board);
    const from = locateCard(next, cardId);
    if (!from) {
      restoreDragSnapshot();
      return;
    }
    const toIdx = next.lists.findIndex((l) => l.id === targetListId);
    if (toIdx < 0) {
      restoreDragSnapshot();
      return;
    }

    if (from.listIdx === toIdx) {
      const cards = next.lists[toIdx].cards;
      const overIdx =
        overData?.type === 'card'
          ? cards.findIndex((c) => c.id === overData.cardId)
          : cards.length - 1;
      if (overIdx >= 0 && overIdx !== from.cardIdx) {
        next.lists[toIdx].cards = arrayMove(cards, from.cardIdx, overIdx);
      }
    } else {
      const [moved] = next.lists[from.listIdx].cards.splice(from.cardIdx, 1);
      moved.list_id = targetListId;
      const overIdx =
        overData?.type === 'card'
          ? next.lists[toIdx].cards.findIndex((c) => c.id === overData.cardId)
          : -1;
      next.lists[toIdx].cards.splice(
        overIdx >= 0 ? overIdx : next.lists[toIdx].cards.length,
        0,
        moved
      );
    }
    setBoard(next);

    const finalCards = next.lists[toIdx].cards;
    const idx = finalCards.findIndex((c) => c.id === cardId);
    moveCard.mutate({
      cardId,
      listId: targetListId,
      beforeId: idx > 0 ? finalCards[idx - 1].id : null,
      afterId: idx < finalCards.length - 1 ? finalCards[idx + 1].id : null,
    });
  }

  const submitList = () => {
    const name = listDraft.trim();
    if (!name) return;
    addList.mutate(name);
    setListDraft('');
  };

  /* Ham truyen xuong ListColumn — giu tham chieu on dinh de React.memo co tac dung. */
  const handleAddCard = useCallback(
    (listId: number, title: string) => addCard.mutate({ listId, title }),
    [addCard]
  );
  const handleRenameList = useCallback(
    (listId: number, name: string) => patchList.mutate({ listId, patch: { name } }),
    [patchList]
  );
  const handleCopyList = useCallback((listId: number) => copyList.mutate(listId), [copyList]);
  const handleSortList = useCallback(
    (listId: number, by: SortBy) => sortList.mutate({ listId, by }),
    [sortList]
  );
  const handleCollapseList = useCallback(
    (listId: number, collapsed: boolean) =>
      patchList.mutate({ listId, patch: { is_collapsed: collapsed } }),
    [patchList]
  );

  /* Loc mot lan cho ca bang thay vi loc lai trong moi lan render cua tung cot. */
  const columns = useMemo(
    () =>
      board.lists.map((list) => {
        const visible = list.cards.filter((c) => matchesFilters(c, filters));
        return { list, visible, hiddenCount: list.cards.length - visible.length };
      }),
    [board.lists, filters]
  );

  const listIds = useMemo(() => board.lists.map((l) => `list-${l.id}`), [board.lists]);

  /** Thong bao bang loi cho trinh doc man hinh khi keo tha bang ban phim. */
  const announcements: Announcements = useMemo(
    () => ({
      onDragStart: ({ active }) => `Đang giữ ${String(active.id)}. Dùng phím mũi tên để di chuyển.`,
      onDragOver: ({ over }) => (over ? `Đang ở trên ${String(over.id)}.` : 'Ngoài vùng thả.'),
      onDragEnd: ({ over }) =>
        over ? `Đã thả vào ${String(over.id)}.` : 'Đã hủy, thẻ trở về vị trí cũ.',
      onDragCancel: () => 'Đã hủy kéo thả.',
    }),
    []
  );

  return (
    <>
      <DndContext
        sensors={sensors}
        accessibility={{ announcements }}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveCard(null);
          setActiveListName(null);
          restoreDragSnapshot();
        }}
      >
        <div className="tr-scroll-onboard flex h-full items-start gap-3 overflow-x-auto px-3 pt-3 pb-4">
          <SortableContext items={listIds} strategy={horizontalListSortingStrategy}>
            {columns.map(({ list, visible, hiddenCount }) => (
              <ListColumn
                key={list.id}
                list={list}
                cards={visible}
                hiddenCount={hiddenCount}
                labels={board.labels}
                onCardClick={openCard}
                onAddCard={handleAddCard}
                onRenameList={handleRenameList}
                onDeleteList={setDeleteListId}
                onCopyList={handleCopyList}
                onSortList={handleSortList}
                onCollapseList={handleCollapseList}
              />
            ))}
          </SortableContext>

          <div className="w-[272px] shrink-0">
            {addingList ? (
              <div className="rounded-modal bg-tr-list p-2">
                <input
                  autoFocus
                  value={listDraft}
                  placeholder="Nhập tiêu đề danh sách…"
                  aria-label={t.board.addList}
                  onChange={(e) => setListDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitList();
                    if (e.key === 'Escape') setAddingList(false);
                  }}
                  className="w-full rounded-control border-2 border-tr-primary bg-tr-panel px-2 py-1.5 text-sm text-tr-text outline-none"
                />
                <div className="mt-2 flex items-center gap-1">
                  <Button variant="primary" onClick={submitList} disabled={addList.isPending}>
                    {addList.isPending ? t.common.saving : t.board.addList}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setAddingList(false)}
                    aria-label={t.common.cancel}
                    className={`rounded-control p-1.5 text-tr-subtle transition hover:bg-tr-hover ${focusRing}`}
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingList(true)}
                className={`flex w-full items-center gap-1.5 rounded-modal bg-white/25 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-white/35 ${focusRing}`}
              >
                <Plus size={16} aria-hidden="true" /> {t.board.addList}
              </button>
            )}
          </div>
        </div>

        <DragOverlay>
          {activeCard && (
            <CardBody card={activeCard} labels={board.labels} onClick={() => {}} dragging />
          )}
          {activeListName && (
            <div className="w-[272px] rotate-3 rounded-modal bg-tr-list px-3 py-2 text-sm font-semibold text-tr-text shadow-lg">
              {activeListName}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <ConfirmDialog
        open={deleteListId !== null}
        message="Xóa danh sách này sẽ xóa toàn bộ thẻ bên trong. Bạn có chắc không?"
        onCancel={() => setDeleteListId(null)}
        onConfirm={() => {
          const listId = deleteListId;
          setDeleteListId(null);
          if (!listId) return;

          // An danh sach ngay, chi that su goi DELETE sau khi het gio hoan tac.
          const name = board.lists.find((l) => l.id === listId)?.name ?? '';
          const snapshot = queryClient.getQueryData<BoardFull>(boardKey);
          setBoard({ ...board, lists: board.lists.filter((l) => l.id !== listId) });

          undoableDelete({
            message: `Đã xóa danh sách “${name}”`,
            commit: () => deleteList.mutate(listId),
            revert: () => (snapshot ? setBoard(snapshot) : refetchBoard()),
          });
        }}
      />
    </>
  );
}
