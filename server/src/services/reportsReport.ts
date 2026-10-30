import { QUADRANTS } from '../lib/crm.ts';

export interface ClosedScoreRow {
  stage_category: string;
  lost_reason: string | null;
  score_snapshot: string;
}

export function buildScoreWinLoss(rows: ClosedScoreRow[]) {
  const byQuadrant: Record<string, { won: number; lost: number }> = {};
  for (const quadrant of QUADRANTS) byQuadrant[quadrant] = { won: 0, lost: 0 };
  const lostReasonByFactor: Record<string, Record<string, number>> = {};

  for (const row of rows) {
    let snapshot: { quadrant: string; scores: Record<string, { score: number }> };
    try {
      snapshot = JSON.parse(row.score_snapshot);
    } catch {
      continue;
    }
    if (byQuadrant[snapshot.quadrant]) {
      byQuadrant[snapshot.quadrant][row.stage_category === 'won' ? 'won' : 'lost'] += 1;
    }
    if (row.stage_category !== 'lost' || !snapshot.scores) continue;
    const entries = Object.entries(snapshot.scores);
    if (entries.length === 0) continue;
    const lowest = entries.reduce((left, right) => (right[1].score < left[1].score ? right : left));
    const reason = row.lost_reason ?? 'other';
    lostReasonByFactor[reason] ??= {};
    lostReasonByFactor[reason][lowest[0]] = (lostReasonByFactor[reason][lowest[0]] ?? 0) + 1;
  }
  return { by_quadrant: byQuadrant, lost_reason_by_factor: lostReasonByFactor };
}

export interface AssigneeReportRow extends Record<string, unknown> {
  contact_id: number | null;
  completed: number;
  open_count: number;
  overdue_count: number;
  due_week_count: number;
  week_hours: number;
  estimated_count: number;
}

export function mergeAssigneeReports(
  openRows: AssigneeReportRow[],
  doneRows: AssigneeReportRow[]
): AssigneeReportRow[] {
  const rows = new Map<number | null, AssigneeReportRow>(
    openRows.map((row) => [row.contact_id, row])
  );
  for (const row of doneRows) {
    const open = rows.get(row.contact_id);
    if (open) open.completed = row.completed;
    else {
      rows.set(row.contact_id, {
        ...row,
        open_count: 0,
        overdue_count: 0,
        due_week_count: 0,
        week_hours: 0,
        estimated_count: 0,
      });
    }
  }
  return [...rows.values()].sort(
    (left, right) => right.overdue_count - left.overdue_count || right.open_count - left.open_count
  );
}
