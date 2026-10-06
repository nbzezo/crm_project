/*
 * Cai dat → Sao luu va Xuat du lieu (1.32.0).
 *
 * Truoc day sao luu nam o ba noi: nut tai ve (Du lieu), gui dinh ky (Telegram)
 * va Google Drive (mot khoi trong Du lieu) — ba lich, ba trang thai, khong noi
 * nao cho biet "lan cuoi du lieu duoc sao lưu an toan la khi nao". Trang nay gom
 * ca ba diem den lai, dau trang la tom tat trang thai tung diem den.
 *
 * Xuat JSON/CSV la viec khac (lay du lieu ra de dung), nen thanh trang rieng.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, DatabaseBackup, Download, HardDriveDownload } from 'lucide-react';
import { api } from '../../api/client';
import type { TelegramConfig } from '../../types';
import { Button, Field, FormError, Panel, Select } from '../common/ui';
import { formatBytes } from '../crm/DocumentUpload';
import { formatDateTime } from '../../lib/format';
import { useUiStore } from '../../stores/uiStore';
import { usePermission, usePermissionCheck } from '../../lib/permissions';
import { DriveBackupSettings } from './DriveBackupSettings';
import { SaveBar, StatusBadge, TechDetails, Toggle, type StatusTone } from './SettingsKit';
import { useSettingsDirty } from './settingsDirty';
import { t } from '../../i18n/vi';

interface BackupFile {
  name: string;
  size: number;
  created_at: string;
}

/** Cac truong cua cau hinh Drive ma trang tom tat can — day du xem DriveBackupSettings. */
interface DriveSummary {
  connected: boolean;
  enabled: boolean;
  last_success_at: string | null;
  last_error: string | null;
  next_run_at: string | null;
}

const CSV_EXPORTS: [string, string][] = [
  ['customers', 'Khách hàng'],
  ['contacts', 'Người liên hệ'],
  ['deals', 'Cơ hội'],
  ['contracts', 'Hợp đồng'],
  ['tasks', 'Công việc'],
  ['revenues', 'Doanh thu theo tháng'],
];

export const TELEGRAM_BACKUP_INTERVALS: [number, string][] = [
  [6, 'Mỗi 6 giờ'],
  [12, 'Mỗi 12 giờ'],
  [24, 'Mỗi ngày'],
  [72, 'Mỗi 3 ngày'],
  [168, 'Mỗi tuần'],
];

const linkButton =
  'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-control border border-tr-border bg-tr-panel px-3 py-1.5 text-sm font-medium text-tr-text transition hover:bg-tr-hover fine:min-h-[32px]';

function when(value: string | null | undefined): string {
  return value ? formatDateTime(value.slice(0, 16)) : 'chưa có';
}

