import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRevenueSummaryReport, type RevenueSummaryLine } from './revenueSummaryReport.ts';

const lines: RevenueSummaryLine[] = [
  {
    id: 1,
    customer_id: 1,
    customer_name: 'Alpha',
    service_name: 'SMS',
    months: {
      '2026-01': { amount_vnd: 100, forecast_vnd: 120, stage: 'paid' },
      '2026-02': { amount_vnd: 50, forecast_vnd: 70, stage: 'invoiced' },
    },
    groups: { '2026-01': 'new', '2026-02': 'base' },
  },
];

test('revenue summary cong dung stage va loc group tai mot noi', () => {
  const all = buildRevenueSummaryReport(2026, null, lines);
  assert.equal(all.totals.amount_vnd, 150);
  assert.equal(all.totals.stage_paid_vnd, 100);
  assert.equal(all.totals.stage_invoiced_vnd, 50);
  assert.equal(all.by_service[0]?.amount_vnd, 150);
  assert.equal(all.by_customer[0]?.amount_vnd, 150);

  const base = buildRevenueSummaryReport(2026, new Set(['base']), lines);
  assert.equal(base.totals.amount_vnd, 50);
  assert.deepEqual(
    base.months.map((month) => month.period),
    ['2026-02']
  );
});
