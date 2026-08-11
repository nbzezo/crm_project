import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Download, HardDriveDownload } from 'lucide-react';
import { api } from '../api/client';
import { Button, Panel } from '../components/common/ui';
import { LabelManager } from '../components/labels/LabelManager';
import { ScoringSettings } from '../components/crm/ScoringSettings';
import { t } from '../i18n/vi';
import { formatBytes } from '../components/crm/DocumentUpload';
import { formatDateTime } from '../lib/format';
import { useUiStore } from '../stores/uiStore';

interface BackupFile {
  name: string;
  size: number;
  created_at: string;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);

  const { data: backups = [] } = useQuery({
    queryKey: ['backups'],
    queryFn: () => api.get<BackupFile[]>('/api/backups'),
  });

  const backup = useMutation({
    mutationFn: () => api.post<{ name: string; size: number }>('/api/backup'),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      pushToast(`Đã tạo bản sao lưu ${result.name}`, 'success');
    },
  });

  return (
    <div className="max-w-4xl space-y-4 p-6">
      <Panel title={t.settings.backup}>
        <p className="mb-3 flex items-center gap-2 text-sm text-tr-subtle">
          <Database size={15} /> {t.settings.dataLocation}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => backup.mutate()} disabled={backup.isPending}>
            <HardDriveDownload size={15} /> {t.settings.backupNow}
          </Button>
          <a
            href="/api/export"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-tr-border bg-tr-panel px-3 py-1.5 text-sm font-medium text-tr-text transition hover:bg-tr-hover"
          >
            <Download size={15} /> {t.settings.exportJson}
          </a>
        </div>

        {/* NFR-06: xuất CSV mở được bằng Excel */}
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-tr-subtle uppercase">
            Xuất CSV (mở bằng Excel)
          </h3>
          <div className="flex flex-wrap gap-2">
            {[
              ['customers', 'Khách hàng'],
              ['contacts', 'Người liên hệ'],
              ['deals', 'Cơ hội'],
              ['contracts', 'Hợp đồng'],
              ['tasks', 'Công việc'],
              ['revenues', 'Doanh thu theo tháng'],
            ].map(([entity, label]) => (
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
                  <span className="text-xs text-tr-muted">
                    {formatBytes(file.size)}
                  </span>
                  <span className="text-xs text-tr-muted">
                    {formatDateTime(file.created_at.slice(0, 16))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <Panel title={t.settings.manageLabels}>
        <LabelManager />
      </Panel>

      <Panel title="Chấm điểm cơ hội (BANT + 4P)">
        <ScoringSettings />
      </Panel>

      <Panel title="Dữ liệu mẫu">
        <p className="text-sm text-tr-subtle">
          Chạy lệnh <code className="rounded bg-tr-hover px-1.5 py-0.5">npm run seed</code> trong
          thư mục dự án để nạp dữ liệu mẫu (chỉ chạy khi cơ sở dữ liệu còn trống).
        </p>
      </Panel>

    </div>
  );
}
