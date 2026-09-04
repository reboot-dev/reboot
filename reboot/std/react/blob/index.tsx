// Browser-side helpers for `reboot.std.blob`: a dead-simple hook for
// uploading a `File` into a `Blob` the application backend has
// created, plus the lower-level `BlobUploader` for bytes that come
// from somewhere other than a file input.
//
// The control-plane calls go through the generated browser client,
// which brings retry, reconnection and authentication with it; only
// the bytes are handled here directly, `PUT` to the URLs the control
// plane mints (the application's own data plane for the `filesystem`
// store, presigned S3 URLs for the `s3` store — the uploader neither
// knows nor cares which). Those `PUT`s are not Reboot RPCs, so they
// stay a plain `fetch`.

import { useRebootClient } from "@reboot-dev/reboot-react";
import { Blob_Status } from "@reboot-dev/reboot-std-api/blob/v1/blob_pb.js";
import { useBlob } from "@reboot-dev/reboot-std-api/blob/v1/blob_rbt_react.js";
import { Blob } from "@reboot-dev/reboot-std-api/blob/v1/blob_rbt_web.js";
import { WebContext } from "@reboot-dev/reboot-web";
import { useMemo } from "react";

// Re-exported so applications can reactively render blob metadata
// (e.g. a progress bar for an attachment some *other* client is
// uploading) without a separate import of the generated client.
export { useBlob };

// How many parts `upload()` has in flight at once. Parts are
// independent, and uploading them one at a time leaves most of the
// available bandwidth unused on any connection with real latency.
const UPLOAD_CONCURRENCY = 4;

// How long `useBlobDownloadUrl` asks its URL to stay valid for. The
// store caps what it grants; the granted value comes back on the
// response.
const DOWNLOAD_URL_TTL_SECONDS = 60 * 60;

export interface UploadProgress {
  uploadedBytes: number;
  totalBytes: number;
}

export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

