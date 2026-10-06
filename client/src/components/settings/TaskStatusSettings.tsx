/**
 * Danh sách trạng thái công việc cấu hình được (v67).
 *
 * Danh sách phẳng: tên, màu, thứ tự, ẩn/hiện. Mỗi trạng thái có một **ý nghĩa với
 * hệ thống** (chưa bắt đầu, đang thực hiện, chờ bên ngoài, bị chặn, chờ duyệt,
 * hoàn thành) — đó là thứ báo cáo, nhắc việc và nút hoàn thành đọc. Mỗi thao tác
 * lưu ngay: đây là danh sách nhỏ, không phải biểu mẫu dài.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus } from 'lucide-react';
import { CARD_STATUSES, type CardStatus, type TaskStatusDef } from '@workflow/contracts';
import { api } from '../../api/client';
import { Button, Field, FormError, Input, Panel, Select, Skeleton, focusRing } from '../common/ui';
import { Modal } from '../common/Modal';
import { usePermission } from '../../lib/permissions';
import { invalidateCardViews } from '../../lib/queryKeys';
import { STATUS_KIND_LABELS, TASK_STATUSES_KEY } from '../../lib/taskStatuses';
import { useUiStore } from '../../stores/uiStore';
import { TASK_FLOW_SETTINGS_KEY } from '../taskFlow/taskFlowApi';
import { CARD_STATUS_TONE } from '../tasks/CardStatusControl';

const MANAGE_KEY = [...TASK_STATUSES_KEY, 'manage'] as const;

export function TaskStatusSettings() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const canEdit = usePermission('settings.app', 'update');
  const [newLabel, setNewLabel] = useState('');
  const [newKind, setNewKind] = useState<CardStatus>('doing');
  const [hiding, setHiding] = useState<TaskStatusDef | null>(null);
  const [moveTo, setMoveTo] = useState('');

  const { data: list, isLoading } = useQuery({
    queryKey: MANAGE_KEY,
    queryFn: () => api.get<TaskStatusDef[]>('/api/task-statuses?all=1&usage=1'),
  });

  /* Đổi danh sách thì mọi ô chọn, chip, mẫu quy trình và thẻ (nếu ẩn kèm chuyển
     việc) đều phải đọc lại. */
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: TASK_STATUSES_KEY });
    void queryClient.invalidateQueries({ queryKey: TASK_FLOW_SETTINGS_KEY });
    invalidateCardViews(queryClient);
  };

  const create = useMutation({
    mutationFn: () =>
      api.post<TaskStatusDef>('/api/task-statuses', { label: newLabel.trim(), kind: newKind }),
    onSuccess: (created) => {
      setNewLabel('');
      refresh();
      pushToast(`Đã thêm trạng thái “${created.label}”`, 'success');
    },
  });
  const update = useMutation({
    mutationFn: (vars: { key: string; patch: Record<string, unknown> }) =>
      api.patch<TaskStatusDef>(`/api/task-statuses/${vars.key}`, vars.patch),
    onSuccess: () => {
      setHiding(null);
      refresh();
    },
  });
  const reorder = useMutation({
    mutationFn: (keys: string[]) => api.put('/api/task-statuses/order', { keys }),
    onSuccess: refresh,
  });

  if (isLoading || !list) return <Skeleton className="h-48 rounded-panel" />;

  const activeList = list.filter((status) => status.is_active);
  const move = (index: number, delta: number) => {
    const keys = list.map((status) => status.key);
    const target = index + delta;
    if (target < 0 || target >= keys.length) return;
    [keys[index], keys[target]] = [keys[target], keys[index]];
    reorder.mutate(keys);
  };
  const toggleActive = (status: TaskStatusDef) => {
    if (status.is_active && (status.usage ?? 0) > 0) {
      setHiding(status);
      setMoveTo(activeList.find((s) => s.key !== status.key && s.kind === status.kind)?.key ?? '');
      return;
    }
    update.mutate({ key: status.key, patch: { is_active: !status.is_active } });
  };

  return (
    <Panel title="Trạng thái công việc">
      <p className="mb-3 text-xs text-tr-muted">
        Danh sách trạng thái hiện ở ô Trạng thái của mọi công việc. Mỗi trạng thái chọn một{' '}
        <span className="font-medium text-tr-text">ý nghĩa</span> để hệ thống biết việc đã xong,
        đang chờ hay cần duyệt — báo cáo, nhắc việc và nút hoàn thành dựa vào đó. Việc mới vào trạng
        thái “Chưa bắt đầu” đầu tiên; nút hoàn thành nhanh đưa việc vào trạng thái “Hoàn thành” đầu
        tiên.
      </p>
      <FormError error={create.error ?? update.error ?? reorder.error} />

      <ul className="divide-y divide-tr-border rounded-control border border-tr-border">
        {list.map((status, index) => {
          const used = status.usage ?? 0;
          return (
            <li
              key={status.key}
              className={`flex flex-wrap items-center gap-2 px-2 py-2 ${status.is_active ? '' : 'opacity-60'}`}
            >
              <input
                type="color"
                value={status.color ?? '#94a3b8'}
                disabled={!canEdit}
                onChange={(e) =>
                  update.mutate({ key: status.key, patch: { color: e.target.value } })
                }
                aria-label={`Màu của ${status.label}`}
                title="Màu riêng (chấm màu cạnh tên)"
                className="h-7 w-7 shrink-0 cursor-pointer rounded border border-tr-border bg-transparent p-0.5"
              />
              <Input
                defaultValue={status.label}
                key={`${status.key}-${status.label}`}
                disabled={!canEdit}
                aria-label={`Tên trạng thái ${status.label}`}
                onBlur={(e) => {
                  const label = e.target.value.trim();
                  if (label && label !== status.label) {
                    update.mutate({ key: status.key, patch: { label } });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                className="min-w-40 flex-1"
              />
              <Select
                fullWidth={false}
                value={status.kind}
                disabled={!canEdit || used > 0}
                title={
                  used > 0
                    ? `Đang có ${used} việc — không đổi được ý nghĩa`
                    : 'Ý nghĩa với hệ thống'
                }
                aria-label={`Ý nghĩa của ${status.label}`}
                onChange={(e) =>
                  update.mutate({ key: status.key, patch: { kind: e.target.value } })
                }
                className={`max-w-64 ${CARD_STATUS_TONE[status.kind]}`}
              >
                {CARD_STATUSES.map((kind) => (
                  <option key={kind} value={kind}>
                    {STATUS_KIND_LABELS[kind]}
                  </option>
                ))}
              </Select>
              <span className="w-16 shrink-0 text-right text-xs text-tr-muted tabular-nums">
                {used} việc
              </span>
              {canEdit && (
                <span className="flex shrink-0 items-center">
                  <button
                    type="button"
                    disabled={index === 0 || reorder.isPending}
                    onClick={() => move(index, -1)}
                    aria-label={`Đưa ${status.label} lên`}
                    className={`rounded p-1 text-tr-muted hover:text-tr-text disabled:opacity-30 ${focusRing}`}
                  >
                    <ArrowUp size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={index === list.length - 1 || reorder.isPending}
                    onClick={() => move(index, 1)}
                    aria-label={`Đưa ${status.label} xuống`}
                    className={`rounded p-1 text-tr-muted hover:text-tr-text disabled:opacity-30 ${focusRing}`}
                  >
                    <ArrowDown size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(status)}
                    aria-label={
                      status.is_active ? `Ẩn ${status.label}` : `Hiện lại ${status.label}`
                    }
                    title={status.is_active ? 'Ẩn trạng thái' : 'Hiện lại'}
                    className={`rounded p-1 text-tr-muted hover:text-tr-text ${focusRing}`}
                  >
                    {status.is_active ? (
                      <EyeOff size={14} aria-hidden="true" />
                    ) : (
                      <Eye size={14} aria-hidden="true" />
                    )}
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {canEdit && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-tr-border pt-3">
          <Field label="Thêm trạng thái">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newLabel.trim()) create.mutate();
              }}
              placeholder="Khảo sát, Chờ khách ký…"
              className="min-w-48"
            />
          </Field>
          <Field label="Ý nghĩa">
            <Select
              fullWidth={false}
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as CardStatus)}
            >
              {CARD_STATUSES.map((kind) => (
                <option key={kind} value={kind}>
                  {STATUS_KIND_LABELS[kind]}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            variant="primary"
            disabled={!newLabel.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            <Plus size={15} aria-hidden="true" /> Thêm
          </Button>
        </div>
      )}

      <Modal
        open={hiding !== null}
        onClose={() => setHiding(null)}
        title={`Ẩn trạng thái “${hiding?.label ?? ''}”`}
        width="max-w-md"
        footer={
          <>
            <Button onClick={() => setHiding(null)}>Huỷ</Button>
            <Button
              variant="primary"
              disabled={!moveTo || update.isPending}
              onClick={() =>
                hiding &&
                update.mutate({
                  key: hiding.key,
                  patch: { is_active: false, move_to: moveTo },
                })
              }
            >
              Ẩn và chuyển việc
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-tr-subtle">
          Đang có {hiding?.usage ?? 0} việc ở trạng thái này. Chọn trạng thái để chuyển các việc đó
          sang; cột kanban đang gắn trạng thái này cũng đổi theo.
        </p>
        <Field label="Chuyển sang">
          <Select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            <option value="">— Chọn trạng thái —</option>
            {activeList
              .filter((status) => status.key !== hiding?.key)
              .map((status) => (
                <option key={status.key} value={status.key}>
                  {status.label}
                </option>
              ))}
          </Select>
        </Field>
      </Modal>
    </Panel>
  );
}
