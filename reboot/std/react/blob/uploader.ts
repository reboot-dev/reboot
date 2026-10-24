// The upload side of `reboot.std.blob`, from the browser: the
// control plane's protocol for getting bytes into a `Blob` the
// application backend has created, abstract over the storage the
// bytes go to. The control-plane calls go through the generated
// browser client, which brings retry, reconnection and
// authentication with it; the one step that is the storage's,
// sending a part's bytes to a URL the control plane answered, is left
// to a subclass. Internal to the package: `index.tsx` exports what is
// public, and the `exports` map leaves this module out.

import { assert } from "@reboot-dev/reboot-api";
import { PromisePool } from "@supercharge/promise-pool";
import {
  Discarded,
  Blob_Status,
  Blob_Transition,
  InfoResponse,
  PartUploadedRequest,
  UploadNotFound,
} from "@reboot-dev/reboot-std-api/blob/v1/blob_pb.js";
import {
  Blob,
  BlobCommitAborted,
  BlobPartUploadUrlAborted,
  BlobInfoAborted,
  BlobPartUploadedAborted,
  BlobRestartUploadAborted,
} from "@reboot-dev/reboot-std-api/blob/v1/blob_rbt_web.js";
import { WebContext } from "@reboot-dev/reboot-web";

/**
 * A part's receipt, as the control plane records it: what uploading
 * the part answered with, of the storage's kind.
 */
export type Receipt = PartUploadedRequest["receipt"];

// How many parts `upload()` has in flight at once. Parts are
// independent, and uploading them one at a time leaves most of the
// available bandwidth unused on any connection with real latency.
const UPLOAD_CONCURRENCY = 4;

export interface UploadOptions {
  signal?: AbortSignal;
}

/**
 * How an upload is refused: the `Aborted` of whichever `Blob` method
 * refused it, carrying that method's declared error as `error`. A
 * `BlobCommitAborted` carrying a `CommitRefused` is the bucket's
 * verdict on the commit, whose `reason` says what was uploaded
 * cannot commit as reported. One carrying an `UploadNotFound`, as
 * `BlobCommitAborted` or `BlobPartUploadUrlAborted`, says the bucket
 * no longer holds the upload, which `upload()` restarts on its own.
 */
export type BlobUploadAborted =
  | BlobInfoAborted
  | BlobPartUploadUrlAborted
  | BlobPartUploadedAborted
  | BlobCommitAborted
  | BlobRestartUploadAborted;

function isBlobUploadAborted(error: unknown): error is BlobUploadAborted {
  return (
    error instanceof BlobInfoAborted ||
    error instanceof BlobPartUploadUrlAborted ||
    error instanceof BlobPartUploadedAborted ||
    error instanceof BlobCommitAborted ||
    error instanceof BlobRestartUploadAborted
  );
}

/**
 * Whether `error` carries `UploadNotFound`: the storage no longer
 * holds the upload, as `uploadPart` reports for a part and the blob's
 * workflow records for a commit.
 */
function isUploadNotFound(error: unknown): boolean {
  return isBlobUploadAborted(error) && error.error instanceof UploadNotFound;
}

/**
 * Uploads bytes into a `Blob` that the application backend has
 * created (blob creation is always application-mediated; ask your
 * backend for a blob ID first).
 *
 * `upload(...)` takes a `File`/`Blob`/`Uint8Array` you already have
 * through `waitForReady()`, `uploadParts(...)` and `commit()` in
 * turn, which can also be called one at a time, with
 * `restartUpload()` in between when the storage has dropped the
 * upload. Attaching an uploader to a partially-uploaded blob resumes
 * it: already-confirmed parts are skipped.
 *
 * Abstract over the storage the bytes go to: everything here is the
 * control plane's protocol, which is the same whatever the storage,
 * and a subclass provides `uploadPart`, the one step that is the
 * storage's: sending a part's bytes to the URL the control plane
 * answered, by whatever request the storage takes, and answering the
 * receipt of the storage's kind (`S3BlobUploader` for an
 * S3-compatible bucket).
 */
export abstract class BlobUploader {
  protected options: { url: string; blobId: string; bearerToken?: string };
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
   * Sends one part's bytes to the URL `partUploadUrl` answers, by
   * whatever request the storage takes, and returns the receipt the
   * storage answered with, of the kind the control plane records as
   * `BlobPart.receipt`. Retries as the storage warrants, asking
   * `partUploadUrl` again when the URL it has has expired, and
   * rejects for a failure that no attempt can fix, or that outlasts
   * the attempts: with `BlobPartUploadUrlAborted` carrying
   * `UploadNotFound` when the storage no longer holds the upload the
   * URL names.
   */
  protected abstract uploadPart(
    partNumber: number,
    bytes: globalThis.Blob | Uint8Array,
    partUploadUrl: () => Promise<URL>,
    options?: { signal?: AbortSignal }
  ): Promise<Receipt>;

