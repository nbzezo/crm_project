import { describe, expect, it } from 'vitest';
import { reminderPresets, snoozePresets } from './reminderTimes';

const now = new Date(2026, 9, 4, 14, 20); // 04/10/2026 14:20 gio may

describe('reminderPresets', () => {
  it('tinh moc theo gio may', () => {
    expect(reminderPresets(now)).toEqual([
      { label: '15 phút nữa', value: '2026-10-04T14:35' },
      { label: '1 giờ nữa', value: '2026-10-04T15:20' },
      { label: '9:00 sáng mai', value: '2026-10-05T09:00' },
    ]);
  });

  it('them 9h ngay han khi han con o phia truoc', () => {
    expect(reminderPresets(now, '2026-10-08').at(-1)).toEqual({
      label: '9:00 ngày hạn',
      value: '2026-10-08T09:00',
    });
  });

  it('bo 9h ngay han khi da qua hoac trung sang mai', () => {
    expect(reminderPresets(now, '2026-10-04')).toHaveLength(3);
    expect(reminderPresets(now, '2026-10-05')).toHaveLength(3);
  });
});

describe('snoozePresets', () => {
  it('hoan tu thoi diem hien tai', () => {
    expect(snoozePresets(now).map((p) => p.value)).toEqual([
      '2026-10-04T14:30',
      '2026-10-04T14:50',
      '2026-10-04T15:20',
      '2026-10-05T09:00',
    ]);
  });
});
