import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, RefreshCw, Sparkles } from 'lucide-react';
import { api } from '../../api/client';
import type { AiBriefResult, AiMode } from '../../ai/types';
import { Button, FormError } from '../common/ui';
import { Modal } from '../common/Modal';

export function AiBrief({
  contextType,
  contextId,
}: {
  contextType: 'today' | 'customer' | 'deal';
  contextId?: number;
}) {
  const [open, setOpen] = useState(false);
  const brief = useMutation({
    mutationFn: (mode: AiMode) =>
      api.post<AiBriefResult>('/api/ai/brief', {
        context_type: contextType,
        context_id: contextId,
        mode,
      }),
  });

  const generate = () => brief.mutate(contextType === 'today' ? 'fast' : 'balanced');
  const result = brief.data;

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Sparkles size={14} className="text-tr-primary" /> AI Brief
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        width="max-w-lg"
        title={
          <span className="flex items-center gap-1.5">
            <Sparkles size={16} className="text-tr-primary" /> AI Brief
          </span>
        }
      >
        {!result ? (
          <div>
            <p className="text-sm text-tr-subtle">
              Tóm tắt tình hình, rủi ro và hành động tiếp theo từ dữ liệu hiện có.
            </p>
            <Button
              variant="primary"
              size="sm"
              className="mt-3"
              disabled={brief.isPending}
              onClick={generate}
            >
              <Sparkles size={14} /> {brief.isPending ? 'Đang phân tích…' : 'Tạo bản tóm tắt'}
            </Button>
            <FormError error={brief.error} />
          </div>
        ) : (
          <div>
            <h2 className="text-base font-semibold text-tr-text">{result.headline}</h2>
            <p className="mt-2 text-sm leading-relaxed text-tr-subtle">{result.summary}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {result.risks.length > 0 && (
                <div className="rounded-lg bg-tr-hover p-3">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-tr-text">
                    <AlertTriangle size={14} className="text-tr-warning" /> Rủi ro
                  </h3>
                  <ul className="mt-2 space-y-1 text-xs text-tr-subtle">
                    {result.risks.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.next_actions.length > 0 && (
                <div className="rounded-lg bg-tr-hover p-3">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-tr-text">
                    <CheckCircle2 size={14} className="text-tr-success" /> Hành động đề xuất
                  </h3>
                  <ul className="mt-2 space-y-1 text-xs text-tr-subtle">
                    {result.next_actions.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-2xs text-tr-muted">
                {result.meta.provider} · {result.meta.model} ·{' '}
                {result.meta.inputTokens + result.meta.outputTokens} token
              </p>
              <Button variant="ghost" size="sm" disabled={brief.isPending} onClick={generate}>
                <RefreshCw size={13} /> {brief.isPending ? 'Đang tạo lại…' : 'Tạo lại'}
              </Button>
            </div>
            <FormError error={brief.error} />
          </div>
        )}
      </Modal>
    </>
  );
}
