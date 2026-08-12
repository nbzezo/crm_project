import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Link2, Plus, Trash2, X } from 'lucide-react';
import { api } from '../../api/client';
import { Button, Field, Input, focusRing } from '../common/ui';
import { invalidateCardViews } from '../../lib/queryKeys';
import { formatDateShort, formatDateTime } from '../../lib/format';
import type { CardDetail, TaskRow } from '../../types';

/**
 * Ước lượng, mốc, phụ thuộc và lịch sử dời hạn của một thẻ.
 *
 * Bốn thứ này đứng cùng nhau vì chúng trả lời chung một câu hỏi: *kế hoạch của
 * việc này có đáng tin không*. Số lần dời hạn nói lên điều đó rõ hơn bất kỳ ước
 * lượng nào, nên nó nằm ngay cạnh ô nhập ước lượng chứ không giấu trong lịch sử.
 */
export function ScheduleSection({ card, onChanged }: { card: CardDetail; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const [estimate, setEstimate] = useState(card.estimate_hours?.toString() ?? '');
  const [spent, setSpent] = useState(card.spent_hours?.toString() ?? '');
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/api/cards/${card.id}`, body),
    onSuccess: () => {
      invalidateCardViews(queryClient);
      onChanged();
    },
  });

  const addDependency = useMutation({
    mutationFn: (predecessorId: number) =>
      api.post(`/api/cards/${card.id}/dependencies`, { predecessor_id: predecessorId }),
    onSuccess: () => {
      setAdding(false);
      setSearch('');
      onChanged();
    },
  });

  const removeDependency = useMutation({
    mutationFn: (predecessorId: number) =>
      api.del(`/api/cards/${card.id}/dependencies/${predecessorId}`),
    onSuccess: onChanged,
  });

  /** Ứng viên việc-trước: chỉ nạp khi mở ô thêm, và loại sẵn chính thẻ này. */
  const { data: candidates = [] } = useQuery({
    queryKey: ['tasks', 'dependency-candidates'],
    queryFn: () => api.get<TaskRow[]>('/api/views/tasks?done=0'),
    enabled: adding,
    staleTime: 30_000,
  });

  const existing = new Set(card.dependencies?.predecessors.map((p) => p.id) ?? []);
  const matches = candidates
    .filter((task) => task.id !== card.id && !existing.has(task.id))
    .filter((task) => task.title.toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, 8);

  const slipCount = card.slip_count ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Ước lượng (giờ)">
          <Input
            type="number"
            min={0}
            step={0.5}
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
            onBlur={() =>
              patch.mutate({ estimate_hours: estimate === '' ? null : Number(estimate) })
            }
          />
        </Field>
        <Field label="Đã dùng (giờ)">
          <Input
            type="number"
            min={0}
            step={0.5}
            value={spent}
            onChange={(e) => setSpent(e.target.value)}
            onBlur={() => patch.mutate({ spent_hours: spent === '' ? 0 : Number(spent) })}
          />
        </Field>
        <Field label="Mốc quan trọng">
          <label className="flex h-9 items-center gap-2 text-sm text-tr-subtle">
            <input
              type="checkbox"
              checked={!!card.is_milestone}
              onChange={(e) => patch.mutate({ is_milestone: e.target.checked })}
              className="h-4 w-4 rounded border-tr-border"
            />
            Là mốc
          </label>
        </Field>
      </div>

      {/* Trượt hạn — con số đứng trước, chi tiết đứng sau. */}
      <div className="rounded-panel border border-tr-border bg-tr-surface px-3 py-2">
        {slipCount === 0 ? (
          <p className="text-sm text-tr-muted">
            Chưa dời hạn lần nào
            {card.baseline_due_date && ` · hạn ban đầu ${formatDateShort(card.baseline_due_date)}`}.
          </p>
        ) : (
          <>
            <p className="text-sm">
              <span className="font-semibold text-tr-warning">Đã dời hạn {slipCount} lần</span>
              {card.baseline_due_date && (
                <span className="text-tr-muted">
                  {' '}
                  · từ {formatDateShort(card.baseline_due_date)}
                  {card.slip_days != null && ` (trượt ${card.slip_days} ngày)`}
                </span>
              )}
            </p>
            <ul className="mt-1.5 space-y-0.5 text-xs text-tr-muted">
              {card.due_changes?.slice(0, 5).map((change) => (
                <li key={change.id}>
                  {formatDateShort(change.old_due)} → {formatDateShort(change.new_due)}
                  <span className="ml-1">
                    · {formatDateTime(change.changed_at.replace(' ', 'T').slice(0, 16))}
                  </span>
                  {change.reason && <span className="ml-1 text-tr-subtle">— {change.reason}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <h4 className="text-xs font-semibold text-tr-subtle">Phải xong trước việc này</h4>
          <span className="flex-1" />
          <Button size="sm" onClick={() => setAdding((v) => !v)}>
            {adding ? <X size={13} aria-hidden="true" /> : <Plus size={13} aria-hidden="true" />}
            {adding ? 'Đóng' : 'Thêm'}
          </Button>
        </div>

        {adding && (
          <div className="mb-2">
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm công việc phải xong trước…"
            />
            <ul className="mt-1 max-h-48 overflow-y-auto rounded-control border border-tr-border">
              {matches.length === 0 ? (
                <li className="px-2 py-2 text-xs text-tr-muted">Không có công việc phù hợp.</li>
              ) : (
                matches.map((task) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => addDependency.mutate(task.id)}
                      className={`flex w-full items-center gap-2 px-2 py-2 text-left text-sm transition hover:bg-tr-hover ${focusRing}`}
                    >
                      <span className="min-w-0 flex-1 truncate text-tr-text">{task.title}</span>
                      <span className="shrink-0 text-2xs text-tr-muted">{task.board_name}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
            {addDependency.error && (
              <p className="mt-1 text-xs text-tr-danger">
                {addDependency.error instanceof Error
                  ? addDependency.error.message
                  : 'Không thêm được phụ thuộc'}
              </p>
            )}
          </div>
        )}

        {(card.dependencies?.predecessors.length ?? 0) === 0 ? (
          <p className="text-xs text-tr-muted">Việc này không phụ thuộc việc nào khác.</p>
        ) : (
          <ul className="space-y-1">
            {card.dependencies.predecessors.map((dep) => (
              <li
                key={dep.id}
                className="flex items-center gap-2 rounded-control bg-tr-hover px-2 py-1.5 text-sm"
              >
                {dep.is_done ? (
                  <Check size={13} className="shrink-0 text-tr-success" aria-hidden="true" />
                ) : (
                  <Link2 size={13} className="shrink-0 text-tr-muted" aria-hidden="true" />
                )}
                <span
                  className={`min-w-0 flex-1 truncate ${dep.is_done ? 'text-tr-muted line-through' : 'text-tr-text'}`}
                >
                  {dep.title}
                </span>
                {/* Vi phạm = việc trước chưa xong mà việc này đã tới ngày bắt đầu.
                    Đây mới là thứ đáng hiện; một danh sách phụ thuộc không có
                    cảnh báo thì chỉ là trang trí. */}
                {!!dep.violated && (
                  <span
                    title="Việc này đã tới ngày bắt đầu nhưng việc trước chưa xong"
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-tr-danger/15 px-2 py-0.5 text-2xs font-medium text-tr-danger"
                  >
                    <AlertTriangle size={11} aria-hidden="true" /> Đang bị kẹt
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeDependency.mutate(dep.id)}
                  aria-label={`Bỏ phụ thuộc: ${dep.title}`}
                  className={`shrink-0 rounded-control p-1 text-tr-muted transition hover:text-tr-danger ${focusRing}`}
                >
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {(card.dependencies?.successors.length ?? 0) > 0 && (
          <p className="mt-2 text-xs text-tr-muted">
            Đang chặn {card.dependencies.successors.length} việc khác:{' '}
            {card.dependencies.successors.map((s) => s.title).join(', ')}
          </p>
        )}
      </div>
    </div>
  );
}
