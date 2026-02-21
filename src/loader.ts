import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv';
import { Question, QuestionsData, TestResult } from './types';

const ajv = new Ajv();

export function isQuestionIdEntry(value: unknown): value is { questionId: string } {
  return typeof value === 'object' && value !== null && 'questionId' in value && typeof (value as { questionId?: unknown }).questionId === 'string';
}

export function sortByQuestionId<T extends { questionId: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.questionId.localeCompare(b.questionId));
}

export function sortOutputByQuestionId(data: unknown): unknown {
  if (Array.isArray(data) && data.every(isQuestionIdEntry)) {
    return sortByQuestionId(data);
  }

  if (typeof data === 'object' && data !== null && 'results' in data) {
    const objectData = data as Record<string, unknown>;
    const results = objectData.results;

    if (Array.isArray(results) && results.every(isQuestionIdEntry)) {
      return {
        ...objectData,
        results: sortByQuestionId(results)
      };
    }
  }

  return data;
}

export function mergeQuestionIdEntries<T extends { questionId: string }>(existing: T[], incoming: T[]): T[] {
  if (incoming.length === 0) {
    return existing;
  }

  const mergedByQuestionId = new Map<string, T>();

  for (const item of existing) {
    mergedByQuestionId.set(item.questionId, item);
  }

  for (const item of incoming) {
    mergedByQuestionId.set(item.questionId, item);
  }

  return Array.from(mergedByQuestionId.values());
}

export function parseQuestionIdEntries(data: unknown): { questionId: string }[] | null {
  if (!Array.isArray(data) || !data.every(isQuestionIdEntry)) {
    return null;
  }

  return data;
}

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

  const incomingQuestionEntries = parseQuestionIdEntries(data);
  if (incomingQuestionEntries) {
    const hasExistingFile = fs.existsSync(filePath);
    let existingQuestionEntries: { questionId: string }[] = [];

    if (hasExistingFile) {
      const existingData = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
      existingQuestionEntries = parseQuestionIdEntries(existingData) ?? [];
    }

    if (incomingQuestionEntries.length === 0 && existingQuestionEntries.length > 0) {
      return;
    }

    const mergedData = mergeQuestionIdEntries(existingQuestionEntries, incomingQuestionEntries);
    const sortedData = sortOutputByQuestionId(mergedData);
    fs.writeFileSync(filePath, JSON.stringify(sortedData, null, 2), 'utf-8');
    return;
  }

  const sortedData = sortOutputByQuestionId(data);
  fs.writeFileSync(filePath, JSON.stringify(sortedData, null, 2), 'utf-8');
}

/**
 * Parse model id into company and model name
 */
export function parseModelId(modelId: string): { company: string; modelName: string } {
  const [rawCompany, ...modelParts] = modelId.split('/');
  const company = rawCompany || 'unknown';
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

/**
 * Load model results from output/{company}/{model}.json
 */
export function loadModelResults(outputDir: string, modelId: string): TestResult[] {
  const { company, modelName } = parseModelId(modelId);
  const filePath = path.join(outputDir, sanitizeFileName(company), `${sanitizeFileName(modelName)}.json`);

  if (!fs.existsSync(filePath)) {
    return [];
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
  return Array.isArray(data) ? (data as TestResult[]) : [];
}
