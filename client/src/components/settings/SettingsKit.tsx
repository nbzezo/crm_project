/*
 * Bo thanh phan dung chung cho moi trang Cai dat (1.32.0).
 *
 * Truoc ban nay muoi bay man co muoi bay cach lam: ba cach luu, sau ten nut Luu,
 * checkbox lan voi cong tac, thao tac nguy hiem nam lan voi thao tac thuong. Quy
 * uoc tu nay:
 *  - Danh sach ngan (danh muc, giai doan, trang thai) luu ngay tung o, va LUON
 *    bao "Dang luu… / Da luu" bang <SaveStatus>.
 *  - Bieu mau sua tren ban nhap dung <SaveBar>: hien khi co thay doi, dinh day,
 *    mot nhan duy nhat "Luu thay doi".
 *  - Bat/tat la <Toggle> (role="switch"), khong phai o tick.
 *  - Thao tac pha huy nam trong <DangerZone> va luon qua hop xac nhan.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Check, Loader2 } from 'lucide-react';
import { Button, IconButton, focusRing } from '../common/ui';

/* ---------- Thanh luu dinh day ---------- */
export function SaveBar({
  dirty,
  saving = false,
  onSave,
  onReset,
  disabled = false,
  message = 'Có thay đổi chưa lưu',
  problem,
  saveLabel = 'Lưu thay đổi',
}: {
  dirty: boolean;
  saving?: boolean;
  onSave: () => void;
  onReset?: () => void;
  /** Khong cho luu (vd. con o trong) — `problem` noi ly do. */
  disabled?: boolean;
  message?: ReactNode;
  problem?: string | null;
  saveLabel?: string;
}) {
  if (!dirty && !saving) return null;
  return (
    <div
      role="region"
      aria-label="Thay đổi chưa lưu"
      className="tr-savebar sticky bottom-[calc(var(--tr-tabbar-h)+0.5rem)] z-20 mt-4 flex flex-wrap items-center gap-2 rounded-panel bg-tr-text px-4 py-2.5 text-sm text-tr-panel shadow-lg md:bottom-4"
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${problem ? 'bg-tr-danger' : 'bg-tr-warning'}`}
      />
      <span className="min-w-[9rem] flex-1" aria-live="polite">
        {problem ?? message}
      </span>
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          disabled={saving}
          className={`min-h-11 rounded-control px-3 font-medium text-tr-panel/80 hover:bg-tr-panel/10 hover:text-tr-panel disabled:opacity-50 fine:min-h-9 ${focusRing}`}
        >
          Bỏ thay đổi
        </button>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={saving || disabled}
        className={`min-h-11 rounded-control bg-tr-primary px-4 font-semibold text-tr-on-primary hover:bg-tr-primary-hover disabled:cursor-not-allowed disabled:opacity-50 fine:min-h-9 ${focusRing}`}
      >
        {saving ? 'Đang lưu…' : saveLabel}
      </button>
    </div>
  );
}

/* ---------- Trang thai luu ngay ---------- */
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface MutationLike {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
}

/**
 * Gop trang thai cua cac mutation luu-ngay thanh mot. "Da luu" hien 2,5 giay
 * sau lan luu thanh cong gan nhat roi tu tat.
 */
export function useSaveState(mutations: MutationLike[]): SaveState {
  const pending = mutations.some((m) => m.isPending);
  const error = !pending && mutations.some((m) => m.isError);
  const success = !pending && !error && mutations.some((m) => m.isSuccess);
  const [showSaved, setShowSaved] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      setShowSaved(false);
      return;
    }
    if (wasPending.current && success) {
      wasPending.current = false;
      setShowSaved(true);
      const id = window.setTimeout(() => setShowSaved(false), 2500);
      return () => window.clearTimeout(id);
    }
    wasPending.current = false;
  }, [pending, success]);

  if (pending) return 'saving';
  if (error) return 'error';
  return showSaved ? 'saved' : 'idle';
}

export function SaveStatus({ state }: { state: SaveState }) {
  return (
    <span aria-live="polite" className="inline-flex min-h-5 items-center gap-1 text-xs font-medium">
      {state === 'saving' && (
        <span className="inline-flex items-center gap-1 text-tr-muted">
          <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Đang lưu…
        </span>
      )}
      {state === 'saved' && (
        <span className="inline-flex items-center gap-1 text-tr-success">
          <Check size={13} aria-hidden="true" /> Đã lưu
        </span>
      )}
      {state === 'error' && (
        <span className="inline-flex items-center gap-1 text-tr-danger">
          <AlertTriangle size={13} aria-hidden="true" /> Chưa lưu được
        </span>
      )}
    </span>
  );
}

/* ---------- Cong tac bat/tat ---------- */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  hideLabel = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
  /** Chi dung khi nhan da hien o cho khac ngay canh. */
  hideLabel?: boolean;
}) {
  const sw = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={hideLabel || description ? label : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${focusRing} ${
        checked ? 'bg-tr-primary' : 'bg-tr-hover-strong'
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}
      />
      {!hideLabel && !description && <span className="sr-only">{label}</span>}
    </button>
  );
  if (hideLabel) return sw;
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-tr-text">{label}</p>
        {description && <p className="text-xs text-tr-muted">{description}</p>}
      </div>
      {sw}
    </div>
  );
}

/* ---------- Vung nguy hiem ---------- */
export function DangerZone({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="Vùng nguy hiểm"
      className="mt-4 rounded-panel border border-tr-danger/40 p-3.5 sm:p-4"
    >
      <h3 className="mb-2 text-xs font-semibold text-tr-danger">Vùng nguy hiểm</h3>
      <div className="divide-y divide-tr-border">{children}</div>
    </section>
  );
}

export function DangerRow({
  title,
  description,
  actionLabel,
  onAction,
  disabled,
}: {
  title: string;
  description: ReactNode;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-tr-text">{title}</p>
        <p className="text-xs text-tr-muted">{description}</p>
      </div>
      <Button variant="danger" onClick={onAction} disabled={disabled}>
        {actionLabel}
      </Button>
    </div>
  );
}

/* ---------- Cham trang thai ---------- */
export type StatusTone = 'ok' | 'warn' | 'error' | 'off';

const DOT: Record<StatusTone, string> = {
  ok: 'bg-tr-success',
  warn: 'bg-tr-warning',
  error: 'bg-tr-danger',
  off: 'bg-tr-hover-strong',
};

const BADGE: Record<StatusTone, string> = {
  ok: 'bg-tr-success/10 text-tr-success',
  warn: 'bg-tr-warning/10 text-tr-warning',
  error: 'bg-tr-danger/10 text-tr-danger',
  off: 'bg-tr-hover text-tr-subtle',
};

export function StatusDot({ tone, label }: { tone: StatusTone; label?: string }) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      title={label}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT[tone]}`}
    />
  );
}

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${BADGE[tone]}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} />
      {children}
    </span>
  );
}

