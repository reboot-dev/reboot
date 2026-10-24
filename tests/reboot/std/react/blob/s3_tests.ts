import { Backoff } from "@reboot-dev/reboot-api";
import { UploadNotFound } from "@reboot-dev/reboot-std-api/blob/v1/blob_pb.js";
import { BlobPartUploadUrlAborted } from "@reboot-dev/reboot-std-api/blob/v1/blob_rbt_web.js";
import { strict as assert } from "node:assert";
import test, { mock } from "node:test";
import {
  PUT_ATTEMPTS,
  putPartWithRetries,
} from "../../../../../reboot/std/react/blob/s3.js";

const BYTES = new Uint8Array([1, 2, 3]);

/**
 * Mocks `fetch` to answer from a script, one entry per call: a status
 * (with an `ETag` for a success), an `Error` to reject with, or a
 * ready-made `Response`. Records what it was asked, so a test can see
 * which URL each attempt went to.
 */
function scriptedFetch(script: (number | Error | Response)[]): {
  urls: string[];
} {
  const urls: string[] = [];
  mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    urls.push(input.toString());
    const next = script.shift();
    if (next === undefined) {
      throw new Error("scripted fetch was called more often than scripted");
    }
    if (next instanceof Error) {
      throw next;
    }
    if (next instanceof Response) {
      return next;
    }
    return new Response(`body for ${next}`, {
      status: next,
      headers: next === 200 ? { ETag: '"etag-of-the-part"' } : {},
    });
  });
  return { urls };
}

/**
 * Mocks `Backoff.wait` to never wait but count the waits, so a test
 * can check that each retry backed off, and runs `onWait` on each.
 */
function countedBackoff(onWait?: () => void): { waits: { count: number } } {
  const waits = { count: 0 };
  mock.method(Backoff.prototype, "wait", async () => {
    waits.count += 1;
    onWait?.();
  });
  return { waits };
}

/**
 * A response whose headers arrived but whose body never will: the
 * connection dropped in between, so reading the body rejects.
 */
function headersOnly(status: number): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.error(new Error("connection reset"));
      },
    }),
    { status }
  );
}

/**
 * A `partUploadUrl` that answers `urls` in turn, and throws once asked
 * for more than that.
 */
function partUploadUrls(...urls: string[]): () => Promise<URL> {
  return async () => {
    const url = urls.shift();
    if (url === undefined) {
      throw new Error("another URL was not expected to be asked for");
    }
    return new URL(url);
  };
}

