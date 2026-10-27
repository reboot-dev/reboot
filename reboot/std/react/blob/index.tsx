// Browser-side helpers for `reboot.std.blob`: a dead-simple hook for
// uploading a `File` into a `Blob` the application backend has
// created, plus the lower-level `BlobUploader` for bytes that come
// from somewhere other than a file input.
//
// The control-plane calls go through the generated browser client,
// which brings retry, reconnection and authentication with it; only
// the bytes are handled here directly, `PUT` to the URLs the control
// plane mints (relative to the application for a bucket it forwards
// to, presigned S3 URLs otherwise — the uploader neither knows nor
// cares which). Those `PUT`s are not Reboot RPCs, so they are a plain
// `fetch`, with retries of their own in `put.ts`.

import { useRebootClient } from "@reboot-dev/reboot-react";
import { PromisePool } from "@supercharge/promise-pool";
import {
  AlreadyCommitted,
  Blob_Status,
} from "@reboot-dev/reboot-std-api/blob/v1/blob_pb.js";
import { useBlob } from "@reboot-dev/reboot-std-api/blob/v1/blob_rbt_react.js";
import {
  Blob,
  BlobCommitAborted,
  BlobCommitWorkflowAborted,
  BlobGetDownloadUrlAborted,
  BlobGetPartUploadInstructionsAborted,
  BlobInfoAborted,
  BlobPartUploadedAborted,
} from "@reboot-dev/reboot-std-api/blob/v1/blob_rbt_web.js";
import { WebContext } from "@reboot-dev/reboot-web";
import { useEffect, useMemo, useState } from "react";
import { putPartWithRetries } from "./put.js";

// Re-exported so applications can reactively render blob metadata
// (e.g. a progress bar for an attachment some *other* client is
// uploading) without a separate import of the generated client.
export { useBlob };

// How many parts `upload()` has in flight at once. Parts are
// independent, and uploading them one at a time leaves most of the
// available bandwidth unused on any connection with real latency.
const UPLOAD_CONCURRENCY = 4;

// How long `useBlobDownloadUrl` asks its URL to stay valid for. The
// S3 caps what it grants; the granted value comes back on the
// response, and the hook mints a fresh URL before it lapses.
const DOWNLOAD_URL_TTL_SECONDS = 60 * 60;

export interface UploadProgress {
  uploadedBytes: number;
  totalBytes: number;
}

export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

/**
 * How an upload is refused: the `Aborted` of whichever `Blob` method
 * refused it, carrying that method's declared error as `error`. The
 * `CommitWorkflow` one is the bucket's verdict on the commit, a
 * `CommitRefused` whose `reason` says what was uploaded cannot commit
 * as reported.
 */
export type BlobUploadAborted =
  | BlobInfoAborted
  | BlobGetPartUploadInstructionsAborted
  | BlobPartUploadedAborted
  | BlobCommitAborted
  | BlobCommitWorkflowAborted;

function isBlobUploadAborted(error: unknown): error is BlobUploadAborted {
  return (
    error instanceof BlobInfoAborted ||
    error instanceof BlobGetPartUploadInstructionsAborted ||
    error instanceof BlobPartUploadedAborted ||
    error instanceof BlobCommitAborted ||
    error instanceof BlobCommitWorkflowAborted
  );
}

/**
 * Uploads bytes into a `Blob` that the application backend has
 * created (blob creation is always application-mediated; ask your
 * backend for a blob ID first).
 *
 * Use `upload(...)` for a `File`/`Blob`/`Uint8Array` you already
 * have, or `putPart(...)`/`commit()` directly when producing bytes
 * incrementally from some other source. Attaching an uploader to a
 * partially-uploaded blob resumes it: already-confirmed parts are
 * skipped.
 */
export class BlobUploader {
  private options: { url: string; blobId: string; bearerToken?: string };
  private confirmed: Map<number, number> = new Map();
  private blob: Blob.WeakReference;
  private context: WebContext;

  constructor(options: { url: string; blobId: string; bearerToken?: string }) {
    this.options = options;
    this.blob = Blob.ref(options.blobId);
    this.context = new WebContext({
      url: options.url,
      bearerToken: options.bearerToken,
    });
  }

