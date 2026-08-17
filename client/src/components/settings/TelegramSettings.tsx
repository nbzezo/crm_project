import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, DatabaseBackup, KeyRound, Send, TriangleAlert } from 'lucide-react';
import { api } from '../../api/client';
import type { TelegramConfig } from '../../types';
import { formatDateTime } from '../../lib/format';
import { Button, Field, FormError, Input, Panel, Select } from '../common/ui';
import { useUiStore } from '../../stores/uiStore';

const BACKUP_INTERVAL_OPTIONS: [number, string][] = [
  [6, 'Mỗi 6 giờ'],
  [12, 'Mỗi 12 giờ'],
  [24, 'Mỗi ngày'],
  [72, 'Mỗi 3 ngày'],
  [168, 'Mỗi tuần'],
];

export function TelegramSettings() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const {
    data: config,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['telegram-config'],
    queryFn: () => api.get<TelegramConfig>('/api/telegram/config'),
  });

  const [chatId, setChatId] = useState('');
  const [botToken, setBotToken] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [notifyDueDates, setNotifyDueDates] = useState(true);
  const [notifyReminders, setNotifyReminders] = useState(true);
  const [notifyAssignee, setNotifyAssignee] = useState(true);
  const [backupEnabled, setBackupEnabled] = useState(false);
  const [backupIntervalHours, setBackupIntervalHours] = useState(24);

  useEffect(() => {
    if (!config) return;
    setChatId(config.chat_id);
    setEnabled(config.enabled);
    setNotifyDueDates(config.notify_due_dates);
    setNotifyReminders(config.notify_reminders);
    setNotifyAssignee(config.notify_assignee);
    setBackupEnabled(config.backup_enabled);
    setBackupIntervalHours(config.backup_interval_hours);
  }, [config]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['telegram-config'] });

  const save = useMutation({
    mutationFn: () =>
      api.put<TelegramConfig>('/api/telegram/config', {
        enabled,
        chat_id: chatId,
        bot_token: botToken || undefined,
        notify_due_dates: notifyDueDates,
        notify_reminders: notifyReminders,
        notify_assignee: notifyAssignee,
        backup_enabled: backupEnabled,
        backup_interval_hours: backupIntervalHours,
      }),
    onSuccess: () => {
      setBotToken('');
      void refresh();
      pushToast('Đã lưu cấu hình Telegram', 'success');
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

  const sendBackup = useMutation({
    mutationFn: () => api.post<{ name: string }>('/api/telegram/send-backup'),
    onSuccess: (result) => {
      void refresh();
      pushToast(`Đã gửi bản sao lưu ${result.name} qua Telegram`, 'success');
    },
    onError: () => void refresh(),
  });

  const statusIcon =
    config?.last_error && !test.isPending ? (
      <TriangleAlert size={14} className="text-tr-danger" />
    ) : config?.last_test_at ? (
      <CheckCircle2 size={14} className="text-tr-success" />
    ) : (
      <KeyRound size={14} className="text-tr-muted" />
    );

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Send size={16} className="text-tr-primary" /> Thông báo qua Telegram
        </span>
      }
    >
      <p className="mb-4 text-sm text-tr-subtle">
        Tạo bot qua @BotFather để lấy Bot Token, và lấy Chat ID qua @userinfobot. Token chỉ được gửi
        đến backend và mã hoá tại máy chủ.
      </p>
      {isLoading && <p className="text-sm text-tr-muted">Đang tải cấu hình…</p>}
      <FormError error={error ?? save.error ?? test.error ?? sendBackup.error} />

      {config && (
        <div className="rounded-panel border border-tr-border bg-tr-list p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="flex items-center gap-1.5 text-xs text-tr-muted">
              {statusIcon}
              {config.last_error
                ? config.last_error
                : config.last_test_at
                  ? `Đã kết nối · lần thử gần nhất lúc ${config.last_test_at}`
                  : 'Chưa kiểm tra kết nối'}
            </p>
            <label className="flex items-center gap-2 text-sm text-tr-subtle">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                className="h-4 w-4 rounded border-tr-border"
              />
              Kích hoạt
            </label>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Chat ID">
              <Input
                value={chatId}
                onChange={(event) => setChatId(event.target.value)}
                placeholder="Ví dụ: 123456789"
              />
            </Field>
            <Field
              label="Bot Token"
              hint={
                config.has_token ? `Đã lưu ${config.token_hint}; để trống để giữ nguyên` : undefined
              }
            >
              <Input
                type="password"
                autoComplete="new-password"
                value={botToken}
                onChange={(event) => setBotToken(event.target.value)}
                placeholder={config.has_token ? '••••••••' : 'Nhập Bot Token'}
              />
            </Field>
          </div>

          <div className="mt-4 space-y-2">
            <label className="flex items-center gap-2 text-sm text-tr-subtle">
              <input
                type="checkbox"
                checked={notifyDueDates}
                onChange={(event) => setNotifyDueDates(event.target.checked)}
                className="h-4 w-4 rounded border-tr-border"
              />
              Báo việc đến hạn / quá hạn
            </label>
            <label className="flex items-center gap-2 text-sm text-tr-subtle">
              <input
                type="checkbox"
                checked={notifyReminders}
                onChange={(event) => setNotifyReminders(event.target.checked)}
                className="h-4 w-4 rounded border-tr-border"
              />
              Báo nhắc hẹn cá nhân
            </label>
            <label className="flex items-center gap-2 text-sm text-tr-subtle">
              <input
                type="checkbox"
                checked={notifyAssignee}
                onChange={(event) => setNotifyAssignee(event.target.checked)}
                className="h-4 w-4 rounded border-tr-border"
              />
              Báo khi được giao việc mới
            </label>
          </div>

          <div className="mt-5 border-t border-tr-border pt-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-tr-text">
              <DatabaseBackup size={15} className="text-tr-primary" /> Sao lưu CSDL định kỳ
            </p>
            <p className="mb-3 text-xs text-tr-subtle">
              Tự động tạo bản sao lưu CSDL và gửi vào nhóm/chat Telegram ở trên theo chu kỳ đã chọn.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex items-center gap-2 text-sm text-tr-subtle">
                <input
                  type="checkbox"
                  checked={backupEnabled}
                  onChange={(event) => setBackupEnabled(event.target.checked)}
                  className="h-4 w-4 rounded border-tr-border"
                />
                Bật gửi sao lưu định kỳ
              </label>
              <div className="w-44">
                <Field label="Chu kỳ gửi">
                  <Select
                    value={backupIntervalHours}
                    disabled={!backupEnabled}
                    onChange={(event) => setBackupIntervalHours(Number(event.target.value))}
                  >
                    {BACKUP_INTERVAL_OPTIONS.map(([hours, label]) => (
                      <option key={hours} value={hours}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Button
                disabled={!config.has_token || !config.chat_id || sendBackup.isPending}
                onClick={() => sendBackup.mutate()}
              >
                <DatabaseBackup size={15} />{' '}
                {sendBackup.isPending ? 'Đang gửi…' : 'Gửi sao lưu ngay'}
              </Button>
            </div>
            <p className="mt-2 text-xs text-tr-muted">
              {config.backup_enabled && config.next_backup_at
                ? `Lần gửi tiếp theo: ${formatDateTime(config.next_backup_at)}`
                : 'Chưa bật gửi định kỳ'}
              {config.last_backup_sent_at
                ? ` · Lần gửi gần nhất: ${formatDateTime(config.last_backup_sent_at)}`
                : ''}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Đang lưu…' : 'Lưu'}
            </Button>
            <Button disabled={!config.has_token || test.isPending} onClick={() => test.mutate()}>
              <Send size={15} /> {test.isPending ? 'Đang gửi…' : 'Gửi thử'}
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
