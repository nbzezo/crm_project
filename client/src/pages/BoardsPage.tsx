import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Archive, Building2, FolderKanban, Plus, Star, X } from 'lucide-react';
import { api } from '../api/client';
import {
  ALL_BACKGROUNDS,
  BOARD_COLORS,
  BOARD_GRADIENTS,
  backgroundStyle,
} from '../lib/backgrounds';
import { Combobox } from '../components/common/Combobox';
import { Popover, usePopover } from '../components/common/Popover';
import { Button, EmptyState, ErrorState, Skeleton, focusRing } from '../components/common/ui';
import { t } from '../i18n/vi';
import { STAR_COLOR } from '../theme/palettes';
import type { Board, Customer } from '../types';

export default function BoardsPage() {
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const create = usePopover();
  const [name, setName] = useState('');
  const [background, setBackground] = useState(ALL_BACKGROUNDS[0]);
  const [customerId, setCustomerId] = useState<string>('');

  const {
    data: boards = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['boards', showArchived],
    queryFn: () => api.get<Board[]>(`/api/boards${showArchived ? '?archived=1' : ''}`),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', 'select'],
    queryFn: () => api.get<Customer[]>('/api/customers'),
    staleTime: 60_000,
  });

  const createBoard = useMutation({
    mutationFn: () =>
      api.post<Board>('/api/boards', {
        name: name.trim(),
        background,
        customer_id: customerId === '' ? null : Number(customerId),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      create.close();
      setName('');
      setCustomerId('');
    },
  });

  const patchBoard = useMutation({
    mutationFn: (vars: { id: number; patch: Record<string, unknown> }) =>
      api.patch(`/api/boards/${vars.id}`, vars.patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['boards'] }),
  });

  const starred = boards.filter((b) => b.is_starred && !b.is_archived);
  const others = boards.filter((b) => !b.is_starred || b.is_archived);

  /** Bảng còn lại gom theo dự án; nhóm không thuộc dự án nào xuống cuối. */
  const groupsByProject = useMemo(() => {
    const byProject = new Map<number | null, { title: string; boards: Board[] }>();
    for (const board of others) {
      const key = board.project_id ?? null;
      const bucket = byProject.get(key) ?? {
        title: board.project_name ?? 'Không thuộc dự án nào',
        boards: [],
      };
      bucket.boards.push(board);
      byProject.set(key, bucket);
    }
    return [...byProject.entries()]
      .map(([projectId, group]) => ({ key: String(projectId), projectId, ...group }))
      .sort((a, b) => {
        if (a.projectId === null) return 1;
        if (b.projectId === null) return -1;
        return a.title.localeCompare(b.title, 'vi');
      });
  }, [others]);

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-tr-subtle">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-4 w-4 rounded border-tr-border"
          />
          Hiện cả bảng {t.board.archived.toLowerCase()}
        </label>
        <button
          onClick={create.toggle}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-control bg-tr-primary px-3 text-sm font-medium text-tr-on-primary transition hover:bg-tr-primary-hover fine:min-h-0 fine:py-1.5 ${focusRing}`}
          aria-haspopup="dialog"
        >
          <Plus size={16} aria-hidden="true" /> {t.board.newBoard}
        </button>
      </div>

      {isLoading ? (
        <div
          role="status"
          aria-label={t.common.loading}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-panel" />
          ))}
        </div>
      ) : error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : boards.length === 0 ? (
        <EmptyState
          message={t.board.noBoards}
          hint={
            showArchived
              ? 'Không có bảng nào trong kho lưu trữ.'
              : 'Tạo bảng đầu tiên để bắt đầu sắp xếp công việc theo cột.'
          }
          action={
            !showArchived && (
              <Button variant="primary" onClick={create.toggle}>
                <Plus size={16} aria-hidden="true" /> {t.board.newBoard}
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-6">
          {starred.length > 0 && (
            <Section title="Đã gắn sao" icon={<Star size={15} />}>
              {starred.map((board) => (
                <BoardTile
                  key={board.id}
                  board={board}
                  onToggleStar={patchBoard.mutate}
                  onToggleArchive={patchBoard.mutate}
                />
              ))}
            </Section>
          )}
          {/*
            Nhóm theo dự án thay vì một danh sách phẳng.

            Một bảng thuộc dự án nào là thông tin quyết định — từ v19 nó cũng
            quyết định luôn công việc bên trong thuộc dự án nào. Nhóm "Không thuộc
            dự án" đứng cuối vì đó thường là việc cá nhân, không phải cam kết.
          */}
          {groupsByProject.map((group) => (
            <Section
              key={group.key}
              title={group.title}
              icon={group.projectId ? <FolderKanban size={15} /> : undefined}
              action={
                group.projectId ? (
                  <Link
                    to={`/projects/${group.projectId}`}
                    className={`text-xs font-medium text-tr-primary hover:underline ${focusRing}`}
                  >
                    Mở dự án
                  </Link>
                ) : undefined
              }
            >
              {group.boards.map((board) => (
                <BoardTile
                  key={board.id}
                  board={board}
                  onToggleStar={patchBoard.mutate}
                  onToggleArchive={patchBoard.mutate}
                />
              ))}
            </Section>
          ))}

          {/* Nút tạo bảng tách khỏi các nhóm: nó không thuộc dự án nào cho tới
              khi người dùng chọn, nên nằm trong một nhóm cụ thể là nói dối. */}
          <button
            onClick={create.toggle}
            className={`flex h-16 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-tr-border text-sm text-tr-subtle transition hover:bg-tr-hover ${focusRing}`}
          >
            <Plus size={15} aria-hidden="true" /> {t.board.newBoard}
          </button>
        </div>
      )}

      <Popover
        open={create.open}
        anchor={create.anchor}
        onClose={create.close}
        title="Tạo bảng"
        width={304}
      >
        <div className="space-y-3">
          <div
            className="flex h-24 items-center justify-center rounded-lg"
            style={backgroundStyle(background)}
          >
            <div className="h-16 w-24 rounded bg-white/25" />
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold text-tr-subtle">Phông nền</span>
            <div className="mb-2 grid grid-cols-4 gap-2">
              {BOARD_GRADIENTS.slice(0, 4).map((bg) => (
                <button
                  key={bg}
                  onClick={() => setBackground(bg)}
                  className={`h-10 rounded transition ${background === bg ? 'ring-2 ring-tr-primary ring-offset-1' : ''}`}
                  style={backgroundStyle(bg)}
                />
              ))}
            </div>
            <div className="grid grid-cols-5 gap-2">
              {BOARD_COLORS.map((bg) => (
                <button
                  key={bg}
                  onClick={() => setBackground(bg)}
                  className={`h-8 rounded transition ${background === bg ? 'ring-2 ring-tr-primary ring-offset-1' : ''}`}
                  style={backgroundStyle(bg)}
                />
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-tr-subtle">
              {t.board.boardName}
            </span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && createBoard.mutate()}
              className="w-full rounded border-2 border-tr-primary px-2.5 py-1.5 text-sm outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-tr-subtle">
              {t.board.linkedCustomer}
            </span>
            <Combobox
              value={customerId === '' ? '' : Number(customerId)}
              onChange={(v) => setCustomerId(v === '' ? '' : String(v))}
              options={customers.map((c) => ({ id: c.id, label: c.name }))}
              placeholder={`— ${t.common.none} —`}
              searchPlaceholder="Tìm khách hàng…"
              emptyText="Không tìm thấy khách hàng."
              ariaLabel={t.board.linkedCustomer}
            />
          </label>

          <button
            disabled={!name.trim()}
            onClick={() => createBoard.mutate()}
            className="w-full rounded-compact bg-tr-primary py-1.5 text-sm font-medium text-white transition hover:bg-tr-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Tạo mới
          </button>
        </div>
      </Popover>
    </div>
  );
}

function Section({
  title,
  icon,
  action,
  children,
}: {
  action?: React.ReactNode;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-tr-subtle">
        {icon}
        {title}
        {action && <span className="ml-auto">{action}</span>}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {children}
      </div>
    </section>
  );
}

function BoardTile({
  board,
  onToggleStar,
  onToggleArchive,
}: {
  board: Board;
  onToggleStar: (vars: { id: number; patch: Record<string, unknown> }) => void;
  onToggleArchive: (vars: { id: number; patch: Record<string, unknown> }) => void;
}) {
  return (
    <div className="group relative">
      <Link
        to={`/boards/${board.id}`}
        className="block h-24 overflow-hidden rounded-lg p-2.5 text-white transition hover:brightness-110"
        style={backgroundStyle(board.background)}
      >
        <div className="line-clamp-2 pr-6 text-sm font-bold">{board.name}</div>
        <div className="mt-1 text-xs opacity-90">{board.card_count ?? 0} thẻ đang mở</div>
        {board.customer_name && (
          <div className="mt-0.5 flex items-center gap-1 truncate text-xs opacity-90">
            <Building2 size={11} /> {board.customer_name}
          </div>
        )}
        {!!board.is_archived && (
          <div className="absolute bottom-2 left-2.5 rounded bg-black/35 px-1.5 py-0.5 text-xs">
            {t.board.archived}
          </div>
        )}
      </Link>

      <button
        onClick={() => onToggleStar({ id: board.id, patch: { is_starred: !board.is_starred } })}
        className={`absolute top-2 right-2 rounded p-1 text-white transition hover:bg-black/25 ${
          board.is_starred ? '' : 'opacity-0 group-hover:opacity-100'
        }`}
        title={board.is_starred ? 'Bỏ gắn sao' : 'Gắn sao'}
      >
        <Star
          size={14}
          fill={board.is_starred ? STAR_COLOR : 'none'}
          color={board.is_starred ? STAR_COLOR : 'currentColor'}
        />
      </button>

      <button
        onClick={() =>
          onToggleArchive({ id: board.id, patch: { is_archived: !board.is_archived } })
        }
        className="absolute right-2 bottom-2 rounded p-1 text-white opacity-0 transition group-hover:opacity-100 hover:bg-black/25"
        title={board.is_archived ? t.board.unarchive : t.board.archive}
      >
        {board.is_archived ? <X size={13} /> : <Archive size={13} />}
      </button>
    </div>
  );
}
