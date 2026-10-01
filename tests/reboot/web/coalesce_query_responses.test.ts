import { react_pb } from "@reboot-dev/reboot-api";
import {
  coalesceQueryResponses,
  mergeQueryResponses,
} from "@reboot-dev/reboot-web";
import { describe, expect, it } from "vitest";

// A query response carrying `payload` (none for a response that only
// reports idempotency keys) and `idempotencyKeys`.
const queryResponse = (
  payload: string | undefined,
  idempotencyKeys: string[]
): react_pb.QueryResponse =>
  new react_pb.QueryResponse({
    ...(payload !== undefined && {
      responseOrStatus: {
        case: "response",
        value: new TextEncoder().encode(payload),
      },
    }),
    idempotencyKeys,
  });

const payloadOf = (response: react_pb.QueryResponse): string | undefined =>
  response.responseOrStatus.case === "response"
    ? new TextDecoder().decode(response.responseOrStatus.value)
    : undefined;

// A source of query responses that the test feeds by hand: `push()`
// hands the generator a response to yield, an error to throw, or
// `"end"` to return.
const source = () => {
  const queue: (react_pb.QueryResponse | Error | "end")[] = [];
  let wake: (() => void) | undefined = undefined;

  const push = (item: react_pb.QueryResponse | Error | "end") => {
    queue.push(item);
    if (wake !== undefined) {
      wake();
    }
  };

  async function* responses(): AsyncGenerator<
    react_pb.QueryResponse,
    void,
    unknown
  > {
    while (true) {
      let item: react_pb.QueryResponse | Error | "end" | undefined;
      while ((item = queue.shift()) !== undefined) {
        if (item === "end") {
          return;
        } else if (item instanceof Error) {
          throw item;
        }
        yield item;
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
      wake = undefined;
    }
  }

  return { push, responses: responses() };
};

// Everything pushed so far is handed from the source to
// `coalesceQueryResponses()` through microtasks alone, so one trip
// through the macrotask queue is enough to know it has all arrived.
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("mergeQueryResponses", () => {
  it("keeps the latest payload and every idempotency key", () => {
    const merged = mergeQueryResponses(
      queryResponse("first", ["a", "b"]),
      queryResponse("second", ["c"])
    );
    expect(payloadOf(merged)).toBe("second");
    expect(merged.idempotencyKeys).toEqual(["a", "b", "c"]);
  });

  it("keeps the previous payload when the next has none", () => {
    const merged = mergeQueryResponses(
      queryResponse("first", ["a"]),
      queryResponse(undefined, ["b"])
    );
    expect(payloadOf(merged)).toBe("first");
    expect(merged.idempotencyKeys).toEqual(["a", "b"]);
  });

  it("has no payload when neither has one", () => {
    const merged = mergeQueryResponses(
      queryResponse(undefined, ["a"]),
      queryResponse(undefined, ["b"])
    );
    expect(merged.responseOrStatus.case).toBeUndefined();
    expect(merged.idempotencyKeys).toEqual(["a", "b"]);
  });
});

describe("coalesceQueryResponses", () => {
  it("yields each response as is to a consumer that keeps up", async () => {
    const { push, responses } = source();
    const coalesced = coalesceQueryResponses(responses);

    push(queryResponse("first", ["a"]));
    const first = await coalesced.next();
    expect(first.done).toBe(false);
    expect(payloadOf(first.value as react_pb.QueryResponse)).toBe("first");
    expect((first.value as react_pb.QueryResponse).idempotencyKeys).toEqual([
      "a",
    ]);

    push(queryResponse("second", []));
    const second = await coalesced.next();
    expect(payloadOf(second.value as react_pb.QueryResponse)).toBe("second");
    expect((second.value as react_pb.QueryResponse).idempotencyKeys).toEqual(
      []
    );
  });

  it("merges the responses that arrive while the consumer is busy", async () => {
    const { push, responses } = source();
    const coalesced = coalesceQueryResponses(responses);

    push(queryResponse("first", ["a"]));
    await coalesced.next();

    // The consumer is busy: nothing pulls while these arrive.
    push(queryResponse("second", ["b"]));
    push(queryResponse(undefined, ["c"]));
    push(queryResponse("third", ["d", "e"]));
    push(queryResponse(undefined, []));
    await settle();

    const next = await coalesced.next();
    expect(next.done).toBe(false);
    expect(payloadOf(next.value as react_pb.QueryResponse)).toBe("third");
    expect((next.value as react_pb.QueryResponse).idempotencyKeys).toEqual([
      "b",
      "c",
      "d",
      "e",
    ]);

    // Nothing is left over from what was merged.
    push(queryResponse("fourth", []));
    const fourth = await coalesced.next();
    expect(payloadOf(fourth.value as react_pb.QueryResponse)).toBe("fourth");
    expect((fourth.value as react_pb.QueryResponse).idempotencyKeys).toEqual(
      []
    );
  });

  it("throws the source's error only after what arrived before it", async () => {
    const { push, responses } = source();
    const coalesced = coalesceQueryResponses(responses);

    push(queryResponse("first", ["a"]));
    await coalesced.next();

    push(queryResponse("second", ["b"]));
    push(queryResponse("third", ["c"]));
    push(new Error("boom"));
    await settle();

    const next = await coalesced.next();
    expect(next.done).toBe(false);
    expect(payloadOf(next.value as react_pb.QueryResponse)).toBe("third");
    expect((next.value as react_pb.QueryResponse).idempotencyKeys).toEqual([
      "b",
      "c",
    ]);

    await expect(coalesced.next()).rejects.toThrow("boom");
  });

  it("ends only after what arrived before the source ended", async () => {
    const { push, responses } = source();
    const coalesced = coalesceQueryResponses(responses);

    push(queryResponse("first", ["a"]));
    await coalesced.next();

    push(queryResponse("second", ["b"]));
    push("end");
    await settle();

    const next = await coalesced.next();
    expect(next.done).toBe(false);
    expect(payloadOf(next.value as react_pb.QueryResponse)).toBe("second");

    expect((await coalesced.next()).done).toBe(true);
  });
});
