import { describe, expect, it } from 'vitest';
import {
  ANSWER_LABELS,
  QUICK_ACTION_TEXT,
  QUICK_QUESTION_TEXT,
  QUICK_VERDICT_INFO,
} from './quickAssessment';
import type { QuickQuestion, QuickVerdict } from '../types';
describe('quick assessment dictionary', () => {
  const questions = Object.keys(QUICK_QUESTION_TEXT) as QuickQuestion[];
  it('covers every question and action', () => {
    expect(questions).toHaveLength(10);
    questions.forEach((q) => {
      expect(QUICK_QUESTION_TEXT[q].text).toBeTruthy();
      expect(QUICK_QUESTION_TEXT[q].hint).toBeTruthy();
      expect(QUICK_ACTION_TEXT[q].unsure).toBeTruthy();
      expect(QUICK_ACTION_TEXT[q].no).toBeTruthy();
    });
  });
  it('covers every verdict without advanced jargon', () => {
    (Object.keys(QUICK_VERDICT_INFO) as QuickVerdict[]).forEach((v) =>
      expect(QUICK_VERDICT_INFO[v].label).toBeTruthy()
    );
    expect(
      JSON.stringify({
        QUICK_QUESTION_TEXT,
        QUICK_ACTION_TEXT,
        QUICK_VERDICT_INFO,
        ANSWER_LABELS,
      }).toLowerCase()
    ).not.toMatch(/thắng|bant|4p|forecast|champion/);
  });
});
