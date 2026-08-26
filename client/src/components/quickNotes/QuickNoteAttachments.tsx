import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Trash2, Upload } from 'lucide-react';
import { api, qs } from '../../api/client';
import { formatBytes } from '../crm/DocumentUpload';
import { formatDateTime } from '../../lib/format';
import { useUiStore } from '../../stores/uiStore';
import type { CrmDocument } from '../../types';

/**
 * FR18: dinh kem tep cho Ghi chu nhanh — dung lai nguyen kho tai lieu CRM
 * (documentService.ts, multer, 25MB), chi khac cot lien ket `quick_note_id`,
 * giong het cach AttachmentSection.tsx lam voi `card_id`.
 */
export function QuickNoteAttachments({ noteId }: { noteId: number }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: attachments = [] } = useQuery({
    queryKey: ['documents', 'quick-note', noteId],
    queryFn: () => api.get<CrmDocument[]>(`/api/documents${qs({ quick_note_id: noteId })}`),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['documents', 'quick-note', noteId] });
    queryClient.invalidateQueries({ queryKey: ['quick-notes'] });
  };

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append('file', file);
      body.append('quick_note_id', String(noteId));
      const res = await fetch('/api/documents', { method: 'POST', body });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'Tải tệp thất bại');
      }
      return res.json();
    },
    onSuccess: () => {
      refresh();
      pushToast('Đã đính kèm tệp', 'success');
    },
    onError: (error) => pushToast(error instanceof Error ? error.message : 'Tải tệp thất bại'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/documents/${id}`),
    onSuccess: refresh,
  });

  return (
    <div>
      {attachments.length > 0 && (
        <ul className="mb-2 space-y-1">
          {attachments.map((doc) => (
            <li
              key={doc.id}
              className="group flex items-center gap-2 rounded-md border border-tr-border bg-tr-card px-2 py-1.5"
            >
              <FileText size={15} className="shrink-0 text-tr-muted" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-tr-text">{doc.name}</div>
                <div className="truncate text-xs text-tr-muted">
                  {formatBytes(doc.size)} ·{' '}
                  {formatDateTime(doc.created_at.replace(' ', 'T').slice(0, 16))}
                </div>
              </div>
              <a
                href={`/api/documents/${doc.id}/download`}
                className="shrink-0 rounded p-1 text-tr-subtle transition hover:bg-tr-hover-strong hover:text-tr-primary"
                title="Tải về"
              >
                <Download size={14} />
              </a>
              <button
                onClick={() => remove.mutate(doc.id)}
                className="shrink-0 rounded p-1 text-tr-muted opacity-0 transition group-hover:opacity-100 hover:bg-tr-hover-strong hover:text-tr-danger"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.mutate(file);
          e.target.value = '';
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={upload.isPending}
        className="inline-flex items-center gap-1 rounded px-1 py-1 text-sm text-tr-subtle transition hover:text-tr-text disabled:opacity-50"
      >
        <Upload size={14} /> {upload.isPending ? 'Đang tải…' : 'Đính kèm tệp'}
      </button>
    </div>
  );
}
