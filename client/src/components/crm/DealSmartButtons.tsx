/**
 * Smart buttons kiểu Odoo — dãy nút đếm nhanh dưới statusbar, bấm để nhảy
 * thẳng tới khu vực liên quan. Toàn bộ số liệu lấy từ dữ liệu đã fetch sẵn ở
 * `DealDetailPage` (không gọi thêm API nào ở đây).
 */
import type { ReactNode } from 'react';
import { FileText, Gauge, PackageOpen, Users } from 'lucide-react';
import { focusRing } from '../common/ui';
import type {
  CommitteeResponse,
  HandoverState,
  QuickAssessment,
  Scorecard as ScorecardData,
} from '../../types';

type DealTab = 'overview' | 'score' | 'committee' | 'info' | 'handover';

export function DealSmartButtons({
  documentCount,
  scorecard,
  committee,
  handover,
  pendingHandover,
  onNavigate,
  quick,
}: {
  documentCount: number;
  scorecard: ScorecardData | undefined;
  committee: CommitteeResponse | undefined;
  handover: HandoverState | undefined;
  pendingHandover: boolean;
  onNavigate: (tab: DealTab) => void;
  /** Che do Co ban: o dau tien la ket qua danh gia nhanh thay cho diem BANT/4P. */
  quick?: QuickAssessment;
}) {
  const handoverDone = handover?.items.filter((i) => i.is_done).length ?? 0;
  const handoverTotal = handover?.items.length ?? 0;

  return (
    <div className="flex flex-wrap gap-2">
      {quick ? (
        <SmartButton
          icon={<Gauge size={14} aria-hidden="true" />}
          label="Đánh giá nhanh"
          value={`${quick.counts.yes} Có · ${quick.counts.unsure} Chưa rõ · ${quick.counts.no} Không`}
          onClick={() => onNavigate('overview')}
        />
      ) : (
        <SmartButton
          icon={<Gauge size={14} aria-hidden="true" />}
          label="Chấm điểm"
          value={
            scorecard
              ? `Có thật ${scorecard.bant_total}/12 · Lợi thế ${scorecard.p4_total}/12`
              : '—'
          }
          onClick={() => onNavigate('score')}
        />
      )}
      <SmartButton
        icon={<Users size={14} aria-hidden="true" />}
        label={quick ? 'Người liên quan' : 'Nhóm quyết định'}
        value={committee ? `${committee.members.length} người` : '—'}
        onClick={() => onNavigate('committee')}
      />
      <SmartButton
        icon={<FileText size={14} aria-hidden="true" />}
        label="Tài liệu"
        value={`${documentCount} tệp`}
        onClick={() => onNavigate('info')}
      />
      <SmartButton
        icon={<PackageOpen size={14} aria-hidden="true" />}
        label="Bàn giao"
        value={handoverTotal > 0 ? `${handoverDone}/${handoverTotal} mục` : '—'}
        warning={pendingHandover}
        onClick={() => onNavigate('handover')}
      />
    </div>
  );
}

function SmartButton({
  icon,
  label,
  value,
  warning,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  warning?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-0.5 rounded-control border px-3 py-1.5 text-left transition ${focusRing} ${
        warning
          ? 'border-tr-warning/50 bg-tr-warning/10 hover:bg-tr-warning/20'
          : 'border-tr-border bg-tr-panel hover:bg-tr-hover'
      }`}
    >
      <span className="flex items-center gap-1.5 text-xs text-tr-muted">
        {icon}
        {label}
      </span>
      <span className={`text-sm font-semibold ${warning ? 'text-tr-warning' : 'text-tr-text'}`}>
        {value}
      </span>
    </button>
  );
}
