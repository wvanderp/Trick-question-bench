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
const roundTo = (value, places = 2) => Number(value.toFixed(places));

const toFiniteNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
};

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
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      totalLatencyMs: 0,
      tokenSampleCount: 0,
      costSampleCount: 0,
      latencySampleCount: 0,
      avgPromptTokens: 0,
      avgCompletionTokens: 0,
      avgTotalTokens: 0,
      avgCostUsd: 0,
      avgLatencyMs: 0,
    });
  }

  const entry = map.get(id);
  entry.total += 1;
  entry.passed += result.passed ? 1 : 0;
  entry.failed += result.passed ? 0 : 1;
  entry.needsHumanReview += result.needsHumanReview ? 1 : 0;

  if (toFiniteNumber(result.totalTokens) !== undefined) {
    entry.totalPromptTokens += result.promptTokens ?? 0;
    entry.totalCompletionTokens += result.completionTokens ?? 0;
    entry.totalTokens += result.totalTokens;
    entry.tokenSampleCount += 1;
  }

  if (toFiniteNumber(result.costUsd) !== undefined) {
    entry.totalCostUsd += result.costUsd;
    entry.costSampleCount += 1;
  }

  if (toFiniteNumber(result.latencyMs) !== undefined) {
    entry.totalLatencyMs += result.latencyMs;
    entry.latencySampleCount += 1;
  }
};

const finalizeAggregates = (map) =>
  Array.from(map.values())
    .map((entry) => ({
      ...entry,
      passRate: asRate(entry.passed, entry.total),
      avgPromptTokens: entry.tokenSampleCount > 0 ? roundTo(entry.totalPromptTokens / entry.tokenSampleCount, 2) : 0,
      avgCompletionTokens:
        entry.tokenSampleCount > 0 ? roundTo(entry.totalCompletionTokens / entry.tokenSampleCount, 2) : 0,
      avgTotalTokens: entry.tokenSampleCount > 0 ? roundTo(entry.totalTokens / entry.tokenSampleCount, 2) : 0,
      avgCostUsd: entry.costSampleCount > 0 ? roundTo(entry.totalCostUsd / entry.costSampleCount, 6) : 0,
      avgLatencyMs: entry.latencySampleCount > 0 ? roundTo(entry.totalLatencyMs / entry.latencySampleCount, 0) : 0,
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

  const metricTotals = {
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalTokens: 0,
    totalCostUsd: 0,
    totalLatencyMs: 0,
    tokenSampleCount: 0,
    costSampleCount: 0,
    latencySampleCount: 0,
  };

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
        promptTokens: toFiniteNumber(row.usage?.promptTokens),
        completionTokens: toFiniteNumber(row.usage?.completionTokens),
        totalTokens: toFiniteNumber(row.usage?.totalTokens),
        costUsd: toFiniteNumber(row.costUsd),
        latencyMs: toFiniteNumber(row.latencyMs),
      };

      if (normalized.totalTokens !== undefined) {
        metricTotals.totalPromptTokens += normalized.promptTokens ?? 0;
        metricTotals.totalCompletionTokens += normalized.completionTokens ?? 0;
        metricTotals.totalTokens += normalized.totalTokens;
        metricTotals.tokenSampleCount += 1;
      }

      if (normalized.costUsd !== undefined) {
        metricTotals.totalCostUsd += normalized.costUsd;
        metricTotals.costSampleCount += 1;
      }

      if (normalized.latencyMs !== undefined) {
        metricTotals.totalLatencyMs += normalized.latencyMs;
        metricTotals.latencySampleCount += 1;
      }

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
      metrics: {
        totalPromptTokens: metricTotals.totalPromptTokens,
        totalCompletionTokens: metricTotals.totalCompletionTokens,
        totalTokens: metricTotals.totalTokens,
        totalCostUsd: roundTo(metricTotals.totalCostUsd, 6),
        totalLatencyMs: metricTotals.totalLatencyMs,
        tokenSampleCount: metricTotals.tokenSampleCount,
        costSampleCount: metricTotals.costSampleCount,
        latencySampleCount: metricTotals.latencySampleCount,
        avgPromptTokens:
          metricTotals.tokenSampleCount > 0
            ? roundTo(metricTotals.totalPromptTokens / metricTotals.tokenSampleCount, 2)
            : 0,
        avgCompletionTokens:
          metricTotals.tokenSampleCount > 0
            ? roundTo(metricTotals.totalCompletionTokens / metricTotals.tokenSampleCount, 2)
            : 0,
        avgTotalTokens:
          metricTotals.tokenSampleCount > 0 ? roundTo(metricTotals.totalTokens / metricTotals.tokenSampleCount, 2) : 0,
        avgCostUsd:
          metricTotals.costSampleCount > 0 ? roundTo(metricTotals.totalCostUsd / metricTotals.costSampleCount, 6) : 0,
        avgLatencyMs:
          metricTotals.latencySampleCount > 0
            ? roundTo(metricTotals.totalLatencyMs / metricTotals.latencySampleCount, 0)
            : 0,
      },
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
