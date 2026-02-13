import { PartialMessage } from "@bufbuild/protobuf";
import { Assistant } from "@reboot-dev/docubot-api/docubot/assistant/v1/assistant_rbt.js";
import {
  CreateRequest,
  CreateResponse,
  CreateWorkflowRequest,
  MessagesRequest,
  MessagesResponse,
  Query,
  QueryRequest,
  QueryResponse,
  QueryWorkflowRequest,
  Thread,
} from "@reboot-dev/docubot-api/docubot/thread/v1/thread_rbt.js";
import {
  allow,
  atMostOnce,
  ReaderContext,
  until,
  WorkflowContext,
  WriterContext,
} from "@reboot-dev/reboot";
import OpenAI from "openai";
import { AssistantStreamEvent } from "openai/resources/beta/assistants.js";
import { z } from "zod/v4";

export class ThreadServicer extends Thread.singleton.Servicer {
  static #openai: OpenAI;

  constructor() {
    super();

    // NOTE: expecting OPENAI_API_KEY environment variable.
    ThreadServicer.#openai = new OpenAI();
  }

  authorizer() {
    // TODO: introduce proper authorization.
    return allow();
  }

  async create(
    context: WriterContext,
    state: Thread.State,
    request: CreateRequest
  ): Promise<PartialMessage<CreateResponse>> {
    await this.ref()
      .schedule()
      .createWorkflow(context, { assistantId: request.assistantId });
    return {};
  }

  async messages(
    context: ReaderContext,
    state: Thread.State,
    request: MessagesRequest
  ): Promise<PartialMessage<MessagesResponse>> {
    const { queries } = state;
    return { queries };
  }

  async query(
    context: WriterContext,
    state: Thread.State,
    request: QueryRequest
  ): Promise<PartialMessage<QueryResponse>> {
    state.queries.push(new Query({ content: request.content }));
    await this.ref()
      .schedule()
      .queryWorkflow(context, {
        index: state.queries.length - 1,
      });
    return {};
  }

  static async createWorkflow(
    context: WorkflowContext,
    request: CreateWorkflowRequest
  ) {
    // First wait for the assistant to be ready.
    const openaiAssistantId = await until(
      "assistant is ready",
      context,
      async () => {
        const assistant = Assistant.ref(request.assistantId);
        const { openaiAssistantId } = await assistant.status(context);
        return openaiAssistantId !== "" && openaiAssistantId;
      },
      { schema: z.string() }
    );

    let { openaiThreadId } = await Thread.ref().read(context);

    // TODO: need to see if we already created the thread by listing,
    // which unfortunately is a missing API:
    // https://community.openai.com/t/list-and-delete-all-threads/505823/8
    if (openaiThreadId === "") {
      const thread = await ThreadServicer.#openai.beta.threads.create({
        metadata: {
          docubotThreadStateId: context.stateId,
        },
      });

      openaiThreadId = thread.id;

      await Thread.ref()
        .perWorkflow("Save ids")
        .write(context, async (state) => {
          state.openaiAssistantId = openaiAssistantId;
          state.openaiThreadId = openaiThreadId;
        });
    }

    return {};
  }

  // Helper that waits until the OpenAI resources (assistant and
  // thread) are ready.
  static async #untilOpenAIResourcesReady(context: WorkflowContext) {
    return await until(
      "OpenAI resources ready",
      context,
      async () => {
        const { openaiAssistantId, openaiThreadId } = await Thread.ref().read(
          context
        );
        return (
          openaiAssistantId !== "" &&
          openaiThreadId !== "" && { openaiAssistantId, openaiThreadId }
        );
      },
      {
        schema: z.object({
          openaiAssistantId: z.string(),
          openaiThreadId: z.string(),
        }),
      }
    );
  }

  static async queryWorkflow(
    context: WorkflowContext,
    request: QueryWorkflowRequest
  ) {
    const index = request.index;

    // Ensure the OpenAI resources (assistant and thread) are ready.
    const { openaiAssistantId, openaiThreadId } =
      await ThreadServicer.#untilOpenAIResourcesReady(context);

    // Wait until we are the "active" index because OpenAI does not
    // allow you to perform more than one run at a time.
    const content = await until(
      `Our turn`,
      context,
      async () => {
        return await Thread.ref()
          .always()
          .write(
            context,
            async (state) => {
              if (state.activeIndex != index) {
                return false;
              }
              state.queries[index].started = true;
              return state.queries[index].content;
            },
            { schema: z.union([z.string(), z.literal(false)]) }
          );
      },
      { schema: z.string() }
    );

    try {
      await atMostOnce(`run`, context, async () => {
        await ThreadServicer.#openai.beta.threads.messages.create(
          openaiThreadId,
          {
            role: "user",
            content,
          }
        );

        let delta = 0;

        const stream = await ThreadServicer.#openai.beta.threads.runs.create(
          openaiThreadId,
          {
            assistant_id: openaiAssistantId,
            stream: true,
            metadata: {
              docubotThreadStateId: context.stateId,
              queryIndex: index.toString(),
            },
          }
        );

        for await (const event of stream) {
          if (event.event === "thread.message.delta") {
            const data = (event as AssistantStreamEvent.ThreadMessageDelta)
              .data;
            // For now, we assume we're only going to get _text_ back.
            let content =
              data.delta.content?.reduce((content, delta) => {
                if (delta.type === "text") {
                  return content + delta.text?.value || "";
                }
              }, "") || "";

            // Remove annotations for now as they refer to PDF documents
            // and we don't have a way (yet) of connecting the PDF
            // document back to the web page that they refer to.
            content = content.replace(/【[^】]*】/g, "");

            if (content === "") {
              continue;
            }

            await Thread.ref()
              .perWorkflow(`Append delta #${delta++}`)
              .write(context, async (state) => {
                state.queries[index].response += content;
              });
          } else if (event.event === "thread.message.completed") {
            await Thread.ref()
              .perWorkflow("Complete")
              .write(context, async (state) => {
                state.queries[index].completed = true;
              });
            break;
          } else if (event.event === "error") {
            const error = (event as AssistantStreamEvent.ErrorEvent).data;
            throw new Error(
              `Error streaming (code ${error.code}): ${error.message}`
            );
          } else if (event.event === "thread.run.failed") {
            const run = (event as AssistantStreamEvent.ThreadRunFailed).data;
            throw new Error(
              `Error streaming (code ${run.last_error.code}): ${run.last_error.message}`
            );
          } else {
            // NOTE: there are known events that we are not handling.
          }
        }
      });
    } catch (e) {
      console.warn(`Failed to call OpenAI: ${e}`);
    }

    // TODO: OpenAI documentation suggests that they will delete old
    // runs but we could be proactive here and delete them now.

    // Increment the active index so the next query can run, also
    // handling possible hard failures while trying to do the OpenAI
    // run above.
    await Thread.ref()
      .perWorkflow("Finish")
      .write(context, async (state) => {
        if (!state.queries[index].completed) {
          // NOTE: we don't include the error in `response` in the event
          // that it has any sensitive information, but we do `console.warn`
          // above for developers.
          state.queries[index].response += "...encountered an error!";
          state.queries[index].completed = true;
        }
        state.activeIndex++;
      });

    return {};
  }
}
