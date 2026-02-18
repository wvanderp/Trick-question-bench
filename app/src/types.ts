export interface BenchResult {
  id: string;
  modelId: string;
  modelName: string;
  provider: string;
  questionId: string;
  question: string;
  answer: string;
  reasoning?: string;
  judgment: string;
  passed: boolean;
  needsHumanReview: boolean;
  timestamp: string;
  hash: string;
}

export interface AggregateStat {
  id: string;
  label: string;
  total: number;
  passed: number;
  failed: number;
  needsHumanReview: number;
  passRate: number;
}

export interface GeneratedData {
  generatedAt: string;
  totals: {
    models: number;
    results: number;
    passed: number;
    failed: number;
    needsHumanReview: number;
    passRate: number;
  };
  providers: AggregateStat[];
  models: AggregateStat[];
  questions: AggregateStat[];
  results: BenchResult[];
}
