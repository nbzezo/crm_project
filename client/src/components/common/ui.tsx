import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react';
import type {
  ButtonHTMLAttributes,
  ComponentProps,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactElement,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { AlertCircle, CalendarDays, Inbox } from 'lucide-react';
import { PRIORITY_COLORS, t } from '../../i18n/vi';
import type { Priority } from '../../types';
import {
  contrastInk,
  formatDate,
  formatVNDInput,
  joinDateTime,
  maskDateInput,
  parseDateInput,
  parseVNDInput,
  splitDateTime,
} from '../../lib/format';
import { DatePicker } from './DatePicker';
import { Popover, usePopover } from './Popover';

/* ---------- Button ---------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-tr-primary text-tr-on-primary shadow-sm hover:bg-tr-primary-hover',
  secondary: 'border border-tr-border bg-tr-panel text-tr-text shadow-sm hover:bg-tr-hover-strong',
  ghost: 'text-tr-subtle hover:bg-tr-hover',
  danger: 'bg-tr-danger text-tr-on-danger hover:brightness-110',
};

/* Chieu cao toi thieu 44px cho thiet bi cam ung (WCAG 2.5.5), thu gon tren chuot */
const SIZES: Record<Size, string> = {
  sm: 'min-h-[36px] px-2.5 py-1 text-xs fine:min-h-0',
  md: 'min-h-[44px] px-3 py-1.5 text-sm fine:min-h-[32px]',
  lg: 'min-h-[44px] px-4 py-2 text-sm',
};

/** Vong focus dung chung cho moi phan tu bam duoc — luon nhin thay bang ban phim. */
export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-primary';

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type={props.type ?? 'button'}
      {...props}
      className={`tr-button tr-button-${variant} inline-flex items-center justify-center gap-1.5 rounded-control font-medium transition-[background-color,color,filter,opacity] duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${SIZES[size]} ${VARIANTS[variant]} ${focusRing} ${className}`}
    />
  );
}

/* ---------- IconButton ---------- */
type IconButtonTone = 'default' | 'primary' | 'danger';

const ICON_BUTTON_TONES: Record<IconButtonTone, string> = {
  default: 'hover:text-tr-text',
  primary: 'hover:text-tr-primary',
  danger: 'hover:text-tr-danger',
};

export function IconButton({
  label,
  tone = 'default',
  className = '',
  title,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tone?: IconButtonTone;
}) {
  return (
    <button
      type={props.type ?? 'button'}
      aria-label={label}
      title={title ?? label}
      {...props}
      className={`tr-icon-button inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-tr-muted transition hover:bg-tr-hover disabled:cursor-not-allowed disabled:opacity-50 fine:h-8 fine:w-8 ${ICON_BUTTON_TONES[tone]} ${focusRing} ${className}`}
    />
  );
}

/* ---------- Footer chung cho modal biểu mẫu ---------- */
export function FormModalActions({
  onCancel,
  onSubmit,
  pending = false,
  disabled = false,
  cancelLabel = t.common.cancel,
  submitLabel = t.common.save,
  pendingLabel = t.common.saving,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  pending?: boolean;
  disabled?: boolean;
  cancelLabel?: ReactNode;
  submitLabel?: ReactNode;
  pendingLabel?: ReactNode;
}) {
  return (
    <>
      <Button onClick={onCancel}>{cancelLabel}</Button>
      <Button variant="primary" disabled={disabled || pending} onClick={onSubmit}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </>
  );
}

/* ---------- Segmented (nhom nut chon mot trong nhieu) ---------- */
/**
 * Dung cho thanh doi dang xem. Day la nhom nut chon che do, khong dieu khien
 * cac tabpanel rieng, nen dung aria-pressed thay vi semantics tab khong day du.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
  label?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="tr-segmented inline-flex flex-wrap rounded-full border border-tr-border bg-tr-panel p-1 shadow-sm"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`tr-segmented-option inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm whitespace-nowrap transition ${focusRing} ${
            value === option.value
              ? 'bg-tr-primary font-medium text-tr-on-primary'
              : 'text-tr-subtle hover:bg-tr-hover'
          }`}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Field wrappers ---------- */
/**
 * Gan nhan tuong minh bang htmlFor/id (khong dung nhan ngam) va noi
 * hint/loi vao o nhap qua aria-describedby — trinh doc man hinh doc duoc
 * ca ba phan roi rac thay vi gop het vao ten truong.
 */
