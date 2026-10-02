import { describe, expect, it } from 'vitest';
import { pageContextOf } from './pageContext';

describe('pageContextOf', () => {
  it('nhan ra trang chi tiet khach hang va co hoi', () => {
    expect(pageContextOf('/customers/12')).toEqual({ type: 'customer', id: 12 });
    expect(pageContextOf('/deals/7')).toEqual({ type: 'deal', id: 7 });
  });

  it('trang danh sach hay id hong thi khong gui ngu canh', () => {
    expect(pageContextOf('/customers')).toBeNull();
    expect(pageContextOf('/pipeline')).toBeNull();
    expect(pageContextOf('/customers/abc')).toBeNull();
    expect(pageContextOf('/deals/0')).toBeNull();
    expect(pageContextOf('/projects/3')).toBeNull();
  });
});
