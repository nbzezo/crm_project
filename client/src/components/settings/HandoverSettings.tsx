/**
 * Cấu hình quy trình bàn giao Sales → Delivery (v24).
 *
 * Sửa trên một bản nháp cục bộ rồi lưu một lần, khác với các màn hình lưu-ngay
 * khác trong ứng dụng: người dùng thường sắp lại vài mục cùng lúc, và lưu sau
 * mỗi ký tự sẽ khiến một checklist đang sửa dở trở thành checklist đang chạy.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { Button, Field, FormError, Input, Panel, Select, IconButton, Skeleton } from '../common/ui';
import { useUiStore } from '../../stores/uiStore';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { ReorderButtons, SaveBar, moveItem } from './SettingsKit';
import { useSettingsDirty } from './settingsDirty';
import type { HandoverSettingsData, HandoverTemplateItem } from '../../types';

/** Bộ mẫu này là chỗ rơi về của mọi cơ hội nên không cho xoá. */
const FALLBACK_KEY = 'default';

export function HandoverSettings() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);

  const [draft, setDraft] = useState<Record<string, HandoverTemplateItem[]> | null>(null);
  const [slaDays, setSlaDays] = useState(7);
  const [activeKey, setActiveKey] = useState(FALLBACK_KEY);
  const [newKey, setNewKey] = useState('');
  const [confirmDeleteSet, setConfirmDeleteSet] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'handover'],
    queryFn: () => api.get<HandoverSettingsData>('/api/settings/handover'),
  });

  /* Nạp bản nháp ngay trong lúc render khi dữ liệu máy chủ đổi — đặt trong
     useEffect sẽ có một lần render với bản nháp rỗng, làm biểu mẫu nháy. */
  const [loaded, setLoaded] = useState<HandoverSettingsData | null>(null);
  if (data && data !== loaded) {
    setLoaded(data);
    setDraft(structuredClone(data.templates));
    setSlaDays(data.slaDays);
    if (!data.templates[activeKey]) setActiveKey(FALLBACK_KEY);
  }

  const save = useMutation({
    mutationFn: () =>
      api.put<HandoverSettingsData>('/api/settings/handover', {
        templates: draft,
        sla_days: slaDays,
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(['settings', 'handover'], next);
      setLoaded(next);
      pushToast('Đã lưu cấu hình bàn giao', 'success');
    },
  });

  const anyDirty = Boolean(
    loaded &&
    draft &&
    (JSON.stringify(draft) !== JSON.stringify(loaded.templates) || slaDays !== loaded.slaDays)
  );
  useSettingsDirty('handover', anyDirty, 'cấu hình bàn giao', () => save.mutateAsync());

  if (isLoading || !draft) return <Skeleton className="h-64 rounded-panel" />;

  const items = draft[activeKey] ?? [];
  const keys = Object.keys(draft);

  const patchItems = (next: HandoverTemplateItem[]) => setDraft({ ...draft, [activeKey]: next });

  const dirty = loaded ? JSON.stringify(draft) !== JSON.stringify(loaded.templates) : false;
  const slaDirty = loaded ? slaDays !== loaded.slaDays : false;
  const requiredCount = items.filter((item) => item.required).length;
  const hasBlank = Object.values(draft).some((list) => list.some((item) => !item.content.trim()));

  return (
    <div className="space-y-4">
      <Panel title="Thời hạn bàn giao">
        <Field
          label="SLA (ngày)"
          hint="Cơ hội đã thắng quá số ngày này mà hồ sơ chưa đủ sẽ bị automation cảnh báo. Đếm từ ngày chốt thương mại."
        >
          <Input
            type="number"
            min={1}
            max={365}
            value={slaDays}
            onChange={(event) =>
              setSlaDays(Math.max(1, Math.min(365, Number(event.target.value) || 1)))
            }
            className="max-w-32"
          />
        </Field>
      </Panel>

      <Panel title="Bộ mẫu checklist">
        <FormError error={save.error} />

        <div className="mb-3 flex flex-wrap items-end gap-2">
          <Field label="Bộ mẫu theo loại giải pháp">
            <Select
              value={activeKey}
              onChange={(event) => setActiveKey(event.target.value)}
              className="min-w-52"
            >
              {keys.map((key) => (
                <option key={key} value={key}>
                  {key === FALLBACK_KEY ? 'default (mặc định)' : key}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex items-end gap-2">
            <Field label="Thêm bộ mẫu mới">
              <Input
                value={newKey}
                onChange={(event) => setNewKey(event.target.value)}
                placeholder="OmiCX, SIP Trunk…"
                className="max-w-44"
              />
            </Field>
            <Button
              disabled={!newKey.trim() || Boolean(draft[newKey.trim()])}
              onClick={() => {
                const key = newKey.trim();
                /* Bộ mới bắt đầu từ bản sao của 'default' thay vì rỗng: hầu hết
                   loại giải pháp chỉ khác vài mục so với quy trình chung. */
                setDraft({ ...draft, [key]: structuredClone(draft[FALLBACK_KEY] ?? []) });
                setActiveKey(key);
                setNewKey('');
              }}
            >
              <Plus size={15} aria-hidden="true" /> Thêm
            </Button>
            {activeKey !== FALLBACK_KEY && (
              <Button
                variant="ghost"
                className="text-tr-danger"
                onClick={() => setConfirmDeleteSet(true)}
              >
                <Trash2 size={15} aria-hidden="true" /> Xóa bộ này
              </Button>
            )}
          </div>
        </div>

        <p className="mb-2 text-xs text-tr-muted">
          {items.length} mục · {requiredCount} bắt buộc. Chỉ mục bắt buộc mới quyết định một cơ hội
          đã đủ hồ sơ bàn giao hay chưa.
        </p>

        <ul className="space-y-1.5">
          {items.map((item, index) => (
            <li key={index} className="flex items-center gap-2">
              <ReorderButtons
                label={item.content || `mục ${index + 1}`}
                canUp={index > 0}
                canDown={index < items.length - 1}
                onMove={(delta) => patchItems(moveItem(items, index, delta))}
              />
              <Input
                value={item.content}
                onChange={(event) => {
                  const next = [...items];
                  next[index] = { ...item, content: event.target.value };
                  patchItems(next);
                }}
                aria-label={`Nội dung mục ${index + 1}`}
              />
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-tr-subtle">
                <input
                  type="checkbox"
                  checked={item.required}
                  onChange={(event) => {
                    const next = [...items];
                    next[index] = { ...item, required: event.target.checked };
                    patchItems(next);
                  }}
                  className="h-4 w-4 rounded border-tr-border"
                />
                Bắt buộc
              </label>
              <IconButton
                label={`Xóa mục ${index + 1}`}
                tone="danger"
                onClick={() => patchItems(items.filter((_, i) => i !== index))}
              >
                <Trash2 size={14} aria-hidden="true" />
              </IconButton>
            </li>
          ))}
        </ul>

        <div className="mt-3 border-t border-tr-border pt-3">
          <Button onClick={() => patchItems([...items, { content: '', required: true }])}>
            <Plus size={15} aria-hidden="true" /> Thêm mục
          </Button>
        </div>

        <p className="mt-3 text-xs text-tr-muted">
          Đổi bộ mẫu chỉ ảnh hưởng tới checklist tạo mới sau này. Các cơ hội đã có checklist giữ
          nguyên nội dung tại thời điểm chúng được tạo.
        </p>
      </Panel>

      <SaveBar
        dirty={dirty || slaDirty}
        saving={save.isPending}
        disabled={hasBlank || (draft[FALLBACK_KEY] ?? []).length === 0}
        problem={
          hasBlank
            ? 'Còn mục để trống — điền nội dung hoặc xoá mục đó.'
            : (draft[FALLBACK_KEY] ?? []).length === 0
              ? 'Bộ mẫu mặc định không được để rỗng.'
              : null
        }
        onSave={() => save.mutate()}
        onReset={() => {
          if (!loaded) return;
          setDraft(structuredClone(loaded.templates));
          setSlaDays(loaded.slaDays);
          if (!loaded.templates[activeKey]) setActiveKey(FALLBACK_KEY);
        }}
      />

      <ConfirmDialog
        open={confirmDeleteSet}
        title={`Xoá bộ mẫu “${activeKey}”?`}
        message="Cơ hội thuộc loại giải pháp này sẽ dùng bộ mặc định cho checklist tạo sau này. Checklist đã có giữ nguyên. Thay đổi chỉ áp dụng khi bạn bấm Lưu thay đổi."
        confirmLabel="Xoá bộ mẫu"
        onConfirm={() => {
          const next = { ...draft };
          delete next[activeKey];
          setDraft(next);
          setActiveKey(FALLBACK_KEY);
          setConfirmDeleteSet(false);
        }}
        onCancel={() => setConfirmDeleteSet(false)}
      />
    </div>
  );
}