test("putPartWithRetries", async (t) => {
  t.afterEach(() => {
    mock.restoreAll();
  });

  await t.test("returns the ETag of a first-time success", async () => {
    const { urls } = scriptedFetch([200]);
    const { waits } = countedBackoff();
    const etag = await putPartWithRetries(
      1,
      BYTES,
      partUploadUrls("https://bucket/part")
    );
    assert.equal(etag, "etag-of-the-part");
    assert.deepEqual(urls, ["https://bucket/part"]);
    assert.equal(waits.count, 0);
  });

  await t.test("retries a 5xx, then a dropped connection", async () => {
    const { urls } = scriptedFetch([503, new TypeError("fetch failed"), 200]);
    const { waits } = countedBackoff();
    const etag = await putPartWithRetries(
      1,
      BYTES,
      partUploadUrls("https://bucket/part")
    );
    assert.equal(etag, "etag-of-the-part");
    assert.equal(urls.length, 3);
    // One backoff per retry.
    assert.equal(waits.count, 2);
  });

  await t.test("retries a 408, then a 429", async () => {
    const { urls } = scriptedFetch([408, 429, 200]);
    const { waits } = countedBackoff();
    const etag = await putPartWithRetries(
      1,
      BYTES,
      partUploadUrls("https://bucket/part")
    );
    assert.equal(etag, "etag-of-the-part");
    assert.equal(urls.length, 3);
    assert.equal(waits.count, 2);
  });

  await t.test("retries S3's 400 RequestTimeout", async () => {
    const { urls } = scriptedFetch([
      new Response(
        "<Error><Code>RequestTimeout</Code><Message>Your socket " +
          "connection to the server was not read from or written to " +
          "within the timeout period.</Message></Error>",
        { status: 400 }
      ),
      200,
    ]);
    const { waits } = countedBackoff();
    const etag = await putPartWithRetries(
      1,
      BYTES,
      partUploadUrls("https://bucket/part")
    );
    assert.equal(etag, "etag-of-the-part");
    assert.equal(urls.length, 2);
    assert.equal(waits.count, 1);
  });

  await t.test("retries a 503 whose body never arrived", async () => {
    const { urls } = scriptedFetch([headersOnly(503), 200]);
    const { waits } = countedBackoff();
    const etag = await putPartWithRetries(
      1,
      BYTES,
      partUploadUrls("https://bucket/part")
    );
    assert.equal(etag, "etag-of-the-part");
    assert.equal(urls.length, 2);
    assert.equal(waits.count, 1);
  });

  await t.test(
    "asks for another URL on a 403 whose body never arrived",
    async () => {
      const { urls } = scriptedFetch([headersOnly(403), 200]);
      countedBackoff();
      const etag = await putPartWithRetries(
        1,
        BYTES,
        partUploadUrls(
          "https://bucket/part?sig=expired",
          "https://bucket/part?sig=fresh"
        )
      );
      assert.equal(etag, "etag-of-the-part");
      assert.deepEqual(urls, [
        "https://bucket/part?sig=expired",
        "https://bucket/part?sig=fresh",
      ]);
    }
  );

  await t.test("retries a 403 with another URL", async () => {
    const { urls } = scriptedFetch([403, 200]);
    countedBackoff();
    const answered = partUploadUrls(
      "https://bucket/part?sig=expired",
      "https://bucket/part?sig=fresh"
    );
    let urlsAskedFor = 0;
    const etag = await putPartWithRetries(7, BYTES, async () => {
      urlsAskedFor += 1;
      return await answered();
    });
    assert.equal(etag, "etag-of-the-part");
    assert.equal(urlsAskedFor, 2);
    assert.deepEqual(urls, [
      "https://bucket/part?sig=expired",
      "https://bucket/part?sig=fresh",
    ]);
  });

  await t.test("gives up after the last attempt", async () => {
    const { urls } = scriptedFetch(
      Array.from({ length: PUT_ATTEMPTS }, () => 503)
    );
    const { waits } = countedBackoff();
    await assert.rejects(
      putPartWithRetries(3, BYTES, partUploadUrls("https://bucket/part")),
      (error: Error) =>
        error.message.includes(`Part 3 upload failed after ${PUT_ATTEMPTS}`) &&
        error.message.includes("503: body for 503")
    );
    assert.equal(urls.length, PUT_ATTEMPTS);
    // The last attempt is not followed by a wait.
    assert.equal(waits.count, PUT_ATTEMPTS - 1);
  });

  await t.test("reports a 404 as the upload not being found", async () => {
    const { urls } = scriptedFetch([404]);
    const { waits } = countedBackoff();
    await assert.rejects(
      putPartWithRetries(1, BYTES, partUploadUrls("https://bucket/part")),
      (error: Error) =>
        error instanceof BlobPartUploadUrlAborted &&
        error.error instanceof UploadNotFound &&
        `${error}`.includes("Part 1 upload failed") &&
        `${error}`.includes("404: body for 404")
    );
    assert.equal(urls.length, 1);
    assert.equal(waits.count, 0);
  });

  for (const status of [400, 409, 413]) {
    await t.test(`refuses a ${status} for good`, async () => {
      const { urls } = scriptedFetch([status]);
      const { waits } = countedBackoff();
      await assert.rejects(
        putPartWithRetries(1, BYTES, partUploadUrls("https://bucket/part")),
        (error: Error) =>
          error.message.includes("after 1 attempt:") &&
          error.message.includes(`${status}: body for ${status}`)
      );
      assert.equal(urls.length, 1);
      assert.equal(waits.count, 0);
    });
  }

  await t.test("refuses a success without an ETag for good", async () => {
    mock.method(
      globalThis,
      "fetch",
      async () => new Response("stored", { status: 200 })
    );
    const { waits } = countedBackoff();
    await assert.rejects(
      putPartWithRetries(1, BYTES, partUploadUrls("https://bucket/part")),
      (error: Error) => error.message.includes("returned no ETag")
    );
    assert.equal(waits.count, 0);
  });

  await t.test("stops as soon as the caller aborts", async () => {
    const controller = new AbortController();
    const { urls } = scriptedFetch([503, 200]);
    // Abort while waiting to retry, the way a user leaving the page
    // would: the next attempt is not made.
    countedBackoff(() => controller.abort(new Error("user left")));
    await assert.rejects(
      putPartWithRetries(1, BYTES, partUploadUrls("https://bucket/part"), {
        signal: controller.signal,
      }),
      (error: Error) => error.message === "user left"
    );
    assert.equal(urls.length, 1);
  });
});
