import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Eye, Link2, Lock, Mail, Send, Share2, ShieldCheck } from 'lucide-react';
import { api, qs } from '../../api/client';
import { Modal } from '../common/Modal';
import { Button, Field, FormError, IconButton, Input, Select } from '../common/ui';
import { usePermissionCheck } from '../../lib/permissions';
import { formatDateTime } from '../../lib/format';
import {
  SHARE_ENTITY_LABEL,
  SHARE_EXPIRY_OPTIONS,
  SHARE_STATUS_LABEL,
  copyText,
  mailtoHref,
  telegramHref,
  type ShareCreated,
  type ShareEntityType,
  type ShareLink,
  type ShareView,
} from '../../lib/share';
import { useUiStore } from '../../stores/uiStore';

const RESOURCE_OF: Record<ShareEntityType, 'documents' | 'quotations' | 'contracts' | 'notes'> = {
  document: 'documents',
  quotation: 'quotations',
  contract: 'contracts',
  page: 'notes',
};

/* Mau theo token cua theme de tu doi giua sang / toi. */
const STATUS_CLASS = {
  active: 'bg-service-status-using-bg text-service-status-using-fg',
  expired: 'bg-service-status-paused-bg text-service-status-paused-fg',
  revoked: 'bg-service-status-stopped-bg text-service-status-stopped-fg',
} as const;

/** Duoc phep chia se loai ban ghi nay: du quyen SUA va quan tri chua tat chia se cong khai. */
export function useCanShare(entityType: ShareEntityType): boolean {
  const allowed = usePermissionCheck();
  const canShare = allowed(`${RESOURCE_OF[entityType]}:update`);
  const settings = useQuery({
    queryKey: ['share-settings'],
    queryFn: () => api.get<{ public_enabled: boolean }>('/api/shares/settings'),
    enabled: canShare,
    staleTime: 60_000,
  });
  return canShare && settings.data?.public_enabled !== false;
}

/**
 * Nut "Chia se" (cho phep xem) — dung chung cho tai lieu, bao gia, hop dong.
 *
 * An khi nguoi dung khong co quyen SUA loai ban ghi nay hoac quan tri da tat chia
 * se cong khai. Day chi la lop ve giao dien; may chu kiem lai moi request.
 */
