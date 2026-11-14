import { describe, expect, it } from 'vitest';
import { groupLinesByCustomer, totalsFromCells } from './revenue';
import type { RevenueCell, RevenueLine } from '../types';

function line(
  id: number,
  customer_id: number,
  contract_id: number | null,
  service_id: number | null
): RevenueLine {
  return {
    id,
    customer_id,
    customer_name: `KH ${customer_id}`,
    contract_id,
    contract_name: contract_id === null ? null : `HĐ ${contract_id}`,
    service_id,
  } as RevenueLine;
}

describe('groupLinesByCustomer', () => {
  it('gom dòng theo khách hàng, giữ thứ tự xuất hiện', () => {
    const groups = groupLinesByCustomer([line(1, 7, 11, 1), line(2, 3, 10, 1), line(3, 7, 13, 2)]);
    expect(groups.map((g) => g.customer_id)).toEqual([7, 3]);
    expect(groups[0]?.lines.map((l) => l.id)).toEqual([1, 3]);
  });

  it('đếm hợp đồng và dịch vụ khác nhau, bỏ qua dòng chưa gắn', () => {
    // Cùng hợp đồng khác dịch vụ (10×1, 10×2); cùng dịch vụ khác hợp đồng (10×1, 12×1).
    const [group] = groupLinesByCustomer([
      line(1, 5, 10, 1),
      line(2, 5, 10, 2),
      line(3, 5, 12, 1),
      line(4, 5, null, null),
    ]);
    expect(group?.contract_count).toBe(2);
    expect(group?.service_count).toBe(2);
  });

  it('xếp các dòng cùng hợp đồng liền nhau, dòng chưa gắn hợp đồng xuống cuối', () => {
    const [group] = groupLinesByCustomer([
      line(1, 5, 10, 2),
      line(2, 5, null, 1),
      line(3, 5, 12, 1),
      line(4, 5, 10, 3),
    ]);
    expect(group?.lines.map((l) => l.id)).toEqual([1, 4, 3, 2]);
  });
});

describe('totalsFromCells', () => {
  it('cộng đúng từng stage rời nhau và forecast ban đầu', () => {
    const cells = (['forecast', 'reconciled', 'invoiced', 'paid'] as const).map(
      (stage, index): RevenueCell => ({
        amount_vnd: (index + 1) * 10,
        forecast_vnd: 5,
        stage,
        note: '',
      })
    );

    expect(totalsFromCells(cells)).toEqual({
      amount_vnd: 100,
      forecast_vnd: 20,
      stage_forecast_vnd: 10,
      stage_reconciled_vnd: 20,
      stage_invoiced_vnd: 30,
      stage_paid_vnd: 40,
    });
  });
});