/* ---------- Chi tiet ky thuat (an mac dinh) ---------- */
export function TechDetails({ children }: { children: ReactNode }) {
  return (
    <details className="group text-xs text-tr-muted">
      <summary
        className={`inline-flex min-h-9 cursor-pointer items-center rounded-control font-medium text-tr-subtle ${focusRing}`}
      >
        Chi tiết kỹ thuật
      </summary>
      <div className="mt-1 space-y-1.5 leading-relaxed">{children}</div>
    </details>
  );
}

/* ---------- Nut doi thu tu (ban phim dung duoc) ---------- */
export function ReorderButtons({
  label,
  canUp,
  canDown,
  onMove,
  disabled = false,
}: {
  /** Ten muc, de nhan aria thanh "Đưa “…” lên". */
  label: string;
  canUp: boolean;
  canDown: boolean;
  onMove: (delta: -1 | 1) => void;
  disabled?: boolean;
}) {
  return (
    <span className="flex shrink-0">
      <IconButton
        label={`Đưa “${label}” lên`}
        disabled={disabled || !canUp}
        onClick={() => onMove(-1)}
      >
        <ArrowUp size={14} aria-hidden="true" />
      </IconButton>
      <IconButton
        label={`Đưa “${label}” xuống`}
        disabled={disabled || !canDown}
        onClick={() => onMove(1)}
      >
        <ArrowDown size={14} aria-hidden="true" />
      </IconButton>
    </span>
  );
}

/** Doi cho phan tu `index` voi phan tu ke ben, tra ve mang moi. */
export function moveItem<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
