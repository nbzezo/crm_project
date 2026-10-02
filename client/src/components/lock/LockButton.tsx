import { Lock } from 'lucide-react';
import { useLockStore } from '../../stores/lockStore';

/** Nut khoa man hinh tren thanh tren, dat ngay canh chuong thong bao. */
export function LockButton({ className = '' }: { className?: string }) {
  const lock = useLockStore((s) => s.lock);
  return (
    <button
      type="button"
      onClick={lock}
      aria-label="Khóa màn hình"
      title="Khóa màn hình (Ctrl + Shift + L)"
      className={`relative h-11 w-11 items-center justify-center rounded-full border border-tr-border bg-tr-panel text-tr-muted shadow-sm transition hover:border-tr-primary/20 hover:text-tr-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-primary fine:h-9 fine:w-9 ${className}`}
    >
      <Lock size={17} aria-hidden="true" />
    </button>
  );
}
