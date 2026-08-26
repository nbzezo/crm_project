/**
 * Chuyển giai đoạn cơ hội — dùng chung giữa bảng Kanban (kéo-thả) và statusbar
 * trên trang chi tiết cơ hội (bấm thẳng vào một bước).
 *
 * Gộp cả 3 việc luôn đi kèm khi đổi `stage`, để nơi gọi không phải tự lo:
 *  - F-04: cổng giai đoạn chặn khi điểm BANT chưa đủ, ghi đè được nhưng bắt
 *    buộc nhập lý do (lưu vào lịch sử điểm).
 *  - BR-03: chuyển sang "Thua" bắt buộc chọn lý do trước khi máy chủ chấp nhận.
 *  - FR-OPP-06: chuyển sang "Thắng" mở form nhập giá trị chốt thật, tuỳ chọn
 *    tạo luôn hợp đồng.
 *
 * Chỉ có MỘT endpoint chạy đủ 3 luồng trên: `PATCH /api/deals/:id/move` —
 * không dùng `PATCH /api/deals/:id` (không chạy cổng giai đoạn).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { ApiError, api } from '../api/client';
import { Modal } from '../components/common/Modal';
import {
  Button,
  DateInput,
  Field,
  Input,
  MoneyInput,
  Select,
  Textarea,
} from '../components/common/ui';
import { LOST_REASON_ORDER, t } from '../i18n/vi';
import { FACTOR_LABELS, VETO_LABELS } from '../i18n/scoring';
import { formatVND, todayStr } from '../lib/format';
import type { Deal, Factor, Stage, VetoCode } from '../types';

/** Phần chi tiết server gửi kèm lỗi 409 STAGE_GATE_BLOCKED. */
export interface GateDetails {
  target: Stage;
  required: number;
  bant_total: number;
  blocked_by: string[];
}

export type MoveVars = {
  dealId: number;
  stage: Stage;
  beforeId: number | null;
  afterId: number | null;
};

export function useDealStageMove(opts: {
  /** Gọi sau mỗi lần đổi giai đoạn thành công (kể cả sau khi lưu WonDialog) — nơi gọi tự quyết định invalidate query nào. */
  invalidate: () => void;
  /** Việc riêng của nơi gọi khi đổi thành công, trước khi mở WonDialog (vd: dọn state kéo-thả). */
  onMoveSuccess?: (deal: Deal, vars: MoveVars) => void;
  /** Việc riêng của nơi gọi khi đổi thất bại (vd: hoàn tác optimistic UI). */
  onMoveError?: () => void;
}) {
  const navigate = useNavigate();
  const [pendingLost, setPendingLost] = useState<MoveVars | null>(null);
  const [lostReason, setLostReason] = useState('');
  const [lostNote, setLostNote] = useState('');
  const [wonDeal, setWonDeal] = useState<Deal | null>(null);
  const [pendingGate, setPendingGate] = useState<{ vars: MoveVars; details: GateDetails } | null>(
    null
  );
  const [overrideReason, setOverrideReason] = useState('');

  const move = useMutation({
    mutationFn: (
      vars: MoveVars & { lost_reason?: string; lost_note?: string; override?: string }
    ) =>
      api.patch<Deal>(
        `/api/deals/${vars.dealId}/move${vars.override ? `?override=1&reason=${encodeURIComponent(vars.override)}` : ''}`,
        {
          stage: vars.stage,
          beforeId: vars.beforeId,
          afterId: vars.afterId,
          lost_reason: vars.lost_reason,
          lost_note: vars.lost_note,
        }
      ),
    onSuccess: (deal, vars) => {
      opts.onMoveSuccess?.(deal, vars);
      opts.invalidate();
      if (vars.stage === 'won') setWonDeal(deal);
    },
    onError: (error, vars) => {
      opts.onMoveError?.();
      // Server tu choi vi chua co ly do thua -> mo hop thoai bat buoc chon
      if (error instanceof Error && error.message === 'NEED_LOST_REASON') {
        setPendingLost(vars);
        setLostReason('');
        setLostNote('');
      }
      // F-04: cong giai doan chan -> noi ro yeu to nao dang thieu, cho ghi de
      if (error instanceof ApiError && error.message === 'STAGE_GATE_BLOCKED') {
        setPendingGate({ vars, details: error.details as unknown as GateDetails });
        setOverrideReason('');
      }
    },
  });

  const dialogs: ReactNode = (
    <>
      <StageGateDialog
        pending={pendingGate}
        reason={overrideReason}
        onReason={setOverrideReason}
        onCancel={() => setPendingGate(null)}
        onOpenScorecard={() => {
          const dealId = pendingGate?.vars.dealId;
          setPendingGate(null);
          if (dealId) navigate(`/deals/${dealId}`);
        }}
        onOverride={() => {
          if (!pendingGate) return;
          move.mutate({ ...pendingGate.vars, override: overrideReason });
          setPendingGate(null);
        }}
      />

      <LostReasonDialog
        pending={pendingLost}
        reason={lostReason}
        note={lostNote}
        onReason={setLostReason}
        onNote={setLostNote}
        onCancel={() => setPendingLost(null)}
        onConfirm={() => {
          if (!pendingLost || !lostReason) return;
          move.mutate({ ...pendingLost, lost_reason: lostReason, lost_note: lostNote });
          setPendingLost(null);
        }}
      />

      <WonDialog deal={wonDeal} onClose={() => setWonDeal(null)} onDone={opts.invalidate} />
    </>
  );

  return { move: move.mutate, dialogs };
}

