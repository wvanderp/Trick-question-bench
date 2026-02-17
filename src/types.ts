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

export interface ModelsData {
  models: Model[];
}

export interface TestResult {
  questionId: string;
  modelId: string;
  modelName: string;
  question: string;
  answer: string;
  judgment: string;
  passed: boolean;
  timestamp: string;
}
