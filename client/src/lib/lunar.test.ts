import { describe, expect, it } from 'vitest';
import { canChiYear, formatLunar, toLunar } from './lunar';

describe('am lich', () => {
  it('Tet Nguyen dan', () => {
    expect(toLunar(new Date(2024, 1, 10))).toEqual({ day: 1, month: 1, year: 2024, leap: false });
    expect(toLunar(new Date(2026, 1, 17))).toEqual({ day: 1, month: 1, year: 2026, leap: false });
  });

  it('cuoi nam am van thuoc nam cu (Ất Tỵ không có 30 Tết)', () => {
    expect(toLunar(new Date(2026, 1, 16))).toMatchObject({ day: 29, month: 12, year: 2025 });
  });

  it('thang nhuan 2025 (thang 6 nhuan)', () => {
    expect(toLunar(new Date(2025, 6, 25))).toEqual({ day: 1, month: 6, year: 2025, leap: true });
  });

  it('ten nam can chi', () => {
    expect(canChiYear(2026)).toBe('Bính Ngọ');
    expect(canChiYear(2024)).toBe('Giáp Thìn');
    // Trung thu 2026
    expect(formatLunar(new Date(2026, 8, 25))).toBe('15 tháng 8 năm Bính Ngọ');
  });
});
