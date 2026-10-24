// The `BlobUploader` for an S3-compatible bucket: how a part's bytes
// are `PUT` to it, with the retries a bare `fetch` does not have, so
// that a blip does not fail an upload whose control-plane calls ride
// it out through their client -- bounded, unlike that client's
// retries, so that an outage is reported, not waited out -- and the
// `ETag` the `PUT` answers with as the part's receipt. Internal to
// the package: `index.tsx` exports the class, and the `exports` map
// leaves this module out.

import { Backoff } from "@reboot-dev/reboot-api";
import { UploadNotFound } from "@reboot-dev/reboot-std-api/blob/v1/blob_pb.js";
import { BlobPartUploadUrlAborted } from "@reboot-dev/reboot-std-api/blob/v1/blob_rbt_web.js";
import { BlobUploader, Receipt } from "./uploader.js";

// How many times one part's `PUT` is attempted before the upload
// fails. The attempts are spaced by the client's own `Backoff`, so
// that a blip is ridden out in a few seconds while an outage is
// reported rather than waited out.
export const PUT_ATTEMPTS = 4;

/**
 * How one attempt to `PUT` a part ended: with the part's ETag, or with
 * a failure that says whether another attempt is worth making,
 * whether the URL has expired, so that it needs another first, and
 * whether the upload itself was not found, so that no URL for it
 * will do.
 */
export type PutResult =
  | { ok: true; etag: string }
  | {
      ok: false;
      retry: boolean;
      expired: boolean;
      notFound: boolean;
      reason: string;
    };

/**
 * One attempt to `PUT` a part. Retried: a request that never got an
 * answer, and the answers S3 gives while it is momentarily unable
 * rather than unwilling (408, 429, 5xx). Retried with a fresh URL:
 * 403, what S3 answers to a URL whose signature has expired, and
 * an upload that started late in a slow session can outlive the
 * minutes its URLs are presigned for. Not found: 404, what S3
 * answers for a multipart upload it no longer holds, dropped for
 * going uncompleted too long, or consumed by a completion. Everything
 * else
 * is refused for good: the request itself is wrong (400), the blob
 * is already committed (409), or the part is too large (413). The
 * one 400 that is retried is S3's `RequestTimeout`, its answer to an
 * upload whose socket stalled, which AWS documents as retryable.
 */
export async function tryPutPart(
  url: URL,
  bytes: globalThis.Blob | Uint8Array,
  signal?: AbortSignal
): Promise<PutResult> {
  let response: Response;
  try {
    response = await fetch(url, { method: "PUT", body: bytes, signal });
  } catch (error) {
    // `fetch` rejects both for a network failure, which is retried
    // below, and for the caller's abort, which is not: an abort is
    // the caller's doing, so it is thrown as such rather than
    // reported as an attempt to make again.
    signal?.throwIfAborted();
    return {
      ok: false,
      retry: true,
      expired: false,
      notFound: false,
      reason: `${error}`,
    };
  }
  if (response.ok) {
    const etag = (response.headers.get("ETag") ?? "").replace(/"/g, "");
    if (etag === "") {
      return {
        ok: false,
        retry: false,
        expired: false,
        notFound: false,
        reason:
          "the upload returned no ETag; if this application uses an " +
          "S3-compatible bucket, its CORS configuration must " +
          "expose the `ETag` header",
      };
    }
    return { ok: true, etag };
  }
  // The status is the verdict; the body only explains it, so a body
  // that cannot be read (a connection dropped after the headers) is
  // not a reason to skip the retry the status calls for.
  let body: string;
  try {
    body = await response.text();
  } catch (error) {
    // As above: reading the body fails for the caller's abort too,
    // which is thrown as such rather than treated as a body that
    // could not be read.
    signal?.throwIfAborted();
    body = `(body could not be read: ${error})`;
  }
  const reason = `${response.status}: ${body}`;
  if (response.status === 403) {
    return { ok: false, retry: true, expired: true, notFound: false, reason };
  }
  if (response.status === 404) {
    return { ok: false, retry: false, expired: false, notFound: true, reason };
  }
  if (
    response.status === 408 ||
    response.status === 429 ||
    response.status >= 500 ||
    (response.status === 400 && body.includes("<Code>RequestTimeout</Code>"))
  ) {
    return { ok: false, retry: true, expired: false, notFound: false, reason };
  }
  return { ok: false, retry: false, expired: false, notFound: false, reason };
}

/**
 * `PUT`s one part's bytes to the URL `partUploadUrl` answers,
 * retrying as `tryPutPart` advises and asking `partUploadUrl` again
 * when the URL has expired, and returns the part's ETag. Throws for
 * a failure that no attempt can fix, or that outlasts the attempts:
 * `BlobPartUploadUrlAborted` carrying `UploadNotFound` when the
 * bucket no longer holds the upload.
 */
export async function putPartWithRetries(
  partNumber: number,
  bytes: globalThis.Blob | Uint8Array,
  partUploadUrl: () => Promise<URL>,
  options?: { signal?: AbortSignal }
): Promise<string> {
  let url = await partUploadUrl();
  // Waits of up to half a second, a second and two seconds, each
  // jittered, so that the parts of one upload, which fail together,
  // do not retry together.
  const backoff = new Backoff({
    initialBackoffSeconds: 1,
    maxBackoffSeconds: 4,
    backoffMultiplier: 2,
  });
  for (let attempt = 1; ; attempt++) {
    const result = await tryPutPart(url, bytes, options?.signal);
    if (!result.ok) {
      if (result.notFound) {
        // The URL `partUploadUrl` answered names an upload the bucket
        // no longer holds, which `PartUploadUrl` declares for this.
        throw new BlobPartUploadUrlAborted(new UploadNotFound(), {
          message:
            `Part ${partNumber} upload failed: the upload was not ` +
            `found (${result.reason})`,
        });
      }
      if (!result.retry || attempt >= PUT_ATTEMPTS) {
        throw new Error(
          `Part ${partNumber} upload failed after ${attempt} ` +
            `attempt${attempt === 1 ? "" : "s"}: ${result.reason}`
        );
      }
      if (result.expired) {
        url = await partUploadUrl();
      }
      await backoff.wait();
      continue;
    }
    return result.etag;
  }
}

/**
 * Uploads bytes into a `Blob` whose bytes an S3-compatible bucket
 * keeps: `BlobUploader` with the part `PUT` above, and the part's
 * `ETag` as its receipt.
 */
export class S3BlobUploader extends BlobUploader {
  protected async uploadPart(
    partNumber: number,
    bytes: globalThis.Blob | Uint8Array,
    partUploadUrl: () => Promise<URL>,
    options?: { signal?: AbortSignal }
  ): Promise<Receipt> {
    const etag = await putPartWithRetries(
      partNumber,
      bytes,
      partUploadUrl,
      options
    );
    return { case: "etag", value: etag };
  }
}
