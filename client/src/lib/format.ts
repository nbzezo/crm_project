import { addDays as addDaysFn, format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';

const vndFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('vi-VN');

export function formatVND(value: number | null | undefined): string {
  return vndFormatter.format(value ?? 0);
}

/** Rut gon cho truc bieu do / thanh tong: 1,5 tỷ · 250 tr · 900 ng. */
export function formatVNDShort(value: number | null | undefined): string {
  const n = value ?? 0;
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${numberFormatter.format(Math.round((n / 1_000_000_000) * 10) / 10)} tỷ`;
  if (abs >= 1_000_000) return `${numberFormatter.format(Math.round(n / 1_000_000))} tr`;
  if (abs >= 1_000) return `${numberFormatter.format(Math.round(n / 1_000))} ng`;
  return numberFormatter.format(n);
}

/**
 * Ty le -> phan tram. `ratio` la 0..1 (0.42 -> "42%"), `part/total` khi truyen ca hai.
 * Tap trung o day de moi trang khong tu ghep Math.round(x * 100) + '%' khac nhau.
 */
export function formatPercent(ratio: number | null | undefined, digits = 0): string {
  const n = ratio ?? 0;
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}

/** Phan tram cua `part` tren `total`; total = 0 tra ve '—' thay vi NaN%. */
export function formatShare(part: number, total: number, digits = 0): string {
  if (!total) return '—';
  return formatPercent(part / total, digits);
}

/** Doc so tien nguoi dung go: "1.500.000" / "1 500 000 đ" -> 1500000. */
export function parseVNDInput(text: string): number {
  const digits = text.replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

/** Hien thi so tien khi go: 1500000 -> "1.500.000". */
export function formatVNDInput(value: number): string {
  return value ? numberFormatter.format(value) : '';
}

/** 'YYYY-MM-DD' -> '25/12/2026'. Khong dung new Date(str) de tranh lech mui gio. */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  return format(parseISO(dateStr.slice(0, 10)), 'dd/MM/yyyy');
}

export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  return format(parseISO(dateStr.slice(0, 10)), 'dd/MM');
}

/** 'YYYY-MM-DDTHH:mm' -> '25/12/2026 14:30'. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const datePart = formatDate(value);
  const timePart = value.length >= 16 ? value.slice(11, 16) : '';
  return timePart ? `${datePart} ${timePart}` : datePart;
}

export function formatMonth(month: string): string {
  const [y, m] = month.split('-');
  return `T${Number(m)}/${y.slice(2)}`;
}

export function formatWeekday(dateStr: string): string {
  return format(parseISO(dateStr), 'EEEE', { locale: vi });
}

/** Ngay hom nay theo gio may, dang 'YYYY-MM-DD'. */
export function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/** Cong them so ngay vao chuoi 'YYYY-MM-DD', tra ve cung dinh dang (khong qua Date UTC). */
export function addDays(dateStr: string, days: number): string {
  return format(addDaysFn(parseISO(dateStr), days), 'yyyy-MM-dd');
}

/** Thoi diem hien tai dang 'YYYY-MM-DDTHH:mm' (dung cho input datetime-local). */
export function nowLocalInput(): string {
  return format(new Date(), "yyyy-MM-dd'T'HH:mm");
}

export function isOverdue(dueDate: string | null | undefined, isDone: number | boolean): boolean {
  if (!dueDate || isDone) return false;
  return dueDate.slice(0, 10) < todayStr();
}

/** Chon muc chu den hay trang de doc duoc tren nen mau bat ky. */
export function contrastInk(hex: string): string {
  const value = hex.replace('#', '');
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = toLinear(parseInt(value.slice(0, 2), 16));
  const g = toLinear(parseInt(value.slice(2, 4), 16));
  const b = toLinear(parseInt(value.slice(4, 6), 16));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (luminance + 0.05) / 0.05 > 4.5 ? '#0b0b0b' : '#ffffff';
}

/** Bo dau tieng Viet — dung cho loc phia client. */
export function foldText(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}
