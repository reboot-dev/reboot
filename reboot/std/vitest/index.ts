import { TestCase } from "vitest/node";
import { BasicReporter } from "vitest/reporters";

// Vitest, a 'modern' and powerful test framework isn't able to print
// verbose errors out-of-the-box. Use this vitest reporter to see all
// errors printed to the console.
export class BetterErrorTracingReporter extends BasicReporter {
  onTestCaseResult(testCase: TestCase) {
    if (this.isTTY) {
      return;
    }

    // Let `BasicReporter` print the test case line as usual.
    super.onTestCaseResult(testCase);

    const result = testCase.result();

    if (result.state === "failed") {
      result.errors?.forEach((error) => {
        this.ctx.logger.error(
          {
            name: error?.name,
            error: (error as any).error,
            code: (error as any).code,
          },
          error.stack
        );
      });
    }
  }
}
