import { describe, expect, it, vi } from 'vitest';
import {
  buildPendingPairs,
  dedupeModelResults,
  getErrorRetryState,
  getTimeLimitMsFromArgs,
  hasReachedTimeLimit,
  isErrorResult,
  isJudgedResult,
  shuffleItems,
  shouldRetryResult,
  upsertModelResult
} from '../src/benchmark';
import { Question, TestResult } from '../src/types';
import { createVersionInfo, generateHash } from '../src/hash';

const question: Question = {
  id: 'q-1',
  question: 'What is 1+1?',
  judgePrompt: 'Expect 2'
};

function makeResult(overrides: Partial<TestResult> = {}): TestResult {
  return {
    questionId: 'q-1',
    modelId: 'openai/gpt-4o',
    modelName: 'openai/gpt-4o',
    question: 'What is 1+1?',
    answer: '2',
    judgment: 'PASS',
    passed: true,
    needsHumanReview: false,
    timestamp: '2026-02-21T00:00:00.000Z',
    hash: 'abc123',
    ...overrides
  };
}

describe('benchmark parsing helpers', () => {
  it('parses time limit in hours from cli args', () => {
    expect(getTimeLimitMsFromArgs(['node', 'app.js', '--time-limit-hours=4'])).toBe(4 * 60 * 60 * 1000);
    expect(getTimeLimitMsFromArgs(['node', 'app.js', '--time-limit-hours=0.5'])).toBe(30 * 60 * 1000);
    expect(getTimeLimitMsFromArgs(['node', 'app.js'])).toBeUndefined();
  });

  it('throws for invalid time limit values', () => {
    expect(() => getTimeLimitMsFromArgs(['node', 'app.js', '--time-limit-hours=0'])).toThrow('Invalid --time-limit-hours value: 0');
    expect(() => getTimeLimitMsFromArgs(['node', 'app.js', '--time-limit-hours=abc'])).toThrow('Invalid --time-limit-hours value: abc');
  });

  it('detects when the time limit has been reached', () => {
    expect(hasReachedTimeLimit(1_000, undefined, 2_000)).toBe(false);
    expect(hasReachedTimeLimit(1_000, 3_600_000, 3_600_999)).toBe(false);
    expect(hasReachedTimeLimit(1_000, 3_600_000, 3_601_000)).toBe(true);
  });

  it('shuffles items without mutating the input array', () => {
    const items = ['a', 'b', 'c', 'd'];
    const shuffled = shuffleItems(items, vi.fn()
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.8)
      .mockReturnValueOnce(0.4));

    expect(shuffled).toEqual(['b', 'd', 'c', 'a']);
    expect(items).toEqual(['a', 'b', 'c', 'd']);
  });

  it('detects judged/error results', () => {
    expect(isJudgedResult(makeResult())).toBe(true);
    expect(isJudgedResult(makeResult({ judgment: 'ERROR' }))).toBe(false);
    expect(isErrorResult(makeResult({ judgment: 'ERROR' }))).toBe(true);
    expect(isErrorResult(makeResult({ answer: 'ERROR: timeout' }))).toBe(true);
    expect(shouldRetryResult(makeResult({ judgment: 'ERROR' }))).toBe(true);
    expect(shouldRetryResult(makeResult({ judgment: 'ERROR', retry: false }))).toBe(false);
  });

  it('starts error retry counting at one', () => {
    expect(getErrorRetryState()).toEqual({ retryCount: 1 });
    expect(getErrorRetryState(makeResult())).toEqual({ retryCount: 1 });
  });

  it('caps error retries on the third failure', () => {
    expect(getErrorRetryState(makeResult({ judgment: 'ERROR', retryCount: 1 }))).toEqual({ retryCount: 2 });
    expect(getErrorRetryState(makeResult({ judgment: 'ERROR', retryCount: 2 }))).toEqual({ retry: false, retryCount: 3 });
  });

  it('treats legacy error results without retryCount as the first recorded failure', () => {
    expect(
      getErrorRetryState(
        makeResult({
          judgment: 'ERROR',
          answer: 'ERROR: timeout',
          passed: false,
          needsHumanReview: true
        })
      )
    ).toEqual({ retryCount: 2 });
  });
});

