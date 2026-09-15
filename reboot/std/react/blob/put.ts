// How a part's bytes are `PUT` to the data plane: the retries a bare
// `fetch` does not have, so that an upload survives what the
// control-plane calls already survive through their client. Internal
// to the package; `index.tsx` is the only importer, and the package's
// `exports` map keeps it that way.

// How many times one part's `PUT` is attempted before the upload
// fails, and how the attempts are spaced: the delay doubles from the
// first one and is capped, so that a blip is ridden out in seconds
// while an outage is reported rather than waited out. Each delay is
// jittered, so that the parts of one window, which fail together, do
// not retry together.
export const PUT_ATTEMPTS = 4;
export const PUT_FIRST_RETRY_DELAY_MS = 500;
export const PUT_MAX_RETRY_DELAY_MS = 5000;

/**
 * Resolves after `ms`, or rejects at once if `signal` aborts first.
 */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * How one attempt to `PUT` a part ended: with the part's ETag, or with
 * a failure that says whether another attempt is worth making, and
 * whether it needs a freshly minted URL first.
 */
export type PutAttempt =
  | { ok: true; etag: string }
  | { ok: false; retry: boolean; remint: boolean; reason: string };

/**
 * What `putPartWithRetries` reaches the world through. Both default to
 * the real thing; a test hands in its own.
 */
export interface PutPartDependencies {
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/**
 * One attempt to `PUT` a part. Retried: a request that never got an
 * answer, and the answers a store gives while it is momentarily unable
 * rather than unwilling (408, 429, 5xx). Retried with a fresh URL:
 * 403, which on either store is what an expired URL earns, and an
 * upload that started late in a slow session can outlive the minutes
 * its URLs are minted for. Everything else is refused for good: the
 * request itself is wrong (400), the session is gone (404), the blob
 * is already committed (409), or the part is too large (413).
 */
export async function tryPutPart(
  url: string,
  bytes: globalThis.Blob | Uint8Array,
  signal?: AbortSignal,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch
): Promise<PutAttempt> {
  let response: Response;
  try {
    response = await fetchImpl(url, { method: "PUT", body: bytes, signal });
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
  const reason = `${response.status}: ${await response.text()}`;
  if (response.status === 403) {
    return { ok: false, retry: true, remint: true, reason };
  }
  if (
    response.status === 408 ||
    response.status === 429 ||
    response.status >= 500
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
  options?: { signal?: AbortSignal } & PutPartDependencies
): Promise<string> {
  const fetchImpl = options?.fetch ?? globalThis.fetch;
  const sleep = options?.sleep ?? delay;
  for (let attempt = 1; ; attempt++) {
    const outcome = await tryPutPart(url, bytes, options?.signal, fetchImpl);
    // Compared rather than negated: this package compiles without
    // `strict`, and only an equality check narrows a discriminant
    // then.
    if (outcome.ok === false) {
      if (!outcome.retry || attempt >= PUT_ATTEMPTS) {
        throw new Error(
          `Part ${partNumber} upload failed after ${attempt} ` +
            `attempt${attempt === 1 ? "" : "s"}: ${outcome.reason}`
        );
      }
      if (outcome.remint) {
        url = await remint();
      }
      const backoff = Math.min(
        PUT_MAX_RETRY_DELAY_MS,
        PUT_FIRST_RETRY_DELAY_MS * 2 ** (attempt - 1)
      );
      await sleep(backoff * (0.5 + Math.random() / 2), options?.signal);
      continue;
    }
    return outcome.etag;
  }
}
