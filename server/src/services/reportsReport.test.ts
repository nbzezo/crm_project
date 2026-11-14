import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScoreWinLoss, mergeAssigneeReports } from './reportsReport.ts';

test('report bo snapshot hong va dem yeu to thap nhat cua deal thua', () => {
  const result = buildScoreWinLoss([
    { stage_category: 'won', lost_reason: null, score_snapshot: '{hong' },
    {
      stage_category: 'lost',
      lost_reason: 'price',
      score_snapshot: JSON.stringify({
        quadrant: 'reshape',
        scores: { need: { score: 2 }, budget: { score: 0 } },
      }),
    },
  ]);
  assert.equal(result.by_quadrant.reshape?.lost, 1);
  assert.equal(result.lost_reason_by_factor.price?.budget, 1);
});

test('report assignee ghep dong open va completed-only, roi sap qua han truoc', () => {
  const base = {
    completed: 0,
    open_count: 1,
    overdue_count: 2,
    due_week_count: 0,
    week_hours: 0,
    estimated_count: 0,
  };
  const rows = mergeAssigneeReports(
    [{ contact_id: 1, ...base }],
    [
      { contact_id: 1, ...base, completed: 3 },
      { contact_id: 2, ...base, completed: 4 },
    ]
  );
  assert.deepEqual(
    rows.map((row) => [row.contact_id, row.completed, row.open_count]),
    [
      [1, 3, 1],
      [2, 4, 0],
    ]
  );
});
