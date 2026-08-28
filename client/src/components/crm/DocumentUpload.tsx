import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Paperclip, Trash2, Upload } from 'lucide-react';
import { api, qs } from '../../api/client';
import { Button, EmptyState, Field, Select, focusRing } from '../common/ui';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { DOC_TYPE_ORDER, t } from '../../i18n/vi';
import { formatDateTime } from '../../lib/format';
import { useUiStore } from '../../stores/uiStore';
import type { CrmDocument } from '../../types';

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

/** Gioi han khop voi may chu — kiem tra o day de bao loi truoc khi tai len. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const DOCUMENT_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.txt,.csv,.zip';
const UPLOAD_HINT = 'Hỗ trợ PDF, Word, Excel, PowerPoint, ảnh — tối đa 25 MB.';

interface Links {
  customer_id?: number;
  deal_id?: number;
  contract_id?: number;
  quotation_id?: number;
}

/** Khu vực tải lên + danh sách tài liệu, dùng lại ở khách hàng / cơ hội / hợp đồng. */
export function DocumentPanel({ links, title }: { links: Links; title?: string }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const inputRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState('other');
  const [dragging, setDragging] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: documents = [] } = useQuery({
    queryKey: ['documents', links],
    queryFn: () => api.get<CrmDocument[]>(`/api/documents${qs(links as Record<string, number>)}`),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append('file', file);
      body.append('doc_type', docType);
      for (const [key, value] of Object.entries(links))
        if (value !== undefined) body.append(key, String(value));
      const res = await fetch('/api/documents', { method: 'POST', body });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'Tải tệp thất bại');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['customer'] });
      pushToast('Đã tải tài liệu lên', 'success');
    },
    onError: (error) => pushToast(error instanceof Error ? error.message : 'Tải tệp thất bại'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/documents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['customer'] });
    },
  });

  /** Chan tep qua co ngay tren may — truoc day phai doi may chu tu choi. */
  const submitFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      pushToast(`Tệp ${formatBytes(file.size)} vượt giới hạn 25 MB.`);
      return;
    }
    upload.mutate(file);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        {title && <h3 className="mr-auto text-sm font-semibold text-tr-subtle">{title}</h3>}
        <div className="w-52">
          <Field label="Loại tài liệu">
            <Select value={docType} onChange={(e) => setDocType(e.target.value)}>
              {DOC_TYPE_ORDER.map((d) => (
                <option key={d} value={d}>
                  {t.docType[d]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={DOCUMENT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            submitFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <Button
          variant="primary"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
        >
          <Upload size={15} aria-hidden="true" /> {upload.isPending ? 'Đang tải…' : 'Tải tệp lên'}
        </Button>
      </div>

      {/* Vung keo tha — gioi han dung luong luon nhin thay, khong bien mat
          ngay khi co tai lieu dau tien nhu truoc. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          submitFile(e.dataTransfer.files?.[0]);
        }}
        className={`mb-3 rounded-panel border border-dashed px-3 py-2 text-center text-xs transition ${
          dragging
            ? 'border-tr-primary bg-tr-primary/10 text-tr-text'
            : 'border-tr-border text-tr-muted'
        }`}
      >
        Kéo tệp vào đây để tải lên. {UPLOAD_HINT}
      </div>

      {documents.length === 0 ? (
        <EmptyState message="Chưa có tài liệu nào." hint={UPLOAD_HINT} />
      ) : (
        <ul className="divide-y divide-tr-border overflow-hidden rounded-lg border border-tr-border bg-tr-panel">
          {documents.map((doc) => (
            <li key={doc.id} className="group flex items-center gap-3 px-3 py-2.5 text-sm">
              <FileText size={16} className="shrink-0 text-tr-muted" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-tr-text">{doc.name}</div>
                <div className="truncate text-xs text-tr-muted">
                  {t.docType[doc.doc_type] ?? doc.doc_type} · {formatBytes(doc.size)} ·{' '}
                  {formatDateTime(doc.created_at.replace(' ', 'T').slice(0, 16))}
                </div>
              </div>
              <a
                href={`/api/documents/${doc.id}/download`}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-tr-muted transition hover:bg-tr-hover hover:text-tr-primary fine:h-8 fine:w-8 ${focusRing}`}
                aria-label={`Tải về: ${doc.name}`}
              >
                <Download size={15} aria-hidden="true" />
              </a>
              <button
                type="button"
                onClick={() => setDeleteId(doc.id)}
                aria-label={`${t.common.delete}: ${doc.name}`}
                /* Truoc day opacity-0 + group-hover: nut vo hinh khi Tab toi
                   va tren thiet bi cam ung. */
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-tr-muted transition hover:bg-tr-hover hover:text-tr-danger fine:h-8 fine:w-8 hoverable:opacity-0 hoverable:group-hover:opacity-100 hoverable:focus-visible:opacity-100 ${focusRing}`}
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Xoa tai lieu truoc day khong hoi lai, du ConfirmDialog da co san. */}
      <ConfirmDialog
        open={deleteId !== null}
        message="Chuyển tài liệu này vào thùng rác? Bạn có thể khôi phục sau."
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) remove.mutate(deleteId);
          setDeleteId(null);
        }}
      />
    </div>
  );
}

export function DocumentCountBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-tr-muted">
      <Paperclip size={12} />
      {count}
    </span>
  );
}
