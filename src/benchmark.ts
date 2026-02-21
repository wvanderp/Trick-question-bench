import { loadModelResults, saveModelResults } from './loader';
import { generateHash, createVersionInfo } from './hash';
import { Question, TestResult } from './types';

export interface PendingPair {
  modelId: string;
  question: Question;
  hash: string;
}

export interface BuildPendingPairsOptions {
  judgeSystemPrompt: string;
  judgeModel: string;
  loadModelResultsFn?: (outputDir: string, modelId: string) => TestResult[];
  saveModelResultsFn?: (outputDir: string, modelId: string, data: unknown) => void;
}

export function getModelLimitFromArgs(args: string[]): number | undefined {
  const arg = args.find(value => value.startsWith('--model-limit='));
  if (!arg) {
    return undefined;
  }

  const rawLimit = arg.split('=')[1];
  const parsedLimit = Number.parseInt(rawLimit, 10);

  if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
    throw new Error(`Invalid --model-limit value: ${rawLimit}`);
  }

  return parsedLimit;
}

export function isJudgedResult(result: TestResult): boolean {
  return (
    result.modelId.length > 0 &&
    result.questionId.length > 0 &&
    result.hash.length > 0 &&
    result.judgment.length > 0 &&
    result.judgment !== 'ERROR'
  );
}

export function isErrorResult(result: TestResult): boolean {
  return result.judgment === 'ERROR' || result.answer.startsWith('ERROR:');
}

export function upsertModelResult(results: TestResult[], result: TestResult): void {
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].questionId === result.questionId) {
      results.splice(i, 1);
    }
  }
  results.push(result);
}

export function dedupeModelResults(results: TestResult[]): TestResult[] {
  const seenQuestionIds = new Set<string>();
  const dedupedResults: TestResult[] = [];

  for (let i = results.length - 1; i >= 0; i--) {
    const result = results[i];
    if (seenQuestionIds.has(result.questionId)) {
      continue;
    }
    seenQuestionIds.add(result.questionId);
    dedupedResults.unshift(result);
  }

  return dedupedResults;
}

export function buildPendingPairs(
  models: string[],
  questions: Question[],
  outputDir: string,
  options: BuildPendingPairsOptions
): { pendingPairs: PendingPair[]; pendingByModel: Map<string, PendingPair[]>; resultsByModel: Record<string, TestResult[]> } {
  const pendingPairs: PendingPair[] = [];
  const pendingByModel = new Map<string, PendingPair[]>();
  const resultsByModel: Record<string, TestResult[]> = {};

  const loadResults = options.loadModelResultsFn ?? loadModelResults;
  const saveResults = options.saveModelResultsFn ?? saveModelResults;

  const questionHashes = new Map<string, string>();
  for (const question of questions) {
    const versionInfo = createVersionInfo(question, options.judgeSystemPrompt, options.judgeModel);
    questionHashes.set(question.id, generateHash(versionInfo));
  }

  for (const modelId of models) {
    const existingModelResults = loadResults(outputDir, modelId);
    const dedupedResults = dedupeModelResults(existingModelResults);
    resultsByModel[modelId] = dedupedResults;

    if (dedupedResults.length !== existingModelResults.length) {
      saveResults(outputDir, modelId, dedupedResults);
    }

    const resultsByQuestionId = new Map<string, TestResult>();
    for (const result of dedupedResults) {
      resultsByQuestionId.set(result.questionId, result);
    }

    const modelPending: PendingPair[] = [];

    for (const question of questions) {
      const expectedHash = questionHashes.get(question.id);
      if (!expectedHash) {
        continue;
      }

      const existing = resultsByQuestionId.get(question.id);
      const shouldRun = !existing || isErrorResult(existing) || existing.hash !== expectedHash || !isJudgedResult(existing);

      if (shouldRun) {
        const pendingPair: PendingPair = {
          modelId,
          question,
          hash: expectedHash
        };
        pendingPairs.push(pendingPair);
        modelPending.push(pendingPair);
      }
    }

    if (modelPending.length > 0) {
      pendingByModel.set(modelId, modelPending);
    }
  }

  return { pendingPairs, pendingByModel, resultsByModel };
}
