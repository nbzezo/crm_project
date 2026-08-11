const COMBINING_MARKS = /[̀-ͯ]/g;

/** Bo dau tieng Viet + lowercase, dung cho cot search_text va cho tu khoa tim kiem. */
export function fold(s: string | null | undefined): string {
  if (!s) return '';
  return s.toLowerCase().normalize('NFD').replace(COMBINING_MARKS, '').replace(/đ/g, 'd');
}

/** Ghep nhieu doan text thanh mot chuoi search_text da fold. */
export function buildSearchText(...parts: (string | null | undefined)[]): string {
  return fold(parts.filter(Boolean).join(' '));
}
