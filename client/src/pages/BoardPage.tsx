import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  Building2,
  ChevronLeft,
  Filter,
  FolderKanban,
  MoreHorizontal,
  SlidersHorizontal,
  Star,
} from 'lucide-react';
import { api, qs } from '../api/client';
import { BoardView, matchesFilters } from '../components/kanban/BoardView';
import { useAssignees } from '../components/tasks/AssigneePicker';
import { BoardMenu } from '../components/kanban/BoardMenu';
import { BoardFilter } from '../components/kanban/BoardFilter';
import {
  BoardViewChip,
  BoardViewDock,
  BoardViewSegmented,
  type BoardViewMode,
} from '../components/kanban/BoardViews';
import { LazyCalendarView } from '../components/calendar/LazyCalendarView';
import { TimelineBoard } from '../components/views/TimelineBoard';
import { TaskTable } from '../components/tasks/TaskTable';
import { usePopover } from '../components/common/Popover';
import { ErrorState, Skeleton } from '../components/common/ui';
import { backgroundStyle, boardScrim } from '../lib/backgrounds';
import { t } from '../i18n/vi';
import { countActiveFilters, useUiStore } from '../stores/uiStore';
import { STAR_COLOR } from '../theme/palettes';
import { COARSE_QUERY, useMediaQuery } from '../lib/useMediaQuery';
import type { BoardFull, TaskRow } from '../types';

const VIEW_MODES: BoardViewMode[] = ['board', 'calendar', 'timeline', 'table'];

