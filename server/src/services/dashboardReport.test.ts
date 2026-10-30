import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboardReport } from './dashboardReport.ts';

test('dashboard chuan hoa count null va chia dung moc hop dong', () => {
  const report = buildDashboardReport({
    taskCounts: {
      overdue_count: null,
      due_today_count: 1,
      due_tomorrow_count: 2,
      due_week_count: 3,
      open_count: 4,
      done_today_count: null,
    },
    pipeline: { open_count: 2, pipeline_vnd: 100, weighted_vnd: 49.6 },
    closingThisMonth: { count: 1, sum_vnd: 20 },
    tasks: {},
    workload: [],
    pipelineTotals: {},
    attention: {},
    expiringContracts: [{ days_left: 30 }, { days_left: 60 }, { days_left: 61 }],
    upcomingReminders: [],
    recentInteractions: [],
    recentBoards: [],
  });
  assert.equal(report.kpi.weighted_pipeline_vnd, 50);
  assert.equal(report.task_counts.overdue, 0);
  assert.deepEqual(
    [
      report.expiring_contracts.d30,
      report.expiring_contracts.d60,
      report.expiring_contracts.d90,
    ].map((rows) => rows.length),
    [1, 1, 1]
  );
});
