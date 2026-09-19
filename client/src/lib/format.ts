import { addDays as addDaysFn, format, isValid, parseISO } from 'date-fns';

const vndFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('vi-VN');

export function formatVND(value: number | null | undefined): string {
  return vndFormatter.format(value ?? 0);
}

/**
 * Rut gon cho truc bieu do / thanh tong: 1,5 tỷ · 250 tr · 900 ng.
 *
 * QUY TAC CHON GIUA `formatVND` VA `formatVNDShort`:
 *  - `formatVNDShort` cho o hep: chip, chan cot Kanban, o trong bang, nhan truc
 *    bieu do.
 *  - `formatVND` cho KPI va trang chi tiet, noi con so LA noi dung chinh.
 *  - KHONG BAO GIO de hai dang canh nhau trong cung mot khung nhin. Neu mot khung
 *    vua co o hep vua co KPI (vd bang Kanban: chi so dau trang + chan tung cot)
 *    thi ca khung dung dang RUT GON, va dat gia tri day du vao `title` de ai can
 *    con so chinh xac van tra cuu duoc — xem CustomersPage va PipelinePage.
 */
export function formatVNDShort(value: number | null | undefined): string {
  const n = value ?? 0;
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000)
    return `${numberFormatter.format(Math.round((n / 1_000_000_000) * 10) / 10)} tỷ`;
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

const INK_DARK = '#0b0b0b';
const INK_LIGHT = '#ffffff';

function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = toLinear(parseInt(value.slice(0, 2), 16));
  const g = toLinear(parseInt(value.slice(2, 4), 16));
  const b = toLinear(parseInt(value.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Chon muc chu den hay trang de doc duoc tren nen mau bat ky.
 *
 * Ban truoc tinh `(luminance + 0.05) / 0.05` — tuc la do tuong phan voi DEN
 * TUYEN — roi lai tra ve `#0b0b0b`. Muc `#0b0b0b` co do choi 0,0033 chu khong
 * phai 0, nen cong thuc cu uoc luong cao hon thuc te khoang 6,7%: mau nen roi
 * vao dai 4,5–4,8 duoc gan muc den nhung do ra chi con khoang 4,46:1, duoi
 * nguong AA. Gio do thang ca hai lua chon roi lay cai tot hon.
 */
export function contrastInk(hex: string): string {
  const background = relativeLuminance(hex);
  const onDark = contrastRatio(background, relativeLuminance(INK_DARK));
  const onLight = contrastRatio(background, relativeLuminance(INK_LIGHT));
  return onDark >= onLight ? INK_DARK : INK_LIGHT;
}

/** Bo dau tieng Viet — dung cho loc phia client. */
export function foldText(s: string | null | undefined): string {
  if (!s) return '';
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

/* ---------- Nhap ngay theo dd/MM/yyyy ----------
 * `<input type="date">` hien thi theo locale cua TRINH DUYET, khong theo
 * `<html lang="vi">`. Tren Chrome cai dat tieng Anh, nguoi dung go mm/dd trong
 * khi ca ung dung hien thi dd/MM (`formatDate`) — go ngay ky 03/04 hieu la 3
 * thang 4 thi he thong luu 4 thang 3, va nhac gia han 90/60/30/7 ngay lech han
 * mot thang. Hai ham duoi day cho phep tu ve o nhap dd/MM/yyyy, khong phu thuoc
 * locale trinh duyet. */

/** Che dan khi go: "2512" -> "25/12", "25122026" -> "25/12/2026". */
export function maskDateInput(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * 'dd/MM/yyyy' -> 'YYYY-MM-DD'; tra ve null neu chua du hoac khong co that.
 * Kiem lai ngay/thang sau khi dung de loai 31/02 — `parseISO('2026-02-31')`
 * khong nem loi ma tu cuon sang 03/03.
 */
export function parseDateInput(text: string): string | null {
  const digits = text.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1000) return null;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const parsed = parseISO(iso);
  if (!isValid(parsed) || parsed.getDate() !== day || parsed.getMonth() + 1 !== month) return null;
  return iso;
}

/** Tach 'YYYY-MM-DDTHH:mm' thanh hai phan cho DateTimeInput. */
export function splitDateTime(value: string | null | undefined): {
  date: string | null;
  time: string;
} {
  if (!value) return { date: null, time: '' };
  return { date: value.slice(0, 10) || null, time: value.slice(11, 16) };
}

/** Ghep lai 'YYYY-MM-DD' + 'HH:mm'; thieu ngay thi coi nhu chua chon. */
export function joinDateTime(date: string | null, time: string): string | null {
  if (!date) return null;
  return `${date}T${time || '00:00'}`;
}
