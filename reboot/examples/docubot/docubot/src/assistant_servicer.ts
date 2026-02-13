import { Empty, PartialMessage } from "@bufbuild/protobuf";
import {
  Assistant,
  CrawlControlLoopRequest,
  CrawlControlLoopResponse,
  CreateRequest,
  CreateResponse,
  StatusRequest,
  StatusResponse,
} from "@reboot-dev/docubot-api/docubot/assistant/v1/assistant_rbt.js";
import {
  allow,
  atLeastOnce,
  ReaderContext,
  until,
  WorkflowContext,
  WriterContext,
} from "@reboot-dev/reboot";
import { createReadStream, promises as fs } from "fs";
import OpenAI from "openai";
import path from "path";
import { z } from "zod/v4";
import { crawl } from "./crawling.js";

async function ensureOpenAIVectorStoreCreated({
  openai,
  name,
}: {
  openai: OpenAI;
  name: string;
}) {
  const vectorStoreName = `Vector Store for '${name}'`;

  for await (const vectorStore of openai.beta.vectorStores.list()) {
    if (vectorStore.name == vectorStoreName) {
      return vectorStore.id;
    }
  }

  const vectorStore = await openai.beta.vectorStores.create({
    name: vectorStoreName,
  });

  return vectorStore.id;
}

async function ensureOpenAIHasModel(openai: OpenAI, modelId: string) {
  const models = await openai.models.list();

  for (const model of models.data) {
    if (model.id === modelId) {
      return;
    }
  }

  throw new Error(
    `Trying to use '${modelId}' which was not found in ${models}`
  );
}

async function ensureOpenAIAssistantCreated({
  openai,
  name,
  openaiVectorStoreId,
}: {
  openai: OpenAI;
  name: string;
  openaiVectorStoreId: string;
}) {
  for await (const assistant of openai.beta.assistants.list()) {
    if (assistant.name === name) {
      return assistant.id;
    }
  }

  const modelId = "gpt-3.5-turbo";

  await ensureOpenAIHasModel(openai, modelId);

  const openaiAssistant = await openai.beta.assistants.create({
    name,
    instructions: [
      "You are a Q/A chatbot, answering questions based on the",
      "uploaded files to provide the best response to the user.",
      "Do not provide an answer to the question if the",
      "information was not retrieved from the knowledge base.",
    ].join(" "),
    model: modelId,
    tools: [{ type: "file_search" }],
    tool_resources: {
      file_search: {
        vector_store_ids: [openaiVectorStoreId],
      },
    },
  });

  // TODO: it appears as though the vector store is _eventually_
  // attached to the assistant, so we should probably poll to
  // make sure it is attached before returning.

  return openaiAssistant.id;
}

const CRAWL_COMPLETED_FILE_INDEX = BigInt(0);

async function crawlAndUploadFiles({
  openai,
  openaiVectorStoreId,
  url,
  iteration,
}: {
  openai: OpenAI;
  openaiVectorStoreId: string;
  url: string;
  iteration: number;
}) {
  // Check if we've already uploaded all of the files for this iteration. We
  // use a sentinel file that indicates that all of the files have been
  // uploaded, see CRAWL_COMPLETED_FILE_INDEX.
  //
  // Note that on a retry we may determine that we only partially uploaded the
  // files due to a failure. In that case, we completely ignore those files and
  // do a completely new crawl. Those files will eventually be deleted when we
  // remove stale files on a subsequent iteration.
  let fileIds = [];
  let crawlCompleted = false;
  for await (const file of openai.files.list()) {
    const fileInfo = parseFilename(file.filename);
    if (
      fileInfo === null ||
      fileInfo.openaiVectorStoreId != openaiVectorStoreId
    ) {
      // Not our file!
      continue;
    }
    if (fileInfo.iteration != iteration) {
      // Is for a past iteration. Will be cleaned up after indexing for this
      // iteration has completed.
      continue;
    }

    fileIds.push(file.id);
    // If this is the "crawl completed" file (which is last to be uploaded) then
    // the crawl completed.
    crawlCompleted =
      crawlCompleted || fileInfo.fileIndex == CRAWL_COMPLETED_FILE_INDEX;
  }

  if (crawlCompleted) {
    console.log(`Crawl #${iteration} already completed.`);
    return fileIds;
  }

  // Crawl the URL, producing one file per page in a temporary directory.
  console.log(`Crawling for #${iteration}. This might take a little while...`);
  const { tempDir, filepaths } = await crawl({ url });

  console.log("Crawl completed. Uploading files...");

  // Rename each file and then upload it.
  async function createFile(sourceFilepath, fileIndex) {
    const filepath = path.join(
      tempDir.path,
      createFilename(
        new FileInfo(openaiVectorStoreId, iteration, BigInt(fileIndex))
      )
    );
    await fs.rename(sourceFilepath, filepath);
    const file = await openai.files.create({
      file: createReadStream(filepath),
      purpose: "assistants",
    });
    return file.id;
  }

  // We upload all but the `CRAWL_COMPLETED_FILE_INDEX` file in parallel, and
  // then upload that file to signal that the crawl has completed. (NOTE: The
  // OpenAI API doesn't allow empty files, so we can't use an empty placeholder
  // as the sentinel file).
  const filepathEntries = Array.from(filepaths.entries());
  const [crawlCompletedIndex, crawlCompletedFilepath] = filepathEntries.shift();
  const fileIdPromises = filepathEntries.map(([fileIndex, sourceFilepath]) =>
    createFile(sourceFilepath, fileIndex)
  );

  fileIds = await Promise.all(fileIdPromises);
  fileIds.push(await createFile(crawlCompletedFilepath, crawlCompletedIndex));
  return fileIds;
}

