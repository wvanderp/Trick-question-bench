import { describe, expect, it } from 'vitest';
import { findLongestWrongAnswer, findMostCostlyWrongAnswer, getAnswerLength } from '../app/src/insights';
import type { BenchResult } from '../app/src/types';

const makeResult = (overrides: Partial<BenchResult>): BenchResult => ({
  id: 'r1',
  modelId: 'openai/gpt-test',
  modelName: 'gpt-test',
  provider: 'openai',
  questionId: 'q1',
  question: 'question',
  answer: 'answer',
  judgment: 'judgment',
  passed: false,
  needsHumanReview: false,
  timestamp: '2026-03-05T00:00:00.000Z',
  hash: 'hash',
  ...overrides,
});

describe('insights', () => {
  it('picks the longest wrong answer', () => {
    const results: BenchResult[] = [
      makeResult({ id: 'a', passed: true, answer: 'this should be ignored' }),
      makeResult({ id: 'b', answer: 'short' }),
      makeResult({ id: 'c', answer: 'this is the longest wrong answer in this set' }),
    ];

    const longest = findLongestWrongAnswer(results);

    expect(longest?.id).toBe('c');
    expect(getAnswerLength(longest as BenchResult)).toBe(44);
  });

  it('breaks equal-length ties for longest wrong by higher cost', () => {
    const results: BenchResult[] = [
      makeResult({ id: 'a', answer: 'same length text', costUsd: 0.0001 }),
      makeResult({ id: 'b', answer: 'same length text', costUsd: 0.0002 }),
    ];

    const longest = findLongestWrongAnswer(results);

    expect(longest?.id).toBe('b');
  });

  it('picks most costly wrong answer', () => {
    const results: BenchResult[] = [
      makeResult({ id: 'a', costUsd: 0.0001 }),
      makeResult({ id: 'b', passed: true, costUsd: 999 }),
      makeResult({ id: 'c', costUsd: 0.0025 }),
      makeResult({ id: 'd' }),
    ];

    const costly = findMostCostlyWrongAnswer(results);

    expect(costly?.id).toBe('c');
  });

  it('returns undefined when no wrong answers exist', () => {
    const results: BenchResult[] = [
      makeResult({ id: 'a', passed: true }),
      makeResult({ id: 'b', passed: true }),
    ];

    expect(findLongestWrongAnswer(results)).toBeUndefined();
    expect(findMostCostlyWrongAnswer(results)).toBeUndefined();
  });
});
