/**
 * F-11 — chọn bằng chứng thẳng từ hoạt động có thật của chính cơ hội này.
 *
 * Đây là thứ làm cho `verified` có nghĩa: chọn nguồn xong, trích đoạn tự điền vào ô
 * bằng chứng và điểm được đánh dấu đã xác thực. Không có luồng này thì nguyên tắc
 * "không suy đoán" của phương pháp luận chỉ là lời khuyên.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Phone, Search } from 'lucide-react';
import { api, qs } from '../../api/client';
import { Modal } from '../common/Modal';
import { EmptyState, Input, Skeleton, focusRing } from '../common/ui';
import { t } from '../../i18n/vi';
import { formatDate } from '../../lib/format';
import type { EvidenceSource } from '../../types';

export function EvidencePicker({
  dealId,
  open,
  onClose,
  onPick,
}: {
  dealId: number;
  open: boolean;
  onClose: () => void;
  onPick: (source: EvidenceSource) => void;
}) {
  const [q, setQ] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['deal', dealId, 'evidence', q],
    queryFn: () =>
      api.get<EvidenceSource[]>(`/api/deals/${dealId}/evidence-sources${qs({ q })}`),
    enabled: open,
  });

  return (
    <Modal open={open} onClose={onClose} title="Chọn bằng chứng">
      <p className="mb-3 text-xs text-tr-muted">
        Chỉ hiện hoạt động và tài liệu của chính cơ hội này. Chọn xong, đoạn tóm tắt sẽ được
        điền vào ô bằng chứng và điểm được đánh dấu <strong>đã xác thực</strong>.
      </p>

      <div className="relative mb-3">
        <Search
          size={14}
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-tr-muted"
          aria-hidden="true"
        />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm không dấu trong nội dung…"
          className="pl-8"
        />
      </div>

      {isLoading && <Skeleton className="h-32 rounded-panel" />}

      {!isLoading && (data?.length ?? 0) === 0 && (
        <EmptyState
          message="Chưa có hoạt động hay tài liệu nào gắn với cơ hội này."
          hint="Ghi một cuộc gọi hoặc tải tài liệu lên rồi quay lại chấm điểm."
        />
      )}

      <ul className="max-h-80 space-y-1.5 overflow-auto">
        {(data ?? []).map((item) => (
          <li key={`${item.source_type}-${item.id}`}>
            <button
              type="button"
              onClick={() => {
                onPick(item);
                onClose();
              }}
              className={`w-full rounded-control border border-tr-border bg-tr-panel p-2.5 text-left transition hover:border-tr-primary ${focusRing}`}
            >
              <div className="flex items-center gap-2 text-xs text-tr-muted">
                {item.source_type === 'interaction' ? (
                  <Phone size={12} aria-hidden="true" />
                ) : (
                  <FileText size={12} aria-hidden="true" />
                )}
                <span className="font-medium text-tr-subtle">
                  {item.source_type === 'interaction'
                    ? ((t.interactionType as Record<string, string>)[item.kind] ?? item.kind)
                    : ((t.docType as Record<string, string>)[item.kind] ?? item.kind)}
                </span>
                <span>{formatDate(item.occurred_at)}</span>
                {item.contact_name && <span>· {item.contact_name}</span>}
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-tr-text">{item.summary}</p>
              {item.result && <p className="mt-0.5 text-xs text-tr-subtle">→ {item.result}</p>}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/** Ghép trích đoạn dùng làm bằng chứng từ một hoạt động/tài liệu. */
export function evidenceFrom(source: EvidenceSource): string {
  const head = `${formatDate(source.occurred_at)}${source.contact_name ? ` · ${source.contact_name}` : ''}`;
  const body = [source.summary, source.result].filter(Boolean).join(' → ');
  return `${head}: ${body}`;
}
