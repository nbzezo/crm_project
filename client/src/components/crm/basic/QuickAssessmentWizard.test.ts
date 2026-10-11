import { describe, expect, it } from 'vitest';
import { buildQuickPayload, type QuickDraft } from './QuickAssessmentWizard';

const draft: QuickDraft = {
  need: { answer: 'yes', note: '', source: 'ai' },
  budget: { answer: 'no', note: 'Chưa có ngân sách', source: 'user' },
  deadline: { answer: null, note: '', source: null },
  decision_maker: { answer: 'yes', note: '', source: 'ai' },
  supporter: { answer: 'unsure', note: '', source: 'user' },
  fit: { answer: 'yes', note: '', source: 'derived' },
  advantage: { answer: 'no', note: '', source: 'user' },
  process: { answer: null, note: '', source: null },
  profit: { answer: 'yes', note: '', source: 'user' },
  future: { answer: 'unsure', note: '', source: 'user' },
};

describe('buildQuickPayload', () => {
  it('fills unanswered items and preserves unchanged AI suggestions only', () => {
    const result = buildQuickPayload(draft, { need: 'yes', decision_maker: 'no' });
    expect(result).toHaveLength(10);
    expect(result.find((item) => item.question === 'need')).toMatchObject({
      answer: 'yes',
      source: 'ai',
    });
    expect(result.find((item) => item.question === 'decision_maker')).toMatchObject({
      answer: 'yes',
      source: 'user',
    });
    expect(result.find((item) => item.question === 'deadline')).toMatchObject({
      answer: 'unsure',
      source: 'user',
    });
    expect(result.find((item) => item.question === 'budget')).toMatchObject({
      note: 'Chưa có ngân sách',
    });
  });
});
