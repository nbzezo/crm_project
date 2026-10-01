import assert from 'node:assert/strict';
import test from 'node:test';
import { computeKpi, summarizeKpi, type KpiLineInput } from './revenueKpi.ts';
import { yearPeriods } from './revenueSegments.ts';

function line(over: Partial<KpiLineInput> & { group: 'new' | 'expansion' | 'base' }): KpiLineInput {
  const { group, ...rest } = over;
  return {
    line_id: 1,
    am: 'Lan',
    groups: Object.fromEntries(yearPeriods(2026).map((p) => [p, group])),
    cells: {},
    prev_avg_vnd: null,
    ...rest,
  };
}

test('vi du thang 8: Moi + Mo rong ghi nhan toan bo, Nen chi phan vuot, khong bu tru giua dong', () => {
  const entries = computeKpi(
    [
      line({ line_id: 1, group: 'new', cells: { '2026-08': { amount_vnd: 30, stage: 'paid' } } }),
      line({
        line_id: 2,
        group: 'expansion',
        cells: { '2026-08': { amount_vnd: 15, stage: 'reconciled' } },
      }),
      line({
        line_id: 3,
        group: 'base',
        prev_avg_vnd: 20,
        cells: { '2026-08': { amount_vnd: 26, stage: 'invoiced' } },
      }),
      line({
        line_id: 4,
        group: 'base',
        prev_avg_vnd: 55,
        cells: { '2026-08': { amount_vnd: 50, stage: 'paid' } },
      }),
    ],
    2026,
    '2026-10'
  ).filter((e) => e.period === '2026-08');
  const [aug] = summarizeKpi(entries, 2026, { '2026-08': 100 }).filter(
    (m) => m.period === '2026-08'
  );
  assert.deepEqual(
    { ...aug },
    {
      period: '2026-08',
      target_vnd: 100,
      new_vnd: 30,
      expansion_vnd: 15,
      base_growth_vnd: 6,
      total_vnd: 51,
      lost_vnd: 5,
      pending_count: 0,
      missing_baseline_count: 0,
    }
  );
});

test('chua doi soat: cho doi soat, khong ghi nhan cung khong Lost', () => {
  const [entry] = computeKpi(
    [
      line({
        group: 'base',
        prev_avg_vnd: 50,
        cells: { '2026-03': { amount_vnd: 10, stage: 'forecast' } },
      }),
    ],
    2026,
    '2026-10'
  ).filter((e) => e.period === '2026-03');
  assert.equal(entry.status, 'pending');
  assert.equal(entry.lost_vnd, 0);
});

test('Nen khong co doanh thu: Lost toan bo TB nam truoc chi cho thang da qua', () => {
  const entries = computeKpi([line({ group: 'base', prev_avg_vnd: 40 })], 2026, '2026-10');
  assert.equal(entries.length, 9); // T1..T9; T10 (thang hien tai) tro di chua tinh
  assert.ok(entries.every((e) => e.status === 'lost' && e.lost_vnd === 40));
});

test('Nen chua co TB nam truoc: khong ghi nhan, danh dau canh bao', () => {
  const [entry] = computeKpi(
    [line({ group: 'base', cells: { '2026-02': { amount_vnd: 70, stage: 'paid' } } })],
    2026,
    '2026-10'
  ).filter((e) => e.period === '2026-02');
  assert.equal(entry.status, 'missing_baseline');
  assert.equal(entry.kpi_vnd, 0);
});
