import { describe, expect, it } from 'vitest';
import { isQuestionIdEntry, parseModelId, sanitizeFileName, sortByQuestionId, sortOutputByQuestionId } from '../src/loader';

describe('loader parsing helpers', () => {
  it('detects entries with questionId', () => {
    expect(isQuestionIdEntry({ questionId: 'q-1' })).toBe(true);
    expect(isQuestionIdEntry({ questionId: 10 })).toBe(false);
    expect(isQuestionIdEntry(null)).toBe(false);
  });

  it('parses model id into company and model name', () => {
    expect(parseModelId('openai/gpt-4o')).toEqual({ company: 'openai', modelName: 'gpt-4o' });
    expect(parseModelId('meta-llama/llama-4/scout')).toEqual({ company: 'meta-llama', modelName: 'llama-4/scout' });
    expect(parseModelId('single-name')).toEqual({ company: 'single-name', modelName: 'single-name' });
    expect(parseModelId('')).toEqual({ company: 'unknown', modelName: 'unknown' });
  });

  it('sanitizes invalid filename characters', () => {
    expect(sanitizeFileName('a/b:c*d?e"f<g>h|i\\j')).toBe('a_b_c_d_e_f_g_h_i_j');
  });
});

describe('loader data wrangling helpers', () => {
  it('sorts entries by questionId', () => {
    const input = [{ questionId: 'q-10' }, { questionId: 'q-2' }, { questionId: 'q-1' }];
    expect(sortByQuestionId(input)).toEqual([{ questionId: 'q-1' }, { questionId: 'q-10' }, { questionId: 'q-2' }]);
    expect(input).toEqual([{ questionId: 'q-10' }, { questionId: 'q-2' }, { questionId: 'q-1' }]);
  });

  it('sorts array output when all entries have questionId', () => {
    const sorted = sortOutputByQuestionId([
      { questionId: 'q-2', value: 2 },
      { questionId: 'q-1', value: 1 }
    ]);
    expect(sorted).toEqual([
      { questionId: 'q-1', value: 1 },
      { questionId: 'q-2', value: 2 }
    ]);
  });

  it('sorts object.results when results contains questionId entries', () => {
    const sorted = sortOutputByQuestionId({
      model: 'm',
      results: [
        { questionId: 'q-3', value: 3 },
        { questionId: 'q-1', value: 1 }
      ]
    });
    expect(sorted).toEqual({
      model: 'm',
      results: [
        { questionId: 'q-1', value: 1 },
        { questionId: 'q-3', value: 3 }
      ]
    });
  });

  it('leaves unsupported structures unchanged', () => {
    const input = [{ foo: 'bar' }];
    expect(sortOutputByQuestionId(input)).toBe(input);
  });
});
