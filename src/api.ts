import { Question, JudgmentResult } from './types';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

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
  choices: Array<{
    message: {
      content: string;
      reasoning?: string | null;
    };
  }>;
}

export interface QueryResult {
  content: string;
  reasoning?: string;
}

export interface ParsedJudgment {
  passed: boolean;
  needsHumanReview: boolean;
  confidence?: string;
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
  systemPrompt?: string
): Promise<QueryResult> {
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

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/wvanderp/Trick-question-bench',
      'X-Title': 'Trick Question Benchmark'
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as OpenRouterResponse;
  
  // Validate response structure
  if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
    throw new Error('Invalid response structure from OpenRouter API');
  }
  
  if (!data.choices[0].message || typeof data.choices[0].message.content !== 'string') {
    throw new Error('Invalid message structure in OpenRouter API response');
  }

  const result: QueryResult = {
    content: data.choices[0].message.content
  };

  // Capture reasoning if provided by the model
  if (data.choices[0].message.reasoning) {
    result.reasoning = data.choices[0].message.reasoning;
  }
  
  return result;
}

/**
 * Ask a question to a model
 */
export async function askQuestion(
  apiKey: string,
  modelId: string,
  question: Question
): Promise<QueryResult> {
  return await queryModel(
    apiKey,
    modelId,
    question.question,
    question.tokenLimit
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
