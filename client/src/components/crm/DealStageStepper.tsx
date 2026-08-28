/**
 * Statusbar giai đoạn kiểu Odoo cho trang chi tiết cơ hội — bấm thẳng vào một
 * bước để chuyển, thay vì chỉ đọc badge tĩnh. Dùng lại nguyên `useDealStageMove`
 * (cổng điểm BANT + ghi đè, bắt buộc lý do khi thua, form chốt thắng) nên mọi
 * quy tắc nghiệp vụ giống hệt kéo-thả trên bảng Kanban.
 *
 * `lost` không nằm trong hàng bước tuyến tính — nó là một lối thoát riêng, có
 * thể xảy ra từ bất kỳ giai đoạn nào (xem `useDealStageMove`), nên hiển thị
 * dạng badge phủ + liên kết phụ thay vì một ô trong chuỗi.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useDealStageMove } from '../../hooks/useDealStageMove';
import { focusRing } from '../common/ui';
import { STAGE_COLORS, STAGE_ORDER, t } from '../../i18n/vi';
import { contrastInk } from '../../lib/format';
import { invalidateCrmViews } from '../../lib/queryKeys';
import type { Deal, Stage } from '../../types';

const LINEAR_STAGES = STAGE_ORDER.filter((s) => s !== 'lost');

export function DealStageStepper({ deal }: { deal: Deal }) {
  const queryClient = useQueryClient();
  const { move, dialogs } = useDealStageMove({
    invalidate: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', deal.id, 'full'] });
      queryClient.invalidateQueries({ queryKey: ['deal', deal.id, 'scorecard'] });
      invalidateCrmViews(queryClient, deal.customer_id);
    },
  });

  const isLost = deal.stage === 'lost';
  const currentIndex = LINEAR_STAGES.indexOf(deal.stage as (typeof LINEAR_STAGES)[number]);

  const go = (stage: Stage) => move({ dealId: deal.id, stage, beforeId: null, afterId: null });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* `tr-stage-stepper`: moc de theme Zoho ve chuoi chevron giua cac buoc.
          Truoc day CSS bam thang vao chuoi aria-label — doi nhan cho de doc la
          mat hieu ung, im lang. Lop nay la hop dong tuong minh giua hai ben. */}
      <div
        role="group"
        aria-label="Giai đoạn cơ hội"
        className="tr-stage-stepper flex flex-wrap items-center gap-1"
      >
        {LINEAR_STAGES.map((stage, index) => {
          const active = stage === deal.stage;
          const passed = currentIndex >= 0 && index < currentIndex;
          return (
            <button
              key={stage}
              type="button"
              disabled={active}
              onClick={() => go(stage)}
              title={active ? undefined : `Chuyển sang: ${t.stage[stage]}`}
              className={`rounded-compact px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition disabled:cursor-default ${focusRing} ${
                active
                  ? ''
                  : passed
                    ? 'bg-tr-hover-strong text-tr-text hover:brightness-95'
                    : 'text-tr-subtle hover:bg-tr-hover hover:text-tr-text'
              }`}
              style={
                active
                  ? {
                      backgroundColor: STAGE_COLORS[stage],
                      color: contrastInk(STAGE_COLORS[stage]),
                    }
                  : undefined
              }
            >
              {t.stage[stage]}
            </button>
          );
        })}
      </div>

      {isLost ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-tr-danger/15 px-2.5 py-1 text-xs font-semibold text-tr-danger">
          {t.stage.lost}
          {deal.lost_reason && ` — ${t.lostReason[deal.lost_reason] ?? deal.lost_reason}`}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => go('lost')}
          className={`rounded-compact px-1.5 py-1 text-xs font-medium text-tr-muted transition hover:text-tr-danger hover:underline ${focusRing}`}
        >
          Đánh dấu thua cuộc
        </button>
      )}

      {dialogs}
    </div>
  );
}
