import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { parseJudgment, queryModel, fetchGenerationCost, fetchGenerationStats } from '../src/api';

describe('api parsing helpers', () => {
  it('parses PASS verdicts', () => {
    const parsed = parseJudgment('PASS - Correct answer. CONFIDENCE: HIGH');
    expect(parsed).toEqual({
      passed: true,
      needsHumanReview: false,
      confidence: 'HIGH'
    });
  });

  it('parses FAIL verdicts and human review flag', () => {
    const parsed = parseJudgment('FAIL - Ambiguous result.\nNEEDS_HUMAN_REVIEW\nCONFIDENCE: low');
    expect(parsed).toEqual({
      passed: false,
      needsHumanReview: true,
      confidence: 'LOW'
    });
  });

  it('handles missing confidence', () => {
    const parsed = parseJudgment('FAIL - No confidence marker included');
    expect(parsed).toEqual({
      passed: false,
      needsHumanReview: false,
      confidence: undefined
    });
  });
});

describe('queryModel usage and generationId', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('captures usage tokens from response', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'gen-abc123',
        choices: [{ message: { content: 'Hello world' } }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15
        }
      })
    } as Response);

    const result = await queryModel('test-key', 'test-model', 'Hi');

    expect(result.content).toBe('Hello world');
    expect(result.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15
    });
    expect(result.generationId).toBe('gen-abc123');
    expect(result.roundTripMs).toBeTypeOf('number');
  });

  it('returns undefined usage when not provided in response', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'No usage info' } }]
      })
    } as Response);

    const result = await queryModel('test-key', 'test-model', 'Hi');

    expect(result.content).toBe('No usage info');
    expect(result.usage).toBeUndefined();
    expect(result.generationId).toBeUndefined();
    expect(result.usageCostUsd).toBeUndefined();
  });

  it('captures usage.cost when provided', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'gen-cost',
        choices: [{ message: { content: 'Cost included' } }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
          cost: 0.00123
        }
      })
    } as Response);

    const result = await queryModel('test-key', 'test-model', 'Hi');

    expect(result.usageCostUsd).toBe(0.00123);
  });

  it('returns undefined usage when usage payload is malformed', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'gen-malformed-usage',
        choices: [{ message: { content: 'Malformed usage payload' } }],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 'oops',
          total_tokens: 20
        }
      })
    } as Response);

    const result = await queryModel('test-key', 'test-model', 'Hi');

    expect(result.content).toBe('Malformed usage payload');
    expect(result.usage).toBeUndefined();
    expect(result.generationId).toBe('gen-malformed-usage');
  });

  it('captures reasoning alongside usage', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'gen-xyz',
        choices: [{ message: { content: 'Answer', reasoning: 'Because...' } }],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 10,
          total_tokens: 30
        }
      })
    } as Response);

    const result = await queryModel('test-key', 'test-model', 'Hi');

    expect(result.content).toBe('Answer');
    expect(result.reasoning).toBe('Because...');
    expect(result.usage).toEqual({
      promptTokens: 20,
      completionTokens: 10,
      totalTokens: 30
    });
    expect(result.generationId).toBe('gen-xyz');
  });
});

describe('fetchGenerationCost', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns cost on first attempt', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { total_cost: 0.00123 } })
    } as Response);

    const cost = await fetchGenerationCost('test-key', 'gen-abc', 1, 0);

    expect(cost).toBe(0.00123);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries on non-ok response and succeeds', async () => {
    fetchSpy
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { total_cost: 0.005 } })
      } as Response);

    const cost = await fetchGenerationCost('test-key', 'gen-abc', 3, 0);

    expect(cost).toBe(0.005);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('retries when cost is missing and eventually returns undefined', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: {} })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: {} })
      } as Response);

    const cost = await fetchGenerationCost('test-key', 'gen-abc', 2, 0);

    expect(cost).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('returns undefined after all retries fail', async () => {
    fetchSpy
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockResolvedValueOnce({ ok: false } as Response);

    const cost = await fetchGenerationCost('test-key', 'gen-abc', 3, 0);

    expect(cost).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('sends correct authorization header', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { total_cost: 0.001 } })
    } as Response);

    await fetchGenerationCost('my-api-key', 'gen-test', 1, 0);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('gen-test'),
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer my-api-key' }
      })
    );
  });
});

describe('fetchGenerationStats', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns cost and latency when both are present', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { total_cost: 0.00123, generation_time: 1500 } })
    } as Response);

    const stats = await fetchGenerationStats('test-key', 'gen-abc', 1, 0);

    expect(stats.costUsd).toBe(0.00123);
    expect(stats.latencyMs).toBe(1500);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps zero cost values and associated latency', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { total_cost: 0, generation_time: 400 } })
    } as Response);

    const stats = await fetchGenerationStats('test-key', 'gen-zero-cost', 1, 0);

    expect(stats.costUsd).toBe(0);
    expect(stats.latencyMs).toBe(400);
  });

  it('returns cost only when latency is absent', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { total_cost: 0.005 } })
    } as Response);

    const stats = await fetchGenerationStats('test-key', 'gen-abc', 1, 0);

    expect(stats.costUsd).toBe(0.005);
    expect(stats.latencyMs).toBeUndefined();
  });

  it('falls back to upstream_inference_cost when total_cost is missing', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { upstream_inference_cost: 0.0042, generation_time: 700 } })
    } as Response);

    const stats = await fetchGenerationStats('test-key', 'gen-abc', 1, 0);

    expect(stats.costUsd).toBe(0.0042);
    expect(stats.latencyMs).toBe(700);
  });

  it('uses latency field as fallback when generation_time is absent', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { total_cost: 0.001, latency: 800 } })
    } as Response);

    const stats = await fetchGenerationStats('test-key', 'gen-abc', 1, 0);

    expect(stats.costUsd).toBe(0.001);
    expect(stats.latencyMs).toBe(800);
  });

  it('prefers generation_time over latency', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { total_cost: 0.001, generation_time: 1200, latency: 800 } })
    } as Response);

    const stats = await fetchGenerationStats('test-key', 'gen-abc', 1, 0);

    expect(stats.latencyMs).toBe(1200);
  });

  it('retries when cost is missing and keeps latency when exhausted', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { generation_time: 500 } })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { generation_time: 500 } })
      } as Response);

    const stats = await fetchGenerationStats('test-key', 'gen-abc', 2, 0);

    expect(stats.costUsd).toBeUndefined();
    expect(stats.latencyMs).toBe(500);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('falls back to usage when total_cost is missing', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { usage: 0.0035, generation_time: 650 } })
    } as Response);

    const stats = await fetchGenerationStats('test-key', 'gen-usage', 1, 0);

    expect(stats.costUsd).toBe(0.0035);
    expect(stats.latencyMs).toBe(650);
  });

  it('retries on non-ok responses and succeeds', async () => {
    fetchSpy
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { total_cost: 0.002, generation_time: 900 } })
      } as Response);

    const stats = await fetchGenerationStats('test-key', 'gen-abc', 3, 0);

    expect(stats.costUsd).toBe(0.002);
    expect(stats.latencyMs).toBe(900);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('returns empty object when all retries fail', async () => {
    fetchSpy
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockResolvedValueOnce({ ok: false } as Response);

    const stats = await fetchGenerationStats('test-key', 'gen-abc', 2, 0);

    expect(stats).toEqual({});
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
