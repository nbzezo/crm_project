/**
 * F-12 — hỏi ngay sau khi ghi một hoạt động: "cuộc trao đổi này thay đổi yếu tố nào?"
 *
 * Lý do tồn tại: Mục 3.6 của phương pháp luận nói **chỉ hoạt động thực tế mới làm thay
 * đổi điểm**. Nếu chấm điểm là một màn hình riêng phải chủ động vào, người dùng sẽ chấm
 * dồn một lần trước kỳ báo cáo — đúng hành vi mà cả module này sinh ra để ngăn.
 *
 * Dải này bỏ qua được và không chặn gì cả.
 */
import { Link } from 'react-router';
import { X } from 'lucide-react';
import { FACTOR_LABELS } from '../../i18n/scoring';
import { focusRing } from '../common/ui';
import type { Factor } from '../../types';

const FACTORS = Object.keys(FACTOR_LABELS) as Factor[];

export function ScoringPrompt({
  dealId,
  summary,
  onDismiss,
}: {
  dealId: number;
  summary: string;
  onDismiss: () => void;
}) {
  return (
    <div className="mb-4 rounded-panel border border-tr-primary/40 bg-tr-primary/5 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-tr-text">
            Cuộc trao đổi này thay đổi yếu tố nào?
          </p>
          {summary && <p className="mt-0.5 line-clamp-1 text-xs text-tr-muted">“{summary}”</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {FACTORS.map((factor) => (
              <Link
                key={factor}
                to={`/deals/${dealId}?tab=score&factor=${factor}`}
                className={`rounded-control border border-tr-border bg-tr-panel px-2 py-1 text-xs font-medium text-tr-subtle transition hover:border-tr-primary hover:text-tr-text ${focusRing}`}
              >
                {FACTOR_LABELS[factor]}
              </Link>
            ))}
          </div>
          <p className="mt-2 text-2xs text-tr-muted">
            Bỏ qua cũng được — nhưng điểm không được cập nhật thì forecast sẽ nói sai.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Bỏ qua"
          className={`rounded p-1 text-tr-muted hover:text-tr-text ${focusRing}`}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