describe('benchmark data wrangling helpers', () => {
  it('upserts by question id', () => {
    const items = [makeResult({ questionId: 'q-1', answer: '1' }), makeResult({ questionId: 'q-2', answer: '2' })];
    upsertModelResult(items, makeResult({ questionId: 'q-1', answer: 'updated' }));
    expect(items).toHaveLength(2);
    expect(items.find(item => item.questionId === 'q-1')?.answer).toBe('updated');
  });

  it('dedupes and keeps last result per question', () => {
    const deduped = dedupeModelResults([
      makeResult({ questionId: 'q-1', answer: 'old' }),
      makeResult({ questionId: 'q-2', answer: 'stable' }),
      makeResult({ questionId: 'q-1', answer: 'new' })
    ]);

    expect(deduped).toEqual([
      makeResult({ questionId: 'q-2', answer: 'stable' }),
      makeResult({ questionId: 'q-1', answer: 'new' })
    ]);
  });

  it('builds pending pairs and persists deduped data', () => {
    const models = ['openai/gpt-4o'];
    const questions: Question[] = [question];
    const expectedHash = generateHash(createVersionInfo(question, 'judge-system', 'judge-model'));

    const loadModelResultsFn = vi.fn(() => [
      makeResult({ questionId: 'q-1', answer: 'old', hash: 'old-hash' }),
      makeResult({ questionId: 'q-1', answer: 'newer', hash: 'still-old' })
    ]);
    const saveModelResultsFn = vi.fn();

    const result = buildPendingPairs(models, questions, '/tmp/output', {
      judgeSystemPrompt: 'judge-system',
      judgeModel: 'judge-model',
      loadModelResultsFn,
      saveModelResultsFn
    });

    expect(result.pendingPairs).toHaveLength(1);
    expect(result.pendingPairs[0]).toMatchObject({
      modelId: 'openai/gpt-4o',
      question,
      hash: expectedHash
    });
    expect(result.pendingByModel.get('openai/gpt-4o')).toHaveLength(1);
    expect(result.resultsByModel['openai/gpt-4o']).toHaveLength(1);
    expect(saveModelResultsFn).toHaveBeenCalledTimes(1);
  });

  it('skips pending when existing judged result hash matches', () => {
    const models = ['openai/gpt-4o'];
    const questions: Question[] = [question];
    const expectedHash = generateHash(createVersionInfo(question, 'judge-system', 'judge-model'));

    const loadModelResultsFn = vi.fn(() => [makeResult({ hash: expectedHash })]);
    const saveModelResultsFn = vi.fn();

    const result = buildPendingPairs(models, questions, '/tmp/output', {
      judgeSystemPrompt: 'judge-system',
      judgeModel: 'judge-model',
      loadModelResultsFn,
      saveModelResultsFn
    });

    expect(result.pendingPairs).toHaveLength(0);
    expect(result.pendingByModel.has('openai/gpt-4o')).toBe(false);
    expect(saveModelResultsFn).not.toHaveBeenCalled();
  });

  it('skips retrying errored results when retry is false', () => {
    const models = ['openai/gpt-4o'];
    const questions: Question[] = [question];
    const expectedHash = generateHash(createVersionInfo(question, 'judge-system', 'judge-model'));

    const loadModelResultsFn = vi.fn(() => [
      makeResult({
        hash: expectedHash,
        judgment: 'ERROR',
        answer: 'ERROR: rate limited',
        passed: false,
        needsHumanReview: true,
        retry: false
      })
    ]);
    const saveModelResultsFn = vi.fn();

    const result = buildPendingPairs(models, questions, '/tmp/output', {
      judgeSystemPrompt: 'judge-system',
      judgeModel: 'judge-model',
      loadModelResultsFn,
      saveModelResultsFn
    });

    expect(result.pendingPairs).toHaveLength(0);
    expect(result.pendingByModel.has('openai/gpt-4o')).toBe(false);
    expect(saveModelResultsFn).not.toHaveBeenCalled();
  });

  it('still retries errored results by default when retry is omitted', () => {
    const models = ['openai/gpt-4o'];
    const questions: Question[] = [question];
    const expectedHash = generateHash(createVersionInfo(question, 'judge-system', 'judge-model'));

    const loadModelResultsFn = vi.fn(() => [
      makeResult({
        hash: expectedHash,
        judgment: 'ERROR',
        answer: 'ERROR: timeout',
        passed: false,
        needsHumanReview: true
      })
    ]);
    const saveModelResultsFn = vi.fn();

    const result = buildPendingPairs(models, questions, '/tmp/output', {
      judgeSystemPrompt: 'judge-system',
      judgeModel: 'judge-model',
      loadModelResultsFn,
      saveModelResultsFn
    });

    expect(result.pendingPairs).toHaveLength(1);
    expect(result.pendingByModel.get('openai/gpt-4o')).toHaveLength(1);
    expect(saveModelResultsFn).not.toHaveBeenCalled();
  });
});
