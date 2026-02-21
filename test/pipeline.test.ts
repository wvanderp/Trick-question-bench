import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildPendingPairs,
  persistUpdatedModelResults,
  upsertModelResult
} from '../src/benchmark';
import {
  loadModelResults,
  parseModelId,
  sanitizeFileName,
  saveModelResults
} from '../src/loader';
import { createVersionInfo, generateHash } from '../src/hash';
import { Question, TestResult } from '../src/types';

function makeResult(
  modelId: string,
  question: Question,
  hash: string,
  overrides: Partial<TestResult> = {}
): TestResult {
  return {
    questionId: question.id,
    modelId,
    modelName: modelId,
    question: question.question,
    answer: 'default-answer',
    judgment: 'PASS',
    passed: true,
    needsHumanReview: false,
    timestamp: '2026-02-21T00:00:00.000Z',
    hash,
    ...overrides
  };
}

function modelOutputFilePath(outputDir: string, modelId: string): string {
  const { company, modelName } = parseModelId(modelId);
  return path.join(outputDir, sanitizeFileName(company), `${sanitizeFileName(modelName)}.json`);
}

describe('pipeline persistence', () => {
  it('writes only models marked as updated', () => {
    const saveModelResultsFn = vi.fn();
    const outputDir = '/tmp/output';
    const resultsByModel: Record<string, TestResult[]> = {
      'openai/gpt-4o': [
        {
          questionId: 'q-1',
          modelId: 'openai/gpt-4o',
          modelName: 'openai/gpt-4o',
          question: 'Q1',
          answer: 'A1',
          judgment: 'PASS',
          passed: true,
          needsHumanReview: false,
          timestamp: '2026-02-21T00:00:00.000Z',
          hash: 'h1'
        }
      ],
      'anthropic/claude-3.5-sonnet': []
    };

    persistUpdatedModelResults(
      outputDir,
      resultsByModel,
      ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet'],
      saveModelResultsFn
    );

    expect(saveModelResultsFn).toHaveBeenCalledTimes(1);
    expect(saveModelResultsFn).toHaveBeenCalledWith(outputDir, 'openai/gpt-4o', resultsByModel['openai/gpt-4o']);
  });

  it('preserves existing answers when no new answers are produced for a model', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-no-overwrite-'));
    const question: Question = {
      id: 'q-1',
      question: 'What is 1+1?',
      judgePrompt: 'Expect 2'
    };
    const judgeSystemPrompt = 'judge-system';
    const judgeModel = 'judge-model';
    const expectedHash = generateHash(createVersionInfo(question, judgeSystemPrompt, judgeModel));
    const modelId = 'openai/gpt-4o';

    saveModelResults(tempDir, modelId, [
      makeResult(modelId, question, expectedHash, { answer: '2' })
    ]);

    const firstPass = buildPendingPairs([modelId], [question], tempDir, {
      judgeSystemPrompt,
      judgeModel,
      loadModelResultsFn: loadModelResults,
      saveModelResultsFn: saveModelResults
    });

    expect(firstPass.pendingPairs).toHaveLength(0);
    const modelPath = modelOutputFilePath(tempDir, modelId);
    const before = fs.readFileSync(modelPath, 'utf-8');

    persistUpdatedModelResults(tempDir, firstPass.resultsByModel, new Set<string>(), saveModelResults);

    const after = fs.readFileSync(modelPath, 'utf-8');
    expect(after).toBe(before);
  });

  it('updates only changed answers across sequential runs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-sequential-'));
    const question: Question = {
      id: 'q-1',
      question: 'What is 1+1?',
      judgePrompt: 'Expect 2'
    };
    const judgeSystemPrompt = 'judge-system';
    const judgeModel = 'judge-model';
    const expectedHash = generateHash(createVersionInfo(question, judgeSystemPrompt, judgeModel));
    const modelId = 'openai/gpt-4o';

    saveModelResults(tempDir, modelId, [
      makeResult(modelId, question, 'old-hash', { answer: 'stale' })
    ]);

    const firstPass = buildPendingPairs([modelId], [question], tempDir, {
      judgeSystemPrompt,
      judgeModel,
      loadModelResultsFn: loadModelResults,
      saveModelResultsFn: saveModelResults
    });

    expect(firstPass.pendingPairs).toHaveLength(1);
    const updatedModelIds = new Set<string>();

    for (const pending of firstPass.pendingPairs) {
      const updatedResult = makeResult(pending.modelId, pending.question, pending.hash, {
        answer: '2'
      });
      upsertModelResult(firstPass.resultsByModel[pending.modelId], updatedResult);
      updatedModelIds.add(pending.modelId);
    }

    persistUpdatedModelResults(tempDir, firstPass.resultsByModel, updatedModelIds, saveModelResults);

    const afterFirstRun = loadModelResults(tempDir, modelId);
    expect(afterFirstRun).toHaveLength(1);
    expect(afterFirstRun[0].answer).toBe('2');
    expect(afterFirstRun[0].hash).toBe(expectedHash);

    const secondPass = buildPendingPairs([modelId], [question], tempDir, {
      judgeSystemPrompt,
      judgeModel,
      loadModelResultsFn: loadModelResults,
      saveModelResultsFn: saveModelResults
    });

    expect(secondPass.pendingPairs).toHaveLength(0);
  });
});
