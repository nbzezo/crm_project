import { describe, expect, it } from 'vitest';
import { dealTabsFor, influenceBucket, influenceValue, resolveDealTab } from './dealViewMode';

describe('deal view mode', () => {
  it('chooses tabs and defaults safely', () => {
    expect(dealTabsFor('basic').map((x) => x.key)).toEqual([
      'overview',
      'assessment',
      'committee',
      'info',
      'notes',
      'handover',
    ]);
    expect(resolveDealTab('basic', 'score')).toBe('overview');
    expect(resolveDealTab('advanced', 'overview')).toBe('assessment');
    expect(resolveDealTab('advanced', 'score')).toBe('score');
    expect(resolveDealTab('basic', 'wat')).toBe('overview');
  });
  it('maps influence buckets both ways', () => {
    expect([1, 2].map(influenceBucket)).toEqual(['low', 'low']);
    expect(influenceBucket(3)).toBe('medium');
    expect([4, 5].map(influenceBucket)).toEqual(['high', 'high']);
    expect(influenceValue('low')).toBe(2);
    expect(influenceValue('medium')).toBe(3);
    expect(influenceValue('high')).toBe(5);
  });
});
