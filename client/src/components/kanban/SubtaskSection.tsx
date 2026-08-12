import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Plus, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { Button, InlineDate } from '../common/ui';
import { PRIORITY_COLORS, PRIORITY_ORDER, t } from '../../i18n/vi';
import { isOverdue } from '../../lib/format';
import { invalidateCardViews } from '../../lib/queryKeys';
import { useUiStore } from '../../stores/uiStore';
import type { Priority, SubTask } from '../../types';

/** Danh sách việc con ngay trong cửa sổ thẻ — thêm, sửa, xóa tại chỗ. */
export function SubtaskSection({ cardId, subtasks }: { cardId: number; subtasks: SubTask[] }) {
  const queryClient = useQueryClient();
  const openCard = useUiStore((s) => s.openCard);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['card', cardId] });
    invalidateCardViews(queryClient);
  };

  const add = useMutation({
    mutationFn: (title: string) => api.post('/api/cards', { parent_id: cardId, title }),
    onSuccess: () => {
      refresh();
      setDraft('');
    },
  });
  const update = useMutation({
    mutationFn: (vars: { id: number; patch: Record<string, unknown> }) =>
      api.patch(`/api/cards/${vars.id}`, vars.patch),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/cards/${id}`),
    onSuccess: refresh,
  });

  const done = subtasks.filter((s) => s.is_done).length;

  const submit = () => {
    const title = draft.trim();
    if (title) add.mutate(title);
  };

  return (
    <div>
      {/* Khong dung thanh % o day — do la dau hieu nhan dang cua khoi "Viec can lam" */}
      {subtasks.length > 0 && (
        <div className="mb-1.5 text-xs text-tr-muted">
          Hoàn thành {done}/{subtasks.length}
        </div>
      )}

      <ul className="space-y-1">
        {subtasks.map((task) => (
          <li
            key={task.id}
            className="group flex items-center gap-2 rounded-md border border-tr-border bg-tr-card px-2 py-1.5 transition hover:border-tr-primary"
          >
            <input
              type="checkbox"
              checked={!!task.is_done}
              onChange={(e) => update.mutate({ id: task.id, patch: { is_done: e.target.checked } })}
              className="h-4 w-4 shrink-0 rounded border-tr-border text-tr-primary"
            />
            <span
              className={`min-w-0 flex-1 truncate text-sm ${
                task.is_done ? 'text-tr-muted line-through' : 'text-tr-text'
              }`}
            >
              {task.title}
            </span>

            <select
              value={task.priority}
              onChange={(e) =>
                update.mutate({ id: task.id, patch: { priority: e.target.value as Priority } })
              }
              className="w-24 shrink-0 rounded border border-tr-border bg-tr-panel px-1 py-0.5 text-xs font-medium transition hover:border-tr-primary"
              style={{ color: PRIORITY_COLORS[task.priority] }}
            >
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p} className="bg-tr-panel text-tr-text">
                  {t.priority[p]}
                </option>
              ))}
            </select>

            <div className="w-24 shrink-0">
              <InlineDate
                value={task.due_date}
                placeholder="Đặt hạn"
                highlight={isOverdue(task.due_date, task.is_done)}
                onChange={(v) => update.mutate({ id: task.id, patch: { due_date: v } })}
              />
            </div>

            <button
              onClick={() => openCard(task.id)}
              className="shrink-0 rounded p-1 text-tr-subtle transition hover:bg-tr-hover-strong hover:text-tr-text"
              title="Mở chi tiết việc con"
            >
              <ExternalLink size={13} />
            </button>
            <button
              onClick={() => remove.mutate(task.id)}
              className="shrink-0 rounded p-1 text-tr-muted opacity-0 transition group-hover:opacity-100 hover:bg-tr-hover-strong hover:text-tr-danger"
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-2">
        {adding ? (
          <div className="flex gap-1.5">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') setAdding(false);
              }}
              placeholder="Tên việc con…"
              className="flex-1 rounded border-2 border-tr-primary bg-tr-panel px-2 py-1 text-sm text-tr-text outline-none"
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
            <Plus size={14} /> Thêm việc con
          </button>
        )}
      </div>
    </div>
  );
}