  /**
   * Fetches upload instructions for the given part numbers, waiting
   * for the blob's multipart upload to be created. Rejects with
   * `BlobGetPartUploadInstructionsAborted` for a blob that is no
   * longer uploading.
   */
  async partUploadInstructions(
    partNumbers: number[],
    options?: { signal?: AbortSignal }
  ): Promise<{
    partSize: number;
    maxParts: number;
    urls: Map<number, string>;
  }> {
    // `ready` is false until the multipart upload exists, so
    // watch until it flips rather than asking again on a timer. Not
    // if the caller has already aborted, though, in which case no
    // watch is started at all.
    options?.signal?.throwIfAborted();
    const controller = new AbortController();
    options?.signal?.addEventListener("abort", () => controller.abort(), {
      once: true,
    });
    try {
      const [responses] = await this.blob
        .reactively()
        .getPartUploadInstructions(
          this.context,
          { partNumbers },
          { signal: controller.signal }
        );
      for await (const { response, aborted } of responses) {
        // An error the backend answered with -- the blob is already
        // committed, or this caller may not upload -- is final here:
        // the watch would only reconnect and be told the same.
        if (aborted !== undefined) {
          throw aborted;
        }
        if (!response.ready) {
          continue;
        }
        const urls = new Map<number, string>();
        for (const instruction of response.instructions) {
          urls.set(
            instruction.partNumber,
            new URL(instruction.url, this.options.url).toString()
          );
        }
        return {
          partSize: Number(response.partSize),
          maxParts: response.maxParts,
          urls,
        };
      }
      // The watch ends without an answer only when it was aborted: by
      // the caller, whose abort reason is then the error, or by the
      // stream ending on its own, which is not expected.
      options?.signal?.throwIfAborted();
      throw new Error(
        `Stopped watching blob ${this.options.blobId} before its ` +
          "multipart upload was created"
      );
    } finally {
      // Tear the stream down as soon as we have our answer.
      controller.abort();
    }
  }

  /**
   * `PUT`s one part's bytes to the bucket and reports it to the
   * control plane: the step an `upload()` is made of, for a caller
   * that produces its parts itself. Idempotent per part number.
   * Rejects with `BlobGetPartUploadInstructionsAborted` or
   * `BlobPartUploadedAborted` when the control plane refuses the part
   * (the blob is no longer uploading, or the part is out of range).
   *
   * The `PUT` is retried a bounded number of times (the policy is in
   * `put.ts`), unlike the control-plane calls, whose client retries
   * them for as long as the caller waits. A `PUT` that outlasts the
   * attempts rejects too; the part is then still pending, and a later
   * `upload()` of the same blob picks it up again.
   */
  async putPart(
    partNumber: number,
    bytes: globalThis.Blob | Uint8Array,
    options?: { signal?: AbortSignal }
  ): Promise<void> {
    const mint = async () => {
      const { urls } = await this.partUploadInstructions([partNumber], options);
      const url = urls.get(partNumber);
      if (url === undefined) {
        throw new Error(`No upload URL for part ${partNumber}`);
      }
      return url;
    };
    const etag = await putPartWithRetries(
      partNumber,
      await mint(),
      bytes,
      mint,
      options
    );
    const size = bytes instanceof Uint8Array ? bytes.byteLength : bytes.size;
    // The receipt is the kind the servicer checks parts by: S3's ETag.
    await this.blob.partUploaded(this.context, {
      partNumber,
      receipt: { case: "etag", value: etag },
      size: BigInt(size),
    });
    this.confirmed.set(partNumber, size);
  }