async function removeAllFiles({
  openai,
  openaiVectorStoreId,
}: {
  openai: OpenAI;
  openaiVectorStoreId: string;
}) {
  // Delete all files from our vector store.
  const fileDeletes = [];
  for await (const file of openai.files.list()) {
    const fileInfo = parseFilename(file.filename);
    if (
      fileInfo !== null &&
      fileInfo.openaiVectorStoreId == openaiVectorStoreId
    ) {
      console.log(`Deleting file ${file.filename}.`);
      // Delete the file, and its link to the VectorStore (catching errors,
      // in case it was never linked up).
      fileDeletes.push(openai.files.del(file.id));
      fileDeletes.push(
        openai.beta.vectorStores.files
          .del(openaiVectorStoreId, file.id)
          .catch(() => {})
      );
    }
  }

  await Promise.all(fileDeletes);
}

async function removeStaleFiles({
  openai,
  openaiVectorStoreId,
  currentIteration,
}: {
  openai: OpenAI;
  openaiVectorStoreId: string;
  currentIteration: number;
}) {
  // Delete files for our VectorStore, but from previous iterations.
  const fileDeletes = [];
  for await (const file of openai.files.list()) {
    const fileInfo = parseFilename(file.filename);
    if (
      fileInfo !== null &&
      fileInfo.openaiVectorStoreId == openaiVectorStoreId &&
      fileInfo.iteration < currentIteration
    ) {
      // Delete the file, and its link to the VectorStore (catching errors,
      // in case it was never linked up).
      fileDeletes.push(openai.files.del(file.id));
      fileDeletes.push(
        openai.beta.vectorStores.files
          .del(openaiVectorStoreId, file.id)
          .catch(() => {})
      );
    }
  }

  await Promise.all(fileDeletes);
}

function createFilename({
  openaiVectorStoreId,
  iteration,
  fileIndex,
}: FileInfo) {
  return `crawl:${openaiVectorStoreId}:${iteration}:${fileIndex}.pdf`;
}

// Assistant-specific 'FileInfo'.
class FileInfo {
  openaiVectorStoreId: string;
  iteration: number;
  fileIndex: bigint;

  constructor(
    openaiVectorStoreId: string,
    iteration: number,
    fileIndex: bigint
  ) {
    this.openaiVectorStoreId = openaiVectorStoreId;
    this.iteration = iteration;
    this.fileIndex = fileIndex;
  }

  toString(): string {
    return `FileInfo { openaiVectorStoreId: "${this.openaiVectorStoreId}", iteration: ${this.iteration}, fileIndex: ${this.fileIndex} }`;
  }

  equals(other: FileInfo): boolean {
    return (
      this.openaiVectorStoreId === other.openaiVectorStoreId &&
      this.iteration === other.iteration &&
      this.fileIndex === other.fileIndex
    );
  }
}

function parseFilename(filename: string): FileInfo | null {
  const match = filename.match(/^crawl:([^:]+):(\d+):(\d+)\.pdf$/);

  if (!match) {
    return null;
  }
  const [, openaiVectorStoreId, iterationStr, fileIndexStr] = match;
  try {
    const iteration = Number(iterationStr);
    const fileIndex = BigInt(fileIndexStr);
    return new FileInfo(openaiVectorStoreId, iteration, fileIndex);
  } catch (error) {
    return null;
  }
}

