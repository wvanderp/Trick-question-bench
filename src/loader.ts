import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv';
import { Question, QuestionsData, Model, ModelsData } from './types';

const ajv = new Ajv();

/**
 * Load and validate questions from JSON file
 */
export function loadQuestions(filePath: string): Question[] {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as QuestionsData;
  
  // Validate against schema
  const schemaPath = path.join(__dirname, '../schemas/question.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  
  for (const question of data.questions) {
    const valid = ajv.validate(schema, question);
    if (!valid) {
      throw new Error(`Invalid question: ${JSON.stringify(ajv.errors)}`);
    }
  }
  
  return data.questions;
}

/**
 * Load and validate models from JSON file
 */
export function loadModels(filePath: string): Model[] {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ModelsData;
  return data.models;
}

/**
 * Ensure output directory exists
 */
export function ensureOutputDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Save result to a JSON file
 */
export function saveResult(outputDir: string, fileName: string, data: unknown): void {
  ensureOutputDir(outputDir);
  const filePath = path.join(outputDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}
