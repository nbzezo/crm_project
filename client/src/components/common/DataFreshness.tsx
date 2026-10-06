import { RefreshCw } from 'lucide-react';
import { focusRing } from './ui';

export function stampLabel(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  return at.toDateString() === new Date().toDateString()
    ? time
    : `${pad(at.getDate())}/${pad(at.getMonth() + 1)} ${time}`;
}

/**
 * "Số liệu lúc HH:mm · Làm mới" cho cac man tong hop co luu dem 5 phut (1.22.0).
 * `computedAt` lay tu truong `computed_at` may chu gan vao phan hoi.
 */
export function DataFreshness({
  computedAt,
  refreshing,
  onRefresh,
}: {
  computedAt?: string;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  if (!computedAt) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-tr-muted print:hidden">
      <span>Số liệu lúc {stampLabel(computedAt)}</span>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className={`inline-flex items-center gap-1 rounded-control font-medium text-tr-primary hover:underline disabled:cursor-wait disabled:opacity-60 ${focusRing}`}
      >
        <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
        {refreshing ? 'Đang tính lại…' : 'Làm mới'}
      </button>
    </p>
  );
}