function sleep({ ms }: { ms: number }): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AssistantServicer extends Assistant.Servicer {
  static #openai: OpenAI;

  constructor() {
    super();

    // NOTE: expecting OPENAI_API_KEY environment variable.
    AssistantServicer.#openai = new OpenAI();
  }

  authorizer() {
    return allow();
  }

  async create(
    context: WriterContext,
    request: CreateRequest
  ): Promise<PartialMessage<CreateResponse>> {
    this.state.name = request.name;

    // NOTE: calling to OpenAI has side-effects, but more importantly
    // we want to make sure they occur reliably (not partially), so we
    // schedule them to run as a task.
    await this.ref().schedule().ensureOpenAIResourcesCreated(context);

    await this.ref().schedule().crawlControlLoop(context, { url: request.url });

    return {};
  }

  async ensureOpenAIResourcesCreated(
    context: WriterContext,
    request: Empty
  ): Promise<PartialMessage<Empty>> {
    this.state.openaiVectorStoreId = await ensureOpenAIVectorStoreCreated({
      openai: AssistantServicer.#openai,
      name: this.state.name,
    });

    this.state.openaiAssistantId = await ensureOpenAIAssistantCreated({
      openai: AssistantServicer.#openai,
      name: this.state.name,
      openaiVectorStoreId: this.state.openaiVectorStoreId,
    });

    console.log(
      `OpenAI assistant created with ID '${this.state.openaiAssistantId}'`
    );

    return {};
  }

  static async crawlControlLoop(
    context: WorkflowContext,
    request: CrawlControlLoopRequest
  ): Promise<PartialMessage<CrawlControlLoopResponse>> {
    const openaiVectorStoreId = await until(
      `Vector store created`,
      context,
      async () => {
        console.log(`Waiting until vector store created ...`);
        const { openaiVectorStoreId } = await Assistant.ref().read(context);
        return openaiVectorStoreId !== "" && openaiVectorStoreId;
      },
      { schema: z.string() }
    );

    await atLeastOnce(`Remove all files`, context, async () => {
      console.log("Removing all old files for a fresh start.");
      await removeAllFiles({
        openai: AssistantServicer.#openai,
        openaiVectorStoreId,
      });
    });

    // Run control loop every hour.
    const interval = { hours: 1 };

    for await (const iteration of context.loop("Crawl", { interval })) {
      console.log(`Crawl control loop iteration #${iteration}`);

      // Ensure that the crawl has started at least once per
      // iteration.
      const fileIds = await atLeastOnce(
        `Crawl and upload files`,
        context,
        async () => {
          return await crawlAndUploadFiles({
            openai: AssistantServicer.#openai,
            openaiVectorStoreId,
            url: request.url,
            iteration,
          });
        },
        { schema: z.array(z.string()) }
      );

      // Attach them to the vector store (which is idempotent).
      // NOTE: Files cannot be added concurrently, or a 409 is triggered ("The
      // vector store was updated by another process.")
      for (const fileId of fileIds) {
        await AssistantServicer.#openai.beta.vectorStores.files.create(
          openaiVectorStoreId,
          {
            file_id: fileId,
          }
        );
      }

      // Wait for all of them to be available.
      await Promise.all(
        fileIds.map(async (fileId) => {
          while (true) {
            const fileForStatus =
              await AssistantServicer.#openai.beta.vectorStores.files.retrieve(
                openaiVectorStoreId,
                fileId
              );
            if (fileForStatus.status !== "in_progress") {
              console.log(`${fileId} is ready.`);
              break;
            }
            console.log(`Waiting for ${fileId} to be ready...`);

            await sleep({ ms: 500 });
          }
        })
      );

      // Detach and delete stale file(s) each iteration.
      atLeastOnce(`Remove stale files`, context, async () => {
        await removeStaleFiles({
          openai: AssistantServicer.#openai,
          openaiVectorStoreId,
          currentIteration: iteration,
        });
      });

      console.log(`Crawl control loop complete. Next crawl in 1 hour(s)`);
    }

    return {};
  }

  async status(
    context: ReaderContext,
    request: StatusRequest
  ): Promise<PartialMessage<StatusResponse>> {
    return { openaiAssistantId: this.state.openaiAssistantId };
  }
}
