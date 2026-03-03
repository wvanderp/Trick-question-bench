export interface JudgeFunctionResult {
  passed: boolean;
  judgment: string;
}

export type JudgeFunction = (answer: string) => JudgeFunctionResult;

/**
 * Judge functions keyed by name.
 * Each function receives the model's answer and returns a result indicating
 * whether the answer passed and a human-readable judgment string.
 */
export const judgeFunctions: Record<string, JudgeFunction> = {
  /**
   * Checks that the model places an arrow character directly under the comma
   * in the phrase "Moldova, the Republic of".
   *
   * Expected answer format (two lines):
   *   Moldova, the Republic of
   *          ^
   * The comma in "Moldova, the Republic of" is at column index 7.
   */
  'arrow-under-comma-moldova': (answer: string): JudgeFunctionResult => {
    const lines = answer.split('\n').filter(line => line.length > 0);

    if (lines.length < 2) {
      return {
        passed: false,
        judgment:
          'FAIL - The answer does not contain at least two lines. ' +
          'Expected one line with "Moldova, the Republic of" and one line with an arrow under the comma.'
      };
    }

    // Find the line that contains "Moldova" and a comma
    const moldovaLineIndex = lines.findIndex(
      line => line.includes('Moldova') && line.includes(',')
    );

    if (moldovaLineIndex === -1) {
      return {
        passed: false,
        judgment: 'FAIL - No line containing "Moldova," was found in the answer.'
      };
    }

    const moldovaLine = lines[moldovaLineIndex];
    const commaIndex = moldovaLine.indexOf(',');

    // The arrow line should immediately follow the Moldova line
    const arrowLineIndex = moldovaLineIndex + 1;
    if (arrowLineIndex >= lines.length) {
      return {
        passed: false,
        judgment: 'FAIL - No arrow line found after the line containing "Moldova,".'
      };
    }

    const arrowLine = lines[arrowLineIndex];

    // Accept upward-pointing or vertical arrow/pointer characters at the comma position
    const arrowChars = ['^', '↑', '|', '*', '▲'];
    const charAtCommaPos = arrowLine[commaIndex];

    if (!charAtCommaPos || !arrowChars.includes(charAtCommaPos)) {
      return {
        passed: false,
        judgment:
          `FAIL - No arrow character found at column ${commaIndex} (under the comma) ` +
          `in the arrow line. Found: "${charAtCommaPos ?? 'nothing'}" at that position. ` +
          `Arrow line: "${arrowLine}"`
      };
    }

    return {
      passed: true,
      judgment:
        `PASS - The answer correctly places an arrow "${charAtCommaPos}" ` +
        `under the comma in "Moldova, the Republic of".`
    };
  }
};
