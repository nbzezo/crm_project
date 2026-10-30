import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRevenueComparisonReport,
  type RevenueComparisonLine,
} from './revenueComparisonReport.ts';

test('revenue comparison giu totals khi an chi tiet', () => {
  const line: RevenueComparisonLine = {
    id: 1,
    status: 'active',
    start_date: '2026-01-01',
    end_date: null,
    baseline_avg_vnd: 50,
    groups: Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [
        `2026-${String(index + 1).padStart(2, '0')}`,
        'base',
      ])
    ),
    months: { '2026-01': { amount_vnd: 100, forecast_vnd: 100, stage: 'paid', note: '' } },
  };
  const detailed = buildRevenueComparisonReport(
    2026,
    '2026-01',
    new Set(['base']),
    [line],
    new Map([[1, { '2025-01': 80 }]]),
    true
  );
  const compact = buildRevenueComparisonReport(
    2026,
    '2026-01',
    new Set(['base']),
    [line],
    new Map([[1, { '2025-01': 80 }]]),
    false
  );
  assert.equal(detailed.lines.length, 1);
  assert.deepEqual(compact.totals, detailed.totals);
  assert.deepEqual(compact.lines, []);
});
