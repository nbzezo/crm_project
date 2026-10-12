import { describe, expect, it } from 'vitest';
import { isFresh, isPersistedKey, ownerTag, rowCount } from './queryPersist';

describe('queryPersist', () => {
  it('chi luu cac danh sach trong danh sach cho phep', () => {
    expect(isPersistedKey(['deals'])).toBe(true);
    expect(isPersistedKey(['tasks', 'workspace', 'mine', { q: '' }])).toBe(true);
    expect(isPersistedKey(['tasks', 'activity'])).toBe(false);
    expect(isPersistedKey(['documents', 'library'])).toBe(false);
    expect(isPersistedKey(['quick-notes'])).toBe(false);
    expect(isPersistedKey(['revenues', 'summary', 2026, {}])).toBe(true);
    expect(isPersistedKey(['revenues', 'comparison'])).toBe(false);
  });

  it('dem dong de bo qua du lieu qua lon', () => {
    expect(rowCount([1, 2, 3])).toBe(3);
    expect(rowCount({ stages: { lead: [1, 2], won: [3] }, totals: {} })).toBe(3);
    expect(rowCount(null)).toBe(0);
  });

  it('ban luu qua 24 gio la cu', () => {
    const now = Date.UTC(2026, 9, 12);
    expect(isFresh(now - 60_000, now)).toBe(true);
    expect(isFresh(now - 25 * 60 * 60 * 1000, now)).toBe(false);
  });

  it('chu so huu gom tai khoan va phien ban quyen', () => {
    expect(ownerTag({ userId: 7, permissionsVersion: 3 })).toBe('7:3');
    expect(ownerTag({ userId: 7, permissionsVersion: 4 })).not.toBe('7:3');
  });
});
