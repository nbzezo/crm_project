/*
 * Cai dat → Tong quan (1.32.0).
 *
 * Trang mac dinh khi mo Cai dat. Truoc day vao Cai dat la roi thang vao bang
 * Nguoi dung, va muon biet "sao luu Drive con chay khong", "Email co dang loi
 * khong" phai mo tung trang. O day: mot khoi "Can chu y" gom moi loi/viec dang
 * treo, roi cac nhom cai dat kem mot dong trang thai ngan cho moi muc.
 *
 * Chi hoi nhung API ma nguoi xem co quyen doc — khong co quyen thi muc do vang
 * mat khoi trang, khong hien loi 403.
 */
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { api } from '../../api/client';
import type { TelegramConfig } from '../../types';
import type { AiProviderConfig } from '../../ai/types';
import { focusRing, Panel } from '../common/ui';
import { usePermissionCheck } from '../../lib/permissions';
import { formatDateTime } from '../../lib/format';
import {
  SETTINGS_GROUPS,
  visibleSettingsTabs,
  type SettingsTab,
  type SettingsTabDef,
} from '../../lib/settingsNav';
import { StatusDot, type StatusTone } from './SettingsKit';
import type { EmailConfig } from './EmailSettings';

interface UserLite {
  id: number;
  is_active: boolean;
  pending_invite: boolean;
  must_change_password: boolean;
  positions: unknown[];
}

interface DriveLite {
  connected: boolean;
  enabled: boolean;
  last_success_at: string | null;
  last_error: string | null;
}

interface BackupFile {
  name: string;
  created_at: string;
}

interface Alert {
  tone: Exclude<StatusTone, 'ok' | 'off'>;
  title: string;
  detail: string;
  tab: SettingsTab;
  cta: string;
}

interface Meta {
  text: string;
  tone?: StatusTone;
}

