import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Plus, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { Button, Input } from '../common/ui';
import { t } from '../../i18n/vi';
import { invalidateCardViews } from '../../lib/queryKeys';
import { useUiStore } from '../../stores/uiStore';
import type { ChecklistItem } from '../../types';

export function ChecklistSection({ cardId, items }: { cardId: number; items: ChecklistItem[] }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['card', cardId] });
    invalidateCardViews(queryClient);
  };

  const add = useMutation({
    mutationFn: (content: string) => api.post(`/api/cards/${cardId}/checklist`, { content }),
    onSuccess: refresh,
  });
  const toggle = useMutation({
    mutationFn: (vars: { id: number; is_done: boolean }) =>
      api.patch(`/api/checklist/${vars.id}`, { is_done: vars.is_done }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/checklist/${id}`),
    onSuccess: refresh,
  });
  // Mot buoc hoa ra can han/uu tien rieng -> nang len thanh viec con thay vi go lai tay
  const promote = useMutation({
    mutationFn: (id: number) => api.post(`/api/checklist/${id}/promote`),
    onSuccess: () => {
      refresh();
      pushToast('Đã chuyển thành việc con', 'success');
    },
    onError: (error) => pushToast(error instanceof Error ? error.message : 'Chuyển thất bại'),
  });

  const done = items.filter((i) => i.is_done).length;
  const percent = items.length ? Math.round((done / items.length) * 100) : 0;

  const submit = () => {
    const content = draft.trim();
    if (content) add.mutate(content);
    setDraft('');
    setAdding(false);
  };

  return (
    <div>
      {items.length > 0 && (
        <div className="mb-2 flex items-center gap-2">
          <span className="w-8 shrink-0 text-xs text-tr-muted tabular-nums">{percent}%</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-tr-hover-strong">
            <div
              className={`h-full rounded-full transition-all ${percent === 100 ? 'bg-tr-success' : 'bg-tr-primary'}`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="shrink-0 text-xs text-tr-muted">
            {done}/{items.length}
          </span>
        </div>
      )}

      <ul className="space-y-1">
        {items.map((item) => (
          <li
            key={item.id}
            className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-tr-hover"
          >
            <input
              type="checkbox"
              checked={!!item.is_done}
              onChange={(e) => toggle.mutate({ id: item.id, is_done: e.target.checked })}
              className="h-4 w-4 rounded border-tr-border text-tr-primary"
            />
            <span
              className={`flex-1 text-sm ${item.is_done ? 'text-tr-muted line-through' : 'text-tr-text'}`}
            >
              {item.content}
            </span>
            <button
              onClick={() => promote.mutate(item.id)}
              disabled={promote.isPending}
              className="rounded p-1 text-tr-muted opacity-0 transition group-hover:opacity-100 hover:bg-tr-hover hover:text-tr-primary"
              title="Chuyển thành việc con (có hạn và ưu tiên riêng)"
            >
              <ArrowUpRight size={13} />
            </button>
            <button
              onClick={() => remove.mutate(item.id)}
              className="rounded p-1 text-tr-muted opacity-0 transition group-hover:opacity-100 hover:bg-tr-hover hover:text-tr-danger"
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-2">
        {adding ? (
          <div className="flex gap-1.5">
            <Input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') setAdding(false);
              }}
              placeholder={t.card.addChecklistItem}
            />
            <Button variant="primary" onClick={submit}>
              {t.common.add}
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded px-1 py-1 text-sm text-tr-subtle hover:text-tr-text"
          >
            <Plus size={14} /> {t.card.addChecklistItem}
          </button>
        )}
      </div>
    </div>
  );
}
