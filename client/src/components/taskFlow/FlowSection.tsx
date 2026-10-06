import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Lock, Plus, Trash2 } from 'lucide-react';
import type { FlowStatus } from '@workflow/contracts';
import { Button, Input, Textarea, focusRing } from '../common/ui';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { t } from '../../i18n/vi';
import { statusKeyOf, useTaskStatuses } from '../../lib/taskStatuses';
import { useUiStore } from '../../stores/uiStore';
import type { CardDetail, CardFlow } from '../../types';
import {
  parseSteps,
  refreshAfterFlowChange,
  taskFlowApi,
  useTaskFlowSettings,
  type FlowMutationResult,
} from './taskFlowApi';

/**
 * Mục "Quy trình" trong hộp chi tiết công việc (v66).
 *
 * Quy trình của trạng thái hiện tại nằm trên cùng, làm lần lượt: chỉ bước đầu
 * tiên chưa xong tick được, chỉ bước xong sau cùng bỏ tick được — đúng luật máy
 * chủ giữ. Quy trình của các trạng thái khác (đã qua hoặc chuẩn bị trước) thu gọn
 * bên dưới để xem lại.
 */
export function FlowSection({ card }: { card: CardDetail }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { settings } = useTaskFlowSettings();
  const statuses = useTaskStatuses();
  const statusKey = statusKeyOf(card);
  const flows = card.flows ?? [];
  const current = flows.find((flow) => flow.status === statusKey) ?? null;
  const others = flows.filter((flow) => flow !== current);

  const onDone = (result: FlowMutationResult) => {
    refreshAfterFlowChange(queryClient, card.id);
    if (result.advanced_to) {
      pushToast(
        `Quy trình xong — đã chuyển sang “${statuses.label(result.advanced_to)}”`,
        'success'
      );
    }
  };

  return (
    <div className="space-y-3">
      {current ? (
        <FlowSteps flow={current} onDone={onDone} />
      ) : statuses.kind(statusKey) !== 'done' ? (
        <CreateFlow
          cardId={card.id}
          status={statusKey}
          templateSteps={settings?.templates[statusKey]?.steps ?? []}
          onDone={onDone}
        />
      ) : (
        <p className="text-sm text-tr-muted">Công việc đã hoàn thành.</p>
      )}

      {others.length > 0 && (
        <details className="rounded-control border border-tr-border px-3 py-2">
          <summary className={`cursor-pointer text-xs font-medium text-tr-subtle ${focusRing}`}>
            Quy trình của trạng thái khác ({others.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {others.map((flow) => (
              <li key={flow.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-tr-text">{statuses.label(flow.status)}</span>
                <span className="text-xs text-tr-muted">{flowSummary(flow)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function flowSummary(flow: CardFlow): string {
  const done = flow.steps.filter((step) => step.done_at).length;
  const total = flow.steps.length;
  if (flow.completed_at) return `Đã xong ${total} bước`;
  if (flow.skipped_at) return `Bỏ qua ở bước ${done}/${total}`;
  return `${done}/${total} bước`;
}

function FlowSteps({
  flow,
  onDone,
}: {
  flow: CardFlow;
  onDone: (result: FlowMutationResult) => void;
}) {
  const statuses = useTaskStatuses();
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const tick = useMutation({
    mutationFn: (vars: { id: number; done: boolean }) => taskFlowApi.tick(vars.id, vars.done),
    onSuccess: onDone,
  });
  const add = useMutation({
    mutationFn: (content: string) => taskFlowApi.addStep(flow.id, content),
    onSuccess: onDone,
  });
  const removeStep = useMutation({
    mutationFn: (id: number) => taskFlowApi.removeStep(id),
    onSuccess: onDone,
  });
  const removeFlow = useMutation({
    mutationFn: () => taskFlowApi.remove(flow.id),
    onSuccess: (result) => {
      setConfirmRemove(false);
      onDone(result);
    },
  });

  const done = flow.steps.filter((step) => step.done_at).length;
  const total = flow.steps.length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const firstOpen = flow.steps.find((step) => !step.done_at)?.id;
  const lastDone = [...flow.steps].reverse().find((step) => step.done_at)?.id;
  const busy = tick.isPending;

  const submit = () => {
    const content = draft.trim();
    if (content) add.mutate(content);
    setDraft('');
    setAdding(false);
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="w-8 shrink-0 text-xs text-tr-muted tabular-nums">{percent}%</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-tr-hover-strong">
          <div
            className={`h-full rounded-full transition-all ${percent === 100 ? 'bg-tr-success' : 'bg-tr-primary'}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="shrink-0 text-xs text-tr-muted">
          {done}/{total}
        </span>
      </div>

      <ol className="space-y-1">
        {flow.steps.map((step, index) => {
          const isDone = Boolean(step.done_at);
          const canToggle = isDone ? step.id === lastDone : step.id === firstOpen;
          return (
            <li
              key={step.id}
              className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-tr-hover"
            >
              <span className="w-5 shrink-0 text-right text-xs text-tr-muted tabular-nums">
                {index + 1}.
              </span>
              {canToggle ? (
                <input
                  type="checkbox"
                  checked={isDone}
                  disabled={busy}
                  aria-label={isDone ? `Bỏ đánh dấu: ${step.content}` : `Xong: ${step.content}`}
                  onChange={(e) => tick.mutate({ id: step.id, done: e.target.checked })}
                  className="h-4 w-4 rounded border-tr-border text-tr-primary"
                />
              ) : isDone ? (
                <Check size={16} className="text-tr-success" aria-label="Đã xong" />
              ) : (
                <Lock size={14} className="mx-px text-tr-muted" aria-label="Chờ xong bước trước" />
              )}
              <span
                className={`flex-1 text-sm ${isDone ? 'text-tr-muted line-through' : canToggle ? 'font-medium text-tr-text' : 'text-tr-subtle'}`}
              >
                {step.content}
              </span>
              {!isDone && (
                <button
                  type="button"
                  onClick={() => removeStep.mutate(step.id)}
                  aria-label={`Xóa bước: ${step.content}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-tr-muted opacity-100 transition hover:bg-tr-hover hover:text-tr-danger hoverable:opacity-0 hoverable:group-hover:opacity-100 fine:h-7 fine:w-7"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {adding ? (
          <div className="flex flex-1 gap-1.5">
            <Input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') setAdding(false);
              }}
              placeholder="Tên bước mới"
            />
            <Button variant="primary" onClick={submit}>
              {t.common.add}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={`inline-flex items-center gap-1 rounded px-1 py-1 text-sm text-tr-subtle hover:text-tr-text ${focusRing}`}
          >
            <Plus size={14} /> Thêm bước
          </button>
        )}
        <button
          type="button"
          onClick={() => setConfirmRemove(true)}
          className={`rounded px-1 py-1 text-xs text-tr-muted hover:text-tr-danger ${focusRing}`}
        >
          Bỏ quy trình
        </button>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        title="Bỏ quy trình"
        message={`Xóa quy trình “${statuses.label(flow.status)}” cùng ${total} bước của nó? Công việc vẫn giữ nguyên trạng thái.`}
        confirmLabel="Bỏ quy trình"
        onConfirm={() => removeFlow.mutate()}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}

/**
 * Tạo quy trình: dùng mẫu của trạng thái, hoặc tự nhập (mỗi dòng một bước, điền
 * sẵn mẫu để sửa). Dùng chung cho hộp chi tiết và hộp hỏi khi vào trạng thái.
 */
export function CreateFlow({
  cardId,
  status,
  templateSteps,
  onDone,
  onSkip,
}: {
  cardId: number;
  status: FlowStatus;
  templateSteps: string[];
  onDone: (result: FlowMutationResult) => void;
  /** Có thì hiện nút "Bỏ qua" (hộp hỏi); không có thì là nút trong hộp chi tiết. */
  onSkip?: () => void;
}) {
  const statuses = useTaskStatuses();
  const [custom, setCustom] = useState(onSkip !== undefined && templateSteps.length === 0);
  const [text, setText] = useState(templateSteps.join('\n'));
  const create = useMutation({
    mutationFn: (steps?: string[]) => taskFlowApi.create(cardId, status, steps),
    onSuccess: onDone,
  });
  const steps = parseSteps(text);

  if (custom) {
    return (
      <div className="space-y-2">
        <Textarea
          autoFocus
          rows={Math.min(8, Math.max(3, steps.length + 1))}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Mỗi dòng một bước, theo thứ tự làm\nVí dụ:\nKhảo sát\nCấu hình\nKiểm thử'}
          aria-label="Các bước của quy trình"
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={() => (onSkip ? onSkip() : setCustom(false))}>
            {onSkip ? 'Bỏ qua' : t.common.cancel}
          </Button>
          <Button
            variant="primary"
            disabled={steps.length === 0 || create.isPending}
            onClick={() => create.mutate(steps)}
          >
            Tạo quy trình ({steps.length} bước)
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {templateSteps.length > 0 && (
        <ol className="list-inside list-decimal rounded-control bg-tr-hover px-3 py-2 text-sm text-tr-subtle">
          {templateSteps.map((step, index) => (
            <li key={`${index}-${step}`}>{step}</li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {onSkip && <Button onClick={onSkip}>Bỏ qua</Button>}
        <Button onClick={() => setCustom(true)}>Tự tạo</Button>
        {templateSteps.length > 0 ? (
          <Button
            variant="primary"
            disabled={create.isPending}
            onClick={() => create.mutate(undefined)}
          >
            Dùng mẫu ({templateSteps.length} bước)
          </Button>
        ) : (
          !onSkip && (
            <span className="text-xs text-tr-muted">
              Trạng thái “{statuses.label(status)}” chưa có mẫu — tự tạo các bước.
            </span>
          )
        )}
      </div>
    </div>
  );
}