  /**
   * Commits the upload and waits for the bucket to confirm. Rejects
   * with `BlobCommitAborted`: when `Commit` refuses up front (parts
   * missing, or sizes that do not add up), or, carrying a
   * `CommitRefused`, when the bucket refuses what was uploaded; its
   * `error.reason` describes what went wrong but does not identify
   * which parts, if any, were at fault; or, carrying an
   * `UploadNotFound`, when the bucket no longer holds the upload.
   * Parts are safe to upload again, after `restartUpload()` for the
   * latter.
   */
  async commit(options?: { signal?: AbortSignal }): Promise<void> {
    // `Commit` returns as soon as the commit is asked for; the
    // outcome lands on the blob's state later. Subscribe rather than
    // re-read on a timer: `Info` is a reader, so the update is
    // pushed. Committing before watching is safe because a reactive
    // read always yields current state before any update.
    await this.blob.commit(this.context, {}, options);

    const [infos] = await this.blob
      .reactively()
      .info(this.context, {}, options);
    for await (const { response: info, aborted } of infos) {
      if (aborted !== undefined) {
        throw aborted;
      }
      if (
        info.transition === Blob_Transition.DISCARD ||
        info.status === Blob_Status.DISCARDED
      ) {
        // Discarding is not a verdict on the commit: there is no blob
        // left to repair or to commit again, which is what `Commit`
        // itself answers once a discard has been asked for.
        throw new BlobCommitAborted(new Discarded(), {
          message: `blob ${this.options.blobId} has been discarded`,
        });
      }
      if (info.transition === Blob_Transition.COMMIT) {
        // Still completing.
        continue;
      }
      if (info.status === Blob_Status.COMMITTED) {
        return;
      }
      // The blob's workflow records why the commit did not commit
      // on the blob as it clears the transition, since a browser
      // cannot await the workflow; raised here as `Commit`'s own
      // error, which declares both for this.
      switch (info.commitFailure.case) {
        case "commitRefused":
          throw new BlobCommitAborted(info.commitFailure.value, {
            message: info.commitFailure.value.reason,
          });
        case "uploadNotFound":
          throw new BlobCommitAborted(info.commitFailure.value, {
            message:
              `the bucket no longer holds the upload of blob ` +
              `${this.options.blobId}`,
          });
        default:
          throw new Error(
            `Blob ${this.options.blobId} is uploading again without a ` +
              "commit failure"
          );
      }
    }
    // A reactive read runs until it is aborted, so the watch ends
    // without a verdict only when the caller aborted it: its reason
    // is thrown.
    assert(options?.signal?.aborted);
    throw options.signal.reason;
  }

  /**
   * Uploads `data` in parts and commits: the whole story for bytes
   * you already have, as `waitForReady`, `uploadParts` and `commit`
   * in turn. Resumes where a previous attempt left off, and starts
   * over, once, when the storage has dropped the upload. Resolves
   * `{ aborted }` when a `Blob` method refuses, the way a Reboot
   * React mutation resolves, and rejects on an interruption (a part
   * that could not be uploaded even after retries, or the caller's
   * own abort).
   */
  async upload(
    data: globalThis.Blob | Uint8Array,
    options?: UploadOptions
  ): Promise<{ aborted?: BlobUploadAborted }> {
    try {
      let info = await this.waitForReady(options);
      // An upload the storage has dropped is restarted and uploaded
      // again from its first part, once: a storage that drops the
      // restarted one too is reported, not restarted again.
      for (let restarted = false; ; restarted = true) {
        try {
          await this.uploadParts(info, data, options);
          await this.commit(options);
          return {};
        } catch (error) {
          if (restarted || !isUploadNotFound(error)) {
            throw error;
          }
        }
        info = await this.restartUpload(options);
      }
    } catch (error) {
      // A call the caller abandoned throws that call's `Aborted` like
      // any other failure; the caller's own abort is its reason, not
      // a verdict on the upload, so it is thrown as such here.
      options?.signal?.throwIfAborted();
      if (isBlobUploadAborted(error)) {
        return { aborted: error };
      }
      throw error;
    }
  }

  /**
   * Waits for the blob's upload to exist and returns its `Info`,
   * which has everything `uploadParts` needs: the parts the blob
   * already has, and the part size and limit. The blob's workflow
   * begins the upload after `Create` returns, so a blob just created is
   * `CREATED` for a moment, and `Info` is watched until it moves on
   * rather than asked again on a timer. Rejects with
   * `BlobInfoAborted` when this caller may not read the blob.
   */
  async waitForReady(options?: {
    signal?: AbortSignal;
  }): Promise<InfoResponse> {
    const [infos] = await this.blob
      .reactively()
      .info(this.context, {}, options);
    for await (const { response, aborted } of infos) {
      // An error the backend answered with is final here: the watch
      // would only reconnect and be told the same.
      if (aborted !== undefined) {
        throw aborted;
      }
      if (response.status !== Blob_Status.CREATED) {
        return response;
      }
    }
    // A reactive read runs until it is aborted, so the watch ends
    // without an answer only when the caller aborted it: its reason
    // is thrown.
    assert(options?.signal?.aborted);
    throw options.signal.reason;
  }

