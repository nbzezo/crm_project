import { QUADRANTS } from '../lib/crm.ts';

export interface PipelineHealthRow extends Record<string, unknown> {
  id: number;
  value_vnd: number;
  probability: number;
  quadrant: string;
  deal_age_days: number;
  score_age_days: number | null;
  v1_no_event: number;
  v2_no_economic: number;
  v3_shaped: number;
}

export function buildPipelineHealthReport(
  rows: PipelineHealthRow[],
  declining: unknown[],
  settings: { staleDays: number; v3Mode: string }
) {
  const blockedBy = (row: PipelineHealthRow): string[] => {
    const flags: string[] = [];
    if (row.v1_no_event) flags.push('V1_NO_COMPELLING_EVENT');
    if (row.v2_no_economic) flags.push('V2_NO_ECONOMIC_BUYER');
    if (row.v3_shaped && settings.v3Mode === 'veto') flags.push('V3_COMPETITOR_SHAPED');
    const unscoredButNew = row.score_age_days === null && row.deal_age_days < 7;
    if (
      !unscoredButNew &&
      (row.score_age_days === null || row.score_age_days > settings.staleDays)
    ) {
      flags.push('STALE');
    }
    return flags;
  };

  let stageWeighted = 0;
  let filteredWeighted = 0;
  const quadrantTotals: Record<string, { count: number; sum_vnd: number }> = {};
  for (const quadrant of QUADRANTS) quadrantTotals[quadrant] = { count: 0, sum_vnd: 0 };
  const excluded: Record<string, unknown>[] = [];

  for (const row of rows) {
    const weighted = Math.round((row.value_vnd * row.probability) / 100);
    stageWeighted += weighted;
    quadrantTotals[row.quadrant].count += 1;
    quadrantTotals[row.quadrant].sum_vnd += row.value_vnd;
    const flags = blockedBy(row);
    if (flags.length === 0) filteredWeighted += weighted;
    else excluded.push({ ...row, weighted_vnd: weighted, blocked_by: flags });
  }
  excluded.sort((a, b) => (b.weighted_vnd as number) - (a.weighted_vnd as number));

  return {
    stage_weighted_vnd: stageWeighted,
    filtered_weighted_vnd: filteredWeighted,
    inflation_vnd: stageWeighted - filteredWeighted,
    inflation_ratio: stageWeighted === 0 ? 0 : (stageWeighted - filteredWeighted) / stageWeighted,
    open_count: rows.length,
    excluded_count: excluded.length,
    quadrant_totals: quadrantTotals,
    excluded: excluded.slice(0, 20),
    declining,
    settings: { stale_days: settings.staleDays, v3_mode: settings.v3Mode },
  };
}