export default function BoardPage() {
  const { boardId } = useParams();
  const id = Number(boardId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [activeList, setActiveList] = useState({ index: 0, total: 0 });
  const onActiveListChange = useCallback(
    (index: number, total: number) =>
      setActiveList((prev) =>
        prev.index === index && prev.total === total ? prev : { index, total }
      ),
    []
  );
  const filterPopover = usePopover();
  const coarsePointer = useMediaQuery(COARSE_QUERY);

  const filters = useUiStore((s) => s.boardFilters);
  const resetFilters = useUiStore((s) => s.resetBoardFilters);
  const labelText = useUiStore((s) => s.labelText);
  const toggleLabelText = useUiStore((s) => s.toggleLabelText);
  const activeFilters = countActiveFilters(filters);
  const { data: assignees } = useAssignees();
  const meContactId = assignees?.find((person) => person.is_me)?.id ?? null;

  // Dang xem luu trong URL de F5 hoac chia se link van giu nguyen
  const viewParam = searchParams.get('view') as BoardViewMode | null;
  const view: BoardViewMode = viewParam && VIEW_MODES.includes(viewParam) ? viewParam : 'board';
  const setView = (mode: BoardViewMode) => {
    const next = new URLSearchParams(searchParams);
    if (mode === 'board') next.delete('view');
    else next.set('view', mode);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => () => resetFilters(), [id, resetFilters]);

  const {
    data: board,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['board', id],
    queryFn: () => api.get<BoardFull>(`/api/boards/${id}/full`),
    enabled: Number.isFinite(id),
  });
  const matchCount =
    board?.lists.reduce(
      (sum, list) =>
        sum + list.cards.filter((card) => matchesFilters(card, filters, meContactId)).length,
      0
    ) ?? 0;

  // Dang bang tinh lay du lieu phang cua rieng bang nay
  const { data: boardTasks = [] } = useQuery({
    queryKey: ['tasks', { board_id: id }],
    queryFn: () => api.get<TaskRow[]>(`/api/views/tasks${qs({ board_id: id })}`),
    enabled: Number.isFinite(id) && view === 'table',
  });

  const patchBoard = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.patch(`/api/boards/${id}`, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', id] });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
    },
  });

  /* Khung xuong dang cot thay cho mot dong chu — bang la man hinh nang du lieu
     nhat, truoc day toan trang chop trang trong luc cho. */
  if (isLoading)
    return (
      <div
        role="status"
        aria-label={t.common.loading}
        className="flex h-full items-start gap-3 p-3"
      >
        {Array.from({ length: 4 }).map((_, col) => (
          <div key={col} className="w-[272px] shrink-0 space-y-2 rounded-modal bg-tr-list p-2">
            <Skeleton className="h-6 w-32" />
            {Array.from({ length: 3 + (col % 3) }).map((_, row) => (
              <Skeleton key={row} className="h-16 w-full rounded-panel" />
            ))}
          </div>
        ))}
      </div>
    );
  if (error || !board)
    return (
      <div className="p-6">
        <ErrorState
          message={(error as Error)?.message ?? t.common.error}
          onRetry={() => queryClient.invalidateQueries({ queryKey: ['board', id] })}
        />
      </div>
    );

  return (
    <div className="relative flex h-full flex-col" style={backgroundStyle(board.background)}>
      <header
        className="flex min-h-12 shrink-0 flex-wrap items-center gap-1.5 bg-tr-nav px-2 py-1.5 text-white pt-[max(0.375rem,env(safe-area-inset-top))] md:bg-[var(--board-scrim)] md:pt-1.5 sm:h-12 sm:flex-nowrap sm:gap-2 sm:px-3 sm:py-0"
        /* Lop phu lam dam anh nen bang de chu trang doc duoc — dung token de con
           chinh duoc mot cho, xem --tr-board-scrim trong index.css. */
        style={{ '--board-scrim': boardScrim(board.background) } as React.CSSProperties}
      >
        <Link
          to={board.project_id ? `/projects/${board.project_id}` : '/boards'}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded md:hidden"
          aria-label="Quay lại danh sách luồng việc"
        >
          <ChevronLeft size={22} />
        </Link>
        {editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              setEditingName(false);
              if (nameDraft.trim() && nameDraft !== board.name)
                patchBoard.mutate({ name: nameDraft.trim() });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setEditingName(false);
            }}
            className="min-w-0 max-w-[55vw] rounded border-2 border-white bg-white/95 px-2 py-1 text-base font-bold text-tr-text outline-none sm:max-w-xs"
          />
        ) : coarsePointer ? (
          <span className="tr-display min-w-0 max-w-[55vw] truncate px-2 py-1 text-base font-bold sm:max-w-xs">
            {board.name}
          </span>
        ) : (
          <button
            onClick={() => {
              setNameDraft(board.name);
              setEditingName(true);
            }}
            className="tr-display min-h-11 min-w-0 max-w-[55vw] truncate rounded px-2 py-1 text-left text-base font-bold transition hover:bg-white/20 fine:min-h-0 sm:max-w-xs"
          >
            {board.name}
          </button>
        )}

        <div className="hidden md:block">
          <BoardViewChip value={view} onChange={setView} />
        </div>

        <button
          onClick={() => patchBoard.mutate({ is_starred: !board.is_starred })}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded transition hover:bg-white/20 fine:h-8 fine:w-8"
          aria-label={board.is_starred ? 'Bỏ gắn sao' : 'Gắn sao luồng việc này'}
          title={board.is_starred ? 'Bỏ gắn sao' : 'Gắn sao luồng việc này'}
        >
          <Star
            size={17}
            fill={board.is_starred ? STAR_COLOR : 'none'}
            color={board.is_starred ? STAR_COLOR : 'currentColor'}
          />
        </button>

        {/* Bảng thuộc dự án nào là thông tin quyết định: từ v19 nó cũng quyết
            định luôn dự án của mọi công việc bên trong. */}
        {board.project_name && (
          <Link
            to={`/projects/${board.project_id}`}
            className="tr-header-btn hidden max-w-72 min-w-0 md:inline-flex"
            title={`Dự án: ${board.project_name} — mọi công việc trong luồng này thuộc dự án đó`}
          >
            <FolderKanban size={14} className="shrink-0" />
            <span className="min-w-0 truncate">{board.project_name}</span>
          </Link>
        )}

        {board.customer_name && (
          <Link
            to={`/customers/${board.customer_id}`}
            className="tr-header-btn hidden max-w-72 min-w-0 md:inline-flex"
            title={`${t.board.linkedCustomer}: ${board.customer_name}`}
          >
            <Building2 size={14} className="shrink-0" />
            <span className="min-w-0 truncate">{board.customer_name}</span>
          </Link>
        )}

        <div className="ml-auto flex items-center gap-1">
          {view === 'board' && (
            <>
              <button
                onClick={toggleLabelText}
                className="hidden h-11 w-11 items-center justify-center rounded text-white transition hover:bg-white/20 md:flex fine:h-8 fine:w-8"
                aria-label={labelText ? 'Thu gọn chữ trên nhãn' : 'Hiện chữ trên nhãn'}
                title={labelText ? 'Nhãn đang hiện chữ' : 'Nhãn đang thu gọn'}
              >
                <SlidersHorizontal size={17} />
              </button>
              <button
                onClick={filterPopover.toggle}
                className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded px-2 text-white transition hover:bg-white/20 fine:h-8 sm:min-w-8"
                aria-label={`Bộ lọc${activeFilters > 0 ? `, ${activeFilters} bộ lọc đang bật` : ''}`}
                title="Bộ lọc"
              >
                <Filter size={17} />
                {activeFilters > 0 && (
                  <span className="rounded-full bg-white px-1.5 text-xs font-bold text-tr-primary">
                    {activeFilters}
                  </span>
                )}
              </button>
            </>
          )}
          <button
            onClick={() => setMenuOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded text-white transition hover:bg-white/20 fine:h-8 fine:w-8"
            aria-label="Mở menu luồng việc"
            title="Menu luồng việc"
          >
            <MoreHorizontal size={18} />
          </button>
        </div>
        <div className="basis-full pb-1 md:hidden">
          <div className="mb-1 px-2 text-xs text-white/85">
            {board.project_name ?? board.customer_name ?? 'Luồng việc'} ·{' '}
            {board.lists.reduce((sum, list) => sum + list.cards.length, 0)} việc
          </div>
          <BoardViewSegmented value={view} onChange={setView} />
        </div>
      </header>

      {view === 'board' && activeList.total > 0 && (
        <div
          className="flex items-center justify-between px-3 py-2 text-sm font-semibold text-white md:hidden"
          aria-live="polite"
          style={{ backgroundColor: boardScrim(board.background) }}
        >
          <span>
            {board.lists[activeList.index]?.name} · {activeList.index + 1}/{activeList.total}
          </span>
          <span className="flex gap-1.5" aria-hidden="true">
            {board.lists.map((list, index) => (
              <span
                key={list.id}
                className={`h-1.5 rounded-full ${index === activeList.index ? 'w-4.5 bg-white' : 'w-1.5 bg-white/45'}`}
              />
            ))}
          </span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        {view === 'board' && <BoardView board={board} onActiveListChange={onActiveListChange} />}
        {view === 'calendar' && (
          /* Cung cong thuc full-height nhu trang Lich. Giu `pb-20` vi
             BoardViewDock noi o day — khong co no thi hang cuoi bi che khuat. */
          <div className="flex h-full min-h-[520px] flex-col p-4 pb-4 md:pb-20">
            <LazyCalendarView boardId={id} />
          </div>
        )}
        {view === 'timeline' && (
          <div className="p-4 pb-4 md:pb-20">
            <TimelineBoard boardId={id} />
          </div>
        )}
        {view === 'table' && (
          <div className="p-4 pb-4 md:pb-20">
            <TaskTable tasks={boardTasks} />
          </div>
        )}
      </div>

      <BoardViewDock value={view} onChange={setView} />

      <BoardFilter
        open={filterPopover.open}
        anchor={filterPopover.anchor}
        onClose={filterPopover.close}
        labels={board.labels}
        matchCount={matchCount}
      />

      <BoardMenu
        board={board}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onRename={() => {
          setMenuOpen(false);
          setNameDraft(board.name);
          setEditingName(true);
        }}
        labelText={labelText}
        onToggleLabelText={toggleLabelText}
        onDeleted={() => navigate('/boards')}
      />
    </div>
  );
}
