// @ts-nocheck
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..');
const outputDir = path.join(repoRoot, 'output');
const targetDir = path.join(appRoot, 'public', 'generated');
const targetFile = path.join(targetDir, 'benchmark-data.json');

const asRate = (passed, total) => (total === 0 ? 0 : Number(((passed / total) * 100).toFixed(2)));

const ensureArray = (value, source) => {
  if (!Array.isArray(value)) {
    throw new Error(`Expected array in ${source}`);
  }
  return value;
};

const collectJsonFiles = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return collectJsonFiles(fullPath);
      }
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        return [];
      }
      if (entry.name === 'summary.json') {
        return [];
      }
      return [fullPath];
    }),
  );

  return files.flat();
};

const addAggregate = (map, id, label, result) => {
  if (!map.has(id)) {
    map.set(id, {
      id,
      label,
      total: 0,
      passed: 0,
      failed: 0,
      needsHumanReview: 0,
      passRate: 0,
    });
  }

  const entry = map.get(id);
  entry.total += 1;
  entry.passed += result.passed ? 1 : 0;
  entry.failed += result.passed ? 0 : 1;
  entry.needsHumanReview += result.needsHumanReview ? 1 : 0;
};

const finalizeAggregates = (map) =>
  Array.from(map.values())
    .map((entry) => ({
      ...entry,
      passRate: asRate(entry.passed, entry.total),
    }))
    .sort((a, b) => {
      if (b.total !== a.total) {
        return b.total - a.total;
      }
      return a.label.localeCompare(b.label);
    });

const run = async () => {
  const files = await collectJsonFiles(outputDir);

  if (files.length === 0) {
    throw new Error(`No result JSON files found under ${outputDir}`);
  }

  const providers = new Map();
  const models = new Map();
  const questions = new Map();
  const results = [];

  for (const filePath of files) {
    const text = await fs.readFile(filePath, 'utf8');
    const parsed = ensureArray(JSON.parse(text), filePath);

    for (let index = 0; index < parsed.length; index += 1) {
      const row = parsed[index];
      if (!row || typeof row !== 'object') {
        continue;
      }

      const modelId = String(row.modelId ?? 'unknown/unknown');
      const modelName = String(row.modelName ?? modelId);
      const questionId = String(row.questionId ?? `unknown-question-${index}`);
      const question = String(row.question ?? '');
      const provider = modelId.includes('/') ? modelId.split('/')[0] : 'unknown';

      const normalized = {
        id: `${modelId}::${questionId}::${index}`,
        modelId,
        modelName,
        provider,
        questionId,
        question,
        answer: String(row.answer ?? ''),
        reasoning: typeof row.reasoning === 'string' ? row.reasoning : undefined,
        judgment: String(row.judgment ?? ''),
        passed: Boolean(row.passed),
        needsHumanReview: Boolean(row.needsHumanReview),
        timestamp: String(row.timestamp ?? ''),
        hash: String(row.hash ?? ''),
      };

      results.push(normalized);

      addAggregate(providers, provider, provider, normalized);
      addAggregate(models, modelId, modelName, normalized);
      addAggregate(questions, questionId, question, normalized);
    }
  }

  const passed = results.filter((item) => item.passed).length;
  const failed = results.length - passed;
  const needsHumanReview = results.filter((item) => item.needsHumanReview).length;

  const output = {
    generatedAt: new Date().toISOString(),
    totals: {
      models: new Set(results.map((item) => item.modelId)).size,
      results: results.length,
      passed,
      failed,
      needsHumanReview,
      passRate: asRate(passed, results.length),
    },
    providers: finalizeAggregates(providers),
    models: finalizeAggregates(models),
    questions: finalizeAggregates(questions),
    results: results.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
  };

  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(targetFile, JSON.stringify(output, null, 2));

  // eslint-disable-next-line no-console
  console.log(`Precomputed ${output.totals.results} results into ${path.relative(appRoot, targetFile)}`);
};

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
