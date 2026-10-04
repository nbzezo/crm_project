import { describe, expect, it } from 'vitest';
import { describeWhen, parseQuickTask } from './quickTaskParser';

// Thu Hai 05/10/2026, 10:00 gio may.
const now = new Date(2026, 9, 5, 10, 0);
const p = (text: string) => parseQuickTask(text, now);

describe('parseQuickTask', () => {
  it.each([
    ['mai 9h gọi anh Nam', 'Gọi anh Nam', '2026-10-06T09:00'],
    ['gọi anh Nam mai 9h30', 'Gọi anh Nam', '2026-10-06T09:30'],
    ['mai 9:15 gọi anh Nam', 'Gọi anh Nam', '2026-10-06T09:15'],
    ['14h gửi báo giá', 'Gửi báo giá', '2026-10-05T14:00'],
    ['3h chiều nay họp', 'Họp', '2026-10-05T15:00'],
    ['họp lúc 3h', 'Họp', '2026-10-05T15:00'],
    ['8h tối gọi mẹ', 'Gọi mẹ', '2026-10-05T20:00'],
    ['tối nay xem lại hợp đồng', 'Xem lại hợp đồng', '2026-10-05T20:00'],
    ['chiều mai gửi báo giá', 'Gửi báo giá', '2026-10-06T14:00'],
    ['sáng mai họp giao ban', 'Họp giao ban', '2026-10-06T09:00'],
    ['1h trưa ăn với khách', 'Ăn với khách', '2026-10-05T13:00'],
    ['30 phút nữa uống thuốc', 'Uống thuốc', '2026-10-05T10:30'],
    ['sau 2 tiếng gọi lại', 'Gọi lại', '2026-10-05T12:00'],
    ['thứ 6 gửi báo cáo', 'Gửi báo cáo', '2026-10-09T09:00'],
    ['chiều thứ sáu gửi báo cáo', 'Gửi báo cáo', '2026-10-09T14:00'],
    ['t4 10h demo', 'Demo', '2026-10-07T10:00'],
    ['thứ 2 tuần sau họp', 'Họp', '2026-10-12T09:00'],
    ['chủ nhật đi chợ', 'Đi chợ', '2026-10-11T09:00'],
    ['15/10 họp giao ban', 'Họp giao ban', '2026-10-15T09:00'],
    ['họp 15/10/2026 lúc 14h', 'Họp', '2026-10-15T14:00'],
    ['mốt gửi hồ sơ', 'Gửi hồ sơ', '2026-10-07T09:00'],
    ['3 ngày nữa gia hạn', 'Gia hạn', '2026-10-08T09:00'],
    // Khong dau.
    ['mai 9h goi anh Nam', 'Goi anh Nam', '2026-10-06T09:00'],
    ['chieu thu 6 gui bao gia', 'Gui bao gia', '2026-10-09T14:00'],
  ])('%s', (text, title, remindAt) => {
    const result = p(text);
    expect(result.title).toBe(title);
    expect(result.remindAt).toBe(remindAt);
    expect(result.dueDate).toBe(remindAt.slice(0, 10));
  });

  it('khong co ngay gio: chi co tieu de', () => {
    expect(p('gọi anh Nam')).toEqual({
      title: 'Gọi anh Nam',
      remindAt: null,
      dueDate: null,
      matched: [],
    });
  });

  it('gio da qua hom nay thi hieu la ngay mai', () => {
    expect(p('8h gọi khách').remindAt).toBe('2026-10-06T08:00');
  });

  it('thu trung hom nay ma gio da qua thi la tuan sau', () => {
    expect(p('thứ 2 9h họp').remindAt).toBe('2026-10-12T09:00');
    expect(p('thứ 2 15h họp').remindAt).toBe('2026-10-05T15:00');
  });

  it('hom nay khong gio: dat han, khong nhac', () => {
    expect(p('hôm nay gửi báo giá')).toMatchObject({
      title: 'Gửi báo giá',
      remindAt: null,
      dueDate: '2026-10-05',
    });
  });

  it('khong nham cac tu giong nhau khi bo dau', () => {
    // "một" khong phai "mốt", "thư" khong phai "thứ", "tôi" khong phai "tối".
    expect(p('gửi một bản hợp đồng')).toMatchObject({ remindAt: null });
    expect(p('gửi thư năm bản')).toMatchObject({ remindAt: null });
    expect(p('9h gọi cho tôi').title).toBe('Gọi cho tôi');
    expect(p('9h gọi cho tôi').remindAt).toBe('2026-10-06T09:00');
    // "3 hộp", "2 gói" khong phai gio.
    expect(p('mua 3 hộp mực')).toMatchObject({ title: 'Mua 3 hộp mực', remindAt: null });
    expect(p('đặt 2 gói cước')).toMatchObject({ remindAt: null });
    // "CN" la viet tat, khong phai chu nhat.
    expect(p('gửi hồ sơ CN Hà Nội')).toMatchObject({ remindAt: null });
  });

  it('ngay khong hop le thi bo qua', () => {
    expect(p('họp 31/02').remindAt).toBeNull();
  });
});

describe('describeWhen', () => {
  it('ghi gon theo ngay', () => {
    expect(describeWhen('2026-10-05T15:00', now)).toBe('Hôm nay 15:00');
    expect(describeWhen('2026-10-06T09:00', now)).toBe('Mai 09:00');
    expect(describeWhen('2026-10-09T14:00', now)).toBe('T6 09/10 14:00');
    expect(describeWhen('2026-10-09', now)).toBe('T6 09/10');
  });
});
