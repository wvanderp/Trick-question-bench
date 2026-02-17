export interface Question {
  id: string;
  question: string;
  judgePrompt: string;
  tokenLimit?: number;
}

export interface QuestionsData {
  questions: Question[];
}

export interface Model {
  id: string;
  name: string;
}

export interface JudgmentResult {
  judgment: string;
  passed: boolean;
  needsHumanReview: boolean;
  confidence?: string;
}

export interface TestResult {
  questionId: string;
  modelId: string;
  modelName: string;
  question: string;
  answer: string;
  judgment: string;
  passed: boolean;
  needsHumanReview: boolean;
  timestamp: string;
  hash: string;
}

export interface VersionInfo {
  questionId: string;
  question: string;
  judgePrompt: string;
  judgeSystemPrompt: string;
  judgeModel: string;
}
