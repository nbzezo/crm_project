/**
 * F-17 — Phiên rà soát pipeline định kỳ.
 *
 * Đi qua từng cơ hội có điểm quá hạn hoặc đang bị veto, mỗi màn một cơ hội với ba lựa
 * chọn: Giữ nguyên / Chấm lại / Chuyển sang Thất bại. Kết phiên tóm tắt số deal đã xử lý
 * và phần pipeline rời khỏi forecast.
 *
 * Đây là thứ biến module từ *biểu mẫu phải điền* thành *thói quen* — use case "Rà soát
 * pipeline" của spec vốn chỉ tồn tại như một lời nhắc, không phải tính năng.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { ClipboardCheck } from 'lucide-react';
import { api } from '../../api/client';
import { Modal } from '../common/Modal';
import { Button, ColorBadge, Field, Select, focusRing } from '../common/ui';
import { LOST_REASON_ORDER, t } from '../../i18n/vi';
import { QUADRANT_COLORS, QUADRANT_LABELS, VETO_LABELS } from '../../i18n/scoring';
import { formatVND } from '../../lib/format';
import type { Quadrant, VetoCode } from '../../types';

interface ReviewDeal {
  id: number;
  title: string;
  customer_name: string;
  value_vnd: number;
  weighted_vnd: number;
  blocked_by: string[];
  bant_total: number;
  p4_total: number;
  quadrant: Quadrant;
}

export function ReviewSession() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [kept, setKept] = useState(0);
  const [dropped, setDropped] = useState(0);
  const [droppedVnd, setDroppedVnd] = useState(0);
  const [lostReason, setLostReason] = useState('');

  const { data } = useQuery({
    queryKey: ['pipeline-health'],
    queryFn: () => api.get<{ excluded: ReviewDeal[] }>('/api/views/pipeline-health'),
    enabled: open,
  });

  const queue = data?.excluded ?? [];
  const current = queue[index];

  const disqualify = useMutation({
    mutationFn: (deal: ReviewDeal) =>
      api.patch(`/api/deals/${deal.id}/move`, {
        stage: 'lost',
        lost_reason: lostReason || 'other',
      }),
    onSuccess: (_result, deal) => {
      setDropped((n) => n + 1);
      setDroppedVnd((v) => v + deal.weighted_vnd);
      setLostReason('');
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-health'] });
      setIndex((i) => i + 1);
    },
  });

  function start() {
    setIndex(0);
    setKept(0);
    setDropped(0);
    setDroppedVnd(0);
    setLostReason('');
    setOpen(true);
  }

  const finished = open && queue.length > 0 && index >= queue.length;

  return (
    <>
      <Button onClick={start} className="ml-auto">
        <ClipboardCheck size={15} /> Phiên rà soát
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Rà soát pipeline"
        width="max-w-lg"
        footer={
          current && !finished ? (
            <>
              <Button
                onClick={() => {
                  setKept((n) => n + 1);
                  setIndex((i) => i + 1);
                }}
              >
                Giữ nguyên
              </Button>
              <Button
                onClick={() => {
                  setOpen(false);
                  navigate(`/deals/${current.id}`);
                }}
              >
                Chấm lại
              </Button>
              <Button
                variant="danger"
                disabled={disqualify.isPending}
                onClick={() => disqualify.mutate(current)}
              >
                Chuyển sang Thất bại
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => setOpen(false)}>
              {t.common.close ?? 'Đóng'}
            </Button>
          )
        }
      >
        {queue.length === 0 && (
          <p className="text-sm text-tr-subtle">
            Không có cơ hội nào cần rà soát — mọi deal đang mở đều có điểm còn hạn và không bị chặn
            khỏi forecast.
          </p>
        )}

        {finished && (
          <div className="space-y-2 text-sm">
            <p className="font-medium text-tr-text">Xong phiên rà soát.</p>
            <ul className="space-y-1 text-tr-subtle">
              <li>Đã xem: {queue.length} cơ hội</li>
              <li>Giữ nguyên: {kept}</li>
              <li>
                Chuyển sang Thất bại: {dropped} — gỡ {formatVND(droppedVnd)} khỏi forecast theo giai
                đoạn
              </li>
            </ul>
          </div>
        )}

        {current && !finished && (
          <div className="space-y-3">
            <p className="text-xs text-tr-muted">
              Cơ hội {index + 1}/{queue.length}
            </p>
            <div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate(`/deals/${current.id}`);
                }}
                className={`text-left text-base font-semibold text-tr-text hover:underline ${focusRing}`}
              >
                {current.title}
              </button>
              <p className="text-sm text-tr-muted">
                {current.customer_name} · {formatVND(current.value_vnd)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <ColorBadge color={QUADRANT_COLORS[current.quadrant]} small>
                {QUADRANT_LABELS[current.quadrant]}
              </ColorBadge>
              <span className="text-tr-subtle">
                BANT {current.bant_total}/12 · 4P {current.p4_total}/12
              </span>
            </div>

            <ul className="space-y-1 rounded-control border border-tr-danger/50 bg-tr-danger/10 p-2.5 text-sm">
              {current.blocked_by.map((code) => (
                <li key={code}>
                  {code === 'STALE'
                    ? 'Điểm đã quá hạn — chưa chấm lại từ lâu'
                    : `${VETO_LABELS[code as VetoCode]?.title ?? code} — ${VETO_LABELS[code as VetoCode]?.message ?? ''}`}
                </li>
              ))}
            </ul>

            <Field label="Lý do thua (nếu chuyển sang Thất bại)">
              <Select value={lostReason} onChange={(e) => setLostReason(e.target.value)}>
                <option value="">— chọn khi cần —</option>
                {LOST_REASON_ORDER.map((reason) => (
                  <option key={reason} value={reason}>
                    {t.lostReason[reason]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}
