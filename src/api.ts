import { Question, JudgmentResult, TokenUsage } from './types';
import { OpenRouterGenerationResponse } from './response';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEBUG_STATS = process.env.BENCH_DEBUG_STATS === '1';

function debugStatsLog(message: string, details?: Record<string, unknown>): void {
  if (!DEBUG_STATS) {
    return;
  }

  if (details) {
    console.log(`[stats-debug] ${message}`, details);
    return;
  }

  console.log(`[stats-debug] ${message}`);
}

// Judge system prompt
export const JUDGE_SYSTEM_PROMPT = `You are an expert judge evaluating AI model responses to trick questions. Your role is to:

1. Carefully analyze whether the AI model's answer is correct according to the provided criteria
2. Determine if the answer shows genuine understanding or if the model fell for the trick
3. Be strict but fair in your evaluation
4. Flag answers that are ambiguous or require human review

Your response MUST follow this exact format:
- Start with either "PASS" or "FAIL"
- If uncertain or the answer is ambiguous, include "NEEDS_HUMAN_REVIEW" on a new line
- Provide a brief explanation of your reasoning
- If unsure, include "CONFIDENCE: LOW", "CONFIDENCE: MEDIUM", or "CONFIDENCE: HIGH"

Example responses:
"PASS - The model correctly identified that roosters don't lay eggs. CONFIDENCE: HIGH"
"FAIL - The model answered 2 instead of 3. CONFIDENCE: HIGH"
"FAIL - Answer is unclear and could be interpreted either way. NEEDS_HUMAN_REVIEW. CONFIDENCE: LOW"
`;

export interface OpenRouterResponse {
  id?: string;
  choices: Array<{
    message: {
      content: string;
      reasoning?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost?: number;
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function extractTokenUsage(usage: OpenRouterResponse['usage']): TokenUsage | undefined {
  if (!usage) {
    return undefined;
  }

  const { prompt_tokens, completion_tokens, total_tokens } = usage;
  if (!isFiniteNumber(prompt_tokens) || !isFiniteNumber(completion_tokens) || !isFiniteNumber(total_tokens)) {
    return undefined;
  }

  return {
    promptTokens: prompt_tokens,
    completionTokens: completion_tokens,
    totalTokens: total_tokens
  };
}

export interface QueryResult {
  content: string;
  reasoning?: string;
  usage?: TokenUsage;
  generationId?: string;
  usageCostUsd?: number;
  roundTripMs?: number;
}

export interface ParsedJudgment {
  passed: boolean;
  needsHumanReview: boolean;
  confidence?: string;
}

export interface QueryModelOptions {
  thinking?: string;
}

export function parseJudgment(judgment: string): ParsedJudgment {
  const trimmedJudgment = judgment.trim();
  const firstLine = trimmedJudgment.split('\n')[0].toUpperCase();
  const passed = firstLine.startsWith('PASS') && !firstLine.startsWith('FAIL');
  const needsHumanReview = judgment.toUpperCase().includes('NEEDS_HUMAN_REVIEW');

  let confidence: string | undefined;
  const confidenceMatch = judgment.match(/CONFIDENCE:\s*(LOW|MEDIUM|HIGH)/i);
  if (confidenceMatch) {
    confidence = confidenceMatch[1].toUpperCase();
  }

  return {
    passed,
    needsHumanReview,
    confidence
  };
}

/**
 * Query the OpenRouter API with a prompt
 */
export async function queryModel(
  apiKey: string,
  modelId: string,
  prompt: string,
  maxTokens?: number,
  systemPrompt?: string,
  options?: QueryModelOptions
): Promise<QueryResult> {
  const requestStart = Date.now();
  const messages: Array<{ role: string; content: string }> = [];
  
  if (systemPrompt) {
    messages.push({
      role: 'system',
      content: systemPrompt
    });
  }
  
  messages.push({
    role: 'user',
    content: prompt
  });

  const requestBody: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    max_tokens?: number;
    reasoning?: { effort: string };
  } = {
    model: modelId,
    messages,
    max_tokens: maxTokens
  };

  if (options?.thinking) {
    requestBody.reasoning = {
      effort: options.thinking
    };
  }

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/wvanderp/Trick-question-bench',
      'X-Title': 'Trick Question Benchmark'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as OpenRouterResponse;
  const roundTripMs = Date.now() - requestStart;
  
  // Validate response structure
  if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
    throw new Error('Invalid response structure from OpenRouter API');
  }
  
  if (!data.choices[0].message || typeof data.choices[0].message.content !== 'string') {
    throw new Error('Invalid message structure in OpenRouter API response');
  }

  const result: QueryResult = {
    content: data.choices[0].message.content,
    roundTripMs
  };

  // Capture reasoning if provided by the model
  if (data.choices[0].message.reasoning) {
    result.reasoning = data.choices[0].message.reasoning;
  }

  // Capture token usage if provided
  const usage = extractTokenUsage(data.usage);
  if (usage) {
    result.usage = usage;
  }

  const usageCostUsd = data.usage && isFiniteNumber(data.usage.cost)
    ? data.usage.cost
    : undefined;
  if (usageCostUsd !== undefined) {
    result.usageCostUsd = usageCostUsd;
  }

  // Capture generation ID for cost lookup
  if (data.id) {
    result.generationId = data.id;
  }

  debugStatsLog('queryModel response metadata', {
    modelId,
    hasGenerationId: Boolean(result.generationId),
    generationId: result.generationId,
    hasUsage: Boolean(result.usage),
    promptTokens: result.usage?.promptTokens,
    completionTokens: result.usage?.completionTokens,
    totalTokens: result.usage?.totalTokens,
    usageCostUsd: result.usageCostUsd,
    roundTripMs: result.roundTripMs
  });
  
  return result;
}

export interface GenerationStats {
  costUsd?: number;
  latencyMs?: number;
}

function extractGenerationStats(response: OpenRouterGenerationResponse): GenerationStats {
  if (!response.data) {
    return {};
  }

  const totalCost = isFiniteNumber(response.data.total_cost) ? response.data.total_cost : undefined;
  const usageCost = isFiniteNumber(response.data.usage) ? response.data.usage : undefined;
  const upstreamInferenceCost = isFiniteNumber(response.data.upstream_inference_cost)
    ? response.data.upstream_inference_cost
    : undefined;
  const costUsd = totalCost ?? usageCost ?? upstreamInferenceCost;

  const generationTime = isFiniteNumber(response.data.generation_time) ? response.data.generation_time : undefined;
  const latency = isFiniteNumber(response.data.latency) ? response.data.latency : undefined;
  const latencyMs = generationTime ?? latency;

  const stats: GenerationStats = {};
  if (costUsd !== undefined) {
    stats.costUsd = costUsd;
  }
  if (latencyMs !== undefined) {
    stats.latencyMs = latencyMs;
  }

  return stats;
}

/**
 * Fetch generation stats (cost and latency) from the OpenRouter API.
 * OpenRouter may take a moment to compute cost, so retries with
 * a short delay are attempted.
 */
export async function fetchGenerationStats(
  apiKey: string,
  generationId: string,
  maxRetries: number = 3,
  delayMs: number = 2000
): Promise<GenerationStats> {
  const url = `https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(generationId)}`;
  let latestLatencyMs: number | undefined;
  debugStatsLog('fetchGenerationStats start', { generationId, maxRetries, delayMs });

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const attemptNumber = attempt + 1;
    if (attempt > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      debugStatsLog('generation endpoint returned non-ok response', {
        generationId,
        attempt: attemptNumber,
        maxRetries,
        status: response.status,
        statusText: response.statusText
      });
      continue;
    }

    const data = await response.json() as OpenRouterGenerationResponse;

    const stats = extractGenerationStats(data);
    debugStatsLog('generation endpoint response parsed', {
      generationId,
      attempt: attemptNumber,
      maxRetries,
      extractedCostUsd: stats.costUsd,
      extractedLatencyMs: stats.latencyMs,
      rawTotalCost: data.data?.total_cost,
      rawUsageCost: data.data?.usage,
      rawUpstreamInferenceCost: data.data?.upstream_inference_cost,
      rawGenerationTime: data.data?.generation_time,
      rawLatency: data.data?.latency
    });

    if (stats.latencyMs !== undefined) {
      latestLatencyMs = stats.latencyMs;
    }
    if (stats.costUsd !== undefined) {
      debugStatsLog('fetchGenerationStats resolved with cost', {
        generationId,
        attempt: attemptNumber,
        costUsd: stats.costUsd,
        latencyMs: stats.latencyMs ?? latestLatencyMs
      });
      return {
        ...stats,
        latencyMs: stats.latencyMs ?? latestLatencyMs
      };
    }

  }

