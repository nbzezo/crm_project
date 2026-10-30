interface DashboardCounts extends Record<string, number | null> {
  overdue_count: number | null;
  due_today_count: number | null;
  due_tomorrow_count: number | null;
  due_week_count: number | null;
  open_count: number | null;
  done_today_count: number | null;
}

interface PipelineTotals {
  open_count: number;
  pipeline_vnd: number;
  weighted_vnd: number;
}

export function buildDashboardReport(input: {
  taskCounts: DashboardCounts;
  pipeline: PipelineTotals;
  closingThisMonth: { count: number; sum_vnd: number };
  tasks: unknown;
  workload: unknown;
  pipelineTotals: unknown;
  attention: unknown;
  expiringContracts: ({ days_left: number } & Record<string, unknown>)[];
  upcomingReminders: unknown;
  recentInteractions: unknown;
  recentBoards: unknown;
}) {
  const { taskCounts, pipeline, closingThisMonth, expiringContracts } = input;
  return {
    kpi: {
      open_opportunity_count: pipeline.open_count,
      pipeline_vnd: pipeline.pipeline_vnd,
      weighted_pipeline_vnd: Math.round(pipeline.weighted_vnd),
      closing_this_month_count: closingThisMonth.count,
      closing_this_month_vnd: closingThisMonth.sum_vnd,
      overdue_task_count: taskCounts.overdue_count ?? 0,
      expiring_contract_count: expiringContracts.length,
    },
    task_counts: {
      overdue: taskCounts.overdue_count ?? 0,
      today: taskCounts.due_today_count ?? 0,
      tomorrow: taskCounts.due_tomorrow_count ?? 0,
      week: taskCounts.due_week_count ?? 0,
      open: taskCounts.open_count ?? 0,
      done_today: taskCounts.done_today_count ?? 0,
    },
    tasks: input.tasks,
    workload: input.workload,
    pipeline_totals: input.pipelineTotals,
    attention: input.attention,
    expiring_contracts: {
      d30: expiringContracts.filter((contract) => contract.days_left <= 30),
      d60: expiringContracts.filter(
        (contract) => contract.days_left > 30 && contract.days_left <= 60
      ),
      d90: expiringContracts.filter((contract) => contract.days_left > 60),
      all: expiringContracts,
    },
    upcoming_reminders: input.upcomingReminders,
    recent_interactions: input.recentInteractions,
    recent_boards: input.recentBoards,
  };
}
