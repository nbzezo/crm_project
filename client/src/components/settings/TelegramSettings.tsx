import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { api } from '../../api/client';
import type { TelegramConfig } from '../../types';
import { formatDateTime } from '../../lib/format';
import { Button, Field, FormError, Input, Panel, Skeleton } from '../common/ui';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useUiStore } from '../../stores/uiStore';
import { usePermission } from '../../lib/permissions';
import type { SettingsTab } from '../../lib/settingsNav';
import { SaveBar, StatusBadge, Toggle } from './SettingsKit';
import { useSettingsDirty } from './settingsDirty';

interface Draft {
  enabled: boolean;
  chatId: string;
  botToken: string;
  notifyDueDates: boolean;
  notifyReminders: boolean;
  notifyAssignee: boolean;
}

function draftOf(config: TelegramConfig): Draft {
  return {
    enabled: config.enabled,
    chatId: config.chat_id,
    botToken: '',
    notifyDueDates: config.notify_due_dates,
    notifyReminders: config.notify_reminders,
    notifyAssignee: config.notify_assignee,
  };
}

/**
 * Thong bao qua Telegram.
 *
 * 1.32.0: phan sao luu dinh ky chuyen sang Cai dat → Sao luu (gom ba diem den
 * mot cho); gio kiem tra duoc dinh dang; cong tac thay o tick; mot thanh luu.
 */
