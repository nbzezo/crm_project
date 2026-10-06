/**
 * Cài đặt Quy trình theo trạng thái của công việc (v66).
 *
 * Công tắc bật/tắt lưu ngay (đó là một quyết định, không phải bản nháp). Mẫu của
 * từng trạng thái thì sửa trên bản nháp rồi lưu một lần — cùng lý do với
 * HandoverSettings: lưu sau mỗi ký tự sẽ biến mẫu đang sửa dở thành mẫu đang dùng.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import {
  CARD_STATUSES,
  FLOW_STATUSES,
  type FlowAskMode,
  type FlowStatus,
  type FlowTemplate,
  type TaskFlowSettings as Settings,
} from '@workflow/contracts';
import { api } from '../../api/client';
import { Button, Field, FormError, Input, Panel, Select, Skeleton, focusRing } from '../common/ui';
import { t } from '../../i18n/vi';
import { usePermission } from '../../lib/permissions';
import { useUiStore } from '../../stores/uiStore';
import { TASK_FLOW_SETTINGS_KEY, useTaskFlowSettings } from '../taskFlow/taskFlowApi';

const ASK_LABELS: Record<FlowAskMode, string> = {
  always: 'Luôn hỏi',
  auto: 'Tự áp mẫu',
  never: 'Không hỏi',
};

const ASK_HINTS: Record<FlowAskMode, string> = {
  always: 'Khi công việc vào trạng thái này, hỏi: Dùng mẫu · Tự tạo · Bỏ qua.',
  auto: 'Tự tạo quy trình từ mẫu, không hỏi. Vẫn sửa các bước trong công việc được.',
  never: 'Không làm gì. Vẫn thêm quy trình tay trong công việc được.',
};

export function TaskFlowSettings() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const canEdit = usePermission('settings.app', 'update');
  const { settings } = useTaskFlowSettings();

  const [draft, setDraft] = useState<Record<FlowStatus, FlowTemplate> | null>(null);
  const [active, setActive] = useState<FlowStatus>('doing');
  const [loaded, setLoaded] = useState<Settings | null>(null);
  if (settings && settings !== loaded) {
    setLoaded(settings);
    setDraft(structuredClone(settings.templates));
  }

  const save = useMutation({
    mutationFn: (body: Partial<Settings>) => api.put<Settings>('/api/task-flows/settings', body),
    onSuccess: (next, body) => {
      queryClient.setQueryData(TASK_FLOW_SETTINGS_KEY, next);
      pushToast(
        body.enabled === undefined
          ? 'Đã lưu mẫu quy trình'
          : body.enabled
            ? 'Đã bật Quy trình cho công việc'
            : 'Đã tắt Quy trình — công việc chạy như trước',
        'success'
      );
    },
  });

  if (!settings || !draft || !loaded) return <Skeleton className="h-64 rounded-panel" />;

  const template = draft[active];
  const patch = (next: Partial<FlowTemplate>) =>
    setDraft({ ...draft, [active]: { ...template, ...next } });
  const setSteps = (steps: string[]) => patch({ steps });
  const dirty = JSON.stringify(draft) !== JSON.stringify(loaded.templates);
  const hasBlank = FLOW_STATUSES.some((status) => draft[status].steps.some((step) => !step.trim()));

  return (
    <div className="space-y-4">
      <Panel title="Quy trình cho công việc">
        <FormError error={save.error} />
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={settings.enabled}
            disabled={!canEdit || save.isPending}
            onChange={(e) => save.mutate({ enabled: e.target.checked })}
            className="mt-0.5 h-5 w-5 rounded border-tr-border"
          />
          <span>
            <span className="block text-sm font-medium text-tr-text">
              Bật quy trình cho công việc
            </span>
            <span className="block text-xs text-tr-muted">
              Mỗi trạng thái của công việc có thể có một quy trình gồm các bước làm lần lượt. Đổi
              trạng thái khi quy trình chưa xong thì phải xác nhận bỏ qua; xong bước cuối thì công
              việc tự chuyển trạng thái. Tắt thì công việc chạy như trước, các quy trình đã tạo vẫn
              được giữ.
            </span>
          </span>
        </label>
      </Panel>

      <Panel title="Mẫu theo trạng thái">
        <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Trạng thái">
          {FLOW_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              role="tab"
              aria-selected={status === active}
              onClick={() => setActive(status)}
              className={`rounded-control border px-3 py-1.5 text-sm ${focusRing} ${
                status === active
                  ? 'border-tr-primary bg-tr-primary/10 font-medium text-tr-primary'
                  : 'border-tr-border text-tr-subtle hover:bg-tr-hover'
              }`}
            >
              {t.cardStatus[status]}
              {draft[status].steps.length > 0 && (
                <span className="ml-1.5 text-xs text-tr-muted">{draft[status].steps.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Khi công việc vào trạng thái này" hint={ASK_HINTS[template.ask]}>
            <Select
              value={template.ask}
              disabled={!canEdit}
              onChange={(e) => patch({ ask: e.target.value as FlowAskMode })}
            >
              {(Object.keys(ASK_LABELS) as FlowAskMode[]).map((mode) => (
                <option key={mode} value={mode}>
                  {ASK_LABELS[mode]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Xong bước cuối thì chuyển sang"
            hint="Luồng việc không có cột cho trạng thái này thì chuyển thẳng sang Hoàn thành."
          >
            <Select
              value={template.next_status}
              disabled={!canEdit}
              onChange={(e) =>
                patch({ next_status: e.target.value as FlowTemplate['next_status'] })
              }
            >
              {CARD_STATUSES.filter((status) => status !== active).map((status) => (
                <option key={status} value={status}>
                  {t.cardStatus[status]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <p className="mb-2 mt-4 text-sm font-medium text-tr-text">
          Các bước mẫu của “{t.cardStatus[active]}”
        </p>
        {template.steps.length === 0 && (
          <p className="mb-2 text-xs text-tr-muted">
            Chưa có bước nào — khi hỏi, người dùng chỉ có lựa chọn Tự tạo hoặc Bỏ qua.
          </p>
        )}
        <ol className="space-y-1.5">
          {template.steps.map((step, index) => (
            <li key={index} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-right text-xs text-tr-muted tabular-nums">
                {index + 1}.
              </span>
              <Input
                value={step}
                disabled={!canEdit}
                // Ô vừa thêm (trống, cuối danh sách) nhận con trỏ ngay để gõ tiếp.
                autoFocus={index === template.steps.length - 1 && step === ''}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && step.trim()) setSteps([...template.steps, '']);
                }}
                onChange={(e) => {
                  const next = [...template.steps];
                  next[index] = e.target.value;
                  setSteps(next);
                }}
                aria-label={`Bước ${index + 1}`}
              />
              <button
                type="button"
                disabled={!canEdit || index === 0}
                onClick={() => {
                  const next = [...template.steps];
                  [next[index - 1], next[index]] = [next[index], next[index - 1]];
                  setSteps(next);
                }}
                aria-label={`Đưa bước ${index + 1} lên`}
                className={`shrink-0 rounded p-1 text-tr-muted hover:text-tr-text disabled:opacity-30 ${focusRing}`}
              >
                <ArrowUp size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={!canEdit || index === template.steps.length - 1}
                onClick={() => {
                  const next = [...template.steps];
                  [next[index + 1], next[index]] = [next[index], next[index + 1]];
                  setSteps(next);
                }}
                aria-label={`Đưa bước ${index + 1} xuống`}
                className={`shrink-0 rounded p-1 text-tr-muted hover:text-tr-text disabled:opacity-30 ${focusRing}`}
              >
                <ArrowDown size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => setSteps(template.steps.filter((_, i) => i !== index))}
                aria-label={`Xóa bước ${index + 1}`}
                className={`shrink-0 rounded p-1 text-tr-muted hover:text-tr-danger ${focusRing}`}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>

        {canEdit && (
          <div className="mt-3 flex items-center gap-2 border-t border-tr-border pt-3">
            <Button onClick={() => setSteps([...template.steps, ''])}>
              <Plus size={15} aria-hidden="true" /> Thêm bước
            </Button>
            <span className="flex-1" />
            <Button
              variant="primary"
              disabled={save.isPending || !dirty || hasBlank}
              onClick={() => save.mutate({ templates: draft })}
            >
              {save.isPending ? 'Đang lưu…' : 'Lưu mẫu'}
            </Button>
          </div>
        )}
        {hasBlank && (
          <p className="mt-2 text-xs text-tr-danger">
            Còn bước để trống — điền tên hoặc xóa bước đó trước khi lưu.
          </p>
        )}
        <p className="mt-3 text-xs text-tr-muted">
          Đổi mẫu chỉ ảnh hưởng tới quy trình tạo sau này. Quy trình đã có trong công việc giữ
          nguyên các bước của nó.
        </p>
      </Panel>
    </div>
  );
}
