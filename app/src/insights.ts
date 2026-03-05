import type { BenchResult } from './types';

const hasCost = (result: BenchResult): result is BenchResult & { costUsd: number } =>
  typeof result.costUsd === 'number' && Number.isFinite(result.costUsd);

const toAnswerLength = (answer: string) => answer.trim().length;

export const findLongestWrongAnswer = (results: BenchResult[]): BenchResult | undefined => {
  return results
    .filter((result) => !result.passed)
    .reduce<BenchResult | undefined>((currentBest, candidate) => {
      if (!currentBest) {
        return candidate;
      }

      const candidateLength = toAnswerLength(candidate.answer);
      const bestLength = toAnswerLength(currentBest.answer);

      if (candidateLength > bestLength) {
        return candidate;
      }

      if (candidateLength < bestLength) {
        return currentBest;
      }

      const candidateCost = hasCost(candidate) ? candidate.costUsd : -1;
      const bestCost = hasCost(currentBest) ? currentBest.costUsd : -1;
      if (candidateCost > bestCost) {
        return candidate;
      }

      return currentBest;
    }, undefined);
};

export const findMostCostlyWrongAnswer = (results: BenchResult[]): BenchResult | undefined => {
  return results
    .filter((result) => !result.passed && hasCost(result))
    .reduce<BenchResult | undefined>((currentBest, candidate) => {
      if (!currentBest) {
        return candidate;
      }

      if ((candidate.costUsd ?? 0) > (currentBest.costUsd ?? 0)) {
        return candidate;
      }

      if ((candidate.costUsd ?? 0) < (currentBest.costUsd ?? 0)) {
        return currentBest;
      }

      const candidateLength = toAnswerLength(candidate.answer);
      const bestLength = toAnswerLength(currentBest.answer);
      return candidateLength > bestLength ? candidate : currentBest;
    }, undefined);
};

export const getAnswerLength = (result: BenchResult) => toAnswerLength(result.answer);