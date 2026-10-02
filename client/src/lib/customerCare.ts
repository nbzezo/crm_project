import type { CareTier } from '../types';

/*
 * Hạng chăm sóc và nhịp liên hệ mặc định — đối chiếu TIER_CADENCE_DAYS ở
 * server/src/services/customerCare.ts. Hạng Tiêu chuẩn = 30 ngày, đúng ngưỡng
 * "khách lâu không liên hệ" ở tab Trọng tâm trước v54.
 */
export const CARE_TIER_ORDER: CareTier[] = ['vip', 'key', 'standard', 'low'];

export const CARE_TIER_LABELS: Record<CareTier, string> = {
  vip: 'VIP',
  key: 'Chiến lược',
  standard: 'Tiêu chuẩn',
  low: 'Ít ưu tiên',
};

export const TIER_CADENCE_DAYS: Record<CareTier, number> = {
  vip: 14,
  key: 21,
  standard: 30,
  low: 90,
};

/** 'MM-DD' hoặc 'YYYY-MM-DD' → 'dd/mm' (kèm năm nếu có). */
export function formatBirthday(value: string | null | undefined): string {
  const match = /^(?:(\d{4})-)?(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) return '';
  return match[1] ? `${match[3]}/${match[2]}/${match[1]}` : `${match[3]}/${match[2]}`;
}

/** Nhập 'dd/mm' hoặc 'dd/mm/yyyy' (cách người Việt gõ) → dạng máy chủ lưu. '' = xoá. */
export function parseBirthdayInput(value: string): string | null | undefined {
  const text = value.trim();
  if (!text) return '';
  const match = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}))?$/.exec(text);
  if (!match) return undefined;
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return undefined;
  const md = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return match[3] ? `${match[3]}-${md}` : md;
}
