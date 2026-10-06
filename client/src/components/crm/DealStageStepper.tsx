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
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDealStageMove } from '../../hooks/useDealStageMove';
import { CircleSlash, Ellipsis } from 'lucide-react';
import { focusRing, IconButton } from '../common/ui';
import { Popover, PopoverItem, usePopover } from '../common/Popover';
import { t } from '../../i18n/vi';
import { contrastInk } from '../../lib/format';
import { invalidateCrmViews } from '../../lib/queryKeys';
import type { Deal, Stage } from '../../types';
import {
  closedStageKey,
  pickLabel,
  stageCategory,
  stageColor,
  stageKeys,
  stageLabel,
} from '../../lib/crmConfig';

export function DealStageStepper({ deal }: { deal: Deal }) {
  const activeStepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (window.matchMedia('(max-width: 767px)').matches)
      activeStepRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [deal.stage]);
  const queryClient = useQueryClient();
  const { move, dialogs } = useDealStageMove({
    invalidate: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', deal.id, 'full'] });
      queryClient.invalidateQueries({ queryKey: ['deal', deal.id, 'scorecard'] });
      invalidateCrmViews(queryClient, deal.customer_id);
    },
  });

  const lostMenu = usePopover();
  const isLost = stageCategory(deal.stage) === 'lost';
  /* Dải bước: mọi giai đoạn đang dùng trừ Thất bại (đi qua menu riêng). */
  const LINEAR_STAGES = stageKeys({ include: deal.stage }).filter(
    (key) => stageCategory(key) !== 'lost'
  );
  const currentIndex = LINEAR_STAGES.indexOf(deal.stage);

  const go = (stage: Stage) =>
    move({ dealId: deal.id, stage, beforeId: null, afterId: null, prevStage: deal.stage });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* `tr-stage-stepper`: moc de theme Don sac ve cac buoc dang vien thuoc danh so.
          Truoc day CSS bam thang vao chuoi aria-label — doi nhan cho de doc la
          mat hieu ung, im lang. Lop nay la hop dong tuong minh giua hai ben. */}
      <div
        role="group"
        aria-label="Giai đoạn cơ hội"
        className="tr-stage-stepper tr-scroll flex snap-x snap-mandatory items-center gap-1 overflow-x-auto md:flex-wrap md:overflow-visible"
      >
        {LINEAR_STAGES.map((stage, index) => {
          const active = stage === deal.stage;
          const passed = currentIndex >= 0 && index < currentIndex;
          return (
            <button
              ref={active ? activeStepRef : undefined}
              key={stage}
              type="button"
              disabled={active}
              aria-current={active ? 'step' : undefined}
              data-active={active ? 'true' : undefined}
              data-passed={passed ? 'true' : undefined}
              onClick={() => go(stage)}
              title={active ? undefined : `Chuyển sang: ${stageLabel(stage)}`}
              className={`min-h-11 shrink-0 snap-center rounded-compact px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition disabled:cursor-default fine:min-h-0 ${focusRing} ${
                active
                  ? ''
                  : passed
                    ? 'bg-tr-hover-strong text-tr-text hover:brightness-95'
                    : 'text-tr-subtle hover:bg-tr-hover hover:text-tr-text'
              }`}
              style={
                active
                  ? {
                      backgroundColor: stageColor(stage),
                      color: contrastInk(stageColor(stage)),
                    }
                  : undefined
              }
            >
              {stageLabel(stage)}
            </button>
          );
        })}
      </div>

      {isLost ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-tr-danger/15 px-2.5 py-1 text-xs font-semibold text-tr-danger">
          {t.stage.lost}
          {deal.lost_reason && ` — ${pickLabel('lost_reason', deal.lost_reason)}`}
        </span>
      ) : (
        /* Tach khoi thanh giai doan: truoc day "Đánh dấu thua cuộc" dung ngay
           canh "Thành công" — hai hanh dong he qua trai nguoc hoan toan, cach
           nhau vai pixel. Gio no nam trong menu "…" voi kieu dang destructive,
           phai mo ra moi bam duoc. Ly do thua van do LostReasonDialog hoi
           (BR-03), nen khong mat buoc xac nhan nao. */
        <>
          <IconButton
            label="Hành động khác cho cơ hội"
            onClick={lostMenu.toggle}
            aria-haspopup="menu"
            aria-expanded={lostMenu.open}
          >
            <Ellipsis size={16} aria-hidden="true" />
          </IconButton>
          <Popover
            open={lostMenu.open}
            anchor={lostMenu.anchor}
            onClose={lostMenu.close}
            title="Hành động khác"
            width={224}
          >
            <PopoverItem
              danger
              icon={<CircleSlash size={15} aria-hidden="true" />}
              onClick={() => {
                lostMenu.close();
                go(closedStageKey('lost'));
              }}
            >
              Đánh dấu thua cuộc
            </PopoverItem>
          </Popover>
        </>
      )}

      {dialogs}
    </div>
  );
}
