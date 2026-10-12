import type { Deal, DealsPagedResponse, Stage } from '../types';

export function appendStagePage(
  data: DealsPagedResponse,
  stage: Stage,
  page: Deal[]
): DealsPagedResponse {
  const existing = data.stages[stage] ?? [];
  const ids = new Set(existing.map((deal) => deal.id));
  const added = page.filter((deal) => !ids.has(deal.id));
  return {
    ...data,
    stages: { ...data.stages, [stage]: [...existing, ...added] },
    more: { ...data.more, [stage]: Math.max(0, (data.more[stage] ?? 0) - added.length) },
  };
}
