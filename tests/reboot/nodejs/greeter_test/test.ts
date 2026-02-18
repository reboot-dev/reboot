import { Empty, PartialMessage } from "@bufbuild/protobuf";
import {
  Application,
  ReaderContext,
  Reboot,
  WorkflowContext,
  until,
} from "@reboot-dev/reboot";
import { Event } from "@reboot-dev/reboot-api";
import nonStrictAssert, { strict as assert } from "node:assert";
import { test } from "node:test";
import * as uuid from "uuid";
import {
  CreateRequest,
  ErrorWithValue,
  GreetRequest,
  GreetResponse,
  Greeter,
} from "../../greeter_rbt.js";
import { GreeterServicer } from "../greeter.js";

test("constructors and readers", async (t) => {
  let rbt: Reboot;
  t.beforeEach(async () => {
    rbt = new Reboot();
    await rbt.start();
  });
  t.afterEach(async () => {
    await rbt.stop();
  });

  await t.test("creating with ID", async (t) => {
    await rbt.up(new Application({ servicers: [GreeterServicer] }));

    const context = rbt.createExternalContext("test", {
      idempotencySeed: uuid.v4(),
    });

    // Test creating with ID.
    await Greeter.create(context, "other greeter", {
      title: "Dr",
      name: "Jonathan",
      adjective: "Best",
    });

    // Test creating with generated ID.
    //
    // Scoping here for snippet purposes.
    {
      const [greeter, response] = await Greeter.create(context, {
        title: "Dr",
        name: "Jonathan",
        adjective: "Best",
      });
    }

    // Test creating with generated ID idempotently.
    await Greeter.idempotently().create(context, {
      title: "Mr",
      name: "John",
      adjective: "Dangerous",
    });

    await Greeter.idempotently("generated").create(context, {
      title: "Mr",
      name: "John",
      adjective: "Dangerous",
    });

    await Greeter.idempotently("create").create(
      context,
      "greeter",
      // Pass a whole object to test that we can take an object as a request.
      new CreateRequest({
        title: "Mr",
        name: "John",
        adjective: "Dangerous",
      })
    );

    // Call `idempotently()` with explicit alias to test "alias or options".
    const [greeter] = await Greeter.idempotently({ alias: "create" }).create(
      context,
      "greeter",
      {
        title: "Mr",
        name: "John",
        adjective: "Dangerous",
      }
    );

    // Pass a partial to test that we can take a partial as a request.
    let response = await greeter.greet(context, { name: "Jake" });

    assert(response.equals({ message: "Hi Jake, I am Mr John the Dangerous" }));

    // Also demonstrate GetWholeState().
    const state = await greeter.getWholeState(context);
    assert(state.equals({ title: "Mr", name: "John", adjective: "Dangerous" }));

    // Call a writer that reverts the name after a second.
    await greeter.setAdjective(context, {
      adjective: "Friendly",
      revertAfter1Second: true,
    });

    response = await greeter.greet(context, { name: "Jake" });

    assert(response.equals({ message: "Hi Jake, I am Mr John the Friendly" }));

    // Wait until the name has been reverted.
    while (response.message !== "Hi Jake, I am Mr John the Dangerous") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      response = await greeter.greet(context, { name: "Jake" });
    }

    // Call a transaction.
    await greeter.transactionSetAdjective(context, { adjective: "Friendly" });

    response = await greeter.greet(context, { name: "Jake" });

    assert(
      response.equals({ message: "Hi Jake, I am Mr John the _Friendly_" })
    );

    // Call a transaction that reverts the name after a second.
    await greeter.transactionSetAdjective(context, {
      adjective: "Hungry",
      revertAfter1Second: true,
    });

    response = await greeter.greet(context, { name: "Jake" });

    assert(response.equals({ message: "Hi Jake, I am Mr John the _Hungry_" }));

    // Wait until the name has been reverted.
    while (response.message !== "Hi Jake, I am Mr John the _Friendly_") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      response = await greeter.greet(context, { name: "Jake" });
    }

    try {
      await greeter.failWithException(context);
      throw new Error("Should be unreachable!");
    } catch (e) {
      assert(e instanceof Greeter.FailWithExceptionAborted);
      assert(
        `${e}` ===
          "GreeterFailWithExceptionAborted: rbt.v1alpha1.Unknown: unhandled (in 'tests.reboot.Greeter.FailWithException') Exception: Hi!"
      );
    }

    try {
      await greeter.failWithAborted(context);
      throw new Error("Should be unreachable!");
    } catch (e) {
      assert(e instanceof Greeter.FailWithAbortedAborted);
      assert(e.error instanceof ErrorWithValue);
      assert(e.error.value === "Hi!");

      // Test that the message parameter passed to FailWithAbortedAborted
      // is available on the client side.
      assert(
        `${e}`.includes("Custom error message from TypeScript"),
        `Expected error string to contain message but got: ${e}`
      );
    }

    const { task } = await greeter.spawn().workflow(context);
    const { value } = await task;
    assert(value === "Hello world!");
  });

  await t.test("workflow with declared error", async (t) => {
    class WorkflowWithErrorServicer extends GreeterServicer {
      static async workflow(
        context: WorkflowContext,
        request: Empty
      ): Promise<{ value: string }> {
        // Test that workflow methods can raise declared errors with message.
        throw new Greeter.WorkflowAborted(
          new ErrorWithValue({ value: "Workflow error field!" }),
          { message: "Custom workflow error message from TypeScript" }
        );
      }
    }

    await rbt.up(new Application({ servicers: [WorkflowWithErrorServicer] }));

    const context = rbt.createExternalContext("test workflow error", {
      idempotencySeed: uuid.v4(),
    });

    const [greeter] = await Greeter.create(context, {
      title: "Dr",
      name: "Jonathan",
      adjective: "Best",
    });

    try {
      const { task } = await greeter.spawn().workflow(context);
      await task;
      throw new Error("Should be unreachable!");
    } catch (e) {
      assert(e instanceof Greeter.WorkflowAborted);
      assert(e.error instanceof ErrorWithValue);
      assert(e.error.value === "Workflow error field!");

      // Test that the message parameter passed to WorkflowAborted
      // is available on the client side in workflows.
      assert(
        `${e}`.includes("Custom workflow error message from TypeScript"),
        `Expected error string to contain workflow message but got: ${e}`
      );
    }
  });

  await t.test("WeakReference.stateId", async (t) => {
    class SelfReferentialGreeterServicer extends GreeterServicer {
      async greet(
        context: ReaderContext,
        request: GreetRequest
      ): Promise<PartialMessage<GreetResponse>> {
        return {
          message: `Hi ${request.name}, I am ${this.ref().stateId}`,
        };
      }
    }

    await rbt.up(
      new Application({ servicers: [SelfReferentialGreeterServicer] })
    );

    const context = rbt.createExternalContext("test");

    const [greeter] = await Greeter.create(context, {
      title: "Dr",
      name: "Jonathan",
      adjective: "Best",
    });

    let response = await greeter.greet(context, { name: "Jake" });
    assert(response.message.includes(greeter.stateId));
  });

  await t.test("Cancelling a workflow waiting in until", async (t) => {
    const event = new Event();

    class LongRunningWorkflowGreeterServicer extends GreeterServicer {
      static async workflow(context: WorkflowContext, request: Empty) {
        await until("Forever", context, async () => {
          event.set();
          return false;
        });
        return { value: "Unreachable!" };
      }
    }

    await rbt.up(
      new Application({ servicers: [LongRunningWorkflowGreeterServicer] })
    );

    const context = rbt.createExternalContext("test");

    const [greeter] = await Greeter.create(context, {
      title: "Dr",
      name: "Jonathan",
      adjective: "Best",
    });

    await greeter.spawn().workflow(context);

    // Wait until we're within the `until()` of the workflow.
    await event.wait();
  });

  await t.test("forall executes with given ids", async (t) => {
    await rbt.up(new Application({ servicers: [GreeterServicer] }));

    const context = rbt.createExternalContext("test");

    // Creating some greeters.
    await Greeter.create(context, "greeter-1", {
      title: "Mr",
      name: "Heinz",
      adjective: "Erhardt",
    });

    await Greeter.create(context, "greeter-2", {
      title: "Mrs",
      name: "Heidi",
      adjective: "Kabel",
    });

    // Does reject correctly with non-existing id.
    try {
      await Greeter.forall(["greeter-1", "non-existing-id"]).greet(context, {
        name: "Helmut Schmidt",
      });

      throw new Error("This should not throw here.");
    } catch (error) {
      assert.strictEqual(error.message, "rbt.v1alpha1.StateNotConstructed");
    }

    // Returns correct array of greetings.
    const greeters = await Greeter.forall(["greeter-1", "greeter-2"]).greet(
      context,
      { name: "Helmut Schmidt" }
    );

    nonStrictAssert.deepEqual(greeters, [
      // Man, this is so funny! :-D
      {
        message: "Hi Helmut Schmidt, I am Mr Heinz the Erhardt",
      },
      {
        message: "Hi Helmut Schmidt, I am Mrs Heidi the Kabel",
      },
    ]);
  });

  await t.test("forall accepts iterables", async (t) => {
    await rbt.up(new Application({ servicers: [GreeterServicer] }));

    const context = rbt.createExternalContext("test iterables");

    await Greeter.create(context, "greeter-iter-1", {
      title: "Mr",
      name: "Heinz",
      adjective: "Erhardt",
    });

    await Greeter.create(context, "greeter-iter-2", {
      title: "Mrs",
      name: "Heidi",
      adjective: "Kabel",
    });

    // Test `forall` with `Set`.
    const idsSet = new Set(["greeter-iter-1", "greeter-iter-2"]);
    const resultFromSet = await Greeter.forall(idsSet).greet(context, {
      name: "Test",
    });
    assert.strictEqual(resultFromSet.length, 2);

    // Test `forall` with `Map.keys()`.
    const idsMap = new Map([
      ["greeter-iter-1", 1],
      ["greeter-iter-2", 2],
    ]);
    const resultFromMapKeys = await Greeter.forall(idsMap.keys()).greet(
      context,
      { name: "Test" }
    );
    assert.strictEqual(resultFromMapKeys.length, 2);

    // Test `forall` with generator function.
    function* idGenerator() {
      yield "greeter-iter-1";
      yield "greeter-iter-2";
    }
    const resultFromGenerator = await Greeter.forall(idGenerator()).greet(
      context,
      { name: "Test" }
    );
    assert.strictEqual(resultFromGenerator.length, 2);
  });
});
