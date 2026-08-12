import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { api } from '../../api/client';
import { t } from '../../i18n/vi';
import { contrastInk } from '../../lib/format';
import type { BoardFull, CardDetail, Label } from '../../types';
import { Popover } from '../common/Popover';

interface PopoverController {
  open: boolean;
  anchor: HTMLElement | null;
  close: () => void;
}

interface Props {
  card: CardDetail;
  pop: PopoverController;
  onDone: () => void;
}

export function ListPopover({ card, pop, onDone }: Props) {
  const boardId = card.board?.id;
  const { data: board } = useQuery({
    queryKey: ['board', boardId],
    queryFn: () => api.get<BoardFull>(`/api/boards/${boardId}/full`),
    enabled: pop.open && !!boardId,
  });
  const move = useMutation({
    mutationFn: (listId: number) =>
      api.patch(`/api/cards/${card.id}/move`, { list_id: listId, beforeId: null, afterId: null }),
    onSuccess: () => {
      onDone();
      pop.close();
    },
  });

  return (
    <Popover
      open={pop.open}
      anchor={pop.anchor}
      onClose={pop.close}
      title="Chuyển danh sách"
      width={272}
    >
      <div className="space-y-1">
        {board?.lists.map((list) => (
          <button
            key={list.id}
            type="button"
            onClick={() => move.mutate(list.id)}
            className={`flex min-h-11 w-full items-center justify-between rounded px-3 text-left text-sm transition hover:bg-tr-hover sm:min-h-8 ${
              list.id === card.list_id ? 'font-semibold text-tr-primary' : 'text-tr-text'
            }`}
          >
            {list.name}
            {list.id === card.list_id && <Check size={14} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </Popover>
  );
}

export function LabelsPopover({ card, pop, onDone }: Props) {
  const queryClient = useQueryClient();
  const { data: labels = [] } = useQuery({
    queryKey: ['labels'],
    queryFn: () => api.get<Label[]>('/api/labels'),
    enabled: pop.open,
  });
  const save = useMutation({
    mutationFn: (ids: number[]) => api.put(`/api/cards/${card.id}/labels`, { label_ids: ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['card', card.id] });
      onDone();
    },
  });
  const selected = new Set(card.labels.map((label) => label.id));

  return (
    <Popover open={pop.open} anchor={pop.anchor} onClose={pop.close} title={t.card.labels}>
      {labels.length === 0 && (
        <p className="text-sm text-tr-muted">Chưa có nhãn nào — tạo trong Menu bảng.</p>
      )}
      <div className="space-y-1.5">
        {labels.map((label) => {
          const active = selected.has(label.id);
          return (
            <button
              key={label.id}
              type="button"
              onClick={() => {
                const next = new Set(selected);
                if (active) next.delete(label.id);
                else next.add(label.id);
                save.mutate([...next]);
              }}
              className={`flex min-h-11 w-full items-center justify-between rounded px-3 text-sm font-medium transition hover:brightness-95 sm:min-h-8 ${
                active ? 'ring-2 ring-tr-text ring-offset-1' : ''
              }`}
              style={{ backgroundColor: label.color, color: contrastInk(label.color) }}
            >
              {label.name}
              {active && <Check size={14} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </Popover>
  );
}
