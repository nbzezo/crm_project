import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Database,
  Download,
  GanttChartSquare,
  HardDriveDownload,
  Mail,
  Network,
  PackageOpen,
  Send,
  ShieldCheck,
  Tag,
  Target,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '../api/client';
import type { TelegramConfig } from '../types';
import { Button, EmptyState, Panel } from '../components/common/ui';
import { Tabs } from '../components/common/Tabs';
import { PageHeader, PageShell } from '../components/common/PageShell';
import { LabelManager } from '../components/labels/LabelManager';
import { ScoringSettings } from '../components/crm/ScoringSettings';
import { t } from '../i18n/vi';
import { formatBytes } from '../components/crm/DocumentUpload';
import { formatDateTime } from '../lib/format';
import { useUiStore } from '../stores/uiStore';
import { AiSettings } from '../components/ai/AiSettings';
import { TelegramSettings } from '../components/settings/TelegramSettings';
import { HandoverSettings } from '../components/settings/HandoverSettings';
import { DeliverySettings } from '../components/settings/DeliverySettings';
import { EmailSettings } from '../components/settings/EmailSettings';
import { UserSettings } from '../components/settings/UserSettings';
import { OrgChartSettings } from '../components/settings/OrgChartSettings';
import { PositionSettings } from '../components/settings/PositionSettings';
import { usePermissionCheck, type PermissionKey } from '../lib/permissions';
import { useSearchParams } from 'react-router';

interface BackupFile {
  name: string;
  size: number;
  created_at: string;
}

const CSV_EXPORTS: [string, string][] = [
  ['customers', 'Khách hàng'],
  ['contacts', 'Người liên hệ'],
  ['deals', 'Cơ hội'],
  ['contracts', 'Hợp đồng'],
  ['tasks', 'Công việc'],
  ['revenues', 'Doanh thu theo tháng'],
];

type SettingsTab =
  | 'users'
  | 'org'
  | 'positions'
  | 'labels'
  | 'scoring'
  | 'handover'
  | 'delivery'
  | 'email'
  | 'telegram'
  | 'ai'
  | 'data';

/*
 * Muc Cai dat, xep theo BON NHOM.
 *
 * Truoc day day la mot danh sach phang muoi hai muc tren mot dai tab ngang —
 * ma khung trang chi rong 896px nen nam muc cuoi khong bao gio hien ra. Te hon,
 * chung tron bon loai viec khac han nhau: cau hinh quy trinh, ket noi ra ngoai,
 * quan tri to chuc va viec ca nhan, khong co thu tu nao giai thich duoc.
 *
 * *Tai khoan* da chuyen ra menu avatar: no la thu duy nhat o day ma MOI nguoi
 * deu dung, con muoi mot muc con lai deu la viec quan tri.
 *
 * `group` phai lien tuc theo thu tu mang — tieu de nhom chi ve o muc dau tien
 * cua moi nhom (xem cho goi Tabs ben duoi).
 */
const SETTINGS_TABS: {
  key: SettingsTab;
  label: string;
  icon: LucideIcon;
  group: string;
  permission?: PermissionKey;
}[] = [
  {
    key: 'users',
    label: t.settings.tabUsers,
    icon: Users,
    group: t.settings.groupOrg,
    permission: 'admin.users:read',
  },
  {
    key: 'org',
    label: t.permissions.tabOrg,
    icon: Network,
    group: t.settings.groupOrg,
    permission: 'admin.org:read',
  },
  {
    key: 'positions',
    label: t.permissions.tabPositions,
    icon: ShieldCheck,
    group: t.settings.groupOrg,
    permission: 'admin.positions:read',
  },

  {
    key: 'labels',
    label: t.settings.tabLabels,
    icon: Tag,
    group: t.settings.groupProcess,
    permission: 'settings.app:read',
  },
  {
    key: 'scoring',
    label: t.settings.tabScoring,
    icon: Target,
    group: t.settings.groupProcess,
    permission: 'settings.app:read',
  },
  {
    key: 'handover',
    label: t.settings.tabHandover,
    icon: PackageOpen,
    group: t.settings.groupProcess,
    permission: 'settings.app:read',
  },
  {
    key: 'delivery',
    label: t.settings.tabDelivery,
    icon: GanttChartSquare,
    group: t.settings.groupProcess,
    permission: 'settings.app:read',
  },

  {
    key: 'email',
    label: t.settings.tabEmail,
    icon: Mail,
    group: t.settings.groupIntegration,
    permission: 'settings.email:read',
  },
  {
    key: 'telegram',
    label: t.settings.tabTelegram,
    icon: Send,
    group: t.settings.groupIntegration,
    permission: 'settings.telegram:read',
  },
  {
    key: 'ai',
    label: t.settings.tabAi,
    icon: Bot,
    group: t.settings.groupIntegration,
    permission: 'settings.ai:read',
  },

  {
    key: 'data',
    label: t.settings.tabData,
    icon: Database,
    group: t.settings.groupData,
    permission: 'data.export:export',
  },
];

