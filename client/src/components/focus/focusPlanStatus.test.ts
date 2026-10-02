import { describe, expect, it } from 'vitest';
import { ageLabel, planStatus } from './focusPlanStatus';

const NOW = new Date('2026-10-07T15:00:00');
const NO_CHANGES = { done: 0, added: 0, moved: 0, total: 0 };
const WEEK = { from: '2026-10-05', to: '2026-10-11' };
const TODAY = { from: '2026-10-07', to: '2026-10-07' };

describe('planStatus', () => {
  it('ket qua moi, du lieu khong doi thi chua cu', () => {
    const status = planStatus(
      { generated_at: '2026-10-07T09:00:00', changes: NO_CHANGES },
      WEEK,
      NOW
    );
    expect(status.stale).toBe(false);
    expect(status.ageLabel).toBe('lúc 09:00 hôm nay');
  });

  it('du lieu da doi thi bao ro doi gi', () => {
    const status = planStatus(
      { generated_at: '2026-10-07T14:30:00', changes: { done: 2, added: 1, moved: 0, total: 3 } },
      WEEK,
      NOW
    );
    expect(status.stale).toBe(true);
    expect(status.reasons[0]).toBe('Từ lúc phân tích: 2 mục đã xong, 1 mục mới.');
  });

  it('nguong thoi gian theo do dai ky', () => {
    // Ky mot ngay: qua 4 gio la cu
    expect(
      planStatus({ generated_at: '2026-10-07T10:30:00', changes: NO_CHANGES }, TODAY, NOW).stale
    ).toBe(true);
    expect(
      planStatus({ generated_at: '2026-10-07T12:00:00', changes: NO_CHANGES }, TODAY, NOW).stale
    ).toBe(false);
    // Ky tuan: qua 1 ngay
    expect(
      planStatus({ generated_at: '2026-10-06T14:00:00', changes: NO_CHANGES }, WEEK, NOW).stale
    ).toBe(true);
    // Ky thang: chua toi 3 ngay
    expect(
      planStatus(
        { generated_at: '2026-10-05T16:00:00', changes: NO_CHANGES },
        { from: '2026-10-01', to: '2026-10-31' },
        NOW
      ).stale
    ).toBe(false);
  });

  it('xem hom nay ma phan tich tu hom qua thi cu, du chua qua 4 gio', () => {
    const status = planStatus(
      { generated_at: '2026-10-06T23:30:00', changes: NO_CHANGES },
      TODAY,
      new Date('2026-10-07T01:00:00')
    );
    expect(status.reasons).toEqual(['Phân tích từ hôm trước, chưa tính tình hình hôm nay.']);
  });

  it('ky da qua: chi cu khi phan tich truoc luc ky ket thuc', () => {
    const past = { from: '2026-09-28', to: '2026-10-04' };
    expect(
      planStatus({ generated_at: '2026-10-02T09:00:00', changes: NO_CHANGES }, past, NOW).stale
    ).toBe(true);
    expect(
      planStatus({ generated_at: '2026-10-05T09:00:00', changes: NO_CHANGES }, past, NOW).stale
    ).toBe(false);
  });
});

it('ageLabel', () => {
  expect(ageLabel('2026-10-07T14:55:00', NOW)).toBe('5 phút trước');
  expect(ageLabel('2026-10-06T08:00:00', NOW)).toBe('lúc 08:00 hôm qua');
  expect(ageLabel('2026-10-03T08:00:00', NOW)).toBe('4 ngày trước');
});
