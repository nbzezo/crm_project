import { describe, expect, it } from 'vitest';
import {
  formatDate,
  joinDateTime,
  maskDateInput,
  parseDateInput,
  splitDateTime,
} from './format';

/**
 * Cac o ngay truoc day la `<input type="date">` thuan nen Chrome ve theo locale
 * trinh duyet: nguoi dung go mm/dd trong khi ung dung hien thi dd/MM. Bo test
 * nay khoa lai chieu doc/ghi dd/MM/yyyy — sai o day la sai ngay ky hop dong.
 */
describe('maskDateInput', () => {
  it('chen dau / theo tung nhom chu so', () => {
    expect(maskDateInput('2')).toBe('2');
    expect(maskDateInput('25')).toBe('25');
    expect(maskDateInput('2512')).toBe('25/12');
    expect(maskDateInput('25122026')).toBe('25/12/2026');
  });

  it('bo ky tu khong phai so va cat phan thua', () => {
    expect(maskDateInput('25/12/2026')).toBe('25/12/2026');
    expect(maskDateInput('25-12-2026')).toBe('25/12/2026');
    expect(maskDateInput('251220261234')).toBe('25/12/2026');
  });
});

describe('parseDateInput', () => {
  it('doc dd/MM/yyyy chu khong phai mm/dd/yyyy', () => {
    // Chinh la ca gay hong: ngay ky 03/04 phai la 3 thang 4.
    expect(parseDateInput('03/04/2027')).toBe('2027-04-03');
    expect(parseDateInput('25/12/2026')).toBe('2026-12-25');
  });

  it('tra null khi chua go du 8 chu so', () => {
    expect(parseDateInput('')).toBeNull();
    expect(parseDateInput('25/12')).toBeNull();
    expect(parseDateInput('25/12/202')).toBeNull();
  });

  it('tu choi ngay khong co that thay vi cuon sang thang sau', () => {
    expect(parseDateInput('31/02/2026')).toBeNull();
    expect(parseDateInput('31/04/2026')).toBeNull();
    expect(parseDateInput('00/01/2026')).toBeNull();
    expect(parseDateInput('01/13/2026')).toBeNull();
  });

  it('nhan ngay 29/02 cua nam nhuan', () => {
    expect(parseDateInput('29/02/2028')).toBe('2028-02-29');
    expect(parseDateInput('29/02/2027')).toBeNull();
  });

  it('di duoc ca vong: go -> luu -> hien thi lai', () => {
    const typed = maskDateInput('03042027');
    expect(typed).toBe('03/04/2027');
    const iso = parseDateInput(typed);
    expect(iso).toBe('2027-04-03');
    expect(formatDate(iso)).toBe('03/04/2027');
  });
});

describe('splitDateTime / joinDateTime', () => {
  it('tach va ghep lai khong doi gia tri', () => {
    expect(splitDateTime('2026-12-25T14:30')).toEqual({ date: '2026-12-25', time: '14:30' });
    expect(joinDateTime('2026-12-25', '14:30')).toBe('2026-12-25T14:30');
  });

  it('coi nhu chua chon khi thieu ngay', () => {
    expect(splitDateTime(null)).toEqual({ date: null, time: '' });
    expect(joinDateTime(null, '14:30')).toBeNull();
  });

  it('thieu gio thi mac dinh 00:00', () => {
    expect(joinDateTime('2026-12-25', '')).toBe('2026-12-25T00:00');
  });
});
