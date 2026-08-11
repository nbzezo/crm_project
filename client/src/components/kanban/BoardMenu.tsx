import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Image, Plus, Tag, Trash2, X } from 'lucide-react';
import { api } from '../../api/client';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { BOARD_COLORS, BOARD_GRADIENTS, backgroundStyle } from '../../lib/backgrounds';
import { t } from '../../i18n/vi';
import { contrastInk, formatDateTime } from '../../lib/format';
import type { BoardFull, Label } from '../../types';

type View = 'main' | 'background' | 'labels';

const LABEL_PALETTE = [
  '#4bce97',
  '#f5cd47',
  '#fea362',
  '#f87168',
  '#9f8fef',
  '#579dff',
  '#6cc3e0',
  '#94c748',
  '#e774bb',
  '#8590a2',
];

export function BoardMenu({
  board,
  open,
  onClose,
  onDeleted,
}: {
  board: BoardFull;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>('main');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [labelName, setLabelName] = useState('');
  const [labelColor, setLabelColor] = useState(LABEL_PALETTE[0]);

  const { data: labels = [] } = useQuery({
    queryKey: ['labels'],
    queryFn: () => api.get<Label[]>('/api/labels'),
    enabled: open,
  });

  const refreshBoard = () => {
    queryClient.invalidateQueries({ queryKey: ['board', board.id] });
    queryClient.invalidateQueries({ queryKey: ['boards'] });
  };

  const setBackground = useMutation({
    mutationFn: (background: string) => api.patch(`/api/boards/${board.id}`, { background }),
    onSuccess: refreshBoard,
  });

  const addLabel = useMutation({
    mutationFn: () => api.post('/api/labels', { name: labelName.trim(), color: labelColor }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels'] });
      refreshBoard();
      setLabelName('');
    },
  });

  const removeLabel = useMutation({
    mutationFn: (id: number) => api.del(`/api/labels/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels'] });
      refreshBoard();
    },
  });

  const removeBoard = useMutation({
    mutationFn: () => api.del(`/api/boards/${board.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      onDeleted();
    },
  });

  if (!open) return null;

  const titles: Record<View, string> = {
    main: 'Menu bảng',
    background: 'Đổi hình nền',
    labels: t.settings.manageLabels,
  };

  return (
    <>
      <aside className="tr-popover-shadow absolute top-0 right-0 z-40 flex h-full w-[339px] flex-col bg-tr-panel">
        <header className="relative flex h-12 shrink-0 items-center justify-center border-b border-tr-border px-10">
          {view !== 'main' && (
            <button
              onClick={() => setView('main')}
              className="absolute left-2 rounded p-1.5 text-tr-muted transition hover:bg-tr-hover"
            >
              <ChevronLeft size={17} />
            </button>
          )}
          <span className="text-sm font-semibold text-tr-subtle">{titles[view]}</span>
          <button
            onClick={onClose}
            className="absolute right-2 rounded p-1.5 text-tr-muted transition hover:bg-tr-hover"
          >
            <X size={17} />
          </button>
        </header>

        <div className="tr-scroll flex-1 overflow-y-auto p-3">
          {view === 'main' && (
            <div className="space-y-1">
              <MenuRow
                icon={
                  <span
                    className="h-6 w-8 rounded"
                    style={backgroundStyle(board.background)}
                  />
                }
                label="Đổi hình nền"
                onClick={() => setView('background')}
              />
              <MenuRow
                icon={<Tag size={18} className="text-tr-subtle" />}
                label={t.settings.manageLabels}
                onClick={() => setView('labels')}
              />
              <div className="my-2 border-t border-tr-border" />
              <div className="px-2 py-1 text-xs text-tr-muted">
                Tạo lúc {formatDateTime(board.created_at?.replace(' ', 'T').slice(0, 16))}
              </div>
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-tr-danger transition hover:bg-tr-hover"
              >
                <Trash2 size={17} /> Xóa bảng này
              </button>
            </div>
          )}

          {view === 'background' && (
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 text-xs font-semibold text-tr-subtle">Chuyển sắc</h3>
                <div className="grid grid-cols-3 gap-2">
                  {BOARD_GRADIENTS.map((bg) => (
                    <BackgroundTile
                      key={bg}
                      value={bg}
                      active={board.background === bg}
                      onPick={() => setBackground.mutate(bg)}
                    />
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold text-tr-subtle">Màu đơn</h3>
                <div className="grid grid-cols-5 gap-2">
                  {BOARD_COLORS.map((bg) => (
                    <BackgroundTile
                      key={bg}
                      value={bg}
                      active={board.background === bg}
                      onPick={() => setBackground.mutate(bg)}
                      small
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {view === 'labels' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                {labels.map((label) => (
                  <div key={label.id} className="flex items-center gap-2">
                    <span
                      className="flex h-8 flex-1 items-center rounded px-3 text-sm font-medium"
                      style={{ backgroundColor: label.color, color: contrastInk(label.color) }}
                    >
                      {label.name}
                    </span>
                    <button
                      onClick={() => removeLabel.mutate(label.id)}
                      className="rounded p-1.5 text-tr-muted transition hover:bg-tr-hover hover:text-tr-danger"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                {labels.length === 0 && (
                  <p className="text-sm text-tr-muted">Chưa có nhãn nào.</p>
                )}
              </div>

              <div className="border-t border-tr-border pt-3">
                <input
                  value={labelName}
                  onChange={(e) => setLabelName(e.target.value)}
                  placeholder={t.settings.labelName}
                  onKeyDown={(e) => e.key === 'Enter' && labelName.trim() && addLabel.mutate()}
                  className="w-full rounded border border-tr-border px-2.5 py-1.5 text-sm outline-none focus:border-tr-primary"
                />
                <div className="mt-2 grid grid-cols-5 gap-2">
                  {LABEL_PALETTE.map((color) => (
                    <button
                      key={color}
                      onClick={() => setLabelColor(color)}
                      className={`h-8 rounded transition ${
                        labelColor === color ? 'ring-2 ring-tr-primary ring-offset-1' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <button
                  disabled={!labelName.trim()}
                  onClick={() => addLabel.mutate()}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[3px] bg-tr-primary py-1.5 text-sm font-medium text-white transition hover:bg-tr-primary-hover disabled:opacity-50"
                >
                  <Plus size={15} /> Tạo nhãn
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      <ConfirmDialog
        open={confirmDelete}
        message={`Xóa bảng "${board.name}" sẽ xóa toàn bộ danh sách và thẻ bên trong.`}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          removeBoard.mutate();
        }}
      />
    </>
  );
}

function MenuRow({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded px-2 py-2 text-left text-sm text-tr-text transition hover:bg-tr-hover"
    >
      {icon}
      {label}
    </button>
  );
}

function BackgroundTile({
  value,
  active,
  onPick,
  small,
}: {
  value: string;
  active: boolean;
  onPick: () => void;
  small?: boolean;
}) {
  return (
    <button
      onClick={onPick}
      className={`relative rounded-lg transition hover:brightness-110 ${small ? 'h-10' : 'h-16'} ${
        active ? 'ring-2 ring-tr-primary ring-offset-2' : ''
      }`}
      style={backgroundStyle(value)}
    >
      {active && (
        <span className="absolute inset-0 flex items-center justify-center text-white">
          <Image size={16} />
        </span>
      )}
    </button>
  );
}
