// How a part's bytes are `PUT` to the data plane: the retries a bare
// `fetch` does not have, so that a blip does not fail an upload whose
// control-plane calls ride it out through their client. Bounded,
// unlike that client's retries: an outage is reported, not waited
// out. Internal to the package: the `exports` map leaves it out of
// the public surface.

import { Backoff } from "@reboot-dev/reboot-api";

// How many times one part's `PUT` is attempted before the upload
// fails. The attempts are spaced by the client's own `Backoff`, so
// that a blip is ridden out in a few seconds while an outage is
// reported rather than waited out.
export const PUT_ATTEMPTS = 4;

/**
 * How one attempt to `PUT` a part ended: with the part's ETag, or with
 * a failure that says whether another attempt is worth making, and
 * whether it needs a freshly minted URL first.
 */
export type PutAttempt =
  | { ok: true; etag: string }
  | { ok: false; retry: boolean; remint: boolean; reason: string };

/**
 * One attempt to `PUT` a part. Retried: a request that never got an
 * answer, and the answers a store gives while it is momentarily unable
 * rather than unwilling (408, 429, 5xx). Retried with a fresh URL:
 * 403, what a store answers to a URL whose signature has expired, and
 * an upload that started late in a slow session can outlive the
 * minutes its URLs are minted for. Everything else is refused for
 * good: the request itself is wrong (400), the session is gone (404),
 * the blob is already committed (409), or the part is too large
 * (413). The one 400 that is retried is S3's `RequestTimeout`, its
 * answer to an upload whose socket stalled, which AWS documents as
 * retryable.
 */
export async function tryPutPart(
  url: string,
  bytes: globalThis.Blob | Uint8Array,
  signal?: AbortSignal
): Promise<PutAttempt> {
  signal?.throwIfAborted();
  let response: Response;
  try {
    response = await fetch(url, { method: "PUT", body: bytes, signal });
  } catch (error) {
    // Aborting is the caller's doing, not the network's.
    signal?.throwIfAborted();
    return { ok: false, retry: true, remint: false, reason: `${error}` };
  }
  if (response.ok) {
    const etag = (response.headers.get("ETag") ?? "").replace(/"/g, "");
    if (etag === "") {
      return {
        ok: false,
        retry: false,
        remint: false,
        reason:
          "the upload returned no ETag; if this application uses an " +
          "S3-compatible store, its bucket CORS configuration must " +
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
    signal?.throwIfAborted();
    body = `(body could not be read: ${error})`;
  }
  const reason = `${response.status}: ${body}`;
  if (response.status === 403) {
    return { ok: false, retry: true, remint: true, reason };
  }
  if (
    response.status === 408 ||
    response.status === 429 ||
    response.status >= 500 ||
    (response.status === 400 && body.includes("<Code>RequestTimeout</Code>"))
  ) {
    return { ok: false, retry: true, remint: false, reason };
  }
  return { ok: false, retry: false, remint: false, reason };
}

/**
 * `PUT`s one part's bytes, retrying as `tryPutPart` advises and asking
 * `remint` for a fresh URL when the old one has expired, and returns
 * the part's ETag. Throws for a failure that no attempt can fix, or
 * that outlasts the attempts.
 */
export async function putPartWithRetries(
  partNumber: number,
  url: string,
  bytes: globalThis.Blob | Uint8Array,
  remint: () => Promise<string>,
  options?: { signal?: AbortSignal }
): Promise<string> {
  // Waits of up to half a second, a second and two seconds, each
  // jittered, so that the parts of one upload, which fail together,
  // do not retry together.
  const backoff = new Backoff({
    initialBackoffSeconds: 1,
    maxBackoffSeconds: 4,
    backoffMultiplier: 2,
  });
  for (let attempt = 1; ; attempt++) {
    const outcome = await tryPutPart(url, bytes, options?.signal);
    if (!outcome.ok) {
      if (!outcome.retry || attempt >= PUT_ATTEMPTS) {
        throw new Error(
          `Part ${partNumber} upload failed after ${attempt} ` +
            `attempt${attempt === 1 ? "" : "s"}: ${outcome.reason}`
        );
      }
      if (outcome.remint) {
        url = await remint();
      }
      await backoff.wait();
      continue;
    }
    return outcome.etag;
  }
}
