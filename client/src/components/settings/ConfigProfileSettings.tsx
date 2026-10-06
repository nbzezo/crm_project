/**
 * Cài đặt → Hồ sơ cấu hình (1.27.0).
 *
 * Xuất toàn bộ cấu hình nghiệp vụ (danh mục, quy trình bán hàng, chấm điểm, bàn
 * giao, triển khai, vị trí & quyền) thành một tệp JSON, và nhập lại ở bản cài khác.
 * Nhập luôn qua hai bước: chạy thử để xem những gì sẽ đổi, rồi mới áp dụng.
 * Không xoá gì — mục chỉ có ở bản cài này được giữ nguyên.
 */
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, FileUp } from 'lucide-react';
import { api } from '../../api/client';
import { Button, FormError, Panel } from '../common/ui';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useUiStore } from '../../stores/uiStore';
import { usePermission } from '../../lib/permissions';
import { CRM_CONFIG_QUERY_KEY } from '../../lib/crmConfig';

interface ImportReport {
  dry_run: boolean;
  created: string[];
  updated: string[];
  warnings: string[];
}

export function ConfigProfileSettings() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const canEdit = usePermission('settings.app', 'update');
  const fileInput = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<{ name: string; data: unknown } | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);

  /* Dữ liệu hồ sơ đi theo tham số của lần gọi, không đọc từ state: lần chạy thử
     được gọi ngay sau setProfile, khi state còn là giá trị cũ. */
  const run = useMutation({
    mutationFn: ({ data, dryRun }: { data: unknown; dryRun: boolean }) =>
      api.post<ImportReport>(`/api/crm-config/profile${dryRun ? '?dry_run=1' : ''}`, data),
    onSuccess: (result) => {
      setReport(result);
      if (!result.dry_run) {
        setConfirmApply(false);
        queryClient.invalidateQueries();
        queryClient.invalidateQueries({ queryKey: CRM_CONFIG_QUERY_KEY });
        pushToast('Đã áp dụng hồ sơ cấu hình', 'success');
        setProfile(null);
      }
    },
  });

  const pick = async (file: File | undefined) => {
    setReport(null);
    setReadError(null);
    run.reset();
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as unknown;
      setProfile({ name: file.name, data });
      run.mutate({ data, dryRun: true });
    } catch {
      setProfile(null);
      setReadError('Tệp không phải JSON hợp lệ');
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="Xuất hồ sơ cấu hình">
        <p className="mb-3 text-sm text-tr-subtle">
          Một tệp JSON gồm danh mục, quy trình bán hàng, chấm điểm, bàn giao, triển khai, vị trí và
          quyền — không có dữ liệu khách hàng nào. Dùng để dựng bản cài cho khách mới, hoặc chép cấu
          hình đã tinh chỉnh sang bản cài khác.
        </p>
        <a
          href="/api/crm-config/profile"
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-control border border-tr-border bg-tr-panel px-3 py-1.5 text-sm font-medium text-tr-text transition hover:bg-tr-hover fine:min-h-[32px]"
        >
          <Download size={15} aria-hidden="true" /> Tải hồ sơ cấu hình
        </a>
      </Panel>

      {canEdit && (
        <Panel title="Nhập hồ sơ cấu hình">
          <p className="mb-3 text-sm text-tr-subtle">
            Khớp theo khoá: mục có trong hồ sơ được thêm hoặc cập nhật, mục chỉ có ở đây được giữ
            nguyên. Chọn tệp sẽ <b>chạy thử</b> trước để bạn xem những gì sẽ đổi.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => {
              void pick(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => fileInput.current?.click()} disabled={run.isPending}>
              <FileUp size={15} aria-hidden="true" /> Chọn tệp hồ sơ…
            </Button>
            {profile && <span className="text-sm text-tr-subtle">{profile.name}</span>}
          </div>
          {readError && <p className="mt-2 text-sm text-tr-danger">{readError}</p>}
          <FormError error={run.error} />

          {report && (
            <div className="mt-4 space-y-3 text-sm">
              <h3 className="font-semibold text-tr-text">
                {report.dry_run ? 'Kết quả chạy thử (chưa ghi gì)' : 'Đã áp dụng'}
              </h3>
              <ReportList title="Thêm mới" items={report.created} />
              <ReportList title="Cập nhật" items={report.updated} />
              <ReportList title="Lưu ý" items={report.warnings} tone="warning" />
              {report.dry_run && profile && (
                <Button
                  variant="primary"
                  disabled={run.isPending}
                  onClick={() => setConfirmApply(true)}
                >
                  {run.isPending ? 'Đang áp dụng…' : 'Áp dụng hồ sơ'}
                </Button>
              )}
            </div>
          )}
          <ConfirmDialog
            open={confirmApply}
            tone="primary"
            title="Áp dụng hồ sơ cấu hình?"
            message={`Cấu hình của bản cài này sẽ thay đổi ngay cho mọi người${profile ? ` theo tệp “${profile.name}”` : ''}.`}
            details={[
              `${report?.created.length ?? 0} mục được thêm mới`,
              `${report?.updated.length ?? 0} mục được cập nhật`,
              'Mục chỉ có ở bản cài này được giữ nguyên, không xoá gì.',
            ]}
            confirmLabel="Áp dụng"
            pending={run.isPending}
            onConfirm={() => profile && run.mutate({ data: profile.data, dryRun: false })}
            onCancel={() => setConfirmApply(false)}
          />
        </Panel>
      )}
    </div>
  );
}

function ReportList({ title, items, tone }: { title: string; items: string[]; tone?: 'warning' }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p
        className={`text-xs font-semibold ${tone === 'warning' ? 'text-tr-warning' : 'text-tr-subtle'}`}
      >
        {title} ({items.length})
      </p>
      <ul className="mt-1 max-h-48 list-disc space-y-0.5 overflow-auto pl-5 text-xs text-tr-text">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
