import { STAGE_ORDER, STAGE_PROBABILITY } from '../../i18n/vi';
import type { Deal, DealsResponse, Stage } from '../../types';

export function cloneDeals(data: DealsResponse): DealsResponse {
  const stages = {} as Record<Stage, Deal[]>;
  for (const stage of STAGE_ORDER) {
    stages[stage] = (data.stages[stage] ?? []).map((deal) => ({ ...deal }));
  }
  return { stages, totals: structuredClone(data.totals) };
}

export function locateDeal(
  data: DealsResponse,
  dealId: number
): { stage: Stage; index: number } | null {
  for (const stage of STAGE_ORDER) {
    const index = (data.stages[stage] ?? []).findIndex((deal) => deal.id === dealId);
    if (index >= 0) return { stage, index };
  }
  return null;
}

/** Dong bo tong pipeline voi cac cot optimistic, dung cung probability mac dinh voi API move. */
export function refreshDealTotals(data: DealsResponse): void {
  for (const stage of STAGE_ORDER) {
    const deals = data.stages[stage] ?? [];
    data.totals[stage] = deals.reduce(
      (total, deal) => {
        total.count += 1;
        total.sum_vnd += deal.value_vnd;
        total.weighted_vnd += Math.round((deal.value_vnd * deal.probability) / 100);
        return total;
      },
      { count: 0, sum_vnd: 0, weighted_vnd: 0 }
    );
  }
}

export function applyOptimisticStage(deal: Deal, stage: Stage): void {
  deal.stage = stage;
  deal.probability = STAGE_PROBABILITY[stage];
}
