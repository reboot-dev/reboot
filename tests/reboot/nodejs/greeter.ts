import { Empty, PartialMessage } from "@bufbuild/protobuf";
import {
  Authorizer,
  AuthorizerRule,
  ReaderContext,
  TransactionContext,
  WorkflowContext,
  WriterContext,
  allow,
  atLeastOnce,
  untilChanges,
  untilPerWorkflow,
} from "@reboot-dev/reboot";
import { strict as assert } from "node:assert";
import { z } from "zod/v4";
import {
  ConstructAndStoreRecursiveMessageRequest,
  ConstructAndStoreRecursiveMessageResponse,
  CreateRequest,
  CreateResponse,
  DangerousFieldsRequest,
  ErrorWithValue,
  GetWholeStateRequest,
  GreetRequest,
  GreetResponse,
  Greeter,
  ReadRecursiveMessageRequest,
  ReadRecursiveMessageResponse,
  RecursiveMessage,
  SetAdjectiveRequest,
  SetAdjectiveResponse,
  StoreRecursiveMessageRequest,
  StoreRecursiveMessageResponse,
  TestLongRunningFetchRequest,
} from "../../../tests/reboot/greeter_rbt.js";

// Global variables for testing `testLongRunningWriter`.
export let testLongRunningWriterCalled = false;
export let testLongRunningWriterCancelled: Promise<void> | undefined =
  undefined;
export const testLongRunningWriterAbortController = new AbortController();

export class GreeterServicer extends Greeter.Servicer {
  constructor() {
    super();
  }

  authorizer():
    | Authorizer<Greeter.State, Greeter.RequestTypes>
    | AuthorizerRule<Greeter.State, Greeter.RequestTypes>
    | null {
    return allow();
  }

  async create(
    context: WriterContext,
    request: CreateRequest
  ): Promise<CreateResponse> {
    this.state.title = request.title;
    this.state.name = request.name;
    this.state.adjective = request.adjective;

    return new CreateResponse();
  }

  async greet(
    context: ReaderContext,
    request: GreetRequest
  ): Promise<PartialMessage<GreetResponse>> {
    return {
      message: `Hi ${request.name}, I am ${this.#properName()}`,
    };
  }