  /**
   * Commits the upload and waits for the bucket to confirm. Rejects
   * with `BlobCommitAborted` when `Commit` refuses up front (parts
   * missing, or sizes that do not add up), or with
   * `BlobCommitWorkflowAborted` when the bucket refuses what was
   * uploaded; its `error.reason` describes what went wrong but does
   * not identify which parts, if any, were at fault. To retry,
   * `putPart` again (parts are safe to re-upload) and `commit` again.
   */
  async commit(options?: { signal?: AbortSignal }): Promise<void> {
    // `Commit` returns as soon as the blob is marked COMMITTING; the
    // outcome lands on the blob's state later. Subscribe rather than
    // re-read on a timer: `Info` is a reader, so the update is
    // pushed. Committing before watching is safe because a reactive
    // read always yields current state before any update. No watch
    // is started for a caller that has already aborted, though.
    await this.blob.commit(this.context);

    options?.signal?.throwIfAborted();
    const controller = new AbortController();
    options?.signal?.addEventListener("abort", () => controller.abort(), {
      once: true,
    });
    try {
      const [infos] = await this.blob
        .reactively()
        .info(this.context, {}, { signal: controller.signal });
      for await (const { response: info, aborted } of infos) {
        if (aborted !== undefined) {
          throw aborted;
        }
        if (info.status === Blob_Status.COMMITTED) {
          return;
        }
        if (info.status === Blob_Status.UPLOADING) {
          // `CommitWorkflow` records the error it aborts with on the
          // blob before reverting the status, since a browser cannot
          // await the task; raised here as that same abort, as though
          // this caller had run the workflow.
          if (info.commitRefused === undefined) {
            throw new Error(
              `Blob ${this.options.blobId} reverted to uploading ` +
                "without a commit refusal"
            );
          }
          throw new BlobCommitWorkflowAborted(info.commitRefused, {
            message: info.commitRefused.reason,
          });
        }
        if (
          info.status === Blob_Status.REMOVE_WHILE_COMMITTING ||
          info.status === Blob_Status.REMOVING ||
          info.status === Blob_Status.REMOVED
        ) {
          // Removal is not a verdict on the commit: there is no blob
          // left to repair or to commit again, which is what `Commit`
          // itself answers once the removal has happened.
          throw new BlobCommitAborted(new AlreadyCommitted(), {
            message: `blob ${this.options.blobId} has been removed`,
          });
        }
      }
      // The watch ends without a verdict only when it was aborted: by
      // the caller, whose abort reason is then the error, or by the
      // stream ending on its own, which is not expected.
      options?.signal?.throwIfAborted();
      throw new Error(
        `Stopped watching blob ${this.options.blobId} before it committed`
      );
    } finally {
      controller.abort();
    }
  }

  /**
   * Uploads `data` in parts and commits: the whole story for bytes
   * you already have. Resumes where a previous attempt left off.
   * Resolves `{ aborted }` when a `Blob` method refuses, the way a
   * Reboot React mutation resolves, and rejects on an interruption
   * (a part that could not be `PUT` even after retries, or the
   * caller's own abort).
   */
  async upload(
    data: globalThis.Blob | Uint8Array,
    options?: UploadOptions
  ): Promise<{ aborted?: BlobUploadAborted }> {
    try {
      await this.uploadAndCommit(data, options);
      return {};
    } catch (error) {
      if (isBlobUploadAborted(error)) {
        return { aborted: error };
      }
      throw error;
    }
  }

  private async uploadAndCommit(
    data: globalThis.Blob | Uint8Array,
    options?: UploadOptions
  ): Promise<void> {
    // Refresh what the control plane already has, so interrupted
    // uploads resume rather than restart.
    const info = await this.blob.info(this.context);
    this.confirmed = new Map(
      info.parts.map((part) => [part.number, Number(part.size)])
    );

    const { partSize, maxParts } = await this.partUploadInstructions(
      [],
      options
    );
    const totalBytes = data instanceof Uint8Array ? data.byteLength : data.size;
    const partCount = Math.max(1, Math.ceil(totalBytes / partSize));
    if (partCount > maxParts) {
      throw new Error(
        `${totalBytes} bytes need ${partCount} parts of ${partSize}, ` +
          `more than the ${maxParts} an upload may have`
      );
    }

    let uploadedBytes = 0;
    for (const [, size] of this.confirmed) {
      uploadedBytes += size;
    }

    // The parts share one signal: the caller's, plus a stop as soon as
    // one of them has failed for good, so that the others do not run
    // out their retries and report parts to a blob whose upload has
    // already been rejected.
    const parts = new AbortController();
    options?.signal?.addEventListener(
      "abort",
      () => parts.abort(options?.signal?.reason),
      { once: true }
    );
    const partOptions = { signal: parts.signal };

    const pending: number[] = [];
    for (let partNumber = 1; partNumber <= partCount; partNumber++) {
      if (!this.confirmed.has(partNumber)) {
        pending.push(partNumber);
      }
    }

    // Each part mints its own URL just before its `PUT`: the URLs are
    // short-lived, so minting them all up front would see the later
    // ones expire before their turn.
    await PromisePool.withConcurrency(UPLOAD_CONCURRENCY)
      .for(pending)
      .handleError(async (error) => {
        // Thrown so that the pool stops and `upload()` rejects with
        // the first failure; the parts still in flight are aborted.
        parts.abort(error);
        throw error;
      })
      .process(async (partNumber) => {
        const offset = (partNumber - 1) * partSize;
        const bytes = data.slice(
          offset,
          Math.min(offset + partSize, totalBytes)
        );
        await this.putPart(partNumber, bytes, partOptions);
        uploadedBytes +=
          bytes instanceof Uint8Array ? bytes.byteLength : bytes.size;
        options?.onProgress?.({ uploadedBytes, totalBytes });
      });

    await this.commit(options);
  }
}

