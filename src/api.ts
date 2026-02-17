import { Question, Model } from './types';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

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
  maxTokens?: number
): Promise<string> {
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
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
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
): Promise<{ judgment: string; passed: boolean }> {
  const judgePrompt = `${question.judgePrompt}

Question: ${question.question}
Answer: ${answer}

Your response should be either "PASS" or "FAIL" followed by a brief explanation.`;

  const judgment = await queryModel(apiKey, judgeModelId, judgePrompt, 200);
  
  // Check if the judgment starts with PASS or FAIL
  const passed = judgment.trim().toUpperCase().startsWith('PASS');
  
  return { judgment, passed };
}
