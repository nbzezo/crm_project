import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HeartHandshake, Lightbulb, RefreshCcw, RotateCcw, ShoppingBag, X } from 'lucide-react';
import { api } from '../../api/client';
import { formatVND } from '../../lib/format';
import { useUiStore } from '../../stores/uiStore';
import type { CustomerSuggestion, Deal, SuggestionKind, SuggestionStats } from '../../types';
import { Modal } from '../common/Modal';
import { Button, FormError, Input, Panel } from '../common/ui';
import { DealForm } from './DealForm';

export const SUGGESTION_META: Record<
  SuggestionKind,
  { label: string; icon: typeof Lightbulb; action: string }
> = {
  renewal: { label: 'Gia hạn', icon: RefreshCcw, action: 'Tạo cơ hội gia hạn' },
  cross_sell: { label: 'Bán chéo', icon: ShoppingBag, action: 'Tạo cơ hội' },
  reopen_quote: { label: 'Mở lại báo giá', icon: RotateCcw, action: 'Tạo cơ hội' },
  reopen_lost: { label: 'Mở lại cơ hội thua', icon: RotateCcw, action: 'Tạo cơ hội' },
  aftercare: { label: 'Chăm sóc sau bán', icon: HeartHandshake, action: 'Tạo 3 nhắc hẹn' },
};

const DISMISS_REASONS = [
  'Khách không có nhu cầu',
  'Đã có kế hoạch khác',
  'Không phù hợp thời điểm',
  'Đã xử lý ngoài hệ thống',
];

/**
 * Gợi ý cơ hội / bán thêm / chăm sóc. Nhận gợi ý tạo cơ hội thì mở form Cơ hội
 * điền sẵn — người dùng duyệt rồi mới lưu; lưu xong mới đánh dấu "đã nhận" kèm
 * cơ hội vừa tạo, để đo tỉ lệ chấp nhận và truy ngược gợi ý → doanh thu.
 */
export function CustomerSuggestions({
  customerId,
  suggestions,
  stats,
}: {
  customerId: number;
  suggestions: CustomerSuggestion[];
  stats: SuggestionStats;
}) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [creating, setCreating] = useState<CustomerSuggestion | null>(null);
  const [dismissing, setDismissing] = useState<CustomerSuggestion | null>(null);

  const global = useQuery({
    queryKey: ['customers', 'suggestion-stats'],
    queryFn: () => api.get<SuggestionStats>('/api/customers/suggestions/stats'),
    staleTime: 5 * 60_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['customer', customerId] });
    void queryClient.invalidateQueries({ queryKey: ['customers', 'suggestion-stats'] });
  };

  const accept = useMutation({
    mutationFn: (input: { suggestion: CustomerSuggestion; dealId?: number }) =>
      api.post<{ reminder_ids: number[] }>(
        `/api/customers/${customerId}/suggestions/${input.suggestion.id}/accept`,
        { deal_id: input.dealId ?? null }
      ),
    onSuccess: (result, input) => {
      pushToast(
        input.suggestion.kind === 'aftercare'
          ? `Đã tạo ${result.reminder_ids.length} nhắc hẹn chăm sóc sau bán.`
          : 'Đã tạo cơ hội từ gợi ý.',
        'success'
      );
      refresh();
    },
    onError: (error) => pushToast(error instanceof Error ? error.message : 'Không lưu được'),
  });

  const start = (suggestion: CustomerSuggestion) => {
    if (suggestion.kind === 'aftercare') accept.mutate({ suggestion });
    else setCreating(suggestion);
  };

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          <Lightbulb size={16} aria-hidden="true" /> Gợi ý cơ hội &amp; chăm sóc
        </span>
      }
      action={
        <span className="text-xs text-tr-muted">
          {stats.accepted + stats.dismissed > 0
            ? `Khách này: nhận ${stats.accepted}/${stats.accepted + stats.dismissed}`
            : null}
          {global.data?.acceptance_rate != null &&
            ` · Toàn hệ thống: ${global.data.acceptance_rate}% được nhận`}
        </span>
      }
    >
      {suggestions.length === 0 ? (
        <p className="text-sm text-tr-muted">
          Chưa có gợi ý mới. Gợi ý xuất hiện khi hợp đồng/dịch vụ sắp hết hạn, báo giá quá hạn chưa
          chốt, có cơ hội thua đủ lâu để mở lại, vừa chốt đơn, hoặc khách cùng ngành đang dùng dịch
          vụ mà khách này chưa dùng.
        </p>
      ) : (
        <ul className="divide-y divide-tr-border">
          {suggestions.map((s) => {
            const meta = SUGGESTION_META[s.kind];
            const Icon = meta.icon;
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-start gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <Icon size={18} className="mt-0.5 shrink-0 text-tr-primary" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-tr-text">{s.title}</p>
                  <p className="text-xs text-tr-subtle">{s.reason}</p>
                  <p className="mt-0.5 text-xs text-tr-muted">
                    {meta.label}
                    {s.value_vnd > 0 && ` · Giá trị tham khảo ${formatVND(s.value_vnd)}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={accept.isPending}
                    onClick={() => start(s)}
                  >
                    {meta.action}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setDismissing(s)}
                    aria-label={`Bỏ qua gợi ý: ${s.title}`}
                  >
                    <X size={14} aria-hidden="true" /> Bỏ qua
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <DealForm
        open={creating !== null}
        onClose={() => setCreating(null)}
        defaultCustomerId={customerId}
        defaults={
          creating
            ? {
                title: creating.title,
                value_vnd: creating.value_vnd,
                notes: `Từ gợi ý: ${creating.reason}`,
                is_renewal: creating.kind === 'renewal',
              }
            : undefined
        }
        onCreated={(deal: Deal) => {
          if (creating) accept.mutate({ suggestion: creating, dealId: deal.id });
        }}
      />

      <DismissDialog
        suggestion={dismissing}
        customerId={customerId}
        onClose={() => setDismissing(null)}
        onDone={refresh}
      />
    </Panel>
  );
}

function DismissDialog({
  suggestion,
  customerId,
  onClose,
  onDone,
}: {
  suggestion: CustomerSuggestion | null;
  customerId: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const dismiss = useMutation({
    mutationFn: () =>
      api.post(`/api/customers/${customerId}/suggestions/${suggestion!.id}/dismiss`, { reason }),
    onSuccess: () => {
      setReason('');
      onClose();
      onDone();
    },
  });
  return (
    <Modal
      open={suggestion !== null}
      onClose={onClose}
      title="Bỏ qua gợi ý"
      width="max-w-md"
      footer={
        <>
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" disabled={dismiss.isPending} onClick={() => dismiss.mutate()}>
            Bỏ qua
          </Button>
        </>
      }
    >
      <p className="text-sm text-tr-subtle">
        <strong className="text-tr-text">{suggestion?.title}</strong> sẽ không hiện lại. Lý do giúp
        đo gợi ý nào hữu ích:
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {DISMISS_REASONS.map((r) => (
          <Button
            key={r}
            size="sm"
            variant={reason === r ? 'primary' : 'secondary'}
            onClick={() => setReason(r)}
          >
            {r}
          </Button>
        ))}
      </div>
      <Input
        className="mt-3"
        placeholder="Hoặc ghi lý do khác…"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        aria-label="Lý do bỏ qua"
      />
      <FormError error={dismiss.error} />
    </Modal>
  );
}