/**
 * The dead-simple upload hook. The blob ID comes from an
 * application-level RPC (blob creation is application-mediated), and
 * then:
 *
 *     const { upload } = useBlobUpload();
 *     ...
 *     const { aborted } = await upload(blobId, file);
 *
 * Like a Reboot React mutation, `upload` resolves `{ aborted }` when
 * the backend refuses, and `aborted` is the `Aborted` of whichever
 * `Blob` method refused: `error` on it is that method's declared
 * error, and `message` says what happened. The refusals another
 * `upload` would only repeat are bytes that do not add up to the
 * `size` the blob was created with (`SizeMismatch`), a blob that is
 * no longer uploading because it was removed or its commit has begun
 * (`AlreadyCommitted`), and the bucket's verdict on the commit
 * (`CommitRefused`, from `CommitWorkflow`): what was uploaded cannot
 * commit as reported. After that last one the blob is back to
 * uploading, but `upload` cannot repair it, since it skips every part
 * the blob already has and the verdict does not say which part is at
 * fault; upload again into a new blob, or replace parts through
 * `BlobUploader.putPart` and `commit` again. A rejection is an
 * interruption: a part that could not be uploaded even after retries,
 * or the caller's own abort. After an interruption the parts that did
 * upload are kept, so calling `upload` again for the same blob
 * resumes rather than restarts. Once a blob's commit has begun, its
 * outcome is read from `useBlob` rather than from `upload`. A blob
 * that is never committed is removed by the backend after a day.
 */
export function useBlobUpload(): {
  upload: (
    blobId: string,
    data: globalThis.Blob | Uint8Array,
    options?: UploadOptions
  ) => Promise<{ aborted?: BlobUploadAborted }>;
} {
  const client = useRebootClient();
  const upload = useMemo(() => {
    return async (
      blobId: string,
      data: globalThis.Blob | Uint8Array,
      options?: UploadOptions
    ) => {
      const uploader = new BlobUploader({
        url: client.url,
        blobId,
        bearerToken: client.bearerToken,
      });
      return await uploader.upload(data, options);
    };
  }, [client.url, client.bearerToken]);
  return { upload };
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * A URL from which a committed blob's bytes can be downloaded (e.g.
 * for an `<img src>`), kept fresh for as long as the component is
 * mounted. Exactly one of the two is ever set: `url` once the blob
 * has committed, `aborted` once it never will (the blob was removed)
 * or this caller may not download it (the blob's download
 * allow-list). Both are `undefined` while the blob is still
 * uploading; render progress meanwhile via `useBlob(...).useInfo()`.
 */
export function useBlobDownloadUrl(
  blobId: string
):
  | { url: string; aborted: undefined }
  | { url: undefined; aborted: BlobGetDownloadUrlAborted }
  | { url: undefined; aborted: undefined } {
  const client = useRebootClient();
  // One reactive read does the waiting: `GetDownloadUrl` answers
  // `ready: false` until the blob commits, so the read stays
  // subscribed and is pushed the URL the moment it does, and aborts
  // only when there will never be one. A reactive read is re-issued
  // when its request changes and not otherwise, so a fresh URL
  // before the last one lapses (S3 caps how long it signs for, and an
  // `<img>` re-rendered after that would 403) is asked for with a
  // later `requestedAt`. Sent to the second, so that components
  // asking within the same second share the read, and the URL.
  const [requestedAtSeconds, setRequestedAtSeconds] = useState(nowSeconds);
  const { response, aborted } = useBlob({ id: blobId }).useGetDownloadUrl({
    ttlSeconds: DOWNLOAD_URL_TTL_SECONDS,
    requestedAt: { seconds: BigInt(requestedAtSeconds) },
  });

  useEffect(() => {
    if (response?.ready !== true || response.ttlSeconds === undefined) {
      return;
    }
    const timer = setTimeout(
      () => setRequestedAtSeconds(nowSeconds()),
      (response.ttlSeconds * 1000 * 9) / 10
    );
    return () => clearTimeout(timer);
  }, [response]);

  // Exactly one of the two, or neither: an `aborted` is final, so a
  // URL from before it is not returned beside it.
  if (aborted !== undefined) {
    return { url: undefined, aborted };
  }
  if (response?.ready === true && response.url !== undefined) {
    return {
      url: new URL(response.url, client.url).toString(),
      aborted: undefined,
    };
  }
  return { url: undefined, aborted: undefined };
}
