import * as path from 'path';
import * as dotenv from 'dotenv';
import { loadQuestions, loadModels, saveModelResults, loadModelResults } from './loader';
import { askQuestion, judgeAnswer, JUDGE_SYSTEM_PROMPT } from './api';
import { TestResult } from './types';
import { buildPendingPairs, getModelLimitFromArgs, upsertModelResult } from './benchmark';

// Load environment variables
dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const JUDGE_MODEL = process.env.JUDGE_MODEL || 'openai/gpt-4o';

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
  const modelLimit = getModelLimitFromArgs(process.argv);
  const outputDir = path.join(__dirname, '../output');
  const { pendingPairs, pendingByModel, resultsByModel } = buildPendingPairs(allModels, questions, outputDir, {
    judgeSystemPrompt: JUDGE_SYSTEM_PROMPT,
    judgeModel: JUDGE_MODEL,
    loadModelResultsFn: loadModelResults,
    saveModelResultsFn: saveModelResults
  });

  const modelsWithPending = allModels.filter(modelId => pendingByModel.has(modelId));
  const models = typeof modelLimit === 'number' ? modelsWithPending.slice(0, modelLimit) : modelsWithPending;

  console.log(`Loaded ${questions.length} questions and ${allModels.length} models`);
  console.log(`Pending model/question pairs: ${pendingPairs.length}`);
  if (typeof modelLimit === 'number') {
    console.log(`Model limit active: first ${modelLimit} models with pending work`);
  }
  console.log(`Models selected for this run: ${models.length}`);
  console.log(`Using judge model: ${JUDGE_MODEL}\n`);

  if (models.length === 0) {
    console.log('No pending model/question pairs found. Everything is up to date.');
    return;
  }

  const results: TestResult[] = [];
  let humanReviewCount = 0;
  let skippedCount = 0;
  let plannedPairCount = 0;

  // Test each model with each pending question
  for (const modelId of models) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing model: ${modelId}`);
    console.log('='.repeat(60));

    const modelPending = pendingByModel.get(modelId) ?? [];
    const modelSkipped = questions.length - modelPending.length;
    skippedCount += modelSkipped;
    plannedPairCount += modelPending.length;

    console.log(`Planned questions for this model: ${modelPending.length}`);
    if (modelSkipped > 0) {
      console.log(`Already up-to-date for this model: ${modelSkipped}`);
    }

    for (const { question, hash } of modelPending) {

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
  console.log(`  Planned tests: ${plannedPairCount}`);
  console.log(`  Total tests: ${results.length}`);
  console.log(`  Passed: ${results.filter(r => r.passed).length}`);
  console.log(`  Failed: ${results.filter(r => !r.passed).length}`);
  console.log(`  Needs human review: ${humanReviewCount}`);
  console.log(`  Skipped (already up-to-date): ${skippedCount}`);
  console.log(`\nResults saved to: ${outputDir}`);
}

// Run the benchmark
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
