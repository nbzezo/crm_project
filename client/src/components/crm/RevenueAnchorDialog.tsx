import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { api } from '../../api/client';
import { Modal } from '../common/Modal';
import { Button, Field, FormError, Input } from '../common/ui';
import { t } from '../../i18n/vi';
import { formatVND } from '../../lib/format';
import { formatPeriod } from '../../lib/revenue';
import type { RevenueAnchorImpact, RevenueAnchorMode, RevenueLine } from '../../types';

const MODE_OPTIONS: { value: RevenueAnchorMode; label: string; hint: string }[] = [
  {
    value: 'auto',
    label: 'Tự động',
    hint: 'Mốc là tháng đầu tiên có doanh thu (kể cả dự kiến). 12 tháng đầu là Mới / Mở rộng, sau đó là Nền.',
  },
  {
    value: 'manual',
    label: 'Chọn tháng mốc',
    hint: 'Dùng cho hợp đồng có doanh thu trước đây chưa nhập vào hệ thống.',
  },
  {
    value: 'base',
    label: 'Toàn bộ là Nền',
    hint: 'Mọi tháng của dòng này đều tính là doanh thu Nền.',
  },
];

/**
 * Sửa tay mốc phân nhóm của một dòng. Luôn xem trước hậu quả (bao nhiêu tháng,
 * bao nhiêu tiền đổi nhóm, ảnh hưởng báo cáo năm nào) rồi mới cho lưu.
 */
export function RevenueAnchorDialog({
  line,
  year,
  onClose,
}: {
  line: RevenueLine;
  year: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<RevenueAnchorMode>(line.anchor.mode);
  const [period, setPeriod] = useState(
    line.anchor.manual_period ?? line.anchor.first_period ?? `${year}-01`
  );
  const body = { mode, period: mode === 'manual' ? period : null };
  const validPeriod = /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
  const unchanged =
    mode === line.anchor.mode && (mode !== 'manual' || period === line.anchor.manual_period);

  const preview = useQuery({
    queryKey: ['revenues', 'anchor-preview', line.id, body],
    queryFn: () =>
      api.post<RevenueAnchorImpact>(`/api/revenues/lines/${line.id}/anchor-preview`, body),
    enabled: mode !== 'manual' || validPeriod,
  });

  const save = useMutation({
    mutationFn: () => api.put(`/api/revenues/lines/${line.id}/anchor?year=${year}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['revenues'] });
      onClose();
    },
  });

  const impact = preview.data;
  const after = impact?.after;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Mốc phân nhóm — ${line.customer_name}${line.service_name ? ` · ${line.service_name}` : ''}`}
      width="max-w-lg"
      footer={
        <>
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button
            variant="primary"
            disabled={unchanged || save.isPending || !impact}
            onClick={() => save.mutate()}
          >
            {impact && impact.moved_count > 0 ? 'Xác nhận đổi mốc' : t.common.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-tr-subtle">
          Hiện tại: <strong className="text-tr-text">{describeAnchor(line.anchor)}</strong>
        </p>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-medium text-tr-subtle">Cách xác định mốc</legend>
          {MODE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-2 rounded-control border border-tr-border px-3 py-2 hover:bg-tr-hover"
            >
              <input
                type="radio"
                name="anchor-mode"
                className="mt-1"
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
              />
              <span>
                <span className="block font-medium text-tr-text">{option.label}</span>
                <span className="block text-xs text-tr-muted">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {mode === 'manual' && (
          <Field label="Tháng mốc (tháng đầu tiên của 12 tháng Mới / Mở rộng)">
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </Field>
        )}

        {after && <p className="text-tr-subtle">Sau khi đổi: {describeAnchor(after)}</p>}

        {impact && impact.moved_count > 0 && !unchanged && (
          <div
            role="alert"
            className="flex gap-2 rounded-control border border-tr-warning/40 bg-tr-warning/10 px-3 py-2 text-tr-text"
          >
            <TriangleAlert
              size={16}
              className="mt-0.5 shrink-0 text-tr-warning"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium">
                {impact.moved_count} tháng ({formatVND(impact.moved_amount_vnd)}) sẽ đổi nhóm
              </p>
              <p className="text-xs text-tr-subtle">
                Báo cáo doanh thu năm {impact.years.join(', ')} sẽ thay đổi theo.{' '}
                {summarizeMoves(impact)}
              </p>
            </div>
          </div>
        )}
        {impact && impact.moved_count === 0 && !unchanged && (
          <p className="text-xs text-tr-muted">Không có tháng doanh thu nào đổi nhóm.</p>
        )}
        <FormError error={save.error ?? preview.error} />
      </div>
    </Modal>
  );
}

export function describeAnchor(anchor: RevenueLine['anchor']): string {
  if (anchor.mode === 'base') return 'Toàn bộ là Nền (sửa tay)';
  if (!anchor.effective) return 'Chưa có doanh thu — sẽ tính từ tháng đầu tiên nhập';
  const manual = anchor.mode === 'manual' ? ' (sửa tay)' : '';
  return `Mới từ ${formatPeriod(anchor.effective)}, Nền từ ${formatPeriod(anchor.base_from)}${manual}`;
}

function summarizeMoves(impact: RevenueAnchorImpact): string {
  const counts = new Map<string, number>();
  for (const move of impact.moved) {
    const key = `${t.revenueGroup[move.from]} → ${t.revenueGroup[move.to]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([key, n]) => `${key}: ${n} tháng`).join(' · ');
}
