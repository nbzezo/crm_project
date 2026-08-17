/**
 * Cấu hình lớp Delivery (v26): ngưỡng phân loại A/B và bộ mẫu danh sách.
 *
 * Các ngưỡng mặc định là **điểm xuất phát, không phải chuẩn** — chúng chỉ trở
 * nên đúng sau khi được hiệu chỉnh theo vài dự án đã chạy thật. Màn hình này tồn
 * tại chính vì thế, nên nó nói thẳng điều đó ra thay vì để người dùng tưởng các
 * con số kia là kết luận của ai đó.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { CARD_STATUSES } from '@workflow/contracts';
import {
  Button,
  Field,
  FormError,
  Input,
  MoneyInput,
  Panel,
  Select,
  Skeleton,
  focusRing,
} from '../common/ui';
import { t } from '../../i18n/vi';
import { useUiStore } from '../../stores/uiStore';
import type { CardStatus, DeliverySettingsData } from '../../types';

type Templates = DeliverySettingsData['boardTemplates'];
type Thresholds = DeliverySettingsData['classification'];

/** Hai bộ này tương ứng Mô hình A và B nên máy chủ từ chối lưu nếu thiếu. */
const REQUIRED_KEYS = ['large', 'small'];

const KEY_LABELS: Record<string, string> = {
  large: 'large — dự án lớn (Mô hình A)',
  small: 'small — dự án nhỏ (Mô hình B)',
};

export function DeliverySettings() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);

  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [templates, setTemplates] = useState<Templates | null>(null);
  const [activeKey, setActiveKey] = useState('large');

  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'delivery'],
    queryFn: () => api.get<DeliverySettingsData>('/api/settings/delivery'),
  });

  const [loaded, setLoaded] = useState<DeliverySettingsData | null>(null);
  if (data && data !== loaded) {
    setLoaded(data);
    setThresholds({ ...data.classification });
    setTemplates(structuredClone(data.boardTemplates));
    if (!data.boardTemplates[activeKey]) setActiveKey('large');
  }

  const save = useMutation({
    mutationFn: () =>
      api.put<DeliverySettingsData>('/api/settings/delivery', {
        classification: thresholds,
        board_templates: templates,
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(['settings', 'delivery'], next);
      setLoaded(next);
      // Phân loại của mọi dự án đọc từ ngưỡng này nên phải nạp lại.
      queryClient.invalidateQueries({ queryKey: ['project'] });
      pushToast('Đã lưu cấu hình triển khai', 'success');
    },
  });

  if (isLoading || !thresholds || !templates) return <Skeleton className="h-64 rounded-panel" />;

  const items = templates[activeKey] ?? [];
  const patchItems = (next: typeof items) => setTemplates({ ...templates, [activeKey]: next });
  const dirty = loaded
    ? JSON.stringify({ thresholds, templates }) !==
      JSON.stringify({ thresholds: loaded.classification, templates: loaded.boardTemplates })
    : false;
  const invalid =
    items.some((item) => !item.name.trim()) ||
    REQUIRED_KEYS.some((key) => (templates[key] ?? []).length === 0);

  return (
    <div className="space-y-4">
      <Panel title="Ngưỡng phân loại dự án">
        <p className="mb-3 text-xs text-tr-muted">
          Vượt <b>bất kỳ</b> ngưỡng nào là đủ để hệ thống đề xuất Mô hình A. Người có thẩm quyền vẫn
          chốt khác được, kèm lý do. <b>Các số mặc định là điểm xuất phát, không phải chuẩn</b> —
          hãy hiệu chỉnh sau vài dự án thật.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Giá trị hợp đồng từ">
            <MoneyInput
              value={thresholds.contract_value_vnd}
              onChange={(value) => setThresholds({ ...thresholds, contract_value_vnd: value })}
            />
          </Field>
          <Field label="Thời lượng dự kiến từ (ngày)">
            <Input
              type="number"
              min={1}
              max={3650}
              value={thresholds.duration_days}
              onChange={(event) =>
                setThresholds({
                  ...thresholds,
                  duration_days: Math.max(1, Number(event.target.value) || 1),
                })
              }
            />
          </Field>
          <Field label="Số giai đoạn từ">
            <Input
              type="number"
              min={1}
              max={100}
              value={thresholds.phase_count}
              onChange={(event) =>
                setThresholds({
                  ...thresholds,
                  phase_count: Math.max(1, Number(event.target.value) || 1),
                })
              }
            />
          </Field>
          <Field label="Số nhóm tham gia từ">
            <Input
              type="number"
              min={1}
              max={100}
              value={thresholds.team_count}
              onChange={(event) =>
                setThresholds({
                  ...thresholds,
                  team_count: Math.max(1, Number(event.target.value) || 1),
                })
              }
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Bộ mẫu danh sách cho bảng triển khai">
        <FormError error={save.error} />

        <div className="mb-3">
          <Field
            label="Bộ mẫu"
            hint="Cột có ánh xạ trạng thái thì kéo thẻ vào đó sẽ đổi trạng thái công việc."
          >
            <Select
              value={activeKey}
              onChange={(event) => setActiveKey(event.target.value)}
              className="max-w-72"
            >
              {Object.keys(templates).map((key) => (
                <option key={key} value={key}>
                  {KEY_LABELS[key] ?? key}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <ul className="space-y-1.5">
          {items.map((item, index) => (
            <li key={index} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-right text-2xs tabular-nums text-tr-muted">
                {index + 1}
              </span>
              <Input
                value={item.name}
                onChange={(event) => {
                  const next = [...items];
                  next[index] = { ...item, name: event.target.value };
                  patchItems(next);
                }}
                aria-label={`Tên danh sách ${index + 1}`}
              />
              <Select
                value={item.status ?? ''}
                onChange={(event) => {
                  const next = [...items];
                  next[index] = {
                    ...item,
                    status: event.target.value === '' ? null : (event.target.value as CardStatus),
                  };
                  patchItems(next);
                }}
                aria-label={`Trạng thái của danh sách ${index + 1}`}
                className="max-w-44 shrink-0"
              >
                <option value="">— không mang nghĩa —</option>
                {CARD_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t.cardStatus[status]}
                  </option>
                ))}
              </Select>
              <button
                type="button"
                onClick={() => patchItems(items.filter((_, i) => i !== index))}
                aria-label={`Xóa danh sách ${index + 1}`}
                className={`shrink-0 rounded p-1 text-tr-muted transition hover:text-tr-danger ${focusRing}`}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-center gap-2 border-t border-tr-border pt-3">
          <Button onClick={() => patchItems([...items, { name: '', status: null }])}>
            <Plus size={15} aria-hidden="true" /> Thêm danh sách
          </Button>
          <span className="flex-1" />
          <Button
            variant="primary"
            disabled={!dirty || invalid || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Đang lưu…' : 'Lưu cấu hình'}
          </Button>
        </div>

        {invalid && (
          <p className="mt-2 text-xs text-tr-danger">
            Còn danh sách chưa đặt tên, hoặc bộ “large”/“small” đang rỗng — cả hai bộ này là bắt
            buộc.
          </p>
        )}

        <p className="mt-3 text-xs text-tr-muted">
          Đổi bộ mẫu chỉ ảnh hưởng tới bảng đổ mẫu sau này. Bảng đã có công việc không bao giờ bị
          thay danh sách.
        </p>
      </Panel>
    </div>
  );
}
