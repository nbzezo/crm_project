import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Sparkles, X } from 'lucide-react';
import { api } from '../../api/client';
import type { AiBriefResult, AiMode } from '../../ai/types';
import { Button, FormError } from '../common/ui';

export function AiBrief({
  contextType,
  contextId,
  compact = false,
}: {
  contextType: 'today' | 'customer' | 'deal';
  contextId?: number;
  compact?: boolean;
}) {
  const brief = useMutation({
    mutationFn: (mode: AiMode) =>
      api.post<AiBriefResult>('/api/ai/brief', {
        context_type: contextType,
        context_id: contextId,
        mode,
      }),
  });

  if (!brief.data) {
    return (
      <div
        className={`rounded-panel border border-tr-primary/20 bg-tr-panel ${compact ? 'p-3' : 'p-4'}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-tr-text">
              <Sparkles size={16} className="text-tr-primary" /> AI Brief
            </div>
            <p className="mt-1 text-xs text-tr-muted">
              Tóm tắt tình hình, rủi ro và hành động tiếp theo từ dữ liệu hiện có.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            disabled={brief.isPending}
            onClick={() => brief.mutate(contextType === 'today' ? 'fast' : 'balanced')}
          >
            <Sparkles size={14} /> {brief.isPending ? 'Đang phân tích…' : 'Tạo bản tóm tắt'}
          </Button>
        </div>
        <FormError error={brief.error} />
      </div>
    );
  }

  const result = brief.data;
  return (
    <section className="rounded-panel border border-tr-primary/25 bg-tr-panel p-4 shadow-sm">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold tracking-wide text-tr-primary uppercase">
            <Sparkles size={14} /> AI Brief
          </div>
          <h2 className="mt-1 text-base font-semibold text-tr-text">{result.headline}</h2>
        </div>
        <button
          type="button"
          onClick={() => brief.reset()}
          aria-label="Đóng AI Brief"
          className="rounded p-1 text-tr-muted hover:bg-tr-hover hover:text-tr-text"
        >
          <X size={16} />
        </button>
      </header>
      <p className="mt-2 text-sm leading-relaxed text-tr-subtle">{result.summary}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
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
      <p className="mt-3 text-2xs text-tr-muted">
        {result.meta.provider} · {result.meta.model} ·{' '}
        {result.meta.inputTokens + result.meta.outputTokens} token
      </p>
    </section>
  );
}
