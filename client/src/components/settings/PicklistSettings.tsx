/**
 * Cài đặt → Danh mục (1.24.0).
 *
 * Mỗi danh mục là một danh sách giá trị dùng trong ô chọn khắp ứng dụng. Thao tác
 * lưu ngay từng mục (khác Bàn giao lưu cả bộ): mỗi thay đổi ở đây độc lập và có
 * hiệu lực với mọi người ngay, nên không có "bản nháp" nào để giữ.
 *
 * Không xoá cứng mục đang có dữ liệu: ẩn để nó rời khỏi ô chọn mà bản ghi cũ vẫn
 * hiện đúng tên, hoặc gộp vào mục khác để bỏ hẳn.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Combine, Plus, Trash2 } from 'lucide-react';
import { PICKLISTS, type PicklistItem, type PicklistKey } from '@workflow/contracts';
import { api } from '../../api/client';
import { Button, Field, FormError, IconButton, Input, Panel, Select } from '../common/ui';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useUiStore } from '../../stores/uiStore';
import { usePermission } from '../../lib/permissions';
import { CRM_CONFIG_QUERY_KEY, usePicklist } from '../../lib/crmConfig';

/** Tên và giải thích của từng danh mục, theo thứ tự hiện trên màn hình. */
export const PICKLIST_META: { key: PicklistKey; title: string; hint: string }[] = [
  {
    key: 'lost_reason',
    title: 'Lý do thất bại',
    hint: 'Bắt buộc chọn khi chuyển cơ hội sang Thất bại; dùng cho thống kê thắng/thua.',
  },
  {
    key: 'interaction_type',
    title: 'Loại tương tác',
    hint: 'Loại của mỗi dòng trong Lịch sử tương tác (gọi, gặp, Zalo…).',
  },
  {
    key: 'doc_type',
    title: 'Loại tài liệu',
    hint: 'Phân loại tệp tải lên; AI đọc tài liệu cũng chọn trong danh sách này.',
  },
  {
    key: 'customer_industry',
    title: 'Ngành nghề khách hàng',
    hint: 'Ô Ngành nghề trên hồ sơ khách hàng; dùng để lọc và so sánh khách cùng ngành.',
  },
  {
    key: 'customer_size',
    title: 'Quy mô khách hàng',
    hint: 'Ô Quy mô trên hồ sơ khách hàng.',
  },
  {
    key: 'customer_source',
    title: 'Nguồn khách hàng',
    hint: 'Khách hàng đến từ đâu. Mục "Hợp đồng" được gán tự động khi tạo khách từ tệp hợp đồng.',
  },
  {
    key: 'deal_source',
    title: 'Nguồn cơ hội',
    hint: 'Cơ hội đến từ đâu. Mục "Gia hạn hợp đồng" được gán tự động cho cơ hội gia hạn.',
  },
];

export function PicklistSettings() {
  const [list, setList] = useState<PicklistKey>(PICKLIST_META[0].key);
  const meta = PICKLIST_META.find((entry) => entry.key === list) ?? PICKLIST_META[0];

  return (
    <div className="space-y-4">
      <Panel title="Danh mục">
        <Field label="Danh mục cần sửa" hint={meta.hint}>
          <Select
            value={list}
            onChange={(event) => setList(event.target.value as PicklistKey)}
            className="max-w-72"
          >
            {PICKLIST_META.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.title}
              </option>
            ))}
          </Select>
        </Field>
      </Panel>
      <PicklistEditor key={list} list={list} title={meta.title} />
    </div>
  );
}

