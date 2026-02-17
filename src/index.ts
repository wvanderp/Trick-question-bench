import * as path from 'path';
import * as dotenv from 'dotenv';
import { loadQuestions, loadModels, saveResult } from './loader';
import { askQuestion, judgeAnswer } from './api';
import { TestResult } from './types';

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
  const outputDir = path.join(__dirname, '../output');

  // Test each model with each question
  for (const model of models) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing model: ${model.name} (${model.id})`);
    console.log('='.repeat(60));

    for (const question of questions) {
      console.log(`\nQuestion: ${question.id}`);
      console.log(`  Q: ${question.question}`);

      try {
        // Ask the question
        const answer = await askQuestion(OPENROUTER_API_KEY, model, question);
        console.log(`  A: ${answer}`);

        // Judge the answer
        const { judgment, passed } = await judgeAnswer(
          OPENROUTER_API_KEY,
          JUDGE_MODEL,
          question,
          answer
        );
        
        console.log(`  Judge: ${judgment}`);
        console.log(`  Result: ${passed ? '✓ PASS' : '✗ FAIL'}`);

        // Store the result
        const result: TestResult = {
          questionId: question.id,
          modelId: model.id,
          modelName: model.name,
          question: question.question,
          answer,
          judgment,
          passed,
          timestamp: new Date().toISOString()
        };

        results.push(result);

        // Save individual result
        const fileName = `${model.id.replace(/\//g, '_')}_${question.id}.json`;
        saveResult(outputDir, fileName, result);

      } catch (error) {
        console.error(`  Error: ${error instanceof Error ? error.message : String(error)}`);
        
        // Store error result
        const result: TestResult = {
          questionId: question.id,
          modelId: model.id,
          modelName: model.name,
          question: question.question,
          answer: `ERROR: ${error instanceof Error ? error.message : String(error)}`,
          judgment: 'ERROR',
          passed: false,
          timestamp: new Date().toISOString()
        };
        
        results.push(result);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Save summary results
  saveResult(outputDir, 'summary.json', {
    totalTests: results.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    timestamp: new Date().toISOString(),
    results
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log('Summary:');
  console.log(`  Total tests: ${results.length}`);
  console.log(`  Passed: ${results.filter(r => r.passed).length}`);
  console.log(`  Failed: ${results.filter(r => !r.passed).length}`);
  console.log(`\nResults saved to: ${outputDir}`);
}

// Run the benchmark
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
