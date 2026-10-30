import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPipelineHealthReport, type PipelineHealthRow } from './pipelineHealthReport.ts';

function row(overrides: Partial<PipelineHealthRow>): PipelineHealthRow {
  return {
    id: 1,
    value_vnd: 100,
    probability: 50,
    quadrant: 'pursue',
    deal_age_days: 20,
    score_age_days: 1,
    v1_no_event: 0,
    v2_no_economic: 0,
    v3_shaped: 0,
    ...overrides,
  };
}

test('pipeline health giu grace period va loai veto/stale khoi forecast', () => {
  const report = buildPipelineHealthReport(
    [
      row({ id: 1 }),
      row({ id: 2, deal_age_days: 2, score_age_days: null }),
      row({ id: 3, v1_no_event: 1, value_vnd: 200 }),
      row({ id: 4, score_age_days: 31, value_vnd: 300 }),
    ],
    [{ id: 9 }],
    { staleDays: 30, v3Mode: 'veto' }
  );
  assert.equal(report.stage_weighted_vnd, 350);
  assert.equal(report.filtered_weighted_vnd, 100);
  assert.equal(report.excluded_count, 2);
  assert.deepEqual(
    report.excluded.map((item) => item.blocked_by),
    [['STALE'], ['V1_NO_COMPELLING_EVENT']]
  );
  assert.deepEqual(report.declining, [{ id: 9 }]);
});