export function TelegramSettings({ onOpen }: { onOpen?: (tab: SettingsTab) => void }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const canEdit = usePermission('settings.telegram', 'update');
  const {
    data: config,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['telegram-config'],
    queryFn: () => api.get<TelegramConfig>('/api/telegram/config'),
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [source, setSource] = useState<TelegramConfig | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  if (config && config !== source) {
    setSource(config);
    setDraft(draftOf(config));
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['telegram-config'] });

  const save = useMutation({
    mutationFn: (next: Draft) =>
      api.put<TelegramConfig>('/api/telegram/config', {
        enabled: next.enabled,
        chat_id: next.chatId,
        bot_token: next.botToken || undefined,
        notify_due_dates: next.notifyDueDates,
        notify_reminders: next.notifyReminders,
        notify_assignee: next.notifyAssignee,
      }),
    onSuccess: () => {
      void refresh();
      pushToast('Đã lưu cấu hình Telegram', 'success');
    },
  });

  const clearToken = useMutation({
    mutationFn: () => api.put<TelegramConfig>('/api/telegram/config', { clear_bot_token: true }),
    onSuccess: () => {
      setConfirmClear(false);
      void refresh();
      pushToast('Đã xoá Bot Token', 'success');
    },
  });

  const test = useMutation({
    mutationFn: () => api.post('/api/telegram/test'),
    onSuccess: () => {
      void refresh();
      pushToast('Đã gửi tin nhắn thử tới Telegram', 'success');
    },
    onError: () => void refresh(),
  });

  const base = config ? draftOf(config) : null;
  const dirty = Boolean(draft && base && JSON.stringify(draft) !== JSON.stringify(base));
  useSettingsDirty('telegram', dirty, 'Telegram', () =>
    draft ? save.mutateAsync(draft) : Promise.resolve()
  );

  if (isLoading || !config || !draft) {
    return error ? <FormError error={error} /> : <Skeleton className="h-64 rounded-panel" />;
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const status = config.last_error ? (
    <StatusBadge tone="error">Lỗi</StatusBadge>
  ) : config.last_test_at ? (
    <StatusBadge tone="ok">Đã kết nối</StatusBadge>
  ) : (
    <StatusBadge tone="off">Chưa kiểm tra</StatusBadge>
  );

  return (
    <div className="space-y-4">
      <Panel
        title={
          <span className="flex items-center gap-2">
            <Send size={16} className="text-tr-primary" aria-hidden="true" /> Kết nối bot
          </span>
        }
        action={status}
      >
        <FormError error={error ?? save.error ?? test.error ?? clearToken.error} />
        <div className="mb-3 rounded-control border border-tr-border bg-tr-surface p-3 text-sm">
          {config.last_error ? (
            <p className="text-tr-danger">{config.last_error}</p>
          ) : config.last_test_at ? (
            <p className="text-tr-subtle">
              Gửi thử thành công lúc{' '}
              <b className="text-tr-text">{formatDateTime(config.last_test_at)}</b>
            </p>
          ) : (
            <p className="text-tr-subtle">Chưa gửi tin thử lần nào.</p>
          )}
        </div>
        <Toggle
          checked={draft.enabled}
          onChange={(value) => set('enabled', value)}
          disabled={!canEdit}
          label="Gửi thông báo qua Telegram"
          description="Tắt thì không gửi tin nào, cấu hình vẫn được giữ."
        />
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="Chat ID" hint="Lấy bằng cách nhắn cho @userinfobot.">
            <Input
              value={draft.chatId}
              disabled={!canEdit}
              onChange={(event) => set('chatId', event.target.value)}
              placeholder="Ví dụ: 123456789"
            />
          </Field>
          <Field
            label="Bot Token"
            hint={
              config.has_token
                ? `Đã lưu ${config.token_hint ?? ''}; để trống để giữ nguyên`
                : 'Tạo bot qua @BotFather để lấy token. Token được mã hoá tại máy chủ.'
            }
          >
            <Input
              type="password"
              autoComplete="new-password"
              disabled={!canEdit}
              value={draft.botToken}
              onChange={(event) => set('botToken', event.target.value)}
              placeholder={config.has_token ? '••••••••' : 'Nhập Bot Token'}
            />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            disabled={!config.has_token || test.isPending || dirty}
            title={dirty ? 'Lưu thay đổi trước khi gửi thử' : undefined}
            onClick={() => test.mutate()}
          >
            <Send size={15} aria-hidden="true" /> {test.isPending ? 'Đang gửi…' : 'Gửi tin thử'}
          </Button>
          {config.has_token && canEdit && (
            <Button
              variant="ghost"
              className="text-tr-danger"
              onClick={() => setConfirmClear(true)}
            >
              Xoá Bot Token
            </Button>
          )}
        </div>
      </Panel>

      <Panel title="Gửi những thông báo nào">
        <div className="divide-y divide-tr-border">
          <Toggle
            checked={draft.notifyDueDates}
            onChange={(value) => set('notifyDueDates', value)}
            disabled={!canEdit}
            label="Việc đến hạn và quá hạn"
            description="Tóm tắt các việc sắp đến hạn hoặc đã trễ."
          />
          <Toggle
            checked={draft.notifyReminders}
            onChange={(value) => set('notifyReminders', value)}
            disabled={!canEdit}
            label="Nhắc hẹn cá nhân"
            description="Theo giờ hẹn của từng người."
          />
          <Toggle
            checked={draft.notifyAssignee}
            onChange={(value) => set('notifyAssignee', value)}
            disabled={!canEdit}
            label="Khi được giao việc mới"
            description="Gửi ngay khi có người giao việc."
          />
        </div>
        {onOpen && (
          <p className="mt-3 text-xs text-tr-muted">
            Gửi bản sao lưu định kỳ qua Telegram nay nằm ở{' '}
            <button
              type="button"
              onClick={() => onOpen('backup')}
              className="font-medium text-tr-primary underline"
            >
              Dữ liệu &amp; bảo mật → Sao lưu
            </button>
            .
          </p>
        )}
      </Panel>

      <SaveBar
        dirty={dirty}
        saving={save.isPending}
        onSave={() => save.mutate(draft)}
        onReset={() => setDraft(draftOf(config))}
      />

      <ConfirmDialog
        open={confirmClear}
        title="Xoá Bot Token?"
        message="Hệ thống sẽ ngừng gửi mọi tin Telegram — thông báo và sao lưu định kỳ — cho tới khi nhập token mới."
        confirmLabel="Xoá token"
        pending={clearToken.isPending}
        onConfirm={() => clearToken.mutate()}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
