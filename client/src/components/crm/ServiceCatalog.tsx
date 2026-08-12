import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '../../api/client';
import { Modal } from '../common/Modal';
import { Button, EmptyState, Input, MoneyInput, Select } from '../common/ui';
import { t } from '../../i18n/vi';
import { formatVND } from '../../lib/format';
import { invalidateRevenueViews } from '../../lib/queryKeys';
import type { Service } from '../../types';

const EMPTY = {
  name: '',
  code: '',
  category: '',
  unit: '',
  default_price_vnd: 0,
  is_active: true,
};
type Draft = typeof EMPTY;

/** Danh mục dịch vụ dùng chung: thêm, sửa, ngừng cung cấp. */
export function ServiceCatalog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.get<Service[]>('/api/services'),
    enabled: open,
  });

  const reset = () => {
    setDraft(EMPTY);
    setEditingId(null);
  };

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...draft,
        code: draft.code || null,
        category: draft.category || null,
        unit: draft.unit || null,
      };
      return editingId
        ? api.patch(`/api/services/${editingId}`, payload)
        : api.post('/api/services', payload);
    },
    onSuccess: () => {
      invalidateRevenueViews(queryClient);
      reset();
    },
  });

  // Server chặn xóa dịch vụ đang được dùng — lỗi hiện qua toast chung.
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/services/${id}`),
    onSuccess: () => invalidateRevenueViews(queryClient),
  });

  const toggleActive = useMutation({
    mutationFn: (service: Service) =>
      api.patch(`/api/services/${service.id}`, { is_active: !service.is_active }),
    onSuccess: () => invalidateRevenueViews(queryClient),
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      width="max-w-3xl"
      title={t.service.manage}
      footer={
        <Button
          onClick={() => {
            reset();
            onClose();
          }}
        >
          {t.common.close}
        </Button>
      }
    >
      <div className="mb-4 grid grid-cols-1 gap-2 rounded-lg border border-tr-border bg-tr-surface p-3 sm:grid-cols-12">
        <div className="sm:col-span-4">
          <Input
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder={t.service.name}
          />
        </div>
        <div className="sm:col-span-2">
          <Input
            value={draft.code}
            onChange={(e) => set('code', e.target.value)}
            placeholder={t.service.code}
          />
        </div>
        <div className="sm:col-span-2">
          <Input
            value={draft.category}
            onChange={(e) => set('category', e.target.value)}
            placeholder={t.service.category}
          />
        </div>
        <div className="sm:col-span-2">
          <MoneyInput
            value={draft.default_price_vnd}
            onChange={(v) => set('default_price_vnd', v)}
          />
        </div>
        <div className="flex gap-1 sm:col-span-2">
          <Button
            variant="primary"
            className="flex-1"
            disabled={!draft.name.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {editingId ? <Check size={15} /> : <Plus size={15} />}
            {editingId ? t.common.save : t.common.add}
          </Button>
          {editingId && (
            <Button variant="ghost" onClick={reset} title={t.common.cancel}>
              <X size={15} />
            </Button>
          )}
        </div>
      </div>

      {services.length === 0 ? (
        <EmptyState message={t.service.noServices} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-tr-border">
          <table className="w-full text-sm">
            <thead className="bg-tr-surface text-left text-xs tracking-wide text-tr-subtle uppercase">
              <tr>
                <th scope="col" className="px-3 py-2">
                  {t.service.name}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t.service.category}
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  {t.service.defaultPrice}
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  {t.service.inUse}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t.customer.status}
                </th>
                <th scope="col" className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tr-border">
              {services.map((s) => (
                <tr key={s.id} className={s.is_active ? '' : 'opacity-60'}>
                  <td className="px-3 py-2 font-medium text-tr-text">
                    {s.name}
                    {s.code && <span className="ml-1 text-xs text-tr-muted">({s.code})</span>}
                  </td>
                  <td className="px-3 py-2 text-tr-subtle">{s.category || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {s.default_price_vnd ? formatVND(s.default_price_vnd) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-tr-subtle">
                    {s.customer_count ?? 0} KH / {s.line_count ?? 0} dòng
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={s.is_active ? '1' : '0'}
                      onChange={() => toggleActive.mutate(s)}
                      className="py-0.5 text-xs"
                    >
                      <option value="1">{t.service.active}</option>
                      <option value="0">Ngừng cung cấp</option>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => {
                          setEditingId(s.id);
                          setDraft({
                            name: s.name,
                            code: s.code ?? '',
                            category: s.category ?? '',
                            unit: s.unit ?? '',
                            default_price_vnd: s.default_price_vnd,
                            is_active: !!s.is_active,
                          });
                        }}
                        aria-label={`${t.common.edit}: ${s.name}`}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control sm:h-8 sm:w-8 text-tr-muted transition hover:bg-tr-hover hover:text-tr-text"
                      >
                        <Pencil size={14} aria-hidden="true" />
                      </button>
                      <button
                        onClick={() => remove.mutate(s.id)}
                        aria-label={`${t.common.delete}: ${s.name}`}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control sm:h-8 sm:w-8 text-tr-muted transition hover:bg-tr-hover hover:text-tr-danger"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
