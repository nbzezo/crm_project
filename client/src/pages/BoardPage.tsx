import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  Building2,
  Filter,
  FolderKanban,
  MoreHorizontal,
  SlidersHorizontal,
  Star,
} from 'lucide-react';
import { api, qs } from '../api/client';
import { BoardView } from '../components/kanban/BoardView';
import { BoardMenu } from '../components/kanban/BoardMenu';
import { BoardFilter } from '../components/kanban/BoardFilter';
import { BoardViewChip, BoardViewDock, type BoardViewMode } from '../components/kanban/BoardViews';
import { LazyCalendarView } from '../components/calendar/LazyCalendarView';
import { TimelineBoard } from '../components/views/TimelineBoard';
import { TaskTable } from '../components/tasks/TaskTable';
import { usePopover } from '../components/common/Popover';
import { ErrorState, Skeleton } from '../components/common/ui';
import { backgroundStyle } from '../lib/backgrounds';
import { t } from '../i18n/vi';
import { countActiveFilters, useUiStore } from '../stores/uiStore';
import { STAR_COLOR } from '../theme/palettes';
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
  const filterPopover = usePopover();

  const filters = useUiStore((s) => s.boardFilters);
  const resetFilters = useUiStore((s) => s.resetBoardFilters);
  const labelText = useUiStore((s) => s.labelText);
  const toggleLabelText = useUiStore((s) => s.toggleLabelText);
  const activeFilters = countActiveFilters(filters);

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
        className="flex min-h-12 shrink-0 flex-wrap items-center gap-1.5 px-2 py-1.5 text-white sm:h-12 sm:flex-nowrap sm:gap-2 sm:px-3 sm:py-0"
        style={{ backgroundColor: '#0000001f' }}
      >
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
        ) : (
          <button
            onClick={() => {
              setNameDraft(board.name);
              setEditingName(true);
            }}
            className="min-h-11 min-w-0 max-w-[55vw] truncate rounded px-2 py-1 text-left text-base font-bold transition hover:bg-white/20 sm:min-h-0 sm:max-w-xs"
          >
            {board.name}
          </button>
        )}

        <div className="hidden sm:block">
          <BoardViewChip value={view} onChange={setView} />
        </div>

        <button
          onClick={() => patchBoard.mutate({ is_starred: !board.is_starred })}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded transition hover:bg-white/20 sm:h-8 sm:w-8"
          aria-label={board.is_starred ? 'Bỏ gắn sao' : 'Gắn sao bảng này'}
          title={board.is_starred ? 'Bỏ gắn sao' : 'Gắn sao bảng này'}
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
            className="tr-header-btn hidden max-w-44 truncate md:inline-flex"
            title="Bảng này thuộc dự án — mọi công việc bên trong cũng vậy"
          >
            <FolderKanban size={14} /> {board.project_name}
          </Link>
        )}

        {board.customer_name && (
          <Link
            to={`/customers/${board.customer_id}`}
            className="tr-header-btn hidden max-w-44 truncate md:inline-flex"
            title={t.board.linkedCustomer}
          >
            <Building2 size={14} /> {board.customer_name}
          </Link>
        )}

        <div className="ml-auto flex items-center gap-1">
          {view === 'board' && (
            <>
              <button
                onClick={toggleLabelText}
                className="flex h-11 w-11 items-center justify-center rounded text-white transition hover:bg-white/20 sm:h-8 sm:w-8"
                aria-label={labelText ? 'Thu gọn chữ trên nhãn' : 'Hiện chữ trên nhãn'}
                title={labelText ? 'Nhãn đang hiện chữ' : 'Nhãn đang thu gọn'}
              >
                <SlidersHorizontal size={17} />
              </button>
              <button
                onClick={filterPopover.toggle}
                className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded px-2 text-white transition hover:bg-white/20 sm:h-8 sm:min-w-8"
                aria-label={`Bộ lọc${activeFilters > 0 ? `, ${activeFilters} bộ lọc đang bật` : ''}`}
                title="Bộ lọc"
              >
                <Filter size={17} />
                {activeFilters > 0 && (
                  <span className="rounded-full bg-white px-1.5 text-2xs font-bold text-tr-primary">
                    {activeFilters}
                  </span>
                )}
              </button>
            </>
          )}
          <button
            onClick={() => setMenuOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded text-white transition hover:bg-white/20 sm:h-8 sm:w-8"
            aria-label="Mở menu bảng"
            title="Menu bảng"
          >
            <MoreHorizontal size={18} />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {view === 'board' && <BoardView board={board} />}
        {view === 'calendar' && (
          /* Cung cong thuc full-height nhu trang Lich. Giu `pb-20` vi
             BoardViewDock noi o day — khong co no thi hang cuoi bi che khuat. */
          <div className="flex h-full min-h-[520px] flex-col p-4 pb-20">
            <LazyCalendarView boardId={id} />
          </div>
        )}
        {view === 'timeline' && (
          <div className="p-4 pb-20">
            <TimelineBoard boardId={id} />
          </div>
        )}
        {view === 'table' && (
          <div className="p-4 pb-20">
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
      />

      <BoardMenu
        board={board}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onDeleted={() => navigate('/boards')}
      />
    </div>
  );
}
