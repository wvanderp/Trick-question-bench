import { describe, expect, it } from 'vitest';
import { parseJudgment } from '../src/api';

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