export function Field({
  label,
  children,
  hint,
  error,
  required,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
}) {
  const autoId = useId();
  /* Khi noi goi tu dat `id` cho o nhap (de bang tom tat loi co the focus thang
     toi no), `htmlFor` phai bam theo CHINH id do. Ban truoc luon dung `useId()`
     cho nhan trong khi o nhap giu id rieng — nhan tro vao mot id khong ton tai. */
  const childId = isValidElement(children) ? (children.props as { id?: string }).id : undefined;
  const id = childId ?? autoId;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined,
      })
    : children;

  return (
    <div className="block">
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-tr-subtle">
        {label}
        {required && (
          <span className="ml-0.5 text-tr-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {control}
      {hint && (
        <span id={hintId} className="mt-1 block text-xs text-tr-muted">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className="mt-1 flex items-center gap-1 text-xs text-tr-danger">
          <AlertCircle size={12} className="shrink-0" aria-hidden="true" />
          {error}
        </span>
      )}
    </div>
  );
}

// Khong dat `text-sm` o day: co chu cua o nhap do `.tr-field-control` trong
// index.css quyet dinh — 16px tren cam ung de iOS khong tu phong to, 14px khi
// co con tro chinh xac.
const inputBase =
  'tr-field-control w-full rounded-control border border-tr-border bg-tr-list px-3 py-2 text-tr-text outline-none transition-[border-color,box-shadow] duration-150 hover:border-tr-primary/20 focus:border-tr-primary focus:ring-2 focus:ring-tr-primary/15 disabled:cursor-not-allowed disabled:bg-tr-hover disabled:text-tr-muted aria-invalid:border-tr-danger aria-invalid:focus:ring-tr-danger';

// ComponentProps<'input'> (thay vi InputHTMLAttributes) de `ref` duoc chap nhan dung kieu —
// can cho cac o quick-add tu refocus sau khi luu (vd TasksPage.tsx QuickAddRow).
export function Input({ className = '', ...props }: ComponentProps<'input'>) {
  return <input {...props} className={`${inputBase} ${className}`} />;
}

/**
 * `[&>option]:...` — trinh duyet ve popup cua `<select>` bang mau he thong, khong
 * theo theme trang: khong co lop nay thi option chu sang tren nen sang giua giao
 * dien toi, kho doc. Ap dung o day de moi noi dung `Select` deu duoc fix mot lan.
 */
export const selectOptionContrast = '[&>option]:bg-tr-panel [&>option]:text-tr-text';

/**
 * `fullWidth={false}` bo han `w-full` khoi class thay vi de noi goi chong them
 * `w-auto`: hai class Tailwind cung sua width thi thang thua do THU TU TRONG CSS
 * BIEN DICH quyet dinh, khong phai thu tu viet trong className — nen chong len
 * nhau cho ket qua khong doan truoc duoc (xem cung van de o MeetingNoteEditor).
 */
export function Select({
  className = '',
  fullWidth = true,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { fullWidth?: boolean }) {
  const base = fullWidth ? inputBase : inputBase.replace('w-full ', '');
  return <select {...props} className={`${base} ${selectOptionContrast} ${className}`} />;
}

export function Textarea({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLTextAreaElement> & { rows?: number }) {
  return (
    <textarea
      {...(props as object)}
      className={`${inputBase} resize-y leading-relaxed ${className}`}
    />
  );
}

/* ---------- DateInput (chuoi 'YYYY-MM-DD', khong dung Date) ----------
 *
 * Truoc day la `<input type="date">` thuan. Chrome ve o do theo locale cua
 * TRINH DUYET chu khong theo `<html lang="vi">`, nen tren may cai tieng Anh
 * nguoi dung go mm/dd trong khi ca ung dung hien thi dd/MM: go ngay ky 03/04
 * hieu la 3 thang 4 thi he thong luu 4 thang 3, keo theo nhac gia han hop dong
 * 90/60/30/7 ngay lech han mot thang.
 *
 * Gio la o text go dd/MM/yyyy co che dan + nut mo lich tu ve. Chu ky
 * (`value` la chuoi ISO 'YYYY-MM-DD', `onChange` tra null khi de trong) giu
 * nguyen nen moi noi dang dung khong phai sua. */
export function DateInput({
  value,
  onChange,
  className = '',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const picker = usePopover();
  const [text, setText] = useState(() => formatDate(value));

  // Dong bo khi gia tri doi tu ben ngoai (chon tu lich, reset form).
  useEffect(() => {
    setText(formatDate(value));
  }, [value]);

  return (
    <div className="relative">
      <Input
        {...props}
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/yyyy"
        value={text}
        onChange={(e) => {
          const masked = maskDateInput(e.target.value);
          setText(masked);
          const parsed = parseDateInput(masked);
          if (parsed) onChange(parsed);
          else if (masked === '') onChange(null);
        }}
        onBlur={(e) => {
          // Go do dang thi tra o ve gia tri hop le gan nhat, khong de ket o
          // trang thai nua voi ma nguoi dung tuong da nhap xong.
          setText(formatDate(value));
          props.onBlur?.(e);
        }}
        className={`pr-10 ${className}`}
      />
      <button
        type="button"
        onClick={picker.toggle}
        aria-label="Mở lịch chọn ngày"
        aria-haspopup="dialog"
        aria-expanded={picker.open}
        className={`absolute top-1/2 right-1 -translate-y-1/2 rounded-control p-2 text-tr-muted transition hover:bg-tr-hover hover:text-tr-text ${focusRing}`}
      >
        <CalendarDays size={15} aria-hidden="true" />
      </button>
      <Popover
        open={picker.open}
        onClose={picker.close}
        anchor={picker.anchor}
        title="Chọn ngày"
        width={288}
      >
        <DatePicker
          value={value}
          onSelect={(next) => {
            onChange(next);
            picker.close();
          }}
        />
      </Popover>
    </div>
  );
}

/* ---------- DateTimeInput (chuoi 'YYYY-MM-DDTHH:mm') ----------
 * Ghep DateInput voi mot o gio. Gio giu `type="time"` cua trinh duyet: 12h hay
 * 24h deu hien AM/PM ro rang nen khong co kieu nham lan nhu ngay/thang. */
export function DateTimeInput({
  value,
  onChange,
  className = '',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const { date, time } = splitDateTime(value);
  return (
    <div className={`flex gap-2 ${className}`}>
      <DateInput
        {...props}
        value={date}
        onChange={(next) => onChange(joinDateTime(next, time))}
        className="min-w-0 flex-1"
      />
      <Input
        type="time"
        aria-label="Giờ"
        value={time}
        onChange={(e) => onChange(joinDateTime(date, e.target.value))}
        className="w-28 shrink-0"
      />
    </div>
  );
}

/**
 * O ngay sua tai cho: hien thi dd/MM/yyyy (khong phu thuoc locale trinh duyet),
 * bam vao moi doi thanh o chon ngay.
 */
export function InlineDate({
  value,
  onChange,
  highlight,
  placeholder = '—',
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value' | 'onChange'> & {
  value: string | null;
  onChange: (value: string | null) => void;
  highlight?: boolean;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');

  if (editing) {
    return (
      <input
        type="text"
        inputMode="numeric"
        autoFocus
        autoComplete="off"
        aria-label="Ngày, dạng ngày/tháng/năm"
        placeholder="dd/mm/yyyy"
        value={text}
        onChange={(e) => {
          const masked = maskDateInput(e.target.value);
          setText(masked);
          const parsed = parseDateInput(masked);
          if (parsed) onChange(parsed);
          else if (masked === '') onChange(null);
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => e.key === 'Enter' && setEditing(false)}
        className="w-24 rounded-control border border-tr-border bg-tr-panel px-1 py-0.5 text-xs tabular-nums text-tr-text"
      />
    );
  }

  return (
    <button
      {...props}
      type="button"
      onClick={() => {
        setText(formatDate(value));
        setEditing(true);
      }}
      className={`rounded-control border border-transparent px-1.5 py-0.5 text-xs tabular-nums hover:border-tr-border ${focusRing} ${
        highlight ? 'font-semibold text-tr-danger' : value ? 'text-tr-subtle' : 'text-tr-muted'
      }`}
    >
      {value ? formatDate(value) : placeholder}
    </button>
  );
}

/* ---------- MoneyInput (VND, cho phep go 1.500.000) ----------
 * `...props` bat buoc phai co: `Field` bom id/aria-* vao con bang cloneElement,
 * khong chuyen tiep thi nhan va loi khong noi duoc voi o nhap. */
export function MoneyInput({
  value,
  onChange,
  className = '',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="relative">
      <Input
        {...props}
        inputMode="numeric"
        value={formatVNDInput(value)}
        onChange={(e) => onChange(parseVNDInput(e.target.value))}
        className={`pr-10 ${className}`}
        placeholder="0"
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-tr-muted">
        ₫
      </span>
    </div>
  );
}

/* ---------- Badge mau (tu chon muc chu den/trang cho du tuong phan) ---------- */
export function ColorBadge({
  color,
  children,
  small,
}: {
  color: string;
  children: ReactNode;
  small?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap ${
        small ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs'
      }`}
      style={{ backgroundColor: color, color: contrastInk(color) }}
    >
      {children}
    </span>
  );
}

export function PriorityBadge({ priority, small }: { priority: Priority; small?: boolean }) {
  return (
    <ColorBadge color={PRIORITY_COLORS[priority]} small={small}>
      {t.priority[priority]}
    </ColorBadge>
  );
}

/* ---------- EmptyState ---------- */
export function EmptyState({
  message,
  hint,
  action,
}: {
  message: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="tr-empty-state flex flex-col items-center justify-center gap-3 rounded-modal border border-dashed border-tr-border bg-tr-panel/60 px-6 py-12 text-center">
      <Inbox className="text-tr-muted" size={36} aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm text-tr-subtle">{message}</p>
        {hint && <p className="text-xs text-tr-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------- Bang bao loi trong bieu mau ---------- */
/**
 * Toast loi mac dinh (main.tsx) hien o goc duoi phai va tu tat sau 4 giay —
 * nguoi dung dang nhin vao form rat de bo lo. Bang nay giu loi ngay tren cho
 * bam Luu cho toi khi thu lai.
 *
 * Bang nay CHIEM FOCUS khi vua xuat hien. `role="alert"` chi khien trinh doc man
 * hinh doc len noi dung, con focus ban phim thi van nam o nut Luu — nguoi dung
 * ban phim nghe thay "co loi" nhung phai tu do nguoc len tim. Doi focus mot lan,
 * dung luc bang xuat hien, la cach re nhat de dong khoang cach do.
 *
 * `fields` cho phep noi tung loi toi dung o nhap sai. Bam vao mot muc se dua
 * focus thang toi o do, nen bang vua la thong bao vua la duong dan sua.
 */
export function FormError({
  error,
  fields,
  takeFocus = true,
}: {
  error: unknown;
  fields?: { id: string; label: string }[];
  /**
   * Dat false khi bang nay dung lam tom tat loi validation: luc do focus da
   * duoc dua ve o nhap dau tien bi loi, keo nguoc len day se cuop mat.
   */
  takeFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Bam theo noi dung loi chu khong phai chinh `error`: mot doi tuong Error moi
  // nhung cung thong diep (bam Luu lai, van sai cho cu) van phai keo focus ve.
  const message = error ? (error instanceof Error ? error.message : t.common.saveError) : null;

  useEffect(() => {
    if (message && takeFocus) ref.current?.focus({ preventScroll: false });
  }, [message, takeFocus]);

  if (!message) return null;

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="mb-3 rounded-panel border border-tr-danger/50 bg-tr-danger/10 p-3 text-sm text-tr-text outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-danger"
    >
      <div className="flex items-start gap-2">
        <AlertCircle size={16} className="mt-0.5 shrink-0 text-tr-danger" aria-hidden="true" />
        <span>{message}</span>
      </div>
      {/* `min-h-6` + khoang cach dong: WCAG 2.2 doi vung cham it nhat 24x24px.
          Cac muc nay von chi cao 21px va cach nhau 2px nen axe bao target-size. */}
      {fields && fields.length > 0 && (
        <ul className="mt-2 ml-6 list-disc space-y-1">
          {fields.map((field) => (
            <li key={field.id}>
              <button
                type="button"
                onClick={() => document.getElementById(field.id)?.focus()}
                className={`inline-flex min-h-6 items-center underline underline-offset-2 hover:text-tr-danger ${focusRing}`}
              >
                {field.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Skeleton (khung xuong khi dang tai) ---------- */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`tr-skeleton ${className}`} />;
}

/** Khung xuong dang bang: n dong x m cot. */
export function SkeletonRows({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-3" role="status" aria-label="Đang tải dữ liệu">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={`h-5 ${c === 0 ? 'flex-[2]' : 'flex-1'}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------- Phần đầu bảng ---------- */
export function TableHead({ className = '', ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      {...props}
      className={`tr-table-head bg-tr-surface text-left text-xs tracking-wide text-tr-subtle uppercase ${className}`}
    />
  );
}

/* ---------- ErrorState ---------- */
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="tr-empty-state flex flex-col items-center justify-center gap-3 rounded-modal border border-dashed border-tr-danger/60 bg-tr-panel/60 px-6 py-12 text-center"
    >
      <AlertCircle className="text-tr-danger" size={32} aria-hidden="true" />
      <p className="text-sm text-tr-subtle">{message ?? t.common.loadError}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {t.common.retry}
        </Button>
      )}
    </div>
  );
}

/* ---------- Card panel ---------- */
export function Panel({
  title,
  children,
  action,
  className = '',
}: {
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`tr-bento-card rounded-panel border border-tr-border bg-tr-panel p-3.5 sm:p-4 ${className}`}
    >
      {/* flex-wrap + min-w-0: tieu de va cum nut/loc phai duoc xuong dong khi chat
          thay vi ep nhau. Khong co hai thu nay thi cum `action` bi don thanh cot
          hep o mep phai roi tran ra ngoai vien card — thay ro nhat o bo loc "Ma
          tran co hoi" tren /pipeline-health. */}
      {(title || action) && (
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="min-w-0 text-sm font-bold tracking-[-0.01em] text-tr-text">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
