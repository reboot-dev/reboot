import { DefaultReporter, TestCase } from "vitest/node";

// Vitest, a 'modern' and powerful test framework isn't able to print
// verbose errors out-of-the-box. Use this vitest reporter to see all
// errors printed to the console.
//
// Built on `DefaultReporter` without its summary, which is what the
// `basic` reporter of Vitest 3 was before Vitest 4 removed it.
export class BetterErrorTracingReporter extends DefaultReporter {
  constructor() {
    super({ summary: false });
  }

  onTestCaseResult(testCase: TestCase) {
    if (this.isTTY) {
      return;
    }

    // Let `DefaultReporter` print the test case line as usual.
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
