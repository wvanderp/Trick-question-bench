import { Question, Model, JudgmentResult } from './types';

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
    };
  }>;
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
): Promise<string> {
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
  
  return data.choices[0].message.content;
}

/**
 * Ask a question to a model
 */
export async function askQuestion(
  apiKey: string,
  model: Model,
  question: Question
): Promise<string> {
  return await queryModel(
    apiKey,
    model.id,
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
  const judgePrompt = `${question.judgePrompt}

Question: ${question.question}
Answer: ${answer}`;

  const judgment = await queryModel(
    apiKey, 
    judgeModelId, 
    judgePrompt, 
    200,
    JUDGE_SYSTEM_PROMPT
  );
  
  // Parse the judgment
  const judgmentUpper = judgment.toUpperCase();
  const passed = judgmentUpper.includes('PASS') && !judgmentUpper.includes('FAIL');
  const needsHumanReview = judgmentUpper.includes('NEEDS_HUMAN_REVIEW');
  
  // Extract confidence if present
  let confidence: string | undefined;
  const confidenceMatch = judgment.match(/CONFIDENCE:\s*(LOW|MEDIUM|HIGH)/i);
  if (confidenceMatch) {
    confidence = confidenceMatch[1].toUpperCase();
  }
  
  return { 
    judgment, 
    passed,
    needsHumanReview,
    confidence
  };
}
