/**
 * Cấu hình module chấm điểm.
 *
 * Hai ngưỡng "nguội" cố tình nằm cạnh nhau để người dùng thấy chúng là hai thứ khác nhau:
 * *nguội tương tác 14 ngày* là của Tổng quan (không đổi ở đây), còn *điểm quá hạn* là của
 * module này.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Button, Field, FormError, Input, Select, Skeleton } from '../common/ui';
import { t } from '../../i18n/vi';
import { formatVNDInput, parseVNDInput } from '../../lib/format';
import type { ScoringSettings as Settings, Stage } from '../../types';

/** Chỉ các giai đoạn tiến lên mới đặt cổng được; Thất bại không bao giờ bị chặn. */
const GATED_STAGES: Stage[] = ['approaching', 'discussing', 'quoted', 'negotiating'];

export function ScoringSettings() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Settings | null>(null);

  const { data } = useQuery({
    queryKey: ['scoring-settings'],
    queryFn: () => api.get<Settings>('/api/settings/scoring'),
  });

  useEffect(() => {
    if (data && !draft) setDraft(data);
  }, [data, draft]);

  const save = useMutation({
    mutationFn: (next: Settings) =>
      api.put('/api/settings/scoring', {
        stage_gate: next.stageGate,
        stale_days: next.staleDays,
        v3_mode: next.v3Mode,
        challenge_threshold_vnd: next.challengeThresholdVnd,
        winloss_min_deals: next.winlossMinDeals,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scoring-settings'] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-health'] });
    },
  });

  if (!draft) return <Skeleton className="h-48 rounded-panel" />;

  const setGate = (stage: Stage, value: string) => {
    const next = { ...draft.stageGate };
    if (value === '') delete next[stage];
    else next[stage] = Number(value);
    setDraft({ ...draft, stageGate: next });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-1 text-sm font-semibold text-tr-text">Cổng giai đoạn</h3>
        <p className="mb-2 text-xs text-tr-muted">
          Điểm BANT tối thiểu để chuyển cơ hội vào từng giai đoạn. Để trống là không chặn. Kéo sang{' '}
          <strong>Thất bại</strong> không bao giờ bị chặn — nếu chặn thì không đóng được deal xấu.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {GATED_STAGES.map((stage) => (
            <Field key={stage} label={t.stage[stage]}>
              <Input
                type="number"
                min={0}
                max={12}
                value={draft.stageGate[stage] ?? ''}
                placeholder="không chặn"
                onChange={(e) => setGate(stage, e.target.value)}
              />
            </Field>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Điểm quá hạn sau (ngày)"
          hint="Khác với “nguội tương tác 14 ngày” của Tổng quan — đây là tuổi của lần chấm điểm"
        >
          <Input
            type="number"
            min={1}
            max={365}
            value={draft.staleDays}
            onChange={(e) => setDraft({ ...draft, staleDays: Number(e.target.value) })}
          />
        </Field>

        <Field
          label="Đối thủ đã soạn tiêu chí thầu"
          hint="Trục 4P đã đo vị thế cạnh tranh — chặn thêm forecast là phạt hai lần cho cùng một dữ kiện"
        >
          <Select
            value={draft.v3Mode}
            onChange={(e) => setDraft({ ...draft, v3Mode: e.target.value as 'warn' | 'veto' })}
          >
            <option value="warn">Chỉ cảnh báo, vẫn tính vào forecast</option>
            <option value="veto">Chặn khỏi forecast (siết chặt)</option>
          </Select>
        </Field>

        <Field
          label="Ngưỡng deal lớn bắt buộc phản biện 4P"
          hint="Trên ngưỡng này, chấm 4P từ 2 điểm phải trả lời câu phản biện"
        >
          <Input
            value={formatVNDInput(draft.challengeThresholdVnd)}
            onChange={(e) =>
              setDraft({ ...draft, challengeThresholdVnd: parseVNDInput(e.target.value) })
            }
          />
        </Field>

        <Field
          label="Số deal tối thiểu cho báo cáo thắng/thua"
          hint="Dưới ngưỡng này, báo cáo chỉ hiện số đếm, không gợi ý hiệu chỉnh ngưỡng"
        >
          <Input
            type="number"
            min={1}
            value={draft.winlossMinDeals}
            onChange={(e) => setDraft({ ...draft, winlossMinDeals: Number(e.target.value) })}
          />
        </Field>
      </div>

      <FormError error={save.error} />
      <div className="flex items-center gap-2">
        <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate(draft)}>
          {save.isPending ? t.common.saving : t.common.save}
        </Button>
        {save.isSuccess && <span className="text-xs text-tr-success">Đã lưu cấu hình.</span>}
      </div>

      <p className="border-t border-tr-border pt-3 text-xs text-tr-muted">
        Điểm chất lượng <strong>không bao giờ</strong> ghi đè xác suất theo giai đoạn của cơ hội.
        Hai chỉ số được phép khác nhau — chênh lệch giữa chúng chính là thứ trang{' '}
        <em>Sức khỏe pipeline</em> đo.
      </p>
    </div>
  );
}
