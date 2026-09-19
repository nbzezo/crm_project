import { describe, expect, it } from 'vitest';
import { getCustomerHealth } from './customerInsights';
import type { Customer } from '../../types';

function daysAgo(days: number): string {
  const date = new Date(Date.now() - days * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Khach hang toi thieu; tung ca chi ghi de dung truong minh quan tam. */
function customer(patch: Partial<Customer> = {}): Customer {
  return {
    id: 1,
    name: 'CÔNG TY TEST',
    created_at: daysAgo(1),
    last_activity_at: null,
    overdue_task_count: 0,
    overdue_next_action_count: 0,
    deals_without_next_action_count: 0,
    ...patch,
  } as Customer;
}

describe('getCustomerHealth', () => {
  /**
   * Ca gay hong trong ban ra soat 18/09/2026: GOLDEN GATE — 0 co hoi, 0 cong
   * viec, chua tung tuong tac, tao 20 ngay truoc — van duoc cham "Tốt", trong
   * khi mot khach dang duoc cham tich cuc lai bi "Cần chú ý".
   */
  it('khong cham "Tốt" cho khach chua tung tuong tac', () => {
    const health = getCustomerHealth(customer({ created_at: daysAgo(20) }));
    expect(health.level).not.toBe('good');
    expect(health.label).toBe('Nguội');
  });

  it('khach vua tao thi trung tinh, chua ket luan', () => {
    const health = getCustomerHealth(customer({ created_at: daysAgo(2) }));
    expect(health.level).toBe('new');
    expect(health.label).toBe('Chưa đủ dữ liệu');
  });

  it('qua 30 ngay khong tuong tac la rui ro', () => {
    const health = getCustomerHealth(customer({ created_at: daysAgo(45) }));
    expect(health.level).toBe('risk');
  });

  it('dang duoc cham soc thi "Tốt"', () => {
    const health = getCustomerHealth(
      customer({ created_at: daysAgo(60), last_activity_at: daysAgo(2) })
    );
    expect(health.level).toBe('good');
    expect(health.reason).toBe('Đang được chăm sóc');
  });

  it('viec qua han van thang moi tin hieu khac', () => {
    expect(getCustomerHealth(customer({ overdue_task_count: 2 })).level).toBe('risk');
    expect(
      getCustomerHealth(
        customer({ created_at: daysAgo(60), last_activity_at: daysAgo(1), overdue_task_count: 1 })
      ).level
    ).toBe('attention');
  });

  it('im lang 14 ngay tro len thi can chu y', () => {
    const health = getCustomerHealth(
      customer({ created_at: daysAgo(90), last_activity_at: daysAgo(20) })
    );
    expect(health.level).toBe('attention');
  });
});
