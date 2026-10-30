import { describe, expect, it } from 'vitest';
import { scoreTrendSeries } from './scoreTrend';
import type { ScoreHistoryEntry } from '../types';

describe('scoreTrendSeries', () => {
  it('chỉ tính delta từ snapshot đầu tiên đủ tám yếu tố', () => {
    const factors = [
      'budget',
      'authority',
      'need',
      'timeline',
      'price',
      'relationship',
      'fit',
      'process',
    ];
    const history = factors.map((factor, index) => ({
      id: index + 1,
      factor,
      old_score: null,
      new_score: 1,
      reason: '',
      changed_at: `2026-01-0${index + 1}`,
    })) as ScoreHistoryEntry[];
    history.push({ ...history[0]!, id: 9, old_score: 1, new_score: 3, changed_at: '2026-01-09' });

    expect(scoreTrendSeries(history)).toEqual([
      { at: '2026-01-08', bant: 4, p4: 4 },
      { at: '2026-01-09', bant: 6, p4: 4 },
    ]);
  });
});
