export interface Question {
  id: string;
  question: string;
  /** Prompt for the LLM judge. Required when judgeFunction is not set. */
  judgePrompt?: string;
  /** Key into the judgeFunctions map in data/judgeFunctions.ts. When set, the JS function is used instead of an LLM judge. */
  judgeFunction?: string;
  tokenLimit?: number;
}

export interface QuestionsData {
  questions: Question[];
}

export interface ModelConfig {
  name: string;
  disabled: boolean;
  thinking?: string;
  release_date?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
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
  reasoning?: string;
  judgment: string;
  passed: boolean;
  needsHumanReview: boolean;
  timestamp: string;
  hash: string;
  usage?: TokenUsage;
  costUsd?: number;
  latencyMs?: number;
}

export interface VersionInfo {
  questionId: string;
  question: string;
  judgePrompt: string;
  judgeSystemPrompt: string;
  judgeModel: string;
  judgeFunction?: string;
}
