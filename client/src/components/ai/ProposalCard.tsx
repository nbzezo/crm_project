import { Check, ShieldCheck, X } from 'lucide-react';
import { Button } from '../common/ui';
import type { AiActionProposal } from '../../ai/types';

/**
 * De xuat hanh dong cua AI, kem nut duyet.
 *
 * Xuat hien o hai cho: ngay duoi cau tra loi trong khung chat, va trong danh
 * sach "Hành động chờ duyệt" o tab Van hanh. Mot ban duy nhat — hai ban se lech
 * nhau dung vao luc nguoi dung can tin vao con so trong `payload`.
 *
 * `payload` hien duoi dang JSON tho co chu y: day la thu SAP DUOC GHI vao CSDL,
 * va nguoi duyet phai nhin thay chinh xac no chu khong phai mot ban tom tat.
 */
export function ProposalCard({
  proposal,
  onDecide,
  pending,
}: {
  proposal: AiActionProposal;
  onDecide: (decision: 'approve' | 'reject') => void;
  pending: boolean;
}) {
  return (
    <div className="rounded-panel border border-tr-warning/40 bg-tr-hover p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-tr-text">
        <ShieldCheck size={15} className="text-tr-warning" aria-hidden="true" /> Hành động cần bạn
        xác nhận
      </div>
      <h3 className="mt-2 text-sm font-semibold text-tr-text">{proposal.title}</h3>
      {proposal.explanation && (
        <p className="mt-1 text-xs text-tr-subtle">{proposal.explanation}</p>
      )}
      <pre className="tr-scroll mt-2 max-h-44 overflow-auto rounded-lg bg-tr-panel p-2 text-xs whitespace-pre-wrap text-tr-muted">
        {JSON.stringify(proposal.payload, null, 2)}
      </pre>
      {proposal.status === 'pending' ? (
        <div className="mt-3 flex gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={pending}
            onClick={() => onDecide('approve')}
          >
            <Check size={14} aria-hidden="true" /> Duyệt &amp; thực thi
          </Button>
          <Button size="sm" disabled={pending} onClick={() => onDecide('reject')}>
            <X size={14} aria-hidden="true" /> Từ chối
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-xs font-medium text-tr-muted">Trạng thái: {proposal.status}</p>
      )}
    </div>
  );
}
