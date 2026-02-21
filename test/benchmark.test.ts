import { describe, expect, it, vi } from 'vitest';
import {
  buildPendingPairs,
  dedupeModelResults,
  getModelLimitFromArgs,
  isErrorResult,
  isJudgedResult,
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
  it('parses model limit from cli args', () => {
    expect(getModelLimitFromArgs(['node', 'app.js', '--model-limit=5'])).toBe(5);
    expect(getModelLimitFromArgs(['node', 'app.js'])).toBeUndefined();
  });

  it('throws for invalid model limit values', () => {
    expect(() => getModelLimitFromArgs(['node', 'app.js', '--model-limit=0'])).toThrow('Invalid --model-limit value: 0');
    expect(() => getModelLimitFromArgs(['node', 'app.js', '--model-limit=abc'])).toThrow('Invalid --model-limit value: abc');
  });

  it('detects judged/error results', () => {
    expect(isJudgedResult(makeResult())).toBe(true);
    expect(isJudgedResult(makeResult({ judgment: 'ERROR' }))).toBe(false);
    expect(isErrorResult(makeResult({ judgment: 'ERROR' }))).toBe(true);
    expect(isErrorResult(makeResult({ answer: 'ERROR: timeout' }))).toBe(true);
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
});
