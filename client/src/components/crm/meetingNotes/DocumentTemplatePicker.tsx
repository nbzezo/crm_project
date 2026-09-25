import { useEffect, useRef } from 'react';
import { FilePlus2 } from 'lucide-react';
import { Modal } from '../../common/Modal';
import { focusRing } from '../../common/ui';
import { DOCUMENT_TEMPLATES, type DocumentPurpose } from './documentTemplates';

export function DocumentTemplatePicker({
  open,
  pending,
  error,
  onClose,
  onSelect,
}: {
  open: boolean;
  pending: boolean;
  error?: string | null;
  onClose: () => void;
  onSelect: (purpose: DocumentPurpose) => void;
}) {
  const selecting = useRef(false);
  useEffect(() => {
    if (!open || error) selecting.current = false;
  }, [open, error]);

  return (
    <Modal open={open} onClose={onClose} title="Chọn mục đích tài liệu" width="max-w-3xl">
      <p className="mb-4 text-sm text-tr-subtle">
        Chọn một mục để mở ngay trang mới với mẫu nội dung tương ứng.
      </p>
      {error && (
        <p role="alert" className="mb-3 text-sm text-tr-danger">
          {error}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {DOCUMENT_TEMPLATES.map((template) => (
          <button
            key={template.key}
            type="button"
            disabled={pending}
            onClick={() => {
              if (selecting.current) return;
              selecting.current = true;
              onSelect(template.key);
            }}
            className={`rounded-panel border border-tr-border bg-tr-panel p-3 text-left transition hover:border-tr-primary hover:bg-tr-hover disabled:opacity-50 ${focusRing}`}
          >
            <span className="flex items-center gap-2 font-semibold text-tr-text">
              <FilePlus2 size={16} className="text-tr-primary" aria-hidden="true" />
              {template.label}
            </span>
            <span className="mt-1 block text-xs text-tr-subtle">{template.description}</span>
            {template.sections.length > 0 && (
              <span className="mt-2 block text-xs text-tr-muted">
                {template.sections.slice(0, 3).join(' · ')}
                {template.sections.length > 3 ? '…' : ''}
              </span>
            )}
          </button>
        ))}
      </div>
    </Modal>
  );
}
