/**
 * Cài đặt Quy trình theo trạng thái của công việc (v66), kèm danh sách trạng thái
 * cấu hình được (v67) ở trên cùng.
 *
 * Công tắc bật/tắt lưu ngay (đó là một quyết định, không phải bản nháp). Mẫu của
 * từng trạng thái thì sửa trên bản nháp rồi lưu một lần — cùng lý do với
 * HandoverSettings: lưu sau mỗi ký tự sẽ biến mẫu đang sửa dở thành mẫu đang dùng.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import {
  type FlowAskMode,
  type FlowStatus,
  type FlowTemplate,
  type TaskFlowSettings as Settings,
} from '@workflow/contracts';
import { api } from '../../api/client';
import { Button, Field, FormError, Input, Panel, Select, Skeleton, focusRing } from '../common/ui';
import { usePermission } from '../../lib/permissions';
import { useTaskStatuses } from '../../lib/taskStatuses';
import { useUiStore } from '../../stores/uiStore';
import { TASK_FLOW_SETTINGS_KEY, useTaskFlowSettings } from '../taskFlow/taskFlowApi';
import { SaveBar, Toggle } from './SettingsKit';
import { useSettingsDirty } from './settingsDirty';

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
  const statuses = useTaskStatuses();
  /* v67: mọi trạng thái đang dùng, trừ ý nghĩa Hoàn thành, có một mẫu. */
  const flowStatuses = statuses.active.filter((status) => status.kind !== 'done');

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

  const dirtyAll = Boolean(
    draft && loaded && JSON.stringify(draft) !== JSON.stringify(loaded.templates)
  );
  useSettingsDirty('task-flow', dirtyAll, 'mẫu quy trình công việc', () =>
    draft ? save.mutateAsync({ templates: draft }) : Promise.resolve()
  );

  if (!settings || !draft || !loaded) return <Skeleton className="h-64 rounded-panel" />;

  /* Trạng thái đang chọn có thể vừa bị ẩn, hoặc vừa tạo mà mẫu chưa tải lại. */
  const activeKey = draft[active]
    ? active
    : (flowStatuses.find((status) => draft[status.key])?.key ?? active);
  const template: FlowTemplate = draft[activeKey] ?? {
    steps: [],
    next_status: 'done',
    ask: 'never',
  };
  const patch = (next: Partial<FlowTemplate>) =>
    setDraft({ ...draft, [activeKey]: { ...template, ...next } });
  const setSteps = (steps: string[]) => patch({ steps });
  const dirty = JSON.stringify(draft) !== JSON.stringify(loaded.templates);
  const hasBlank = Object.values(draft).some((item) => item.steps.some((step) => !step.trim()));

  return (
    <div className="space-y-4">
      <Panel title="Quy trình cho công việc">
        <FormError error={save.error} />
        <Toggle
          checked={settings.enabled}
          disabled={!canEdit || save.isPending}
          onChange={(value) => save.mutate({ enabled: value })}
          label="Bật quy trình cho công việc"
          description="Mỗi trạng thái có thể có các bước làm lần lượt; xong bước cuối thì công việc tự chuyển trạng thái. Tắt thì công việc chạy như trước, các quy trình đã tạo vẫn được giữ. Công tắc này lưu ngay."
        />
      </Panel>

      <Panel title="Mẫu quy trình theo trạng thái">
        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Chọn trạng thái">
          {flowStatuses.map((status) => (
            <button
              key={status.key}
              type="button"
              aria-pressed={status.key === activeKey}
              onClick={() => setActive(status.key)}
              className={`rounded-control border px-3 py-1.5 text-sm ${focusRing} ${
                status.key === activeKey
                  ? 'border-tr-primary bg-tr-primary/10 font-medium text-tr-primary'
                  : 'border-tr-border text-tr-subtle hover:bg-tr-hover'
              }`}
            >
              {status.label}
              {(draft[status.key]?.steps.length ?? 0) > 0 && (
                <span className="ml-1.5 text-xs text-tr-muted">
                  {draft[status.key]?.steps.length}
                </span>
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
            hint="Thẻ trên kanban sang cột gắn trạng thái đó, nếu luồng việc có cột như vậy."
          >
            <Select
              value={template.next_status}
              disabled={!canEdit}
              onChange={(e) => patch({ next_status: e.target.value })}
            >
              {statuses.active
                .filter((status) => status.key !== activeKey)
                .map((status) => (
                  <option key={status.key} value={status.key}>
                    {status.label}
                  </option>
                ))}
            </Select>
          </Field>
        </div>

        <p className="mb-2 mt-4 text-sm font-medium text-tr-text">
          Các bước mẫu của “{statuses.label(activeKey)}”
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
          <div className="mt-3 border-t border-tr-border pt-3">
            <Button onClick={() => setSteps([...template.steps, ''])}>
              <Plus size={15} aria-hidden="true" /> Thêm bước
            </Button>
          </div>
        )}
        <SaveBar
          dirty={dirty}
          saving={save.isPending}
          disabled={hasBlank}
          problem={hasBlank ? 'Còn bước để trống — điền tên hoặc xoá bước đó.' : null}
          onSave={() => save.mutate({ templates: draft })}
          onReset={() => setDraft(structuredClone(loaded.templates))}
        />
        <p className="mt-3 text-xs text-tr-muted">
          Đổi mẫu chỉ ảnh hưởng tới quy trình tạo sau này. Quy trình đã có trong công việc giữ
          nguyên các bước của nó.
        </p>
      </Panel>
    </div>
  );
}