function PicklistEditor({ list, title }: { list: PicklistKey; title: string }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const canEdit = usePermission('settings.app', 'update');
  const items = usePicklist().items(list);
  const [newLabel, setNewLabel] = useState('');
  const [merging, setMerging] = useState<PicklistItem | null>(null);
  const [deleting, setDeleting] = useState<PicklistItem | null>(null);

  const usage = useQuery({
    queryKey: ['crm-config', 'usage', list],
    queryFn: () => api.get<Record<number, number>>(`/api/crm-config/picklists/${list}/usage`),
    enabled: canEdit,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: CRM_CONFIG_QUERY_KEY });
  };

  const create = useMutation({
    mutationFn: (label: string) => api.post(`/api/crm-config/picklists/${list}`, { label }),
    onSuccess: () => {
      setNewLabel('');
      refresh();
    },
  });
  const patch = useMutation({
    mutationFn: ({ id, ...body }: { id: number; label?: string; is_active?: boolean }) =>
      api.patch(`/api/crm-config/picklists/${list}/${id}`, body),
    onSuccess: refresh,
  });
  const reorder = useMutation({
    mutationFn: (ids: number[]) => api.put(`/api/crm-config/picklists/${list}/order`, { ids }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/crm-config/picklists/${list}/${id}`),
    onSuccess: () => {
      setDeleting(null);
      refresh();
    },
  });

  const move = (index: number, delta: number) => {
    const ids = items.map((item) => item.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate(ids);
  };

  const error = create.error ?? patch.error ?? reorder.error ?? remove.error;
  const labelStorage = PICKLISTS[list].storage === 'label';

  return (
    <Panel title={title}>
      <FormError error={error} />
      {labelStorage && (
        <p className="mb-2 text-xs text-tr-muted">
          Danh mục này lưu chính tên hiển thị: đổi tên một mục sẽ cập nhật luôn mọi bản ghi đang
          dùng nó.
        </p>
      )}
      <ul className="divide-y divide-tr-border">
        {items.map((item, index) => {
          const used = usage.data?.[item.id];
          return (
            <li key={item.id} className="flex flex-wrap items-center gap-2 py-1.5">
              <div className="flex shrink-0">
                <IconButton
                  label={`Đưa "${item.label}" lên`}
                  disabled={!canEdit || index === 0 || reorder.isPending}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={14} aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={`Đưa "${item.label}" xuống`}
                  disabled={!canEdit || index === items.length - 1 || reorder.isPending}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={14} aria-hidden="true" />
                </IconButton>
              </div>
              <LabelInput
                item={item}
                disabled={!canEdit}
                onSave={(label) => patch.mutate({ id: item.id, label })}
              />
              <span className="w-32 shrink-0 text-xs text-tr-muted">
                {used === undefined ? '' : `${used} bản ghi`}
                {item.is_system === 1 && ' · hệ thống'}
              </span>
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-tr-subtle">
                <input
                  type="checkbox"
                  checked={item.is_active === 1}
                  disabled={!canEdit || item.is_system === 1}
                  onChange={(event) =>
                    patch.mutate({ id: item.id, is_active: event.target.checked })
                  }
                  className="h-4 w-4 rounded border-tr-border"
                />
                Đang dùng
              </label>
              <IconButton
                label={`Gộp "${item.label}" vào mục khác`}
                disabled={!canEdit || item.is_system === 1 || items.length < 2}
                onClick={() => setMerging(item)}
              >
                <Combine size={14} aria-hidden="true" />
              </IconButton>
              <IconButton
                label={`Xoá "${item.label}"`}
                tone="danger"
                disabled={!canEdit || item.is_system === 1 || (used ?? 1) > 0}
                title={(used ?? 0) > 0 ? 'Còn bản ghi đang dùng — hãy gộp vào mục khác' : undefined}
                onClick={() => setDeleting(item)}
              >
                <Trash2 size={14} aria-hidden="true" />
              </IconButton>
            </li>
          );
        })}
      </ul>

      {canEdit && (
        <form
          className="mt-3 flex items-end gap-2 border-t border-tr-border pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (newLabel.trim()) create.mutate(newLabel.trim());
          }}
        >
          <Field label="Thêm mục mới">
            <Input
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              maxLength={100}
              className="max-w-72"
            />
          </Field>
          <Button type="submit" disabled={!newLabel.trim() || create.isPending}>
            <Plus size={15} aria-hidden="true" /> Thêm
          </Button>
        </form>
      )}

      {merging && (
        <MergeDialog
          list={list}
          from={merging}
          items={items}
          used={usage.data?.[merging.id]}
          onClose={() => setMerging(null)}
          onDone={(moved) => {
            setMerging(null);
            refresh();
            pushToast(`Đã gộp, chuyển ${moved} bản ghi`, 'success');
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        message={`Xoá hẳn mục "${deleting?.label ?? ''}"? Mục chưa có bản ghi nào dùng.`}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </Panel>
  );
}

/** Ô sửa tên tại chỗ: lưu khi rời ô hoặc bấm Enter, Esc để bỏ. */
function LabelInput({
  item,
  disabled,
  onSave,
}: {
  item: PicklistItem;
  disabled: boolean;
  onSave: (label: string) => void;
}) {
  const [value, setValue] = useState(item.label);
  const [source, setSource] = useState(item.label);
  if (item.label !== source) {
    setSource(item.label);
    setValue(item.label);
  }
  const commit = () => {
    const next = value.trim();
    if (!next) setValue(item.label);
    else if (next !== item.label) onSave(next);
  };
  return (
    <Input
      value={value}
      disabled={disabled}
      maxLength={100}
      aria-label={`Tên mục ${item.label}`}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') setValue(item.label);
      }}
      className={`min-w-40 flex-1 ${item.is_active === 1 ? '' : 'text-tr-muted line-through'}`}
    />
  );
}

function MergeDialog({
  list,
  from,
  items,
  used,
  onClose,
  onDone,
}: {
  list: PicklistKey;
  from: PicklistItem;
  items: PicklistItem[];
  used: number | undefined;
  onClose: () => void;
  onDone: (moved: number) => void;
}) {
  const targets = items.filter((item) => item.id !== from.id);
  const [into, setInto] = useState<number>(targets[0]?.id ?? 0);
  const merge = useMutation({
    mutationFn: () =>
      api.post<{ moved: number }>(`/api/crm-config/picklists/${list}/${from.id}/merge`, {
        into_id: into,
      }),
    onSuccess: (result) => onDone(result.moved),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Gộp "${from.label}"`}
      width="max-w-md"
      footer={
        <>
          <Button onClick={onClose}>Huỷ</Button>
          <Button
            variant="primary"
            disabled={!into || merge.isPending}
            onClick={() => merge.mutate()}
          >
            {merge.isPending ? 'Đang gộp…' : 'Gộp'}
          </Button>
        </>
      }
    >
      <FormError error={merge.error} />
      <p className="mb-3 text-sm text-tr-subtle">
        {used === undefined ? 'Mọi' : `${used}`} bản ghi đang dùng "{from.label}" sẽ chuyển sang mục
        được chọn, rồi "{from.label}" bị xoá. Không hoàn tác được.
      </p>
      <Field label="Gộp vào">
        <Select value={into} onChange={(event) => setInto(Number(event.target.value))}>
          {targets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
              {item.is_active === 1 ? '' : ' (đang ẩn)'}
            </option>
          ))}
        </Select>
      </Field>
    </Modal>
  );
}
