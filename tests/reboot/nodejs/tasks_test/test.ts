import { Empty } from "@bufbuild/protobuf";
import {
  Application,
  Reboot,
  TransactionContext,
  WorkflowContext,
  WriterContext,
  allow,
} from "@reboot-dev/reboot";
import test from "node:test";
import { Task } from "./task_rbt.js";

type Method = "writer" | "transaction" | "workflow";

class TaskServicer extends Task.singleton.Servicer {
  methodToSchedule: Method;
  static callback: (methodThatRan: Method) => void;

  constructor(
    methodToSchedule: Method,
    callback: (methodThatRan: Method) => void
  ) {
    super();
    this.methodToSchedule = methodToSchedule;
    TaskServicer.callback = callback;
  }

  authorizer() {
    return allow();
  }

  async constructorTransaction(
    context: TransactionContext,
    state: Task.State,
    request: Empty
  ): Promise<Empty> {
    return new Empty();
  }

  async transaction(
    context: TransactionContext,
    state: Task.State,
    request: Empty
  ): Promise<Empty> {
    if (this.methodToSchedule === "writer") {
      await this.ref().schedule().scheduledWriter(context, request);
    } else if (this.methodToSchedule === "transaction") {
      await this.ref().schedule().scheduledTransaction(context, request);
    } else if (this.methodToSchedule === "workflow") {
      await this.ref().schedule().scheduledWorkflow(context, request);
    }
    return new Empty();
  }

  async scheduledWriter(
    context: WriterContext,
    state: Task.State,
    request: Empty
  ): Promise<Empty> {
    TaskServicer.callback("writer");
    return new Empty();
  }

  async scheduledTransaction(
    context: TransactionContext,
    state: Task.State,
    request: Empty
  ): Promise<Empty> {
    TaskServicer.callback("transaction");
    return new Empty();
  }

  static async scheduledWorkflow(
    context: WorkflowContext,
    request: Empty
  ): Promise<Empty> {
    TaskServicer.callback("workflow");
    return new Empty();
  }
}

// These tests differ from those in tasks_tests.py as they verify that
// the timestamps passed from TypeScript are preserved even after serialization
// and deserialization, as they eventually transition into Python.
test("tasks", async (t) => {
  let rbt: Reboot;

  t.beforeEach(async () => {
    rbt = new Reboot();
    await rbt.start();
  });

  t.afterEach(async () => {
    await rbt.stop();
  });

  await t.test("schedule writer", async (t) => {
    // The promise that resolves when the scheduledWriter task executes.
    let writerTaskExecuted;
    const writerExecutedPromise = new Promise((resolve) => {
      writerTaskExecuted = resolve;
    });

    class ScheduleWriterTaskServicer extends TaskServicer {
      constructor() {
        super("writer", (methodThatRan: Method) => {
          if (methodThatRan === "writer") {
            writerTaskExecuted();
          }
        });
      }
    }

    await rbt.up(new Application({ servicers: [ScheduleWriterTaskServicer] }));

    const context = rbt.createExternalContext("test");

    const [task, _] = await Task.constructorTransaction(context);

    // Test that we schedule a writer task and run it immediately.
    await task.transaction(context);

    // Assert that the writer task ran immediately.
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error("Writer task did not run immediately"));
      }, 20000);
    });
    await Promise.race([writerExecutedPromise, timeoutPromise]);
  });

  await t.test("schedule transaction", async (t) => {
    // The promise that resolves when the scheduledTransaction task executes.
    let transactionTaskExecuted;
    const transactionExecutedPromise = new Promise((resolve) => {
      transactionTaskExecuted = resolve;
    });

    class ScheduleTransactionTaskServicer extends TaskServicer {
      constructor() {
        super("transaction", (methodThatRan: Method) => {
          if (methodThatRan === "transaction") {
            transactionTaskExecuted();
          }
        });
      }
    }

    await rbt.up(
      new Application({ servicers: [ScheduleTransactionTaskServicer] })
    );

    const context = rbt.createExternalContext("test");

    const [task, _] = await Task.constructorTransaction(context);

    // Test that we schedule a transaction task and run it immediately.
    await task.transaction(context);

    // Assert that the transaction task ran immediately.
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error("Transaction task did not run immediately"));
      }, 20000);
    });
    await Promise.race([transactionExecutedPromise, timeoutPromise]);
  });

  await t.test("schedule workflow", async (t) => {
    // The promise that resolves when the scheduledWorkflow task executes.
    let workflowTaskExecuted;
    const workflowExecutedPromise = new Promise((resolve) => {
      workflowTaskExecuted = resolve;
    });

    class ScheduleWorkflowTaskServicer extends TaskServicer {
      constructor() {
        super("workflow", (methodThatRan: Method) => {
          if (methodThatRan === "workflow") {
            workflowTaskExecuted();
          }
        });
      }
    }

    await rbt.up(
      new Application({ servicers: [ScheduleWorkflowTaskServicer] })
    );

    const context = rbt.createExternalContext("test");

    const [task, _] = await Task.constructorTransaction(context);

    // Test that we schedule a workflow task and run it immediately.
    await task.transaction(context);

    // Assert that the workflow task ran immediately.
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error("Workflow task did not run immediately"));
      }, 20000);
    });
    await Promise.race([workflowExecutedPromise, timeoutPromise]);
  });
});
