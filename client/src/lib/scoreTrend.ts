import type { Factor, ScoreHistoryEntry } from '../types';

const FACTORS: Factor[] = [
  'budget',
  'authority',
  'need',
  'timeline',
  'price',
  'relationship',
  'fit',
  'process',
];
const BANT = new Set<Factor>(FACTORS.slice(0, 4));

export function scoreTrendSeries(history: ScoreHistoryEntry[]) {
  const current: Partial<Record<Factor, number>> = {};
  const series: { at: string; bant: number; p4: number }[] = [];
  for (const entry of history) {
    if (entry.new_score === null || !FACTORS.includes(entry.factor as Factor)) continue;
    current[entry.factor as Factor] = entry.new_score;
    if (FACTORS.some((factor) => current[factor] === undefined)) continue;
    let bant = 0;
    let p4 = 0;
    for (const factor of FACTORS) {
      if (BANT.has(factor)) bant += current[factor]!;
      else p4 += current[factor]!;
    }
    series.push({ at: entry.changed_at, bant, p4 });
  }
  return series;
}
