import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { api } from '../../api/client';
import { usePermission } from '../../lib/permissions';
import { useUiStore } from '../../stores/uiStore';
import { Modal } from '../common/Modal';
import { Button, FormError, Input } from '../common/ui';

interface DigestSettings {
  enabled: boolean;
  daily: boolean;
  weekly: boolean;
  monthly: boolean;
  time: string;
  ai: boolean;
}

type DigestKind = 'daily' | 'weekly' | 'monthly';

const KIND_LABEL: Record<DigestKind, string> = {
  daily: 'Bản tin ngày',
  weekly: 'Bản tin tuần (sáng thứ Hai)',
  monthly: 'Bản tin tháng (ngày mùng 1)',
};

/**
 * Cai dat ban tin Trong tam gui qua Telegram — dung chung bot/chat da cau hinh
 * o Cai dat > Telegram. Gui cho nguoi bot dang nhac viec giup.
 */
export function FocusDigestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const canEdit = usePermission('settings.telegram', 'update');
  const canSend = usePermission('settings.telegram', 'create');
  const { data: saved } = useQuery({
    queryKey: ['telegram', 'focus-digest'],
    queryFn: () => api.get<DigestSettings>('/api/telegram/focus-digest'),
    enabled: open,
  });
  const { data: connection } = useQuery({
    queryKey: ['telegram', 'config'],
    queryFn: () =>
      api.get<{ enabled: boolean; has_token: boolean; chat_id: string }>('/api/telegram/config'),
    enabled: open,
  });
  const [form, setForm] = useState<DigestSettings | null>(null);
  useEffect(() => {
    if (saved) setForm(saved);
  }, [saved]);

  const save = useMutation({
    mutationFn: (value: DigestSettings) =>
      api.put<DigestSettings>('/api/telegram/focus-digest', value),
    onSuccess: (value) => {
      queryClient.setQueryData(['telegram', 'focus-digest'], value);
      pushToast('Đã lưu cài đặt bản tin', 'success');
      onClose();
    },
  });
  const test = useMutation({
    mutationFn: (kind: DigestKind) => api.post('/api/telegram/focus-digest/test', { kind }),
    onSuccess: () => pushToast('Đã gửi bản tin thử qua Telegram', 'success'),
  });

  const connected = Boolean(connection?.enabled && connection.has_token && connection.chat_id);
  const set = (patch: Partial<DigestSettings>) =>
    setForm((current) => (current ? { ...current, ...patch } : current));
  const dirty = Boolean(form && saved && JSON.stringify(form) !== JSON.stringify(saved));

  return (
    <Modal
      open={open}
      onClose={onClose}
      dirty={dirty}
      width="max-w-md"
      title={
        <span className="flex items-center gap-1.5">
          <Send size={16} className="text-tr-primary" aria-hidden="true" /> Bản tin Trọng tâm qua
          Telegram
        </span>
      }
      footer={
        <>
          <Button onClick={onClose}>Đóng</Button>
          {canEdit && (
            <Button
              variant="primary"
              disabled={!form || !dirty || save.isPending}
              onClick={() => form && save.mutate(form)}
            >
              {save.isPending ? 'Đang lưu…' : 'Lưu'}
            </Button>
          )}
        </>
      }
    >
      {!form ? (
        <p className="text-sm text-tr-muted">Đang tải…</p>
      ) : (
        <div className="space-y-3">
          {connection && !connected && (
            <p className="rounded-control bg-tr-warning/10 p-2 text-sm text-tr-warning">
              Telegram chưa được kết nối. Vào Cài đặt › Telegram để nhập Bot Token và Chat ID trước.
            </p>
          )}
          <p className="text-sm text-tr-subtle">
            Tóm tắt việc phải làm, lịch, mốc kinh doanh và điểm cần chú ý — gửi tới người bot đang
            nhắc việc giúp.
          </p>
          <label className="flex items-center gap-2 text-sm font-medium text-tr-text">
            <input
              type="checkbox"
              checked={form.enabled}
              disabled={!canEdit}
              onChange={(event) => set({ enabled: event.target.checked })}
              className="h-4 w-4 rounded border-tr-border"
            />
            Bật bản tin tự động
          </label>
          <fieldset className="space-y-2 pl-6" disabled={!canEdit || !form.enabled}>
            <legend className="sr-only">Loại bản tin</legend>
            {(['daily', 'weekly', 'monthly'] as DigestKind[]).map((kind) => (
              <label key={kind} className="flex items-center gap-2 text-sm text-tr-subtle">
                <input
                  type="checkbox"
                  checked={form[kind]}
                  onChange={(event) => set({ [kind]: event.target.checked })}
                  className="h-4 w-4 rounded border-tr-border"
                />
                {KIND_LABEL[kind]}
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm text-tr-subtle">
              <span className="shrink-0 whitespace-nowrap">Gửi lúc</span>
              <span className="w-36">
                <Input
                  type="time"
                  value={form.time}
                  onChange={(event) => set({ time: event.target.value })}
                />
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm text-tr-subtle">
              <input
                type="checkbox"
                checked={form.ai}
                onChange={(event) => set({ ai: event.target.checked })}
                className="h-4 w-4 rounded border-tr-border"
              />
              Kèm 3 ưu tiên do AI phân tích (tốn token AI mỗi lần gửi)
            </label>
          </fieldset>

          {canSend && connected && (
            <div className="border-t border-tr-border pt-3">
              <p className="mb-2 text-xs text-tr-muted">
                Gửi thử ngay để xem bản tin trông thế nào:
              </p>
              <div className="flex flex-wrap gap-2">
                {(['daily', 'weekly', 'monthly'] as DigestKind[]).map((kind) => (
                  <Button
                    key={kind}
                    size="sm"
                    disabled={test.isPending}
                    onClick={() => test.mutate(kind)}
                  >
                    {kind === 'daily' ? 'Ngày' : kind === 'weekly' ? 'Tuần' : 'Tháng'}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <FormError error={save.error ?? test.error} />
        </div>
      )}
    </Modal>
  );
}
