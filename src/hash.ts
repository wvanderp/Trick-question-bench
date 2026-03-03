import * as crypto from 'crypto';
import { Question, VersionInfo } from './types';

/**
 * Generate a hash for tracking answer versions
 */
export function generateHash(versionInfo: VersionInfo): string {
  const data = JSON.stringify({
    questionId: versionInfo.questionId,
    question: versionInfo.question,
    judgePrompt: versionInfo.judgePrompt,
    judgeSystemPrompt: versionInfo.judgeSystemPrompt,
    judgeModel: versionInfo.judgeModel,
    judgeFunction: versionInfo.judgeFunction
  });
  
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

/**
 * Create version info from a question
 */
export function createVersionInfo(
  question: Question,
  judgeSystemPrompt: string,
  judgeModel: string
): VersionInfo {
  const versionInfo: VersionInfo = {
    questionId: question.id,
    question: question.question,
    judgePrompt: question.judgePrompt ?? '',
    judgeSystemPrompt: question.judgeFunction ? '' : judgeSystemPrompt,
    judgeModel: question.judgeFunction ? '' : judgeModel
  };

  if (question.judgeFunction) {
    versionInfo.judgeFunction = question.judgeFunction;
  }

  return versionInfo;
}
