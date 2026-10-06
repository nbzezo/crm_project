import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ErrorState, Panel, Select, SkeletonRows } from '../common/ui';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { DangerRow, DangerZone, Toggle } from './SettingsKit';
import { ShareLinkItem } from '../share/ShareButton';
import { usePermission } from '../../lib/permissions';
import type { ShareLink } from '../../lib/share';
import { useUiStore } from '../../stores/uiStore';

/*
 * "Liên kết chia sẻ" (Cai dat > Du lieu): moi lien ket cong khai cua toi (hoac cua
 * ca cong ty, voi quan tri). Day la noi thu hoi nhanh mot link khi can, khong phai
 * mo tung ban ghi. Duong dan cu /shares chuyen huong ve day (main.tsx).
 */
export function ShareLinksSettings() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const isAdmin = usePermission('settings.app', 'update');
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [confirm, setConfirm] = useState<'disable' | null>(null);
  const [revoking, setRevoking] = useState<ShareLink | null>(null);

  const links = useQuery({
    queryKey: ['shares', 'all', scope],
    queryFn: () => api.get<ShareLink[]>(scope === 'all' ? '/api/shares?all=1' : '/api/shares'),
  });
  const settings = useQuery({
    queryKey: ['share-settings'],
    queryFn: () => api.get<{ public_enabled: boolean }>('/api/shares/settings'),
  });

  const revoke = useMutation({
    mutationFn: (id: number) => api.post<ShareLink>(`/api/shares/${id}/revoke`),
    onSuccess: () => {
      setRevoking(null);
      void queryClient.invalidateQueries({ queryKey: ['shares'] });
      pushToast('Đã thu hồi liên kết', 'success');
    },
  });

  const extend = useMutation({
    mutationFn: ({ id, days }: { id: number; days: number }) =>
      api.post<ShareLink>(`/api/shares/${id}/extend`, { days }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['shares'] });
      pushToast('Đã gia hạn liên kết', 'success');
    },
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      api.put<{ public_enabled: boolean }>('/api/shares/settings', { public_enabled: enabled }),
    onSuccess: (_data, enabled) => {
      setConfirm(null);
      void queryClient.invalidateQueries({ queryKey: ['share-settings'] });
      pushToast(enabled ? 'Đã bật lại chia sẻ công khai' : 'Đã tắt chia sẻ công khai', 'success');
    },
  });
  const enabled = settings.data?.public_enabled ?? true;
  const activeCount = (links.data ?? []).filter((l) => l.status === 'active').length;

  const rows = (links.data ?? []).filter((l) => filter === 'all' || l.status === 'active');

  return (
    <div className="w-full max-w-3xl space-y-4">
      {isAdmin && !enabled && (
        <Panel title="Chia sẻ công khai đang tắt">
          <Toggle
            checked={false}
            disabled={toggle.isPending || settings.isLoading}
            onChange={() => toggle.mutate(true)}
            label="Bật lại chia sẻ bằng liên kết công khai"
            description="Nút Chia sẻ hiện lại và các liên kết chưa hết hạn hoạt động trở lại."
          />
        </Panel>
      )}
      <Panel title="Liên kết đang có">
        <p className="mb-3 text-sm text-tr-subtle">
          Liên kết chỉ xem cho tài liệu, trang tài liệu, báo giá và hợp đồng. Thu hồi một liên kết
          là vô hiệu hoá nó ngay lập tức.
        </p>

        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5 text-tr-subtle">
            Hiển thị
            <Select
              fullWidth={false}
              value={filter}
              onChange={(e) => setFilter(e.target.value as 'active' | 'all')}
            >
              <option value="active">Đang hoạt động</option>
              <option value="all">Tất cả</option>
            </Select>
          </label>
          {isAdmin && (
            <label className="flex items-center gap-1.5 text-tr-subtle">
              Người tạo
              <Select
                fullWidth={false}
                value={scope}
                onChange={(e) => setScope(e.target.value as 'mine' | 'all')}
              >
                <option value="mine">Của tôi</option>
                <option value="all">Cả công ty</option>
              </Select>
            </label>
          )}
        </div>

        {links.isLoading ? (
          <SkeletonRows rows={4} cols={1} />
        ) : links.isError ? (
          <ErrorState
            message={(links.error as Error).message}
            onRetry={() => void links.refetch()}
          />
        ) : rows.length === 0 ? (
          <p className="rounded-card border border-dashed border-tr-border p-6 text-center text-sm text-tr-muted">
            Chưa có liên kết nào. Bấm nút Chia sẻ trên một tài liệu, báo giá hoặc hợp đồng để tạo.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((link) => (
              <ShareLinkItem
                key={link.id}
                link={link}
                showTitle
                onRevoke={() => setRevoking(link)}
                revoking={revoke.isPending}
                onExtend={(days) => extend.mutate({ id: link.id, days })}
                extending={extend.isPending}
              />
            ))}
          </ul>
        )}
      </Panel>

      {isAdmin && enabled && (
        <DangerZone>
          <DangerRow
            title="Tắt chia sẻ công khai cho cả công ty"
            description="Ẩn nút Chia sẻ và mọi liên kết đã gửi ngừng hoạt động (bật lại được)."
            actionLabel="Tắt…"
            disabled={toggle.isPending || settings.isLoading}
            onAction={() => setConfirm('disable')}
          />
        </DangerZone>
      )}

      <ConfirmDialog
        open={confirm === 'disable'}
        title="Tắt chia sẻ công khai?"
        message="Người nhận đang mở liên kết sẽ thấy trang báo liên kết không còn hiệu lực."
        details={[
          scope === 'all'
            ? `${activeCount} liên kết đang hoạt động sẽ ngừng ngay.`
            : 'Mọi liên kết đang hoạt động của cả công ty sẽ ngừng ngay.',
          'Nút Chia sẻ bị ẩn khỏi tài liệu, báo giá và hợp đồng.',
          'Bật lại thì các liên kết chưa hết hạn hoạt động trở lại.',
        ]}
        confirmLabel="Tắt chia sẻ"
        pending={toggle.isPending}
        onConfirm={() => toggle.mutate(false)}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={revoking !== null}
        title="Thu hồi liên kết này?"
        message="Liên kết ngừng hoạt động ngay và không khôi phục được — muốn chia sẻ lại phải tạo liên kết mới."
        confirmLabel="Thu hồi"
        pending={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
        onCancel={() => setRevoking(null)}
      />
    </div>
  );
}