  #properName(): string {
    return `${this.state.title} ${this.state.name} the ${this.state.adjective}`;
  }

  async setAdjective(
    context: WriterContext,
    request: SetAdjectiveRequest
  ): Promise<PartialMessage<SetAdjectiveResponse>> {
    const adjective = this.state.adjective;

    if (request.adjective === "") {
      this.state.adjective = "_" + this.state.adjective + "_";
    } else {
      this.state.adjective = request.adjective;
    }

    if (request.revertAfter1Second) {
      // Now asynchronously revert the setting of the adjective!
      const when = new Date();
      when.setSeconds(when.getSeconds() + 1);
      const taskId = await this.ref()
        .schedule({ when })
        .setAdjective(context, { adjective });
      return { taskId };
    }

    console.log(`Setting 'adjective' === '${this.state.adjective}'`);

    return {};
  }

  async tryToConstructContext(
    context: ReaderContext,
    request: Empty
  ): Promise<Empty> {
    return new Empty();
  }

  async tryToConstructExternalContext(
    context: ReaderContext,
    request: Empty
  ): Promise<Empty> {
    return new Empty();
  }

  async testLongRunningFetch(
    context: ReaderContext,
    request: TestLongRunningFetchRequest
  ): Promise<Empty> {
    await new Promise((resolve) =>
      setTimeout(resolve, request.sleepTimeSeconds * 1000)
    );
    return new Empty();
  }

  async testLongRunningWriter(
    context: WriterContext,
    request: Empty
  ): Promise<Empty> {
    testLongRunningWriterCalled = true;
    testLongRunningWriterCancelled = context.cancelled;

    const signal = testLongRunningWriterAbortController.signal;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, 1000000);

      const onAbort = () => {
        clearTimeout(timeout);
        signal.removeEventListener("abort", onAbort);
        reject(new Error("Aborted"));
      };

      signal.addEventListener("abort", onAbort);
    });

    return new Empty();
  }

  async getWholeState(
    context: ReaderContext,
    request: GetWholeStateRequest
  ): Promise<Greeter.State> {
    return this.state;
  }

  async transactionSetAdjective(
    context: TransactionContext,
    request: SetAdjectiveRequest
  ): Promise<PartialMessage<SetAdjectiveResponse>> {
    const adjective = this.state.adjective;

    this.state.adjective = request.adjective;

    await this.ref().idempotently("Once").setAdjective(context);

    if (this.state.adjective !== "_" + request.adjective + "_") {
      throw new Error("Writer effects missing!");
    }

    // Call with explicit alias to test "alias or options".
    await this.ref().idempotently({ alias: "Once" }).setAdjective(context);

    if (this.state.adjective !== "_" + request.adjective + "_") {
      throw new Error("Writer effects missing!");
    }

    if (request.revertAfter1Second) {
      // Now asynchronously revert the setting of the adjective!
      const when = new Date();
      when.setSeconds(when.getSeconds() + 1);
      const taskId = await this.ref()
        .schedule({ when })
        .setAdjective(context, { adjective });
      return { taskId };
    }

    return {};
  }

  async failWithException(
    context: ReaderContext,
    request: Empty
  ): Promise<PartialMessage<Empty>> {
    throw new Error("Hi!");
  }

  async failWithAborted(
    context: ReaderContext,
    request: Empty
  ): Promise<PartialMessage<Empty>> {
    throw new Greeter.FailWithAbortedAborted(
      new ErrorWithValue({ value: "Hi!" }),
      { message: "Custom error message from TypeScript" }
    );
  }

  static async workflow(context: WorkflowContext, request: Empty) {
    // To test that we can call into a different `Greeter` without
    // explicitly using `.idempotently()` and that it happens each
    // iteration via `.perIteration()` by default.
    //
    // Create the other `Greeter` once per workflow.
    const [other] = await Greeter.create(context, {
      title: "Dr",
      name: "Evil",
      adjective: "cunning",
    });

    for await (const iteration of context.loop("Control loop!")) {
      // Test that we'll check for changes each iteration.
      let calls = 0;
      const result = await untilChanges(
        "Test until changes",
        context,
        async () => {
          calls += 1;

          if (iteration === 0) {
            return iteration;
          } else if (calls === 1) {
            // Call a reader that we'll reactively watch.
            await other.greet(context, { name: "Rick" });

            // Call a writer to trigger reactivity.
            await other.setAdjective(context, {
              adjective: `cunning #${iteration}`,
            });
            return iteration - 1;
          } else {
            return iteration;
          }
        },
        {
          equals: (previous, current) => previous === current,
          schema: z.number(),
        }
      );

      assert(result === iteration);

      // Need to use an `atLeastOnce` so that we won't run this when
      // the entire workflow is re-executed for effect validation
      // (note that the lambda will still get re-executed for effect
      // validation by itself).
      await atLeastOnce("Check call counts", context, async () => {
        if (iteration === 0) {
          // One call to execute.
          assert(calls === 1);
        } else {
          // Two calls, once to execute and once to re-execute
          // reactively.
          assert(calls === 2);
        }
      });

      const { message } = await other.greet(context, { name: "Frank" });

      try {
        await other.greet(context, { name: "Frank" });
        throw new Error("Expecting exception!");
      } catch (e) {
        assert(
          e.message.includes(
            "more than once using the same context an idempotency alias " +
              "or key must be specified"
          )
        );
      }

      if (iteration === 0) {
        assert(message === `Hi Frank, I am Dr Evil the cunning`);
      } else {
        assert(message === `Hi Frank, I am Dr Evil the cunning #${iteration}`);
      }

      // Test that we can't call an inline reader or writer more than
      // once without using `.perWorkflow(...)` with an alias.
      await Greeter.ref().read(context);
      try {
        await Greeter.ref().read(context);
        throw new Error("Expecting exception!");
      } catch (e) {
        assert(
          e.message.includes(
            "more than once using the same context an idempotency alias " +
              "or key must be specified"
          )
        );
      }

      await Greeter.ref().write(context, async (state) => {});
      try {
        await Greeter.ref().write(context, async (state) => {});
        throw new Error("Expecting exception!");
      } catch (e) {
        assert(
          e.message.includes(
            "more than once using the same context an idempotency alias " +
              "or key must be specified"
          )
        );
      }

      if (iteration === 2) {
        return { value: "Hello world!" };
      }

      const newAdjective = `#${iteration}`;

      if (iteration === 0) {
        console.log(`Scheduling 'SetAdjective({ adjective: ${newAdjective})'`);

        const when = new Date();
        when.setSeconds(when.getSeconds() + 1);

        await Greeter.ref()
          .perWorkflow(`Set adjective to ${newAdjective}`)
          .spawn({ when })
          .setAdjective(context, { adjective: newAdjective });
      } else {
        await Greeter.ref()
          .perWorkflow(`Set adjective to ${newAdjective}`)
          .write(
            context,
            async (state) => {
              console.log(
                `Inline writer setting 'adjective' == '${newAdjective}'`
              );
              const adjective = state.adjective;
              state.adjective = newAdjective;
              return { adjective };
            },
            { schema: z.object({ adjective: z.string() }) }
          );

        const { adjective } = await Greeter.ref()
          .perWorkflow(`Set adjective to ${newAdjective}`)
          .write(
            context,
            async (state): Promise<{ adjective: string }> => {
              throw new Error("Unreachable!");
            },
            { schema: z.object({ adjective: z.string() }) }
          );

        assert(adjective === "#0");
      }

      const waitedAdjective = await untilPerWorkflow(
        `Wait for adjective`,
        context,
        async () => {
          console.log(`Waiting until 'adjective' === '${newAdjective}'`);
          const { adjective } = await Greeter.ref().read(context);
          return adjective === newAdjective && adjective;
        },
        { schema: z.string() }
      );

      assert(waitedAdjective === "#0");
    }
  }

  async dangerousFields(
    context: WriterContext,
    request: DangerousFieldsRequest
  ): Promise<PartialMessage<Empty>> {
    return {};
  }

  async storeRecursiveMessage(
    context: WriterContext,
    request: StoreRecursiveMessageRequest
  ): Promise<PartialMessage<StoreRecursiveMessageResponse>> {
    this.state.recursiveMessage = request.message;
    return {};
  }

  async readRecursiveMessage(
    context: ReaderContext,
    request: ReadRecursiveMessageRequest
  ): Promise<PartialMessage<ReadRecursiveMessageResponse>> {
    return { message: this.state.recursiveMessage };
  }

  async constructAndStoreRecursiveMessage(
    context: TransactionContext,
    request: ConstructAndStoreRecursiveMessageRequest
  ): Promise<PartialMessage<ConstructAndStoreRecursiveMessageResponse>> {
    let deepMessage: RecursiveMessage | undefined = undefined;

    for (let i = 0; i < request.depth; i++) {
      const message = new RecursiveMessage({
        message: `Level ${i}`,
        next: deepMessage,
      });
      deepMessage = message;
    }

    await this.ref().storeRecursiveMessage(context, { message: deepMessage });

    return {};
  }
}
