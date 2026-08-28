/**
 * Phân loại mô hình triển khai A/B của một dự án (đặc tả 6.3).
 *
 * Hệ thống **đề xuất**, con người **chốt**. Bảng tín hiệu bên dưới tồn tại để
 * người chốt thấy đề xuất đến từ đâu — một nhãn "Mô hình A" không kèm lý do thì
 * không khác gì cảm tính, chỉ là cảm tính của máy.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Info } from 'lucide-react';
import { api } from '../../api/client';
import { Button, FormError, Panel, Textarea, focusRing } from '../common/ui';
import { t } from '../../i18n/vi';
import { formatVND } from '../../lib/format';
import type { Classification, DeliveryModel } from '../../types';

/** Ngưỡng giá trị hiển thị bằng tiền, còn lại là số đếm. */
function formatSignal(key: string, value: number): string {
  return key === 'contract_value_vnd' ? formatVND(value) : String(value);
}

export function ClassificationPanel({
  projectId,
  classification,
}: {
  projectId: number;
  classification: Classification;
}) {
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<DeliveryModel | null>(null);
  const [reason, setReason] = useState('');

  const choose = useMutation({
    mutationFn: (model: DeliveryModel) =>
      api.put<Classification>(`/api/projects/${projectId}/model`, {
        model,
        reason: reason.trim() || null,
      }),
    onSuccess: () => {
      setPicked(null);
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const { suggested, chosen, signals, overridden } = classification;
  /* Lý do chỉ bắt buộc khi chốt KHÁC đề xuất — bắt giải trình cho một lựa chọn
     mà hệ thống vừa tự đề xuất chỉ đẩy người dùng tới chỗ gõ bừa cho xong. */
  const needsReason = picked !== null && picked !== suggested;
  const canSubmit = picked !== null && (!needsReason || reason.trim().length >= 10);

  return (
    <Panel title="Mô hình triển khai">
      <FormError error={choose.error} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-tr-hover px-2.5 py-1 text-xs font-semibold text-tr-subtle">
          Đề xuất: {t.deliveryModel[suggested]}
        </span>
        {chosen ? (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              overridden ? 'bg-tr-warning/15 text-tr-warning' : 'bg-tr-success/15 text-tr-success'
            }`}
          >
            Đã chốt: {t.deliveryModel[chosen]}
          </span>
        ) : (
          <span className="text-xs text-tr-muted">Chưa ai chốt mô hình cho dự án này.</span>
        )}
      </div>

      {overridden && classification.reason && (
        <p className="mb-3 flex items-start gap-1.5 rounded-control bg-tr-warning/10 px-2.5 py-2 text-xs text-tr-text">
          <CircleAlert size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-tr-warning" />
          <span>
            <b>Chốt khác đề xuất.</b> Lý do: {classification.reason}
          </span>
        </p>
      )}

      <table className="w-full text-sm">
        <caption className="mb-1.5 text-left text-xs text-tr-muted">
          Vượt <b>bất kỳ</b> ngưỡng nào là đủ để đề xuất Mô hình A — không lấy trung bình.
        </caption>
        <thead>
          <tr className="text-xs text-tr-muted uppercase">
            <th scope="col" className="py-1 text-left font-semibold">
              Tiêu chí
            </th>
            <th scope="col" className="py-1 text-right font-semibold">
              Hiện tại
            </th>
            <th scope="col" className="py-1 text-right font-semibold">
              Ngưỡng
            </th>
          </tr>
        </thead>
        <tbody>
          {signals.map((signal) => (
            <tr key={signal.key} className={signal.crossed ? 'text-tr-text' : 'text-tr-muted'}>
              <td className="py-1">
                {signal.crossed && (
                  <span
                    aria-hidden="true"
                    className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-tr-warning"
                  />
                )}
                {signal.label}
                {signal.crossed && <span className="sr-only"> (đã vượt ngưỡng)</span>}
              </td>
              <td className="py-1 text-right tabular-nums">
                {formatSignal(signal.key, signal.value)}
              </td>
              <td className="py-1 text-right tabular-nums">
                {formatSignal(signal.key, signal.threshold)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 border-t border-tr-border pt-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Chọn mô hình triển khai">
          {(['A', 'B'] as DeliveryModel[]).map((model) => (
            <button
              key={model}
              type="button"
              aria-pressed={picked === model}
              onClick={() => setPicked(picked === model ? null : model)}
              className={`rounded-control border px-3 py-1.5 text-xs font-medium transition ${focusRing} ${
                picked === model
                  ? 'border-tr-primary bg-tr-primary/10 text-tr-primary'
                  : 'border-tr-border text-tr-subtle hover:bg-tr-hover'
              }`}
            >
              {t.deliveryModel[model]}
            </button>
          ))}
        </div>

        {needsReason && (
          <div className="mt-2">
            <Textarea
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Vì sao chọn khác đề xuất? (tối thiểu 10 ký tự)"
              aria-label="Lý do chọn khác đề xuất"
            />
            <p className="mt-1 flex items-center gap-1 text-xs text-tr-muted">
              <Info size={11} aria-hidden="true" />
              Lý do được lưu vào nhật ký thay đổi của dự án.
            </p>
          </div>
        )}

        {picked && (
          <Button
            variant="primary"
            className="mt-2"
            disabled={!canSubmit || choose.isPending}
            onClick={() => choose.mutate(picked)}
          >
            {choose.isPending ? 'Đang lưu…' : `Chốt ${t.deliveryModel[picked]}`}
          </Button>
        )}
      </div>
    </Panel>
  );
}