function DataSettings() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);

  const { data: backups = [] } = useQuery({
    queryKey: ['backups'],
    queryFn: () => api.get<BackupFile[]>('/api/backups'),
  });

  const { data: telegramConfig } = useQuery({
    queryKey: ['telegram-config'],
    queryFn: () => api.get<TelegramConfig>('/api/telegram/config'),
  });
  const telegramReady = Boolean(telegramConfig?.has_token && telegramConfig?.chat_id);

  const backup = useMutation({
    mutationFn: () => api.post<{ name: string; size: number }>('/api/backup'),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      pushToast(`Đã tạo bản sao lưu ${result.name}`, 'success');
      window.location.href = `/api/backups/${encodeURIComponent(result.name)}/download`;
    },
  });

  const sendBackupToTelegram = useMutation({
    mutationFn: () => api.post<{ name: string }>('/api/telegram/send-backup'),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      queryClient.invalidateQueries({ queryKey: ['telegram-config'] });
      pushToast(`Đã gửi bản sao lưu ${result.name} qua Telegram`, 'success');
    },
  });

  return (
    <div className="space-y-4">
      <Panel title={t.settings.backup}>
        <p className="mb-3 flex items-center gap-2 text-sm text-tr-subtle">
          <Database size={15} /> {t.settings.dataLocation}
        </p>
        <p className="mb-2 text-xs text-tr-subtle">{t.settings.backupChoiceHint}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => backup.mutate()} disabled={backup.isPending}>
            <HardDriveDownload size={15} />
            {backup.isPending ? 'Đang tạo…' : t.settings.backupDownload}
          </Button>
          <Button
            onClick={() => sendBackupToTelegram.mutate()}
            disabled={!telegramReady || sendBackupToTelegram.isPending}
            title={telegramReady ? undefined : t.settings.backupTelegramNotReady}
          >
            <Send size={15} />
            {sendBackupToTelegram.isPending ? 'Đang gửi…' : t.settings.backupSendTelegram}
          </Button>
          <a
            href="/api/export"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-tr-border bg-tr-panel px-3 py-1.5 text-sm font-medium text-tr-text transition hover:bg-tr-hover"
          >
            <Download size={15} /> {t.settings.exportJson}
          </a>
        </div>
        {!telegramReady && (
          <p className="mt-2 text-xs text-tr-muted">{t.settings.backupTelegramNotReady}</p>
        )}

        {/* NFR-06: xuất CSV mở được bằng Excel */}
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-tr-subtle uppercase">
            {t.settings.exportCsv}
          </h3>
          <div className="flex flex-wrap gap-2">
            {CSV_EXPORTS.map(([entity, label]) => (
              <a
                key={entity}
                href={`/api/export/${entity}.csv`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-tr-border bg-tr-panel px-3 py-1.5 text-sm text-tr-text transition hover:bg-tr-hover"
              >
                <Download size={14} /> {label}
              </a>
            ))}
          </div>
        </div>

        {backups.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-tr-subtle uppercase">
              {t.settings.backupList}
            </h3>
            <ul className="divide-y divide-tr-border rounded-lg border border-tr-border">
              {backups.map((file) => (
                <li key={file.name} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="flex-1 truncate text-tr-text">{file.name}</span>
                  <span className="text-xs text-tr-muted">{formatBytes(file.size)}</span>
                  <span className="text-xs text-tr-muted">
                    {formatDateTime(file.created_at.slice(0, 16))}
                  </span>
                  <a
                    href={`/api/backups/${encodeURIComponent(file.name)}/download`}
                    className="rounded-control p-1 text-tr-muted transition hover:bg-tr-hover hover:text-tr-text"
                    aria-label={`${t.settings.backupDownload} ${file.name}`}
                    title={t.settings.backupDownload}
                  >
                    <Download size={14} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <Panel title={t.settings.sampleData}>
        <p className="text-sm text-tr-subtle">
          Chạy lệnh <code className="rounded bg-tr-hover px-1.5 py-0.5">npm run seed</code> trong
          thư mục dự án để nạp dữ liệu mẫu (chỉ chạy khi cơ sở dữ liệu còn trống).
        </p>
      </Panel>
    </div>
  );
}

export default function SettingsPage() {
  const allowed = usePermissionCheck();
  const [params, setParams] = useSearchParams();

  /* Moi muc con lai deu la viec quan tri — *Tai khoan* da chuyen ra menu avatar
     vi no la thu duy nhat o day ma MOI nguoi deu dung. Nguoi khong co quyen
     quan tri nao se khong thay muc Cai dat o thanh ben (xem Sidebar.tsx). */
  const visibleTabs = SETTINGS_TABS.filter((item) => allowed(item.permission));

  /* Tab nam trong URL chu khong phai useState: mot khu co muoi mot muc thi F5
     mat cho dang xem, va khong gui duoc lien ket cho dong nghiep, la kho chiu
     thay ro. */
  const requested = params.get('tab') as SettingsTab | null;
  const activeTab =
    requested && visibleTabs.some((item) => item.key === requested)
      ? requested
      : (visibleTabs[0]?.key ?? 'users');

  const setTab = (next: SettingsTab) => {
    setParams((prev) => {
      const copy = new URLSearchParams(prev);
      copy.set('tab', next);
      return copy;
    });
  };

  if (visibleTabs.length === 0) {
    return (
      <PageShell width="narrow">
        <PageHeader title={t.settings.pageTitle} className="mb-5" />
        <EmptyState message={t.permissions.noAccessTitle} hint={t.permissions.noAccessHint} />
      </PageShell>
    );
  }

  return (
    <PageShell width="wide" spacing="none">
      <PageHeader title={t.settings.pageTitle} className="mb-5" />

      <Tabs
        value={activeTab}
        onChange={setTab}
        orientation="vertical"
        items={visibleTabs.map((item, index) => ({
          value: item.key,
          label: item.label,
          icon: <item.icon size={15} aria-hidden="true" />,
          /* Chi muc DAU TIEN cua moi nhom mang tieu de — cac muc sau nam duoi no. */
          group: visibleTabs[index - 1]?.group === item.group ? undefined : item.group,
        }))}
        ariaLabel={t.settings.pageTitle}
        idPrefix="settingstab"
      >
        {activeTab === 'labels' && (
          <Panel title={t.settings.manageLabels}>
            <LabelManager />
          </Panel>
        )}
        {activeTab === 'scoring' && (
          <Panel title={t.settings.scoringTitle}>
            <ScoringSettings />
          </Panel>
        )}
        {activeTab === 'handover' && <HandoverSettings />}
        {activeTab === 'delivery' && <DeliverySettings />}
        {activeTab === 'ai' && <AiSettings />}
        {activeTab === 'telegram' && <TelegramSettings />}
        {activeTab === 'email' && <EmailSettings />}
        {activeTab === 'data' && <DataSettings />}
        {activeTab === 'users' && <UserSettings />}
        {activeTab === 'org' && <OrgChartSettings />}
        {activeTab === 'positions' && <PositionSettings />}
      </Tabs>
    </PageShell>
  );
}