export function BackupSettings() {
  const allowed = usePermissionCheck();
  const canTelegram = allowed('settings.telegram:read');

  const backups = useQuery({
    queryKey: ['backups'],
    queryFn: () => api.get<BackupFile[]>('/api/backups'),
  });
  const telegram = useQuery({
    queryKey: ['telegram-config'],
    queryFn: () => api.get<TelegramConfig>('/api/telegram/config'),
    enabled: canTelegram,
  });
  const drive = useQuery({
    queryKey: ['drive-backup', 'config'],
    queryFn: () => api.get<DriveSummary & Record<string, unknown>>('/api/drive-backup/config'),
  });

  const latest = backups.data?.[0];
  const tg = telegram.data;
  const dr = drive.data;

  const destinations: { name: string; tone: StatusTone; status: string; detail: string }[] = [
    {
      name: 'Máy chủ',
      tone: latest ? 'ok' : 'off',
      status: latest ? 'Có bản sao lưu' : 'Chưa có bản nào',
      detail: latest ? `Gần nhất ${when(latest.created_at)}` : 'Bấm “Sao lưu & tải về” để tạo',
    },
  ];
  if (canTelegram) {
    destinations.push({
      name: 'Telegram',
      tone: !tg?.backup_enabled ? 'off' : tg.last_error ? 'error' : 'ok',
      status: !tg?.backup_enabled ? 'Đang tắt' : tg.last_error ? 'Lỗi' : 'Đang gửi định kỳ',
      detail: tg?.last_backup_sent_at
        ? `Gửi gần nhất ${when(tg.last_backup_sent_at)}`
        : 'Chưa gửi lần nào',
    });
  }
  destinations.push({
    name: 'Google Drive',
    tone: !dr?.connected ? 'off' : dr.last_error ? 'error' : dr.enabled ? 'ok' : 'warn',
    status: !dr?.connected
      ? 'Chưa kết nối'
      : dr.last_error
        ? 'Lỗi'
        : dr.enabled
          ? 'Đang sao lưu định kỳ'
          : 'Đã kết nối, đang tắt lịch',
    detail: dr?.last_success_at
      ? `Thành công gần nhất ${when(dr.last_success_at)}`
      : 'Chưa sao lưu lần nào',
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {destinations.map((dest) => (
          <div key={dest.name} className="rounded-panel border border-tr-border bg-tr-panel p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-tr-text">{dest.name}</span>
              <StatusBadge tone={dest.tone}>{dest.status}</StatusBadge>
            </div>
            <p className="mt-1 text-xs text-tr-muted">{dest.detail}</p>
          </div>
        ))}
      </div>

      <ServerBackupPanel backups={backups.data ?? []} />
      {canTelegram && tg && <TelegramBackupPanel config={tg} />}
      <DriveBackupSettings />

      <TechDetails>
        <p className="flex items-center gap-1.5">
          <Database size={13} aria-hidden="true" /> {t.settings.dataLocation}
        </p>
        <p>
          Dữ liệu mẫu: chạy <code className="rounded bg-tr-hover px-1">npm run seed</code> trong thư
          mục dự án (chỉ khi cơ sở dữ liệu còn trống).
        </p>
      </TechDetails>
    </div>
  );
}

function ServerBackupPanel({ backups }: { backups: BackupFile[] }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);

  const backup = useMutation({
    mutationFn: () => api.post<{ name: string; size: number }>('/api/backup'),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['backups'] });
      pushToast(`Đã tạo bản sao lưu ${result.name}`, 'success');
      window.location.href = `/api/backups/${encodeURIComponent(result.name)}/download`;
    },
  });

  return (
    <Panel
      title="Bản sao lưu trên máy chủ"
      action={
        <Button variant="primary" onClick={() => backup.mutate()} disabled={backup.isPending}>
          <HardDriveDownload size={15} aria-hidden="true" />
          {backup.isPending ? 'Đang tạo…' : 'Sao lưu & tải về ngay'}
        </Button>
      }
    >
      <p className="mb-3 text-xs text-tr-muted">
        Chỉ gồm cơ sở dữ liệu, không gồm tệp tải lên — tệp được sao lưu bằng Google Drive bên dưới.
        Máy chủ giữ 10 bản mới nhất; bản cũ hơn tự xoá.
      </p>
      <FormError error={backup.error} />
      {backups.length === 0 ? (
        <p className="rounded-control border border-dashed border-tr-border p-4 text-center text-sm text-tr-muted">
          Chưa có bản sao lưu nào trên máy chủ.
        </p>
      ) : (
        <ul className="divide-y divide-tr-border rounded-control border border-tr-border">
          {backups.map((file) => (
            <li key={file.name} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-40 shrink-0 font-medium text-tr-text tabular-nums">
                {formatDateTime(file.created_at.slice(0, 16))}
              </span>
              <span className="w-20 shrink-0 text-xs text-tr-subtle tabular-nums">
                {formatBytes(file.size)}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-tr-muted">{file.name}</span>
              <a
                href={`/api/backups/${encodeURIComponent(file.name)}/download`}
                className="inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-sm font-medium text-tr-primary hover:bg-tr-hover fine:min-h-8"
                aria-label={`Tải về bản sao lưu ${formatDateTime(file.created_at.slice(0, 16))}`}
              >
                <Download size={14} aria-hidden="true" /> Tải về
              </a>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Lich gui sao luu qua Telegram — truoc 1.32.0 nam trong trang Telegram. */
function TelegramBackupPanel({ config }: { config: TelegramConfig }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const canEdit = usePermission('settings.telegram', 'update');
  const [enabled, setEnabled] = useState(config.backup_enabled);
  const [interval, setIntervalHours] = useState(config.backup_interval_hours);
  const [source, setSource] = useState(config);
  if (source !== config) {
    setSource(config);
    setEnabled(config.backup_enabled);
    setIntervalHours(config.backup_interval_hours);
  }
  const ready = Boolean(config.has_token && config.chat_id);
  const dirty = enabled !== config.backup_enabled || interval !== config.backup_interval_hours;

  const save = useMutation({
    mutationFn: () =>
      api.put<TelegramConfig>('/api/telegram/config', {
        backup_enabled: enabled,
        backup_interval_hours: interval,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['telegram-config'] });
      pushToast('Đã lưu lịch gửi sao lưu qua Telegram', 'success');
    },
  });
  useSettingsDirty('backup-telegram', dirty, 'lịch sao lưu Telegram', () => save.mutateAsync());

  const sendNow = useMutation({
    mutationFn: () => api.post<{ name: string }>('/api/telegram/send-backup'),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['backups'] });
      void queryClient.invalidateQueries({ queryKey: ['telegram-config'] });
      pushToast(`Đã gửi bản sao lưu ${result.name} qua Telegram`, 'success');
    },
  });

  return (
    <Panel
      title="Gửi sao lưu qua Telegram"
      action={
        <Button
          disabled={!ready || sendNow.isPending}
          onClick={() => sendNow.mutate()}
          title={ready ? undefined : t.settings.backupTelegramNotReady}
        >
          <DatabaseBackup size={15} aria-hidden="true" />
          {sendNow.isPending ? 'Đang gửi…' : 'Gửi ngay'}
        </Button>
      }
    >
      <p className="mb-2 text-xs text-tr-muted">
        Nén cơ sở dữ liệu và gửi vào nhóm Telegram đã cấu hình ở Kết nối → Telegram. Telegram chỉ
        nhận tệp tới 50 MB; dữ liệu lớn hơn hãy dùng Google Drive.
      </p>
      {!ready && (
        <p className="mb-2 text-xs text-tr-warning">{t.settings.backupTelegramNotReady}</p>
      )}
      <FormError error={save.error ?? sendNow.error} />
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Toggle
          checked={enabled}
          onChange={setEnabled}
          disabled={!canEdit}
          label="Gửi sao lưu định kỳ"
          description={
            config.backup_enabled && config.next_backup_at
              ? `Lần tiếp theo ${when(config.next_backup_at)} · lần gần nhất ${when(config.last_backup_sent_at)}`
              : `Lần gần nhất ${when(config.last_backup_sent_at)}`
          }
        />
        <div className="sm:w-44">
          <Field label="Chu kỳ gửi">
            <Select
              value={interval}
              disabled={!enabled || !canEdit}
              onChange={(event) => setIntervalHours(Number(event.target.value))}
            >
              {TELEGRAM_BACKUP_INTERVALS.map(([hours, label]) => (
                <option key={hours} value={hours}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
      <SaveBar
        dirty={dirty}
        saving={save.isPending}
        onSave={() => save.mutate()}
        onReset={() => {
          setEnabled(config.backup_enabled);
          setIntervalHours(config.backup_interval_hours);
        }}
      />
    </Panel>
  );
}

export function ExportSettings() {
  return (
    <div className="space-y-4">
      <Panel title="Toàn bộ dữ liệu (JSON)">
        <p className="mb-3 text-sm text-tr-subtle">
          Một tệp JSON chứa mọi bảng dữ liệu nghiệp vụ — dùng để lưu trữ hoặc chuyển sang hệ thống
          khác.
        </p>
        <a href="/api/export" className={linkButton}>
          <Download size={15} aria-hidden="true" /> {t.settings.exportJson}
        </a>
      </Panel>
      <Panel title="Từng loại dữ liệu (CSV, mở bằng Excel)">
        <div className="flex flex-wrap gap-2">
          {CSV_EXPORTS.map(([entity, label]) => (
            <a key={entity} href={`/api/export/${entity}.csv`} className={linkButton}>
              <Download size={14} aria-hidden="true" /> {label}
            </a>
          ))}
        </div>
      </Panel>
    </div>
  );
}
