#!/usr/bin/env node
/**
 * Simple test to verify the system can load and validate data files
 */

import * as path from 'path';
import { loadQuestions, loadModels } from './loader';

const questionsPath = path.join(__dirname, '../data/questions.json');
const modelsPath = path.join(__dirname, '../data/models.json');

console.log('Testing data loading and validation...\n');

try {
  console.log('Loading questions...');
  const questions = loadQuestions(questionsPath);
  console.log(`✓ Successfully loaded ${questions.length} questions`);
  
  questions.forEach(q => {
    console.log(`  - ${q.id}: ${q.question.substring(0, 50)}${q.question.length > 50 ? '...' : ''}`);
  });
  
  console.log('\nLoading models...');
  const models = loadModels(modelsPath);
  console.log(`✓ Successfully loaded ${models.length} models`);
  
  models.forEach(m => {
    console.log(`  - ${m}`);
  });
  
  console.log('\n✓ All tests passed!');
  process.exit(0);
} catch (error) {
  console.error('\n✗ Test failed:', error);
  process.exit(1);
}