export function ShareButton({
  entityType,
  entityId,
  label,
  variant = 'icon',
  size = 15,
}: {
  entityType: ShareEntityType;
  entityId: number;
  /** Ten hien thi cua ban ghi, dung trong tieu de hop thoai va nhan truy cap. */
  label: string;
  variant?: 'icon' | 'button';
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  if (!useCanShare(entityType)) return null;

  return (
    <>
      {variant === 'icon' ? (
        <IconButton onClick={() => setOpen(true)} label={`Chia sẻ: ${label}`} tone="primary">
          <Share2 size={size} aria-hidden="true" />
        </IconButton>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Share2 size={size} aria-hidden="true" /> Chia sẻ
        </Button>
      )}
      {open && (
        <ShareDialog
          entityType={entityType}
          entityId={entityId}
          label={label}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function ShareDialog({
  entityType,
  entityId,
  label,
  onClose,
}: {
  entityType: ShareEntityType;
  entityId: number;
  label: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [expiry, setExpiry] = useState('7');
  const [password, setPassword] = useState('');
  const [allowDownload, setAllowDownload] = useState(true);
  const [lockVersion, setLockVersion] = useState(entityType === 'quotation');
  const [notify, setNotify] = useState(false);
  const [created, setCreated] = useState<ShareCreated | null>(null);
  const [copied, setCopied] = useState(false);

  const listKey = ['shares', entityType, entityId];
  const links = useQuery({
    queryKey: listKey,
    queryFn: () =>
      api.get<ShareLink[]>(`/api/shares${qs({ entity_type: entityType, entity_id: entityId })}`),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<ShareCreated>('/api/shares', {
        entity_type: entityType,
        entity_id: entityId,
        expires_in_days: SHARE_EXPIRY_OPTIONS.find((o) => o.value === expiry)?.days ?? null,
        password: password.trim() || undefined,
        allow_download: allowDownload,
        lock_version: lockVersion,
        notify_on_view: notify,
      }),
    onSuccess: (link) => {
      setCreated(link);
      setCopied(false);
      setPassword('');
      void queryClient.invalidateQueries({ queryKey: listKey });
      void queryClient.invalidateQueries({ queryKey: ['shares', 'all'] });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: number) => api.post<ShareLink>(`/api/shares/${id}/revoke`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listKey });
      void queryClient.invalidateQueries({ queryKey: ['shares', 'all'] });
      pushToast('Đã thu hồi liên kết', 'success');
    },
  });

  const extend = useMutation({
    mutationFn: ({ id, days }: { id: number; days: number }) =>
      api.post<ShareLink>(`/api/shares/${id}/extend`, { days }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listKey });
      void queryClient.invalidateQueries({ queryKey: ['shares', 'all'] });
      pushToast('Đã gia hạn liên kết', 'success');
    },
  });

  async function copy(url: string) {
    const ok = await copyText(url);
    setCopied(ok);
    pushToast(
      ok ? 'Đã sao chép liên kết' : 'Không sao chép được — hãy chọn và sao chép thủ công',
      ok ? 'success' : 'error'
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-xl"
      title={`Chia sẻ: ${label}`}
      footer={<Button onClick={onClose}>Đóng</Button>}
    >
      <p className="mb-3 flex items-start gap-2 text-sm text-tr-subtle">
        <Eye size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        Người có liên kết chỉ được <strong className="mx-1">xem</strong> — không sửa, không xóa và
        không cần tài khoản. Ghi chú nội bộ không bao giờ hiển thị.
      </p>

      {created ? (
        <section
          aria-label="Liên kết vừa tạo"
          className="mb-4 rounded-card border border-tr-border bg-tr-list p-3"
        >
          <p className="mb-2 text-sm font-semibold text-tr-text">
            Đã tạo liên kết
            {created.has_password && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-tr-muted">
                <Lock size={12} aria-hidden="true" /> có mật khẩu
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={created.url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Liên kết chia sẻ"
            />
            <Button variant="primary" onClick={() => void copy(created.url)}>
              {copied ? (
                <Check size={15} aria-hidden="true" />
              ) : (
                <Copy size={15} aria-hidden="true" />
              )}
              {copied ? 'Đã chép' : 'Sao chép'}
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href={mailtoHref(label, created.url, created.has_password)}
              className="inline-flex min-h-[32px] items-center gap-1.5 rounded-control border border-tr-border px-2.5 text-sm text-tr-text hover:bg-tr-hover"
            >
              <Mail size={14} aria-hidden="true" /> Gửi email
            </a>
            <a
              href={telegramHref(label, created.url, created.has_password)}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-h-[32px] items-center gap-1.5 rounded-control border border-tr-border px-2.5 text-sm text-tr-text hover:bg-tr-hover"
            >
              <Send size={14} aria-hidden="true" /> Telegram
            </a>
          </div>
          <p className="mt-2 text-xs text-tr-muted">
            Liên kết chỉ hiện đầy đủ một lần này. Quên thì tạo liên kết mới và thu hồi liên kết cũ.
          </p>
        </section>
      ) : null}

      <section aria-label="Tạo liên kết mới" className="mb-5">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-tr-text">
          <Link2 size={15} aria-hidden="true" /> Tạo liên kết mới
        </h3>
        <FormError error={create.error} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Hết hạn sau">
            <Select value={expiry} onChange={(e) => setExpiry(e.target.value)}>
              {SHARE_EXPIRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Mật khẩu (tùy chọn)"
            hint="Từ 4 ký tự. Gửi mật khẩu riêng, không gửi cùng liên kết."
          >
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={4}
              maxLength={100}
            />
          </Field>
        </div>
        <div className="mt-3 space-y-2 text-sm text-tr-text">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={allowDownload}
              onChange={(e) => setAllowDownload(e.target.checked)}
            />
            <span>
              Cho phép tải về
              <span className="block text-xs text-tr-muted">
                Tắt = chỉ xem trên trình duyệt (PDF, ảnh, văn bản). Tệp Word/Excel sẽ không xem
                được.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={lockVersion}
              onChange={(e) => setLockVersion(e.target.checked)}
            />
            <span>
              Cố định phiên bản hiện tại
              <span className="block text-xs text-tr-muted">
                Số liệu và tệp được chốt tại thời điểm chia sẻ; sửa sau đó không làm đổi trang người
                nhận thấy.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
            />
            <span>
              Nhắc tôi theo dõi khi khách mở lần đầu
              <span className="block text-xs text-tr-muted">
                Gửi một thông báo (chuông) dẫn tới khách hàng / cơ hội của bản ghi này.
              </span>
            </span>
          </label>
        </div>
        <div className="mt-3">
          <Button
            variant="primary"
            disabled={create.isPending || (password.length > 0 && password.length < 4)}
            onClick={() => create.mutate()}
          >
            <ShieldCheck size={15} aria-hidden="true" />
            {create.isPending ? 'Đang tạo…' : 'Tạo liên kết'}
          </Button>
        </div>
      </section>

      <section aria-label="Liên kết đã tạo">
        <h3 className="mb-2 text-sm font-semibold text-tr-text">Liên kết đã tạo</h3>
        {links.isLoading ? (
          <p className="text-sm text-tr-muted">Đang tải…</p>
        ) : (links.data ?? []).length === 0 ? (
          <p className="text-sm text-tr-muted">Chưa có liên kết nào.</p>
        ) : (
          <ul className="space-y-2">
            {links.data!.map((link) => (
              <ShareLinkItem
                key={link.id}
                link={link}
                onRevoke={() => revoke.mutate(link.id)}
                revoking={revoke.isPending}
                onExtend={(days) => extend.mutate({ id: link.id, days })}
                extending={extend.isPending}
              />
            ))}
          </ul>
        )}
      </section>
    </Modal>
  );
}

/** Mot dong lien ket: trang thai, luot mo, nhat ky va nut thu hoi. */
export function ShareLinkItem({
  link,
  onRevoke,
  revoking,
  onExtend,
  extending,
  showTitle = false,
}: {
  link: ShareLink;
  onRevoke: () => void;
  revoking: boolean;
  onExtend: (days: number) => void;
  extending: boolean;
  showTitle?: boolean;
}) {
  const [showViews, setShowViews] = useState(false);
  const views = useQuery({
    queryKey: ['share-views', link.id],
    queryFn: () => api.get<ShareView[]>(`/api/shares/${link.id}/views`),
    enabled: showViews,
  });

  return (
    <li className="rounded-control border border-tr-border p-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_CLASS[link.status]}`}
        >
          {SHARE_STATUS_LABEL[link.status]}
        </span>
        {showTitle && (
          <span className="font-medium text-tr-text">
            {SHARE_ENTITY_LABEL[link.entity_type]}: {link.title}
          </span>
        )}
        <span className="font-mono text-xs text-tr-muted">…{link.token_hint}</span>
        {link.has_password && (
          <span
            className="inline-flex items-center gap-1 text-xs text-tr-muted"
            title="Có mật khẩu"
          >
            <Lock size={12} aria-hidden="true" /> mật khẩu
          </span>
        )}
        {!link.allow_download && <span className="text-xs text-tr-muted">chỉ xem</span>}
        {link.locked_version && <span className="text-xs text-tr-muted">cố định bản</span>}
      </div>
      <p className="mt-1 text-xs text-tr-muted">
        Tạo {formatDateTime(link.created_at.replace(' ', 'T'))} bởi {link.created_by_name || '—'} ·{' '}
        {link.expires_at
          ? `hết hạn ${formatDateTime(link.expires_at.replace(' ', 'T'))}`
          : 'không hết hạn'}{' '}
        · {link.view_count} lượt mở
        {link.last_viewed_at &&
          ` (gần nhất ${formatDateTime(link.last_viewed_at.replace(' ', 'T'))})`}
      </p>
      <div className="mt-1.5 flex gap-2">
        <Button size="sm" onClick={() => setShowViews((v) => !v)} aria-expanded={showViews}>
          <Eye size={13} aria-hidden="true" /> {showViews ? 'Ẩn lượt mở' : 'Xem lượt mở'}
        </Button>
        {link.status !== 'revoked' && (
          <Button size="sm" disabled={extending} onClick={() => onExtend(7)}>
            Gia hạn 7 ngày
          </Button>
        )}
        {link.status === 'active' && (
          <Button size="sm" variant="danger" disabled={revoking} onClick={onRevoke}>
            Thu hồi
          </Button>
        )}
      </div>
      {showViews && (
        <div className="mt-2 text-xs text-tr-subtle">
          {views.isLoading ? (
            'Đang tải…'
          ) : (views.data ?? []).length === 0 ? (
            'Chưa ai mở liên kết này.'
          ) : (
            <ul className="max-h-40 space-y-0.5 overflow-auto">
              {views.data!.map((v) => (
                <li key={v.id}>
                  {formatDateTime(v.viewed_at.replace(' ', 'T'))} ·{' '}
                  {v.action === 'download' ? 'tải về' : 'mở'} · {v.ip || 'không rõ IP'}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
