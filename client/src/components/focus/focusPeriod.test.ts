import { describe, expect, it } from 'vitest';
import { eachDay, nextMonday, periodFor, periodTitle, shiftPeriod } from './focusPeriod';

const TODAY = '2026-10-07'; // thu Tu

describe('periodFor', () => {
  it('tuan bat dau tu thu Hai', () => {
    expect(periodFor('week', TODAY)).toEqual({
      kind: 'week',
      from: '2026-10-05',
      to: '2026-10-11',
    });
    expect(periodFor('week', '2026-10-11')).toEqual({
      kind: 'week',
      from: '2026-10-05',
      to: '2026-10-11',
    });
  });

  it('thang tron', () => {
    expect(periodFor('month', '2026-02-14')).toEqual({
      kind: 'month',
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });
});

describe('shiftPeriod', () => {
  it('tien lui theo dung loai ky', () => {
    expect(shiftPeriod(periodFor('day', TODAY), 1).from).toBe('2026-10-08');
    expect(shiftPeriod(periodFor('week', TODAY), -1)).toMatchObject({
      from: '2026-09-28',
      to: '2026-10-04',
    });
    // Thang 31 ngay -> thang 30 ngay khong bi lech
    expect(shiftPeriod(periodFor('month', '2026-10-15'), 1)).toMatchObject({
      from: '2026-11-01',
      to: '2026-11-30',
    });
  });

  it('ky tu chon dich bang chinh do dai cua no', () => {
    expect(shiftPeriod({ kind: 'custom', from: '2026-10-01', to: '2026-10-10' }, 1)).toEqual({
      kind: 'custom',
      from: '2026-10-11',
      to: '2026-10-20',
    });
  });
});

describe('periodTitle', () => {
  it('goi ten ky gan hom nay bang loi thuong', () => {
    expect(periodTitle(periodFor('day', TODAY), TODAY)).toBe('hôm nay');
    expect(periodTitle(periodFor('day', '2026-10-08'), TODAY)).toBe('ngày mai');
    expect(periodTitle(periodFor('week', TODAY), TODAY)).toBe('tuần này');
    expect(periodTitle(periodFor('week', '2026-10-14'), TODAY)).toBe('tuần sau');
    expect(periodTitle(periodFor('month', TODAY), TODAY)).toBe('tháng này');
    expect(periodTitle(periodFor('month', '2026-12-01'), TODAY)).toBe('tháng 12/2026');
  });
});

it('eachDay va nextMonday', () => {
  expect(eachDay('2026-10-30', '2026-11-02')).toEqual([
    '2026-10-30',
    '2026-10-31',
    '2026-11-01',
    '2026-11-02',
  ]);
  expect(nextMonday(TODAY)).toBe('2026-10-12');
  expect(nextMonday('2026-10-11')).toBe('2026-10-12');
});
