import { strict as assert } from "node:assert";
import test from "node:test";
import {
  PUT_ATTEMPTS,
  PUT_FIRST_RETRY_DELAY_MS,
  putPartWithRetries,
} from "../../../../../reboot/std/react/blob/put.js";

const BYTES = new Uint8Array([1, 2, 3]);

/**
 * A `fetch` that answers from a script, one entry per call: a status
 * (with an `ETag` for a success), an `Error` to reject with, or a
 * ready-made `Response`. It records what it was asked, so a test can
 * see which URL each attempt went to.
 */
function scriptedFetch(script: (number | Error | Response)[]): {
  fetch: typeof globalThis.fetch;
  urls: string[];
} {
  const urls: string[] = [];
  const fetch = async (input: string | URL | Request): Promise<Response> => {
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
  };
  return { fetch, urls };
}

/**
 * A `sleep` that never sleeps but remembers how long it was asked to,
 * so a test can check the backoff.
 */
function recordingSleep(): {
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  delays: number[];
} {
  const delays: number[] = [];
  return {
    sleep: async (ms: number) => {
      delays.push(ms);
    },
    delays,
  };
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

function neverRemint(): Promise<string> {
  throw new Error("remint was not expected");
}

test("putPartWithRetries", async (t) => {
  await t.test("returns the ETag of a first-time success", async () => {
    const { fetch, urls } = scriptedFetch([200]);
    const { sleep, delays } = recordingSleep();
    const etag = await putPartWithRetries(
      1,
      "https://store/part",
      BYTES,
      neverRemint,
      { fetch, sleep }
    );
    assert.equal(etag, "etag-of-the-part");
    assert.deepEqual(urls, ["https://store/part"]);
    assert.deepEqual(delays, []);
  });

  await t.test("retries a 5xx, then a dropped connection", async () => {
    const { fetch, urls } = scriptedFetch([
      503,
      new TypeError("fetch failed"),
      200,
    ]);
    const { sleep, delays } = recordingSleep();
    const etag = await putPartWithRetries(
      1,
      "https://store/part",
      BYTES,
      neverRemint,
      { fetch, sleep }
    );
    assert.equal(etag, "etag-of-the-part");
    assert.equal(urls.length, 3);
    // One backoff per retry, doubling, with jitter of at most half.
    assert.equal(delays.length, 2);
    assert.ok(delays[0] >= PUT_FIRST_RETRY_DELAY_MS / 2);
    assert.ok(delays[0] <= PUT_FIRST_RETRY_DELAY_MS);
    assert.ok(delays[1] >= PUT_FIRST_RETRY_DELAY_MS);
    assert.ok(delays[1] <= PUT_FIRST_RETRY_DELAY_MS * 2);
  });

  await t.test("retries a 408, then a 429", async () => {
    const { fetch, urls } = scriptedFetch([408, 429, 200]);
    const { sleep, delays } = recordingSleep();
    const etag = await putPartWithRetries(
      1,
      "https://store/part",
      BYTES,
      neverRemint,
      { fetch, sleep }
    );
    assert.equal(etag, "etag-of-the-part");
    assert.equal(urls.length, 3);
    assert.equal(delays.length, 2);
  });

  await t.test("retries S3's 400 RequestTimeout", async () => {
    const { fetch, urls } = scriptedFetch([
      new Response(
        "<Error><Code>RequestTimeout</Code><Message>Your socket " +
          "connection to the server was not read from or written to " +
          "within the timeout period.</Message></Error>",
        { status: 400 }
      ),
      200,
    ]);
    const { sleep, delays } = recordingSleep();
    const etag = await putPartWithRetries(
      1,
      "https://store/part",
      BYTES,
      neverRemint,
      { fetch, sleep }
    );
    assert.equal(etag, "etag-of-the-part");
    assert.equal(urls.length, 2);
    assert.equal(delays.length, 1);
  });

  await t.test("retries a 503 whose body never arrived", async () => {
    const { fetch, urls } = scriptedFetch([headersOnly(503), 200]);
    const { sleep, delays } = recordingSleep();
    const etag = await putPartWithRetries(
      1,
      "https://store/part",
      BYTES,
      neverRemint,
      { fetch, sleep }
    );
    assert.equal(etag, "etag-of-the-part");
    assert.equal(urls.length, 2);
    assert.equal(delays.length, 1);
  });

  await t.test("re-mints on a 403 whose body never arrived", async () => {
    const { fetch, urls } = scriptedFetch([headersOnly(403), 200]);
    const { sleep } = recordingSleep();
    const etag = await putPartWithRetries(
      1,
      "https://store/part?sig=expired",
      BYTES,
      async () => "https://store/part?sig=fresh",
      { fetch, sleep }
    );
    assert.equal(etag, "etag-of-the-part");
    assert.deepEqual(urls, [
      "https://store/part?sig=expired",
      "https://store/part?sig=fresh",
    ]);
  });

  await t.test("retries a 403 with a freshly minted URL", async () => {
    const { fetch, urls } = scriptedFetch([403, 200]);
    const { sleep } = recordingSleep();
    let reminted = 0;
    const etag = await putPartWithRetries(
      7,
      "https://store/part?sig=expired",
      BYTES,
      async () => {
        reminted += 1;
        return "https://store/part?sig=fresh";
      },
      { fetch, sleep }
    );
    assert.equal(etag, "etag-of-the-part");
    assert.equal(reminted, 1);
    assert.deepEqual(urls, [
      "https://store/part?sig=expired",
      "https://store/part?sig=fresh",
    ]);
  });

  await t.test("gives up after the last attempt", async () => {
    const { fetch, urls } = scriptedFetch(
      Array.from({ length: PUT_ATTEMPTS }, () => 503)
    );
    const { sleep, delays } = recordingSleep();
    await assert.rejects(
      putPartWithRetries(3, "https://store/part", BYTES, neverRemint, {
        fetch,
        sleep,
      }),
      (error: Error) =>
        error.message.includes(`Part 3 upload failed after ${PUT_ATTEMPTS}`) &&
        error.message.includes("503: body for 503")
    );
    assert.equal(urls.length, PUT_ATTEMPTS);
    // The last attempt is not followed by a wait, and each wait is
    // double the one before, jittered by at most half.
    assert.equal(delays.length, PUT_ATTEMPTS - 1);
    delays.forEach((ms, index) => {
      const backoff = PUT_FIRST_RETRY_DELAY_MS * 2 ** index;
      assert.ok(ms >= backoff / 2, `wait ${index}: ${ms} < ${backoff / 2}`);
      assert.ok(ms <= backoff, `wait ${index}: ${ms} > ${backoff}`);
    });
  });

  for (const status of [400, 404, 409, 413]) {
    await t.test(`refuses a ${status} for good`, async () => {
      const { fetch, urls } = scriptedFetch([status]);
      const { sleep, delays } = recordingSleep();
      await assert.rejects(
        putPartWithRetries(1, "https://store/part", BYTES, neverRemint, {
          fetch,
          sleep,
        }),
        (error: Error) =>
          error.message.includes("after 1 attempt:") &&
          error.message.includes(`${status}: body for ${status}`)
      );
      assert.equal(urls.length, 1);
      assert.deepEqual(delays, []);
    });
  }

  await t.test("refuses a success without an ETag for good", async () => {
    const fetch = async (): Promise<Response> =>
      new Response("stored", { status: 200 });
    const { sleep, delays } = recordingSleep();
    await assert.rejects(
      putPartWithRetries(1, "https://store/part", BYTES, neverRemint, {
        fetch,
        sleep,
      }),
      (error: Error) => error.message.includes("returned no ETag")
    );
    assert.deepEqual(delays, []);
  });

  await t.test("stops as soon as the caller aborts", async () => {
    const controller = new AbortController();
    const { fetch, urls } = scriptedFetch([503, 200]);
    // Abort while waiting to retry, the way a user leaving the page
    // would; the `sleep` stands in for `delay`, which rejects with the
    // abort reason.
    const sleep = async (ms: number, signal?: AbortSignal) => {
      controller.abort(new Error("user left"));
      signal?.throwIfAborted();
    };
    await assert.rejects(
      putPartWithRetries(1, "https://store/part", BYTES, neverRemint, {
        fetch,
        sleep,
        signal: controller.signal,
      }),
      (error: Error) => error.message === "user left"
    );
    assert.equal(urls.length, 1);
  });
});
