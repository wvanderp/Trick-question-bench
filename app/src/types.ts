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
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  latencyMs?: number;
}

export interface AggregateStat {
  id: string;
  label: string;
  total: number;
  passed: number;
  failed: number;
  needsHumanReview: number;
  passRate: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  totalLatencyMs: number;
  tokenSampleCount: number;
  costSampleCount: number;
  latencySampleCount: number;
  avgPromptTokens: number;
  avgCompletionTokens: number;
  avgTotalTokens: number;
  avgCostUsd: number;
  avgLatencyMs: number;
}

export interface GlobalMetrics {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  totalLatencyMs: number;
  tokenSampleCount: number;
  costSampleCount: number;
  latencySampleCount: number;
  avgPromptTokens: number;
  avgCompletionTokens: number;
  avgTotalTokens: number;
  avgCostUsd: number;
  avgLatencyMs: number;
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
    metrics: GlobalMetrics;
  };
  providers: AggregateStat[];
  models: AggregateStat[];
  questions: AggregateStat[];
  results: BenchResult[];
}