export function OverviewSettings({ onOpen }: { onOpen: (tab: SettingsTab) => void }) {
  const allowed = usePermissionCheck();
  const tabs = visibleSettingsTabs(allowed).filter((tab) => tab.key !== 'overview');
  const can = (key: SettingsTab) => tabs.some((tab) => tab.key === key);

  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<UserLite[]>('/api/users'),
    enabled: can('users'),
  });
  const email = useQuery({
    queryKey: ['email', 'config'],
    queryFn: () => api.get<EmailConfig>('/api/email/config'),
    enabled: can('email'),
  });
  const telegram = useQuery({
    queryKey: ['telegram-config'],
    queryFn: () => api.get<TelegramConfig>('/api/telegram/config'),
    enabled: can('telegram'),
  });
  const ai = useQuery({
    queryKey: ['ai-providers'],
    queryFn: () => api.get<AiProviderConfig[]>('/api/ai/providers'),
    enabled: can('ai'),
  });
  const drive = useQuery({
    queryKey: ['drive-backup', 'config'],
    queryFn: () => api.get<DriveLite>('/api/drive-backup/config'),
    enabled: can('backup'),
  });
  const backups = useQuery({
    queryKey: ['backups'],
    queryFn: () => api.get<BackupFile[]>('/api/backups'),
    enabled: can('backup'),
  });

  const alerts: Alert[] = [];
  const meta: Partial<Record<SettingsTab, Meta>> = {};

  if (users.data) {
    const list = users.data;
    const pending = list.filter((u) => u.is_active && u.pending_invite).length;
    const noPosition = list.filter((u) => u.is_active && u.positions.length === 0).length;
    meta.users = {
      text: `${list.filter((u) => u.is_active).length} đang hoạt động${pending ? ` · ${pending} chờ kích hoạt` : ''}`,
      tone: pending || noPosition ? 'warn' : undefined,
    };
    if (pending > 0) {
      alerts.push({
        tone: 'warn',
        title: `${pending} tài khoản chưa kích hoạt`,
        detail: 'người được mời chưa đặt mật khẩu',
        tab: 'users',
        cta: 'Xem người dùng',
      });
    }
    if (noPosition > 0) {
      alerts.push({
        tone: 'warn',
        title: `${noPosition} tài khoản chưa có vị trí`,
        detail: 'đăng nhập được nhưng gần như không thấy gì',
        tab: 'users',
        cta: 'Gán vị trí',
      });
    }
  }

  if (email.data) {
    const cfg = email.data;
    if (cfg.last_error) {
      meta.email = { text: 'Lỗi gửi thư', tone: 'error' };
      alerts.push({
        tone: 'error',
        title: 'Email gửi thư lỗi',
        detail: cfg.last_error,
        tab: 'email',
        cta: 'Sửa kết nối',
      });
    } else if (cfg.ready && cfg.enabled) {
      meta.email = {
        text: cfg.last_test_at ? `Đã kiểm tra ${formatDateTime(cfg.last_test_at)}` : 'Đã cấu hình',
        tone: 'ok',
      };
    } else {
      meta.email = { text: 'Chưa bật', tone: 'off' };
      if (can('users')) {
        alerts.push({
          tone: 'warn',
          title: 'Chưa cấu hình Email',
          detail: 'thư mời và đặt lại mật khẩu phải gửi liên kết bằng tay',
          tab: 'email',
          cta: 'Cấu hình',
        });
      }
    }
  }

  if (telegram.data) {
    const cfg = telegram.data;
    if (cfg.last_error) {
      meta.telegram = { text: 'Lỗi gửi tin', tone: 'error' };
      alerts.push({
        tone: 'error',
        title: 'Telegram gửi tin lỗi',
        detail: cfg.last_error,
        tab: 'telegram',
        cta: 'Sửa kết nối',
      });
    } else if (cfg.enabled && cfg.has_token) {
      meta.telegram = { text: 'Đang gửi thông báo', tone: 'ok' };
    } else {
      meta.telegram = { text: 'Chưa bật', tone: 'off' };
    }
  }

  if (ai.data) {
    const enabled = ai.data.filter((p) => p.enabled);
    const broken = enabled.filter((p) => p.status === 'error');
    const ready = enabled.filter((p) => p.status === 'ready');
    meta.ai = {
      text: enabled.length ? `${ready.length}/${enabled.length} nhà cung cấp sẵn sàng` : 'Chưa bật',
      tone: broken.length ? 'warn' : ready.length ? 'ok' : 'off',
    };
    for (const provider of broken) {
      alerts.push({
        tone: 'warn',
        title: `Trợ lý AI · ${provider.display_name} báo lỗi`,
        detail: provider.last_error ?? 'kết nối lỗi; hệ thống chuyển sang nhà cung cấp khác',
        tab: 'ai',
        cta: 'Sửa kết nối',
      });
    }
  }

  if (drive.data || backups.data) {
    const dr = drive.data;
    const latest = backups.data?.[0];
    if (dr?.connected && dr.last_error) {
      meta.backup = { text: 'Google Drive lỗi', tone: 'error' };
      alerts.push({
        tone: 'error',
        title: 'Sao lưu Google Drive thất bại',
        detail: dr.last_success_at
          ? `lần thành công gần nhất ${formatDateTime(dr.last_success_at)}`
          : dr.last_error,
        tab: 'backup',
        cta: 'Xem sao lưu',
      });
    } else if (dr?.connected && dr.enabled) {
      meta.backup = {
        text: dr.last_success_at
          ? `Drive · ${formatDateTime(dr.last_success_at)}`
          : 'Drive đã kết nối',
        tone: 'ok',
      };
    } else {
      meta.backup = {
        text: latest
          ? `Máy chủ · ${formatDateTime(latest.created_at.slice(0, 16))}`
          : 'Chưa có bản nào',
        tone: latest ? 'warn' : 'error',
      };
      alerts.push({
        tone: 'warn',
        title: 'Tệp tải lên chưa được sao lưu ra ngoài',
        detail: 'chưa bật sao lưu Google Drive định kỳ',
        tab: 'backup',
        cta: 'Bật sao lưu',
      });
    }
  }

  const groups = Object.values(SETTINGS_GROUPS)
    .map((group) => ({ group, items: tabs.filter((tab) => tab.group === group) }))
    .filter((entry) => entry.items.length > 0);

  return (
    <div className="space-y-4">
      {alerts.length > 0 && (
        <Panel
          title={
            <span className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-tr-warning" aria-hidden="true" />
              Cần chú ý
              <span className="rounded-full bg-tr-warning/10 px-2 text-xs font-semibold text-tr-warning">
                {alerts.length}
              </span>
            </span>
          }
        >
          <ul className="space-y-2">
            {alerts.map((alert) => (
              <li key={`${alert.tab}:${alert.title}`}>
                <button
                  type="button"
                  onClick={() => onOpen(alert.tab)}
                  className={`flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-control bg-tr-surface px-3 py-2 text-left transition hover:bg-tr-hover ${focusRing}`}
                >
                  <StatusDot tone={alert.tone} />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold text-tr-text">{alert.title}</span>
                    <span className="text-tr-subtle"> — {alert.detail}</span>
                  </span>
                  <span className="text-sm font-semibold text-tr-primary">{alert.cta} →</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {groups.map(({ group, items }) => (
          <section
            key={group}
            aria-label={group}
            className="rounded-panel border border-tr-border bg-tr-panel p-3.5 sm:p-4"
          >
            <h3 className="mb-1 text-sm font-semibold text-tr-text">{group}</h3>
            <ul>
              {items.map((tab) => (
                <OverviewRow key={tab.key} tab={tab} meta={meta[tab.key]} onOpen={onOpen} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function OverviewRow({
  tab,
  meta,
  onOpen,
}: {
  tab: SettingsTabDef;
  meta?: Meta;
  onOpen: (tab: SettingsTab) => void;
}) {
  return (
    <li className="border-t border-tr-border first:border-t-0">
      <button
        type="button"
        onClick={() => onOpen(tab.key)}
        className={`flex min-h-11 w-full items-center gap-3 rounded-control px-1 py-2 text-left hover:bg-tr-hover ${focusRing}`}
      >
        <tab.icon size={16} className="shrink-0 text-tr-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-tr-text">{tab.label}</span>
          {meta ? (
            <span className="flex items-center gap-1.5 text-xs text-tr-subtle">
              {meta.tone && <StatusDot tone={meta.tone} />}
              {meta.text}
            </span>
          ) : (
            <span className="block truncate text-xs text-tr-muted">{tab.description}</span>
          )}
        </span>
        <ChevronRight size={16} className="shrink-0 text-tr-muted" aria-hidden="true" />
      </button>
    </li>
  );
}
