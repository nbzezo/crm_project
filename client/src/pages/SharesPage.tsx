import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { ErrorState, SkeletonRows } from '../components/common/ui';
import { ShareLinkItem } from '../components/share/ShareButton';
import { usePermission } from '../lib/permissions';
import type { ShareLink } from '../lib/share';
import { useUiStore } from '../stores/uiStore';

/*
 * "Da chia se": moi lien ket cong khai cua toi (hoac cua ca cong ty, voi quan tri).
 * Day la noi thu hoi nhanh mot link khi can, khong phai mo tung ban ghi.
 */
export default function SharesPage() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const isAdmin = usePermission('settings.app', 'update');
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [filter, setFilter] = useState<'active' | 'all'>('active');

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
      void queryClient.invalidateQueries({ queryKey: ['shares'] });
      pushToast('Đã thu hồi liên kết', 'success');
    },
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      api.put<{ public_enabled: boolean }>('/api/shares/settings', { public_enabled: enabled }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['share-settings'] }),
  });

  const rows = (links.data ?? []).filter((l) => filter === 'all' || l.status === 'active');

  return (
    <div className="mx-auto w-full max-w-3xl p-4">
      <p className="mb-3 text-sm text-tr-subtle">
        Các liên kết công khai (chỉ xem) đã tạo cho tài liệu, báo giá và hợp đồng. Thu hồi một liên
        kết là vô hiệu hóa nó ngay lập tức.
      </p>

      {isAdmin && (
        <label className="mb-4 flex items-start gap-2 rounded-card border border-tr-border bg-tr-panel p-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={settings.data?.public_enabled ?? true}
            disabled={toggle.isPending || settings.isLoading}
            onChange={(e) => toggle.mutate(e.target.checked)}
          />
          <span>
            Cho phép chia sẻ bằng liên kết công khai
            <span className="block text-xs text-tr-muted">
              Tắt = ẩn nút Chia sẻ và mọi liên kết đã gửi ngừng hoạt động (có thể bật lại).
            </span>
          </span>
        </label>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5">
          Hiển thị
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as 'active' | 'all')}
            className="rounded-control border border-tr-border bg-tr-list px-2 py-1"
          >
            <option value="active">Đang hoạt động</option>
            <option value="all">Tất cả</option>
          </select>
        </label>
        {isAdmin && (
          <label className="flex items-center gap-1.5">
            Của
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as 'mine' | 'all')}
              className="rounded-control border border-tr-border bg-tr-list px-2 py-1"
            >
              <option value="mine">Tôi</option>
              <option value="all">Toàn công ty</option>
            </select>
          </label>
        )}
      </div>

      {links.isLoading ? (
        <SkeletonRows rows={4} cols={1} />
      ) : links.isError ? (
        <ErrorState message={(links.error as Error).message} onRetry={() => void links.refetch()} />
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
              onRevoke={() => revoke.mutate(link.id)}
              revoking={revoke.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
