import { describe, expect, it } from 'vitest';
import { deriveTitle } from './MeetingNoteEditor';

/**
 * Ban ra soat: 3/4 ghi chu mang ten "Ghi chú mới" hoac "Ghi chú họp mới", chi
 * khac nhau o dau thoi gian — phai mo tung cai ra moi tim duoc cai can.
 */
describe('deriveTitle', () => {
  it('lay cau dau lam tieu de khi ten van la mac dinh', () => {
    expect(deriveTitle('Ghi chú mới', 'Họp review Q4 với MIC\nNội dung...')).toBe(
      'Họp review Q4 với MIC'
    );
    expect(deriveTitle('Ghi chú họp mới', 'Chốt giá VPBank')).toBe('Chốt giá VPBank');
  });

  it('khong bao gio de len ten nguoi dung tu dat', () => {
    expect(deriveTitle('Biên bản họp 12/9', 'Nội dung gì đó')).toBe('');
  });

  it('chua co noi dung thi giu nguyen', () => {
    expect(deriveTitle('Ghi chú mới', '')).toBe('');
    expect(deriveTitle('Ghi chú mới', '   \n  ')).toBe('');
  });

  it('cat bot khi cau dau qua dai', () => {
    const long = 'x'.repeat(120);
    const out = deriveTitle('Ghi chú mới', long);
    expect(out).toHaveLength(81);
    expect(out.endsWith('…')).toBe(true);
  });

  it('tra ve rong khi ten suy ra trung ten hien tai (tranh vong lap)', () => {
    expect(deriveTitle('Ghi chú mới', 'Ghi chú mới')).toBe('');
  });
});
