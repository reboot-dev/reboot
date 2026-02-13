import { TaskResultPack } from "vitest";
import { BasicReporter } from "vitest/reporters";

// Vitest, a 'modern' and powerful test framework isn't able to print verbose errors out-of-the-box.
// Use this vitest reporter to see all errors printed to the console.
export class BetterErrorTracingReporter extends BasicReporter {
  onTaskUpdate(packs: TaskResultPack[]) {
    if (this.isTTY) {
      return;
    }
    for (const pack of packs) {
      const task = this.ctx.state.idMap.get(pack[0]);

      if (task) {
        this.printTask(task);
      }

      if (
        task &&
        task.type === "test" &&
        task.result?.state &&
        task.result?.state !== "run"
      ) {
        if (task.result.state === "fail") {
          task.result.errors?.forEach((error) => {
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
  }
}
