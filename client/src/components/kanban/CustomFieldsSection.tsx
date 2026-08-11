import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { Button, Input, Select } from '../common/ui';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { t } from '../../i18n/vi';
import { invalidateCardViews } from '../../lib/queryKeys';
import type { CardFieldValue, FieldType } from '../../types';

const TYPE_LABELS: Record<FieldType, string> = {
  text: 'Văn bản',
  number: 'Số',
  date: 'Ngày',
  select: 'Danh sách chọn',
  checkbox: 'Hộp kiểm',
};

/**
 * Truong thong tin tuy chinh — dinh nghia o cap bang, gia tri luu theo tung the.
 * Giong Custom Fields cua Trello / Jira: them mot lan, dung cho moi the trong bang.
 */
export function CustomFieldsSection({
  cardId,
  boardId,
  fields,
}: {
  cardId: number;
  boardId: number | null;
  fields: CardFieldValue[];
}) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CardFieldValue | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['card', cardId] });
    queryClient.invalidateQueries({ queryKey: ['card-fields'] });
    invalidateCardViews(queryClient);
  };

  const setValue = useMutation({
    mutationFn: (vars: { fieldId: number; value: string }) =>
      api.put(`/api/cards/${cardId}/fields/${vars.fieldId}`, { value: vars.value }),
    onSuccess: refresh,
  });

  const removeField = useMutation({
    mutationFn: (id: number) => api.del(`/api/card-fields/${id}`),
    onSuccess: refresh,
  });

  return (
    <div>
      {fields.length > 0 && (
        <dl className="mb-2 grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-x-3 gap-y-1.5">
          {fields.map((field) => (
            <div key={field.id} className="group contents">
              <dt className="flex min-w-0 items-center gap-1 text-xs font-semibold text-tr-subtle">
                <span className="truncate" title={field.name}>
                  {field.name}
                </span>
                <button
                  onClick={() => setConfirmDelete(field)}
                  className="shrink-0 rounded p-0.5 text-tr-muted opacity-0 transition group-hover:opacity-100 hover:text-tr-danger"
                  title="Xóa trường này khỏi bảng"
                >
                  <Trash2 size={11} />
                </button>
              </dt>
              <dd className="min-w-0">
                <FieldInput
                  field={field}
                  onChange={(value) => setValue.mutate({ fieldId: field.id, value })}
                />
              </dd>
            </div>
          ))}
        </dl>
      )}

      {adding ? (
        <NewFieldForm boardId={boardId} onDone={refresh} onClose={() => setAdding(false)} />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded px-1 py-1 text-sm text-tr-subtle transition hover:text-tr-text"
        >
          <Plus size={14} /> Thêm trường thông tin
        </button>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        message={`Xóa trường "${confirmDelete?.name}" khỏi bảng? Giá trị đã nhập ở mọi thẻ cũng sẽ mất.`}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) removeField.mutate(confirmDelete.id);
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}

/** O nhap gia tri, doi theo kieu du lieu cua truong. */
function FieldInput({
  field,
  onChange,
}: {
  field: CardFieldValue;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(field.value);

  if (field.field_type === 'checkbox') {
    return (
      <input
        type="checkbox"
        checked={field.value === '1'}
        onChange={(e) => onChange(e.target.checked ? '1' : '')}
        className="h-4 w-4 rounded border-tr-border text-tr-primary"
      />
    );
  }

  if (field.field_type === 'select') {
    return (
      <Select value={field.value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— chưa chọn —</option>
        {field.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
    );
  }

  // text / number / date: luu khi roi o hoac nhan Enter, tranh goi API moi ky tu
  return (
    <Input
      type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== field.value && onChange(draft)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      placeholder="—"
    />
  );
}

/** Form tao dinh nghia truong moi cho bang hien tai. */
function NewFieldForm({
  boardId,
  onDone,
  onClose,
}: {
  boardId: number | null;
  onDone: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [fieldType, setFieldType] = useState<FieldType>('text');
  const [options, setOptions] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.post('/api/card-fields', {
        board_id: boardId,
        name: name.trim(),
        field_type: fieldType,
        options:
          fieldType === 'select'
            ? options
                .split(',')
                .map((o) => o.trim())
                .filter(Boolean)
            : [],
      }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });

  const canSubmit = name.trim() !== '' && (fieldType !== 'select' || options.trim() !== '');

  return (
    <div className="space-y-2 rounded-md border border-tr-border bg-tr-card p-2.5">
      <div className="flex gap-2">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
          placeholder="Tên trường, ví dụ: Ngân sách"
        />
        <div className="w-40 shrink-0">
          <Select value={fieldType} onChange={(e) => setFieldType(e.target.value as FieldType)}>
            {(Object.keys(TYPE_LABELS) as FieldType[]).map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {fieldType === 'select' && (
        <Input
          value={options}
          onChange={(e) => setOptions(e.target.value)}
          placeholder="Các lựa chọn, cách nhau bởi dấu phẩy"
        />
      )}

      <div className="flex items-center gap-2">
        <Button variant="primary" disabled={!canSubmit} onClick={() => create.mutate()}>
          {t.common.add}
        </Button>
        <button
          onClick={onClose}
          className="rounded px-2 py-1 text-sm text-tr-subtle transition hover:bg-tr-hover"
        >
          {t.common.cancel}
        </button>
        <span className="ml-auto text-xs text-tr-muted">Áp dụng cho mọi thẻ trong bảng này</span>
      </div>
    </div>
  );
}
