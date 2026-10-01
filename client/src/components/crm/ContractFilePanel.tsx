import { useRef, useState, type DragEvent } from 'react';
import {
  AlertTriangle,
  FileText,
  Loader2,
  RefreshCw,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';
import { Button } from '../common/ui';

/** Kết quả AI đọc hợp đồng — khớp `ContractExtraction` ở server/services/ai/contractExtract.ts. */
export interface ContractExtraction {
  contract: {
    name: string;
    number: string;
    value_vnd: number;
    sign_date: string | null;
    start_date: string | null;
    end_date: string | null;
    payment_terms: string;
    status: 'draft' | 'signing' | 'active' | 'expired';
    auto_renew: boolean | null;
  };
  customer: {
    name: string;
    tax_code: string;
    address: string;
    phone: string;
    email: string;
    representative: string;
    representative_title: string;
  };
  customer_match: { id: number; name: string; reason: 'tax_code' | 'name' } | null;
  customer_candidates: { id: number; name: string; tax_code: string | null }[];
  suggested_deal_id: number | null;
  summary: string;
  key_points: string[];
  risks: string[];
  confidence: number;
  extraction: string;
  warnings: string[];
}

export type FilePanelStatus = 'idle' | 'reading' | 'done' | 'error' | 'no-ai';

export const CONTRACT_FILE_ACCEPT = '.pdf,.doc,.docx,.txt,.png,.jpg,.jpeg';

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Khung tải tệp hợp đồng đầu form. Không tự gọi API: cha giữ trạng thái để giữ được
 * tệp qua các lần AI đọc lại, và để form vẫn nhập tay bình thường khi AI hỏng/chưa bật.
 */
export function ContractFilePanel({
  file,
  status,
  error,
  extraction,
  large,
  onPick,
  onClear,
  onRetry,
  onAppendSummary,
  summaryAppended,
}: {
  file: File | null;
  status: FilePanelStatus;
  error?: string | null;
  extraction: ContractExtraction | null;
  large?: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
  onRetry: () => void;
  onAppendSummary: () => void;
  summaryAppended: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const accept = (files: FileList | null) => {
    const picked = files?.[0];
    if (picked) onPick(picked);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    accept(event.dataTransfer.files);
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      className="sr-only"
      accept={CONTRACT_FILE_ACCEPT}
      aria-label="Chọn tệp hợp đồng"
      onChange={(e) => {
        accept(e.target.files);
        e.target.value = '';
      }}
    />
  );

  if (!file) {
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-panel border-2 border-dashed text-center transition-colors ${
          dragging ? 'border-tr-primary bg-tr-hover' : 'border-tr-border'
        } ${large ? 'px-4 py-8' : 'px-3 py-3'}`}
      >
        {input}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex flex-col items-center gap-1 text-sm text-tr-subtle hover:text-tr-text"
        >
          <span className="inline-flex items-center gap-2 font-medium text-tr-text">
            {large ? (
              <UploadCloud size={22} aria-hidden="true" />
            ) : (
              <Sparkles size={16} aria-hidden="true" />
            )}
            Tải tệp hợp đồng lên — AI tự điền thông tin
          </span>
          <span className="text-xs text-tr-muted">
            Kéo thả hoặc bấm để chọn · PDF, Word, ảnh scan · tối đa 25 MB. Không có AI vẫn nhập tay
            được, tệp sẽ được đính kèm vào hợp đồng.
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-panel border border-tr-border bg-tr-hover/40 p-3">
      {input}
      <div className="flex items-center gap-2 text-sm">
        <FileText size={16} className="shrink-0 text-tr-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-medium text-tr-text">{file.name}</span>
        <span className="shrink-0 text-xs text-tr-muted">{formatSize(file.size)}</span>
        {(status === 'done' || status === 'error') && (
          <Button size="sm" onClick={onRetry} title="Cho AI đọc lại tệp">
            <RefreshCw size={14} /> Đọc lại
          </Button>
        )}
        <Button size="sm" onClick={onClear} aria-label="Bỏ tệp">
          <X size={14} />
        </Button>
      </div>

      {status === 'reading' && (
        <p role="status" className="flex items-center gap-2 text-xs text-tr-subtle">
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          AI đang đọc hợp đồng… có thể mất vài chục giây với tệp scan. Bạn vẫn có thể nhập tay bên
          dưới.
        </p>
      )}
      {status === 'no-ai' && (
        <p className="text-xs text-tr-subtle">
          Chưa bật nhà cung cấp AI (Cài đặt → Trợ lý AI) nên chưa tự điền được. Bạn nhập thông tin
          bên dưới; tệp vẫn được đính kèm vào hợp đồng khi lưu.
        </p>
      )}
      {status === 'error' && (
        <p role="alert" className="flex items-start gap-2 text-xs text-tr-danger">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {error || 'AI chưa đọc được tệp.'} Bạn có thể bấm “Đọc lại” hoặc nhập tay; tệp vẫn được
            đính kèm khi lưu.
          </span>
        </p>
      )}

      {status === 'done' && extraction && (
        <div className="space-y-2 border-t border-tr-border pt-2 text-xs">
          <p className="flex items-center gap-1.5 text-tr-subtle">
            <Sparkles size={13} className="text-tr-primary" aria-hidden="true" />
            AI đã điền các ô bên dưới (độ tin cậy ~{Math.round(extraction.confidence * 100)}%) —
            kiểm tra lại trước khi lưu.
          </p>
          {extraction.warnings.map((w) => (
            <p key={w} className="flex items-start gap-1.5 text-tr-warning">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              {w}
            </p>
          ))}
          {extraction.summary && <p className="text-tr-text">{extraction.summary}</p>}
          {(extraction.key_points.length > 0 || extraction.risks.length > 0) && (
            <div className="grid gap-2 sm:grid-cols-2">
              {extraction.key_points.length > 0 && (
                <div>
                  <p className="mb-0.5 font-semibold text-tr-subtle">Điều khoản chính</p>
                  <ul className="list-disc space-y-0.5 pl-4 text-tr-text">
                    {extraction.key_points.map((k) => (
                      <li key={k}>{k}</li>
                    ))}
                  </ul>
                </div>
              )}
              {extraction.risks.length > 0 && (
                <div>
                  <p className="mb-0.5 font-semibold text-tr-warning">Cần lưu ý</p>
                  <ul className="list-disc space-y-0.5 pl-4 text-tr-text">
                    {extraction.risks.map((k) => (
                      <li key={k}>{k}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {extraction.contract.auto_renew && (
            <p className="text-tr-warning">
              Hợp đồng có điều khoản tự động gia hạn — nhớ theo dõi trước ngày kết thúc.
            </p>
          )}
          {(extraction.summary ||
            extraction.key_points.length > 0 ||
            extraction.risks.length > 0) && (
            <Button size="sm" onClick={onAppendSummary} disabled={summaryAppended}>
              {summaryAppended ? 'Đã thêm vào ghi chú' : 'Thêm tóm tắt AI vào ghi chú'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