function StageGateDialog({
  pending,
  reason,
  onReason,
  onCancel,
  onOpenScorecard,
  onOverride,
}: {
  pending: { vars: MoveVars; details: GateDetails } | null;
  reason: string;
  onReason: (v: string) => void;
  onCancel: () => void;
  onOpenScorecard: () => void;
  onOverride: () => void;
}) {
  const details = pending?.details;
  const missingFactors = (details?.blocked_by ?? [])
    .filter((code) => code.startsWith('factor:'))
    .map((code) => code.slice('factor:'.length) as Factor);
  const missingVeto = (details?.blocked_by ?? []).filter((code) => code.startsWith('veto:'));

  return (
    <Modal
      open={pending !== null}
      onClose={onCancel}
      title="Chưa đủ điều kiện chuyển giai đoạn"
      width="max-w-md"
      footer={
        <>
          <Button onClick={onCancel}>{t.common.cancel}</Button>
          <Button onClick={onOpenScorecard}>Mở scorecard</Button>
          <Button variant="primary" disabled={reason.trim().length < 10} onClick={onOverride}>
            Vẫn chuyển
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-tr-text">
          Giai đoạn <strong>{details ? t.stage[details.target] : ''}</strong> yêu cầu BANT ≥{' '}
          <strong>{details?.required}</strong>, cơ hội này đang{' '}
          <strong className="text-tr-danger">{details?.bant_total}</strong>.
        </p>

        {missingFactors.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold text-tr-subtle">
              Yếu tố còn nâng điểm được ngay với dữ liệu hiện có:
            </p>
            <ul className="list-disc space-y-0.5 pl-5 text-tr-text">
              {missingFactors.map((factor) => (
                <li key={factor}>{FACTOR_LABELS[factor]}</li>
              ))}
            </ul>
          </div>
        )}

        {missingVeto.length > 0 && (
          <p className="rounded-control border border-tr-danger/50 bg-tr-danger/10 px-2.5 py-2 text-tr-text">
            {missingVeto.map((code) => VETO_LABELS[code.slice(5) as VetoCode]?.title).join(', ')}
          </p>
        )}

        <Field label="Lý do ghi đè" hint="Bắt buộc, tối thiểu 10 ký tự — được ghi vào lịch sử điểm">
          <Textarea rows={2} value={reason} onChange={(e) => onReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/** BR-03 / AC-04: không cho chuyển sang Thua nếu chưa chọn lý do. */
function LostReasonDialog({
  pending,
  reason,
  note,
  onReason,
  onNote,
  onCancel,
  onConfirm,
}: {
  pending: MoveVars | null;
  reason: string;
  note: string;
  onReason: (v: string) => void;
  onNote: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={pending !== null}
      onClose={onCancel}
      title="Vì sao thua cơ hội này?"
      width="max-w-md"
      footer={
        <>
          <Button onClick={onCancel}>{t.common.cancel}</Button>
          <Button variant="primary" disabled={!reason} onClick={onConfirm}>
            Xác nhận thua
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t.deal.lostReason}>
          <Select value={reason} onChange={(e) => onReason(e.target.value)}>
            <option value="">— bắt buộc chọn —</option>
            {LOST_REASON_ORDER.map((r) => (
              <option key={r} value={r}>
                {t.lostReason[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ghi chú chi tiết" hint={t.common.optional}>
          <Textarea rows={3} value={note} onChange={(e) => onNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/** FR-OPP-06: nhập giá trị chốt thực tế, có thể tạo luôn hợp đồng. */
function WonDialog({
  deal,
  onClose,
  onDone,
}: {
  deal: Deal | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [wonValue, setWonValue] = useState(0);
  const [makeContract, setMakeContract] = useState(true);
  const [number, setNumber] = useState('');
  const [start, setStart] = useState<string | null>(todayStr());
  const [end, setEnd] = useState<string | null>(null);

  const open = deal !== null;

  useEffect(() => {
    if (!deal) return;
    setWonValue(deal.won_value_vnd ?? deal.value_vnd);
    setNumber('');
    setStart(todayStr());
    setEnd(null);
    setMakeContract(true);
  }, [deal?.id]);

  const save = useMutation({
    mutationFn: async () => {
      if (!deal) return;
      await api.patch(`/api/deals/${deal.id}`, {
        won_value_vnd: wonValue || deal.value_vnd,
      });
      if (makeContract) {
        await api.post('/api/contracts', {
          customer_id: deal.customer_id,
          deal_id: deal.id,
          name: deal.title,
          number: number || null,
          value_vnd: wonValue || deal.value_vnd,
          sign_date: todayStr(),
          start_date: start,
          end_date: end,
          status: 'active',
        });
      }
    },
    onSuccess: () => {
      onDone();
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Chốt thành công: ${deal?.title ?? ''}`}
      width="max-w-lg"
      footer={
        <>
          <Button onClick={onClose}>Để sau</Button>
          <Button variant="primary" onClick={() => save.mutate()}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field
            label="Giá trị chốt thực tế"
            hint={deal ? `Giá trị dự kiến: ${formatVND(deal.value_vnd)}` : undefined}
          >
            <MoneyInput value={wonValue} onChange={setWonValue} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-tr-text">
            <input
              type="checkbox"
              checked={makeContract}
              onChange={(e) => setMakeContract(e.target.checked)}
              className="h-4 w-4 rounded border-tr-border"
            />
            Tạo hợp đồng từ cơ hội này
          </label>
        </div>

        {/*
          Cảnh báo MỀM, không chặn: đặc tả yêu cầu Won gắn với hợp đồng/PO đã ký
          hoặc một phê duyệt ngoại lệ, nhưng chặn cứng ngay tại thao tác kéo-thả
          sẽ làm gãy một luồng người dùng đang dùng hằng ngày. Nói rõ hệ quả rồi
          để họ tự quyết là đủ để hồ sơ không bị bỏ quên âm thầm.
        */}
        {!makeContract && (deal?.contract_count ?? 0) === 0 && (
          <div className="rounded-control border border-tr-warning/40 bg-tr-warning/10 px-3 py-2 text-xs text-tr-text sm:col-span-2">
            <span className="font-semibold">Chưa có hợp đồng hay PO nào gắn với cơ hội này.</span>{' '}
            Cơ hội vẫn được ghi nhận là Thắng, nhưng sẽ nằm ở diện <b>chờ bàn giao</b> cho tới khi
            hồ sơ đủ — đánh dấu &ldquo;Hồ sơ bàn giao đã đủ&rdquo; trong biểu mẫu cơ hội khi xong.
          </div>
        )}

        {makeContract && (
          <>
            <Field label="Số hợp đồng">
              <Input value={number} onChange={(e) => setNumber(e.target.value)} />
            </Field>
            <Field label="Ngày bắt đầu">
              <DateInput value={start} onChange={setStart} />
            </Field>
            <Field label="Ngày kết thúc">
              <DateInput value={end} onChange={setEnd} />
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}
