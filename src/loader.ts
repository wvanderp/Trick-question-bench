import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv';
import { Question, QuestionsData } from './types';

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
export function loadModels(filePath: string): string[] {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as string[];
  return data;
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

/**
 * Parse model id into company and model name
 */
export function parseModelId(modelId: string): { company: string; modelName: string } {
  const [company = 'unknown', ...modelParts] = modelId.split('/');
  const modelName = modelParts.join('/') || company;
  return { company, modelName };
}

/**
 * Sanitize text for safe file names
 */
export function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '_');
}

/**
 * Save model results to output/{company}/{model}.json
 */
export function saveModelResults(outputDir: string, modelId: string, data: unknown): void {
  const { company, modelName } = parseModelId(modelId);
  const companyDir = path.join(outputDir, sanitizeFileName(company));
  const fileName = `${sanitizeFileName(modelName)}.json`;
  saveResult(companyDir, fileName, data);
}
