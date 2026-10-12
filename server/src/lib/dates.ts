/**
 * Ngay lich `YYYY-MM-DD` co that hay khong.
 *
 * Regex `^\d{4}-\d{2}-\d{2}$` cho qua ca `2026-02-30` hay `2026-13-01`; SQLite luu
 * nguyen chuoi do roi `julianday()` / `date()` tra NULL, nen loc het han, so ngay con
 * lai, ky doanh thu tinh sai ma khong bao loi. Moi schema ngay cua may chu dung ham nay.
 */
export function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** `YYYY-MM-DDTHH:mm` theo gio dia phuong, ngay va gio deu phai co that. */
export function isRealLocalMinute(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  return isRealDate(match[1]) && Number(match[2]) <= 23 && Number(match[3]) <= 59;
}

/**
 * Ngay hom nay theo gio Viet Nam, `YYYY-MM-DD`.
 *
 * Thay cho `new Date().toISOString().slice(0, 10)` — do la ngay UTC, nen tu 0h den 7h
 * sang gio VN no tra ve ngay HOM QUA. Dat TZ cho container khong sua duoc cho do.
 */
export function todayLocal(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
}

/** Cong `days` ngay vao ngay lich `YYYY-MM-DD` (tinh theo UTC, khong lech mui gio). */
export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
