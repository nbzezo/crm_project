import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Copy, Save, Sparkles } from 'lucide-react';
import { api } from '../../api/client';
import { nowLocalInput } from '../../lib/format';
import { invalidateCrmViews } from '../../lib/queryKeys';
import { useUiStore } from '../../stores/uiStore';
import type { Contact } from '../../types';
import { Modal } from '../common/Modal';
import { Button, Field, FormError, Input, Segmented, Select, Textarea } from '../common/ui';

interface CareAssistResult {
  churn_level: 'low' | 'medium' | 'high';
  churn_summary: string;
  churn_reasons: string[];
  retention_actions: string[];
  message_subject: string;
  message_body: string;
  churn_score: number;
}

export const CHURN_LABELS: Record<CareAssistResult['churn_level'], string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
};

/**
 * AI soạn tin chăm sóc (email / Zalo) và đánh giá nguy cơ mất khách. Tin là bản
 * nháp: người dùng sửa, sao chép để gửi, rồi lưu thành tương tác để nhịp chăm
 * sóc được tính lại.
 */
export function CareAssistant({
  open,
  onClose,
  customerId,
  contacts,
}: {
  open: boolean;
  onClose: () => void;
  customerId: number;
  contacts: Contact[];
}) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const active = contacts.filter((c) => c.is_active !== 0);
  const primary = active.find((c) => c.is_primary) ?? active[0];
  const [channel, setChannel] = useState<'email' | 'zalo'>('email');
  const [contactId, setContactId] = useState<number | ''>('');
  const [purpose, setPurpose] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (open) setContactId(primary?.id ?? '');
  }, [open, primary?.id]);

  const generate = useMutation({
    mutationFn: () =>
      api.post<CareAssistResult>('/api/ai/assist/customer-care', {
        customer_id: customerId,
        contact_id: contactId === '' ? null : contactId,
        channel,
        purpose: purpose.trim() || undefined,
      }),
    onSuccess: (result) => {
      setSubject(result.message_subject);
      setBody(result.message_body);
    },
  });

  const log = useMutation({
    mutationFn: () =>
      api.post('/api/interactions', {
        customer_id: customerId,
        contact_id: contactId === '' ? null : contactId,
        type: channel,
        occurred_at: nowLocalInput(),
        summary: (subject || body.split('\n')[0] || 'Tin chăm sóc').slice(0, 200),
        result: body,
      }),
    onSuccess: () => {
      pushToast('Đã lưu thành tương tác — nhịp chăm sóc được tính lại.', 'success');
      invalidateCrmViews(queryClient, customerId);
      onClose();
    },
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(subject ? `${subject}\n\n${body}` : body);
      pushToast('Đã sao chép nội dung.', 'success');
    } catch {
      pushToast('Trình duyệt không cho sao chép — hãy chọn và sao chép thủ công.');
    }
  };

  const result = generate.data;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title={
        <span className="flex items-center gap-1.5">
          <Sparkles size={16} className="text-tr-primary" aria-hidden="true" /> AI chăm sóc khách
          hàng
        </span>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Kênh">
            <Segmented
              value={channel}
              onChange={setChannel}
              label="Kênh gửi"
              options={[
                { value: 'email', label: 'Email' },
                { value: 'zalo', label: 'Zalo' },
              ]}
            />
          </Field>
          <Field label="Gửi cho">
            <Select
              value={contactId}
              onChange={(e) => setContactId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">— Liên hệ chính —</option>
              {active.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                  {c.title ? ` · ${c.title}` : ''}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Mục đích (tuỳ chọn)" hint="Để trống: AI tự chọn theo tình hình khách hàng.">
          <Input
            placeholder="vd: chúc mừng sinh nhật, nhắc gia hạn, hỏi thăm sau triển khai…"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
        </Field>
        <Button variant="primary" disabled={generate.isPending} onClick={() => generate.mutate()}>
          <Sparkles size={14} aria-hidden="true" />{' '}
          {generate.isPending ? 'Đang phân tích…' : result ? 'Soạn lại' : 'Đánh giá & soạn tin'}
        </Button>
        <FormError error={generate.error} />

        {result && (
          <>
            <div className="rounded-panel border border-tr-border p-3">
              <p className="text-sm font-semibold text-tr-text">
                Nguy cơ mất khách: {CHURN_LABELS[result.churn_level]}{' '}
                <span className="font-normal text-tr-muted">
                  (điểm dữ liệu {result.churn_score}/100)
                </span>
              </p>
              {result.churn_summary && (
                <p className="mt-1 text-sm text-tr-subtle">{result.churn_summary}</p>
              )}
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {result.churn_reasons.length > 0 && (
                  <div>
                    <h3 className="flex items-center gap-1 text-xs font-semibold text-tr-text">
                      <AlertTriangle size={13} className="text-tr-warning" aria-hidden="true" /> Lý
                      do
                    </h3>
                    <ul className="mt-1 space-y-0.5 text-xs text-tr-subtle">
                      {result.churn_reasons.map((r) => (
                        <li key={r}>• {r}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.retention_actions.length > 0 && (
                  <div>
                    <h3 className="flex items-center gap-1 text-xs font-semibold text-tr-text">
                      <CheckCircle2 size={13} className="text-tr-success" aria-hidden="true" /> Nên
                      làm
                    </h3>
                    <ul className="mt-1 space-y-0.5 text-xs text-tr-subtle">
                      {result.retention_actions.map((r) => (
                        <li key={r}>• {r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
            {channel === 'email' && (
              <Field label="Tiêu đề">
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </Field>
            )}
            <Field label="Nội dung (bản nháp — sửa trước khi gửi)">
              <Textarea rows={9} value={body} onChange={(e) => setBody(e.target.value)} />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={copy}>
                <Copy size={14} aria-hidden="true" /> Sao chép
              </Button>
              <Button
                variant="primary"
                disabled={!body.trim() || log.isPending}
                onClick={() => log.mutate()}
              >
                <Save size={14} aria-hidden="true" /> Đã gửi — lưu thành tương tác
              </Button>
            </div>
            <FormError error={log.error} />
          </>
        )}
      </div>
    </Modal>
  );
}