  if (latestLatencyMs !== undefined) {
    debugStatsLog('fetchGenerationStats resolved with latency only', {
      generationId,
      latencyMs: latestLatencyMs
    });
    return { latencyMs: latestLatencyMs };
  }

  debugStatsLog('fetchGenerationStats exhausted without stats', { generationId });

  return {};
}

/**
 * Fetch the cost of a generation from the OpenRouter API.
 * @deprecated Use fetchGenerationStats instead for both cost and latency.
 */
export async function fetchGenerationCost(
  apiKey: string,
  generationId: string,
  maxRetries: number = 3,
  delayMs: number = 2000
): Promise<number | undefined> {
  const stats = await fetchGenerationStats(apiKey, generationId, maxRetries, delayMs);
  return stats.costUsd;
}

/**
 * Ask a question to a model
 */
export async function askQuestion(
  apiKey: string,
  modelId: string,
  question: Question,
  thinking?: string
): Promise<QueryResult> {
  return await queryModel(
    apiKey,
    modelId,
    question.question,
    question.tokenLimit,
    undefined,
    { thinking }
  );
}

/**
 * Judge an answer using another AI model
 */
export async function judgeAnswer(
  apiKey: string,
  judgeModelId: string,
  question: Question,
  answer: string
): Promise<JudgmentResult> {
  if (answer.trim().length === 0) {
    return {
      judgment: 'FAIL - Empty model output.',
      passed: false,
      needsHumanReview: false,
      confidence: 'HIGH'
    };
  }

  const judgePrompt = `${question.judgePrompt}

Question: ${question.question}
Answer: ${answer}`;

  const judgeResult = await queryModel(
    apiKey, 
    judgeModelId, 
    judgePrompt, 
    200,
    JUDGE_SYSTEM_PROMPT
  );
  const judgment = judgeResult.content;
  const parsed = parseJudgment(judgment);
  
  return { 
    judgment, 
    passed: parsed.passed,
    needsHumanReview: parsed.needsHumanReview,
    confidence: parsed.confidence
  };
}
