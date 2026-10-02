/*
 * Kieu du lieu va ham dung chung cho chia se bang duong lien ket (v50).
 * Khop voi server/src/routes/shares.ts va services/shareService.ts.
 */

export type ShareEntityType = 'document' | 'quotation' | 'contract';
export type ShareStatus = 'active' | 'expired' | 'revoked';

export interface ShareLink {
  id: number;
  entity_type: ShareEntityType;
  entity_id: number;
  title: string;
  token_hint: string;
  created_by_name: string;
  created_at: string;
  expires_at: string | null;
  has_password: boolean;
  allow_download: boolean;
  locked_version: boolean;
  notify_on_view: boolean;
  status: ShareStatus;
  view_count: number;
  last_viewed_at: string | null;
}

/** Chi nhan duoc MOT LAN luc tao — token khong duoc luu o dau khac. */
export interface ShareCreated extends ShareLink {
  token: string;
  url: string;
}

export interface ShareView {
  id: number;
  viewed_at: string;
  ip: string;
  user_agent: string;
  action: 'view' | 'download';
}

export const SHARE_ENTITY_LABEL: Record<ShareEntityType, string> = {
  document: 'Tài liệu',
  quotation: 'Báo giá',
  contract: 'Hợp đồng',
};

export const SHARE_STATUS_LABEL: Record<ShareStatus, string> = {
  active: 'Đang hoạt động',
  expired: 'Hết hạn',
  revoked: 'Đã thu hồi',
};

export const SHARE_EXPIRY_OPTIONS: { value: string; label: string; days: number | null }[] = [
  { value: '1', label: '1 ngày', days: 1 },
  { value: '7', label: '7 ngày', days: 7 },
  { value: '30', label: '30 ngày', days: 30 },
  { value: 'never', label: 'Không hết hạn', days: null },
];

/** Cau noi ngan cho nguoi nhan khi gui qua email / Telegram. */
export function shareMessage(title: string, url: string, hasPassword: boolean): string {
  return [
    `Xin chào, mình chia sẻ "${title}" để bạn xem:`,
    url,
    hasPassword ? '(Mật khẩu mở liên kết mình sẽ gửi riêng.)' : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function mailtoHref(title: string, url: string, hasPassword: boolean): string {
  return `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(shareMessage(title, url, hasPassword))}`;
}

export function telegramHref(title: string, url: string, hasPassword: boolean): string {
  const text = hasPassword
    ? `${title} (mật khẩu mở liên kết sẽ gửi riêng)`
    : title;
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
}

/** Sao chep vao clipboard; lui ve execCommand khi trinh duyet khong cho (http, iframe). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      return document.execCommand('copy');
    } finally {
      area.remove();
    }
  }
}