export interface UploadResult {
  // The committed object's ETag: an opaque token from the data
  // plane, not a digest of the uploaded bytes.
  etag?: string;
  error?: string;
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
   * for the blob's upload session to be provisioned.
   */
  async instructions(
    partNumbers: number[],
    options?: { signal?: AbortSignal }
  ): Promise<{ partSize: number; urls: Map<number, string> }> {
    // `ready` is false until the `BeginUpload` workflow has
    // provisioned the data-plane upload session, so watch until it
    // flips rather than asking again on a timer.
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
      for await (const response of responses) {
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
        return { partSize: Number(response.partSize), urls };
      }
      options?.signal?.throwIfAborted();
      throw new Error(
        `Stopped watching blob ${this.options.blobId} before its upload ` +
          "session was provisioned"
      );
    } finally {
      // Tear the stream down as soon as we have our answer.
      controller.abort();
    }
  }

  /**
   * `PUT`s one part's bytes to the data plane and reports it to the
   * control plane. Idempotent per part number.
   */
  async putPart(
    partNumber: number,
    bytes: globalThis.Blob | Uint8Array,
    options?: { signal?: AbortSignal }
  ): Promise<void> {
    const { urls } = await this.instructions([partNumber], options);
    const url = urls.get(partNumber);
    if (url === undefined) {
      throw new Error(`No upload URL for part ${partNumber}`);
    }
    await this.putPartToUrl(partNumber, url, bytes, options);
  }

  /**
   * `PUT`s one part's bytes to an already-minted URL and reports it to
   * the control plane.
   */
  private async putPartToUrl(
    partNumber: number,
    url: string,
    bytes: globalThis.Blob | Uint8Array,
    options?: { signal?: AbortSignal }
  ): Promise<void> {
    const response = await fetch(url, {
      method: "PUT",
      body: bytes,
      signal: options?.signal,
    });
    if (!response.ok) {
      throw new Error(
        `Part ${partNumber} upload failed (${response.status}): ` +
          `${await response.text()}`
      );
    }
    const etag = (response.headers.get("ETag") ?? "").replace(/"/g, "");
    if (etag === "") {
      throw new Error(
        `Part ${partNumber} upload returned no ETag; if this ` +
          "application uses an S3-compatible store, its bucket CORS " +
          "configuration must expose the `ETag` header"
      );
    }
    const size = bytes instanceof Uint8Array ? bytes.byteLength : bytes.size;
    await this.blob.partUploaded(this.context, {
      partNumber,
      etag,
      size: BigInt(size),
    });
    this.confirmed.set(partNumber, size);
  }

  /**
   * Commits the upload and waits for the data plane to confirm,
   * returning the blob's ETag or the reason the commit failed. The
   * failure reason describes what went wrong but does not identify
   * which parts, if any, were at fault; to retry, re-`putPart` (parts
   * are safe to re-upload) and call `commit` again.
   */
  async commit(options?: { signal?: AbortSignal }): Promise<UploadResult> {
    // `Commit` returns as soon as the blob is marked COMMITTING; the
    // data plane finalizes the object in a workflow, and the outcome
    // lands back on the blob's state. Subscribe rather than re-read on
    // a timer: `Info` is a reader, so the update is pushed. Committing
    // first is safe because a reactive read always yields current
    // state before any update, and `Commit` clears the error from a
    // previous attempt as it marks the blob COMMITTING.
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
      for await (const info of infos) {
        if (info.status === Blob_Status.COMMITTED) {
          return { etag: info.etag };
        }
        if (info.commitError !== undefined && info.commitError !== "") {
          return { error: info.commitError };
        }
        if (
          info.status === Blob_Status.REMOVING ||
          info.status === Blob_Status.REMOVED
        ) {
          return { error: "The blob was removed before it committed" };
        }
      }
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
   */
  async upload(
    data: globalThis.Blob | Uint8Array,
    options?: UploadOptions
  ): Promise<UploadResult> {
    // Refresh what the control plane already has, so interrupted
    // uploads resume rather than restart.
    const info = await this.blob.info(this.context);
    this.confirmed = new Map(
      info.parts.map((part) => [part.number, Number(part.size)])
    );

    const { partSize } = await this.instructions([], options);
    const totalBytes = data instanceof Uint8Array ? data.byteLength : data.size;
    const partCount = Math.max(1, Math.ceil(totalBytes / partSize));

    let uploadedBytes = 0;
    for (const [, size] of this.confirmed) {
      uploadedBytes += size;
    }

    const pending: number[] = [];
    for (let partNumber = 1; partNumber <= partCount; partNumber++) {
      if (!this.confirmed.has(partNumber)) {
        pending.push(partNumber);
      }
    }

    // One `instructions` call per window rather than one per part, and
    // no more URLs minted ahead of use than a window's worth: the URLs
    // are short-lived, so fetching them all up front would see the
    // later ones expire before their turn.
    for (let index = 0; index < pending.length; index += UPLOAD_CONCURRENCY) {
      const window = pending.slice(index, index + UPLOAD_CONCURRENCY);
      const { urls } = await this.instructions(window, options);
      await Promise.all(
        window.map(async (partNumber) => {
          const url = urls.get(partNumber);
          if (url === undefined) {
            throw new Error(`No upload URL for part ${partNumber}`);
          }
          const offset = (partNumber - 1) * partSize;
          const bytes = data.slice(
            offset,
            Math.min(offset + partSize, totalBytes)
          );
          await this.putPartToUrl(partNumber, url, bytes, options);
          uploadedBytes +=
            bytes instanceof Uint8Array ? bytes.byteLength : bytes.size;
          options?.onProgress?.({ uploadedBytes, totalBytes });
        })
      );
    }

    return await this.commit(options);
  }
}

/**
 * The dead-simple upload hook. The blob ID comes from an
 * application-level RPC (blob creation is application-mediated), and
 * then:
 *
 *     const { upload } = useBlobUpload();
 *     ...
 *     const { etag, error } = await upload(blobId, file);
 */
export function useBlobUpload(): {
  upload: (
    blobId: string,
    data: globalThis.Blob | Uint8Array,
    options?: UploadOptions
  ) => Promise<UploadResult>;
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

/**
 * Resolves to a URL from which a committed blob's bytes can be
 * downloaded (e.g. for an `<img src>`), or `undefined` while the blob
 * is still uploading. Render upload progress meanwhile via
 * `useBlob(...).useInfo()`.
 */
export function useBlobDownloadUrl(blobId: string): string | undefined {
  const client = useRebootClient();
  // The generated reader hook rather than a hand-rolled request: it
  // brings the retry, reconnection and authentication the reactive
  // machinery already implements, and re-delivers when the blob
  // commits, so there is nothing here to gate on `status`.
  const { response } = useBlob({ id: blobId }).useGetDownloadUrl({
    ttlSeconds: DOWNLOAD_URL_TTL_SECONDS,
  });

  return useMemo(
    () =>
      response === undefined
        ? undefined
        : new URL(response.url, client.url).toString(),
    [response, client.url]
  );
}
