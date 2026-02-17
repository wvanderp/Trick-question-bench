import * as path from 'path';
import * as dotenv from 'dotenv';
import { loadQuestions, loadModels, saveResult, saveModelResults } from './loader';
import { askQuestion, judgeAnswer, JUDGE_SYSTEM_PROMPT } from './api';
import { TestResult } from './types';
import { generateHash, createVersionInfo } from './hash';

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
  const models = loadModels(modelsPath);

  console.log(`Loaded ${questions.length} questions and ${models.length} models`);
  console.log(`Using judge model: ${JUDGE_MODEL}\n`);

  const results: TestResult[] = [];
  const resultsByModel: Record<string, TestResult[]> = {};
  const outputDir = path.join(__dirname, '../output');
  let humanReviewCount = 0;

  // Test each model with each question
  for (const modelId of models) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing model: ${modelId}`);
    console.log('='.repeat(60));

    for (const question of questions) {
      console.log(`\nQuestion: ${question.id}`);
      console.log(`  Q: ${question.question}`);

      try {
        // Ask the question
        const answer = await askQuestion(OPENROUTER_API_KEY, modelId, question);
        console.log(`  A: ${answer}`);

        // Judge the answer
        const { judgment, passed, needsHumanReview, confidence } = await judgeAnswer(
          OPENROUTER_API_KEY,
          JUDGE_MODEL,
          question,
          answer
        );
        
        // Generate hash for this test
        const versionInfo = createVersionInfo(question, JUDGE_SYSTEM_PROMPT, JUDGE_MODEL);
        const hash = generateHash(versionInfo);
        
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
        resultsByModel[modelId].push(result);
        saveModelResults(outputDir, modelId, resultsByModel[modelId]);

      } catch (error) {
        console.error(`  Error: ${error instanceof Error ? error.message : String(error)}`);
        
        // Generate hash even for errors
        const versionInfo = createVersionInfo(question, JUDGE_SYSTEM_PROMPT, JUDGE_MODEL);
        const hash = generateHash(versionInfo);
        
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
        if (!resultsByModel[modelId]) {
          resultsByModel[modelId] = [];
        }
        resultsByModel[modelId].push(result);
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

  // Save summary results
  saveResult(outputDir, 'summary.json', {
    totalTests: results.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    needsHumanReview: results.filter(r => r.needsHumanReview).length,
    timestamp: new Date().toISOString(),
    judgeModel: JUDGE_MODEL,
    results
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log('Summary:');
  console.log(`  Total tests: ${results.length}`);
  console.log(`  Passed: ${results.filter(r => r.passed).length}`);
  console.log(`  Failed: ${results.filter(r => !r.passed).length}`);
  console.log(`  Needs human review: ${humanReviewCount}`);
  console.log(`\nResults saved to: ${outputDir}`);
}

// Run the benchmark
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
