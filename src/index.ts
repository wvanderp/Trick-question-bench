import * as path from 'path';
import * as dotenv from 'dotenv';
import { loadQuestions, loadModels, saveModelResults, loadModelResults } from './loader';
import { askQuestion, judgeAnswer, JUDGE_SYSTEM_PROMPT } from './api';
import { TestResult } from './types';
import { generateHash, createVersionInfo } from './hash';

// Load environment variables
dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const JUDGE_MODEL = process.env.JUDGE_MODEL || 'openai/gpt-4o';

function getModelLimitFromArgs(): number | undefined {
  const arg = process.argv.find(value => value.startsWith('--model-limit='));
  if (!arg) {
    return undefined;
  }

  const rawLimit = arg.split('=')[1];
  const parsedLimit = Number.parseInt(rawLimit, 10);

  if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
    throw new Error(`Invalid --model-limit value: ${rawLimit}`);
  }

  return parsedLimit;
}

function isJudgedResult(result: TestResult): boolean {
  return (
    result.modelId.length > 0 &&
    result.questionId.length > 0 &&
    result.hash.length > 0 &&
    result.judgment.length > 0 &&
    result.judgment !== 'ERROR'
  );
}

function upsertModelResult(results: TestResult[], result: TestResult): void {
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].questionId === result.questionId) {
      results.splice(i, 1);
    }
  }
  results.push(result);
}

function dedupeModelResults(results: TestResult[]): TestResult[] {
  const seenQuestionIds = new Set<string>();
  const dedupedResults: TestResult[] = [];

  for (let i = results.length - 1; i >= 0; i--) {
    const result = results[i];
    if (seenQuestionIds.has(result.questionId)) {
      continue;
    }
    seenQuestionIds.add(result.questionId);
    dedupedResults.unshift(result);
  }

  return dedupedResults;
}

/**
 * Main runner function
 */
async function main() {
  // Validate API key
  if (!OPENROUTER_API_KEY) {
    console.error('Error: OPENROUTER_API_KEY environment variable is not set');
    console.error('Please create a .env file with your OpenRouter API key');
    process.exit(1);
  }

  // Load questions and models
  const questionsPath = path.join(__dirname, '../data/questions.json');
  const modelsPath = path.join(__dirname, '../data/models.json');
  
  const questions = loadQuestions(questionsPath);
  const allModels = loadModels(modelsPath);
  const modelLimit = getModelLimitFromArgs();
  const models = typeof modelLimit === 'number' ? allModels.slice(0, modelLimit) : allModels;

  console.log(`Loaded ${questions.length} questions and ${models.length} models`);
  if (typeof modelLimit === 'number') {
    console.log(`Model limit active: first ${modelLimit} models`);
  }
  console.log(`Using judge model: ${JUDGE_MODEL}\n`);

  const results: TestResult[] = [];
  const resultsByModel: Record<string, TestResult[]> = {};
  const outputDir = path.join(__dirname, '../output');
  let humanReviewCount = 0;
  let skippedCount = 0;

  // Test each model with each question
  for (const modelId of models) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing model: ${modelId}`);
    console.log('='.repeat(60));

    const existingModelResults = loadModelResults(outputDir, modelId);
    resultsByModel[modelId] = dedupeModelResults(existingModelResults);

    if (resultsByModel[modelId].length !== existingModelResults.length) {
      saveModelResults(outputDir, modelId, resultsByModel[modelId]);
    }
    const completedKeys = new Set(
      existingModelResults
        .filter(isJudgedResult)
        .map(result => `${result.questionId}:${result.hash}`)
    );

    for (const question of questions) {
      const versionInfo = createVersionInfo(question, JUDGE_SYSTEM_PROMPT, JUDGE_MODEL);
      const hash = generateHash(versionInfo);
      const comboKey = `${question.id}:${hash}`;

      if (completedKeys.has(comboKey)) {
        console.log(`\nQuestion: ${question.id}`);
        console.log(`  ↷ Skipping (already answered and judged for this model + judge config)`);
        skippedCount++;
        continue;
      }

      console.log(`\nQuestion: ${question.id}`);
      console.log(`  Q: ${question.question}`);

      try {
        // Ask the question
        const { content: answer, reasoning } = await askQuestion(OPENROUTER_API_KEY, modelId, question);
        console.log(`  A: ${answer}`);
        if (reasoning) {
          console.log(`  Reasoning: ${reasoning.substring(0, 200)}${reasoning.length > 200 ? '...' : ''}`);
        }

        // Judge the answer
        const { judgment, passed, needsHumanReview, confidence } = await judgeAnswer(
          OPENROUTER_API_KEY,
          JUDGE_MODEL,
          question,
          answer
        );
        
        console.log(`  Judge: ${judgment}`);
        console.log(`  Result: ${passed ? '✓ PASS' : '✗ FAIL'}`);
        if (needsHumanReview) {
          console.log(`  ⚠️  NEEDS HUMAN REVIEW`);
          humanReviewCount++;
        }
        if (confidence) {
          console.log(`  Confidence: ${confidence}`);
        }

        // Store the result
        const result: TestResult = {
          questionId: question.id,
          modelId: modelId,
          modelName: modelId,
          question: question.question,
          answer,
          ...(reasoning && { reasoning }),
          judgment,
          passed,
          needsHumanReview,
          timestamp: new Date().toISOString(),
          hash
        };

        results.push(result);
        if (!resultsByModel[modelId]) {
          resultsByModel[modelId] = [];
        }
        upsertModelResult(resultsByModel[modelId], result);
        completedKeys.add(comboKey);
        saveModelResults(outputDir, modelId, resultsByModel[modelId]);

      } catch (error) {
        console.error(`  Error: ${error instanceof Error ? error.message : String(error)}`);

        // Store error result
        const result: TestResult = {
          questionId: question.id,
          modelId: modelId,
          modelName: modelId,
          question: question.question,
          answer: `ERROR: ${error instanceof Error ? error.message : String(error)}`,
          judgment: 'ERROR',
          passed: false,
          needsHumanReview: true,
          timestamp: new Date().toISOString(),
          hash
        };
        
        results.push(result);
        upsertModelResult(resultsByModel[modelId], result);
        saveModelResults(outputDir, modelId, resultsByModel[modelId]);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Save grouped model results
  for (const modelId of Object.keys(resultsByModel)) {
    saveModelResults(outputDir, modelId, resultsByModel[modelId]);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('Summary:');
  console.log(`  Total tests: ${results.length}`);
  console.log(`  Passed: ${results.filter(r => r.passed).length}`);
  console.log(`  Failed: ${results.filter(r => !r.passed).length}`);
  console.log(`  Needs human review: ${humanReviewCount}`);
  console.log(`  Skipped (already judged): ${skippedCount}`);
  console.log(`\nResults saved to: ${outputDir}`);
}

// Run the benchmark
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