  /**
   * Begins another upload for the blob in place of the one it has,
   * for one the storage no longer holds, and waits for it to exist.
   * Returns the blob's `Info` for it, which reports no parts, so that
   * `uploadParts` uploads every part again. Rejects with
   * `BlobRestartUploadAborted` once the blob is past uploading,
   * whichever way.
   */
  async restartUpload(options?: {
    signal?: AbortSignal;
  }): Promise<InfoResponse> {
    // As with `commit`: the call asks, the blob's workflow does, and
    // `Info` is watched for the outcome.
    await this.blob.restartUpload(this.context, {}, options);

    const [infos] = await this.blob
      .reactively()
      .info(this.context, {}, options);
    for await (const { response: info, aborted } of infos) {
      if (aborted !== undefined) {
        throw aborted;
      }
      if (
        info.transition === Blob_Transition.DISCARD ||
        info.status === Blob_Status.DISCARDED
      ) {
        throw new BlobRestartUploadAborted(new Discarded(), {
          message: `blob ${this.options.blobId} has been discarded`,
        });
      }
      if (info.transition === Blob_Transition.UPLOAD) {
        // Still beginning it.
        continue;
      }
      return info;
    }
    // A reactive read runs until it is aborted, so the watch ends
    // without an answer only when the caller aborted it: its reason
    // is thrown.
    assert(options?.signal?.aborted);
    throw options.signal.reason;
  }

  /**
   * Uploads `data` in parts, concurrently, skipping the parts `info`
   * says the blob already has, so that an interrupted upload resumes
   * rather than restarts; `info` is what `waitForReady` returned.
   * Rejects with the first part's failure, `BlobPartUploadUrlAborted`
   * or `BlobPartUploadedAborted` when the control plane refuses the
   * part (the blob is no longer uploading, or the part is out of
   * range), `BlobPartUploadUrlAborted` carrying `UploadNotFound` when
   * the storage no longer holds the upload, or the storage's error
   * when a part could not be uploaded even after retries, and stops
   * the parts still in flight.
   */
  async uploadParts(
    info: InfoResponse,
    data: globalThis.Blob | Uint8Array,
    { signal }: UploadOptions = {}
  ): Promise<void> {
    // The numbers of the parts the blob already has.
    const confirmed = new Set(info.parts.map((part) => part.number));
    const partSize = Number(info.partSize);
    const maxParts = info.maxParts;
    const totalBytes = data instanceof Uint8Array ? data.byteLength : data.size;
    const partCount = Math.max(1, Math.ceil(totalBytes / partSize));
    if (partCount > maxParts) {
      throw new Error(
        `${totalBytes} bytes need ${partCount} parts of ${partSize}, ` +
          `more than the ${maxParts} an upload may have`
      );
    }

    // The parts share one signal: the caller's, plus a stop as soon as
    // one of them has failed for good, so that the others do not run
    // out their retries and report parts to a blob whose upload has
    // already been rejected.
    const controller = new AbortController();
    signal?.addEventListener("abort", () => controller.abort(signal.reason), {
      once: true,
    });
    const options = { signal: controller.signal };

    const pending: number[] = [];
    for (let partNumber = 1; partNumber <= partCount; partNumber++) {
      if (!confirmed.has(partNumber)) {
        pending.push(partNumber);
      }
    }

    // Each part asks for its URL just before its upload: the URLs are
    // short-lived, so asking for them all up front would see the
    // later ones expire before their turn.
    await PromisePool.withConcurrency(UPLOAD_CONCURRENCY)
      .for(pending)
      .handleError(async (error) => {
        // Thrown so that the pool stops and this rejects with the
        // first failure; the parts still in flight are aborted.
        controller.abort(error);
        throw error;
      })
      .process(async (partNumber) => {
        const offset = (partNumber - 1) * partSize;
        const bytes = data.slice(
          offset,
          Math.min(offset + partSize, totalBytes)
        );
        // Sending the bytes is the storage's, through `uploadPart`,
        // which retries it a bounded number of times, unlike the
        // control-plane calls, whose client retries them for as long
        // as the caller waits. A part that outlasts the attempts
        // rejects too; it is then still pending, and a later
        // `upload()` of the same blob picks it up again.
        const receipt = await this.uploadPart(
          partNumber,
          bytes,
          async () => {
            // The URL to upload this part to, from the control plane,
            // resolved against the application's URL. Refused with
            // `BlobPartUploadUrlAborted` for a blob that is no longer
            // uploading (`AlreadyCommitted` or `Discarded`) or a part
            // number past what its declared size allows
            // (`IncompleteParts`).
            const { urlReference } = await this.blob.partUploadUrl(
              this.context,
              { partNumber },
              options
            );
            return new URL(urlReference, this.options.url);
          },
          options
        );
        const size =
          bytes instanceof Uint8Array ? bytes.byteLength : bytes.size;
        // Reported to the control plane, which refuses a part for a
        // blob that is no longer uploading, or out of range.
        await this.blob.partUploaded(
          this.context,
          { partNumber, receipt, size: BigInt(size) },
          options
        );
      });
  }
}
