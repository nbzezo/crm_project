import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { api } from '../../../api/client';
import { QUICK_ACTION_TEXT, QUICK_VERDICT_INFO } from '../../../i18n/quickAssessment';
import { formatDate } from '../../../lib/format';
import { Panel, Button, Skeleton } from '../../common/ui';
import { useUiStore } from '../../../stores/uiStore';
import type { Deal, DealAssessment, QuickAssessment } from '../../../types';

const tones = {
  success: 'border-tr-success/50 bg-tr-success/10',
  warning: 'border-tr-warning/50 bg-tr-warning/10',
  danger: 'border-tr-danger/50 bg-tr-danger/10',
  neutral: 'border-tr-border bg-tr-hover',
} as const;
export function DealOverview({ deal, onStart }: { deal: Deal; onStart: () => void }) {
  const openTaskComposer = useUiStore((s) => s.openTaskComposer);
  const { data: quick, isLoading } = useQuery({
    queryKey: ['deal', deal.id, 'quick-assessment'],
    queryFn: () => api.get<QuickAssessment>(`/api/deals/${deal.id}/quick-assessment`),
  });
  const { data: assessment } = useQuery({
    queryKey: ['deal', deal.id, 'assessment'],
    queryFn: () => api.get<DealAssessment>(`/api/deals/${deal.id}/assessment`),
  });
  if (isLoading || !quick) return <Skeleton className="h-80 rounded-panel" />;
  const verdict = QUICK_VERDICT_INFO[quick.verdict];
  /* Goi y suy tu danh gia chi tiet khong tinh la "da tu danh gia". */
  const hasAnswers = quick.answered_at !== null;
  // decisions xep moi nhat truoc
  const latestDecision = assessment?.decisions.find((d) => d.author_kind !== 'ai');
  const vetoed = Boolean(
    (deal.v1_no_event || deal.v2_no_economic) && (deal.bant_total || deal.p4_total)
  );
  return (
    <div className="space-y-4">
      <Panel>
        <div className={`rounded-control border p-5 ${tones[verdict.tone]}`}>
          <p className="text-sm font-medium text-tr-subtle">Kết luận</p>
          <h2 className="mt-1 text-2xl font-bold text-tr-text">{verdict.label}</h2>
          <p className="mt-2 text-sm text-tr-subtle">{verdict.advice}</p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm text-tr-text">
            <span>{quick.counts.yes} Có</span>
            <span>{quick.counts.unsure} Chưa rõ</span>
            <span>{quick.counts.no} Không</span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {hasAnswers ? (
            <span className="text-sm text-tr-muted">
              Đánh giá lần cuối{' '}
              {quick.answered_at ? formatDate(quick.answered_at.slice(0, 10)) : 'chưa rõ'}
            </span>
          ) : (
            <span className="text-sm text-tr-muted">
              {quick.items.some((item) => item.source === 'derived')
                ? 'Chưa tự đánh giá — kết luận đang dựa trên đánh giá chi tiết.'
                : 'Chưa có câu trả lời.'}
            </span>
          )}
          <Button variant="primary" onClick={onStart}>
            {hasAnswers ? 'Đánh giá lại' : 'Bắt đầu đánh giá (2 phút)'} <ArrowRight size={15} />
          </Button>
        </div>
      </Panel>
      {quick.next_actions.length > 0 && (
        <Panel title="Việc nên làm tiếp">
          <ul className="space-y-2">
            {quick.next_actions.slice(0, 3).map((action) => {
              const title =
                QUICK_ACTION_TEXT[action.question][action.answer === 'no' ? 'no' : 'unsure'];
              return (
                <li
                  key={action.question}
                  className="flex flex-wrap items-center gap-2 rounded-control border border-tr-border p-3"
                >
                  <span className="min-w-0 flex-1 text-sm text-tr-text">{title}</span>
                  <Button
                    size="sm"
                    onClick={() =>
                      openTaskComposer({
                        context: { deal_id: deal.id, customer_id: deal.customer_id },
                        draft: { title },
                      })
                    }
                  >
                    Tạo việc
                  </Button>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
      {latestDecision && (
        <Panel title="Quyết định gần nhất">
          <p className="flex items-center gap-2 text-sm text-tr-text">
            <CheckCircle2 size={16} className="text-tr-success" aria-hidden="true" />{' '}
            {latestDecision.author_name ?? 'Đã chọn'}:{' '}
            <strong>
              {latestDecision.decision === 'pursue'
                ? 'Theo đuổi'
                : latestDecision.decision === 'pause'
                  ? 'Tạm dừng'
                  : 'Rút'}
            </strong>{' '}
            · {formatDate(latestDecision.created_at.slice(0, 10))}
          </p>
        </Panel>
      )}
      {vetoed && (
        <p className="text-sm text-tr-muted">Cơ hội này chưa được tính vào dự báo doanh thu.</p>
      )}
    </div>
  );
}
