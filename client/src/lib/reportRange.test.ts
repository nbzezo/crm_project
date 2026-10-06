import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveRange } from './reportRange';

describe('resolveRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 31, 23, 30)); // 31/08/2026 23:30 gio may
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('thang nay: tu ngay 1 den hom nay', () => {
    expect(resolveRange('month', '', '')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('quy nay: tu dau quy den hom nay', () => {
    expect(resolveRange('quarter', '', '')).toEqual({ from: '2026-07-01', to: '2026-08-31' });
  });

  it('sau thang: lui 6 thang, cuoi thang ngan thi ve ngay cuoi thang', () => {
    // 31/08 lui 6 thang roi vao thang 2 chi co 28 ngay.
    expect(resolveRange('six', '', '')).toEqual({ from: '2026-02-28', to: '2026-08-31' });
  });

  it('tuy chon: giu nguyen khoang nguoi dung nhap', () => {
    expect(resolveRange('custom', '2026-01-15', '2026-03-20')).toEqual({
      from: '2026-01-15',
      to: '2026-03-20',
    });
  });

  it('tuy chon thieu ngay bat dau thi lui 6 thang, khong tu dien ngay ket thuc', () => {
    expect(resolveRange('custom', '', '')).toEqual({ from: '2026-02-28', to: '' });
  });
});
