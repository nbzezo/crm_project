import { describe, expect, it } from 'vitest';
import { formatBirthday, parseBirthdayInput } from './customerCare';

describe('formatBirthday', () => {
  it('doi MM-DD va YYYY-MM-DD sang cach viet Viet Nam', () => {
    expect(formatBirthday('03-09')).toBe('09/03');
    expect(formatBirthday('1990-03-09')).toBe('09/03/1990');
  });

  it('tra chuoi rong khi khong co hoac sai dinh dang', () => {
    expect(formatBirthday(null)).toBe('');
    expect(formatBirthday(undefined)).toBe('');
    expect(formatBirthday('')).toBe('');
    expect(formatBirthday('9/3')).toBe('');
    expect(formatBirthday('1990-3-9')).toBe('');
  });
});

describe('parseBirthdayInput', () => {
  it('nhan dd/mm va dd/mm/yyyy, them so 0 o dau', () => {
    expect(parseBirthdayInput('9/3')).toBe('03-09');
    expect(parseBirthdayInput('09/03/1990')).toBe('1990-03-09');
  });

  it('chap nhan dau cham, gach ngang va khoang trang hai dau', () => {
    expect(parseBirthdayInput(' 9.3 ')).toBe('03-09');
    expect(parseBirthdayInput('9-3-1990')).toBe('1990-03-09');
  });

  it('o trong nghia la xoa', () => {
    expect(parseBirthdayInput('')).toBe('');
    expect(parseBirthdayInput('   ')).toBe('');
  });

  it('tra undefined khi khong hieu duoc', () => {
    expect(parseBirthdayInput('32/1')).toBeUndefined();
    expect(parseBirthdayInput('1/13')).toBeUndefined();
    expect(parseBirthdayInput('0/5')).toBeUndefined();
    expect(parseBirthdayInput('9/3/90')).toBeUndefined();
    expect(parseBirthdayInput('mot thang ba')).toBeUndefined();
  });

  it('di vong voi formatBirthday', () => {
    expect(formatBirthday(parseBirthdayInput('9/3/1990'))).toBe('09/03/1990');
  });
});
