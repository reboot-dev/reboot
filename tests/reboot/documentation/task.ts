import { PartialMessage } from "@bufbuild/protobuf";
import {
  allow,
  Application,
  atMostOnce,
  Reboot,
  until,
  WorkflowContext,
  WriterContext,
} from "@reboot-dev/reboot";
import { OrderedMap } from "@reboot-dev/reboot-std/collections/ordered_map/v1";
import test from "node:test";
import { z } from "zod/v4";
import {
  CreateRequest,
  CreateResponse,
  CreateWorkflowRequest,
  CreateWorkflowResponse,
  OpenLaterRequest,
  OpenLaterResponse,
  OpenRequest,
  OpenResponse,
  PauseServiceRequest,
  PauseServiceResponse,
  ReadStateRequest,
  ReadStateResponse,
  StartPipelineRequest,
  StartPipelineResponse,
  TestTask,
  WelcomeEmailRequest,
  WelcomeEmailResponse,
} from "./task_rbt.js";

class TestTaskServicer extends TestTask.Servicer {
  authorizer() {
    return allow();
  }

  async create(
    context: WriterContext,
    request: CreateRequest
  ): Promise<PartialMessage<CreateResponse>> {
    return {};
  }

  static async startPipeline(
    context: WorkflowContext,
    request: StartPipelineRequest
  ): Promise<PartialMessage<StartPipelineResponse>> {
    const { taskId } = await TestTask.ref().loadS3Blob(context);
    return { taskId };
  }

  static async loadS3Blob(context: WorkflowContext) {
    return {};
  }

  static async readState(
    context: WorkflowContext,
    request: ReadStateRequest
  ): Promise<PartialMessage<ReadStateResponse>> {
    const snapshot = await TestTask.ref().read(context);
    return { snapshot };
  }

  static async pauseService(
    context: WorkflowContext,
    request: PauseServiceRequest
  ): Promise<PartialMessage<PauseServiceResponse>> {
    return {};
  }

  static async welcomeEmail(
    context: WorkflowContext,
    request: WelcomeEmailRequest
  ): Promise<PartialMessage<WelcomeEmailResponse>> {
    return {};
  }

  static async writeState(
    context: WorkflowContext,
    request: PauseServiceRequest
  ): Promise<PartialMessage<PauseServiceResponse>> {
    await TestTask.ref()
      .idempotently("Finally, increment the number of iterations")
      .write(context, async (state) => {
        state.iteration++;
      });

    // Won't execute again because same idempotency alias!
    await TestTask.ref()
      .idempotently("Finally, increment the number of iterations")
      .write(context, async (state) => {
        state.iteration++;
      });

    return {};
  }

  static async createWorkflow(
    context: WorkflowContext,
    request: CreateWorkflowRequest
  ): Promise<PartialMessage<CreateWorkflowResponse>> {
    await atMostOnce("something", context, async () => {
      return;
    });

    return {};
  }

  async open(
    context: WriterContext,
    request: OpenRequest
  ): Promise<PartialMessage<OpenResponse>> {
    this.state.customerName = request.customerName;

    const taskId = await this.ref().schedule().welcomeEmail(context);

    return { welcomeEmailTaskId: taskId };
  }

  async openLater(
    context: WriterContext,
    request: OpenLaterRequest
  ): Promise<PartialMessage<OpenLaterResponse>> {
    this.state.customerName = request.customerName;

    const now = new Date();
    const when = new Date(now.getTime() + 1000 * 60 * 60); // 1 hour from now

    const taskId = await this.ref().schedule({ when }).welcomeEmail(context);

    return { welcomeEmailTaskId: taskId };
  }

  static async twoEmails(
    context: WorkflowContext,
    request: OpenLaterRequest
  ): Promise<PartialMessage<OpenLaterResponse>> {
    const when = new Date();

    // task1 might complete after task2.
    const { task: task1 } = await TestTask.ref()
      .spawn({ when })
      .welcomeEmail(context);

    // task2 might complete before task1.
    const { task: task2 } = await TestTask.ref()
      .spawn({ when })
      .welcomeEmail(context);

    return { welcomeEmailTaskId: task1.taskId };
  }

  static async exampleOfUntil(context: WorkflowContext) {
    await until("Have messages", context, async () => {
      const { messages } = await TestTask.ref().read(context);
      return messages.length > 0;
    });

    const value = await until(
      "Value is stored",
      context,
      async () => {
        const index = OrderedMap.ref("someId");
        const { value } = await index.search(context, { key: "someKey" });
        return value.toJson();
      },
      { schema: z.json() }
    );
  }
}

// These tests are different from the other tests in this directory in that do not
// serve to test our system, instead they serve only to be examples in our
// documentation.

// Documentation examples notoriously go stale, as APIs can shift rapidly while
// docs are not pinned to individual versions. To prevent documentation drift and
// to make sure our users have a good experience, we strive to have every piece of
// code in our documentation be a tested, working piece of code that the user can
// `copy / paste` into their environment and it will just work.
test("task", async (t) => {
  let rbt: Reboot;
  t.before(async () => {
    rbt = new Reboot();
    await rbt.start();
    await rbt.up(new Application({ servicers: [TestTaskServicer] }));
  });
  t.after(async () => {
    await rbt.stop();
  });
  await t.test("create", async (t) => {
    const context = rbt.createExternalContext("test");

    const [task] = await TestTask.idempotently().create(context, "task");

    const {
      task: { taskId },
    } = await task.spawn().createWorkflow(context, {});

    await TestTask.CreateWorkflowTask.retrieve(context, { taskId });
  });
});
