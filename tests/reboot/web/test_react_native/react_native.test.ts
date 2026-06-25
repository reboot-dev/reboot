import { afterEach, describe, expect, it, vi } from "vitest";

import {
  grpcWebsocketServerStream,
  httpCall,
  websockets,
} from "@reboot-dev/reboot-web";

import { GreetRequest, GreetResponse } from "../../greeter_pb.js";

// These tests pin the three React Native compatibility contracts that
// the `@reboot-dev/reboot-web` client must uphold. React Native's
// runtime differs from a browser's in ways that silently broke the
// client before; each test fails if that specific regression is
// reintroduced.
//
// We use a non-browser ("node") environment and replace the relevant
// web globals to approximate React Native rather than spin up a real
// device/simulator, which is impractical in CI.

// A minimal fake `WebSocket` that records the argument it was
// constructed with and lets a test drive its events. It mirrors just
// enough of the real interface for the client code paths under test.
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  // The argument passed to `new WebSocket(...)`. React Native's
  // `WebSocket` only accepts a string, so we assert on its type.
  static lastConstructorArg: unknown = undefined;
  // The most recently constructed instance, so a test can drive it.
  static last: FakeWebSocket | undefined = undefined;

  readyState: number = FakeWebSocket.OPEN;
  binaryType = "blob";
  onopen: (() => void) | null = null;

  private listeners: { [type: string]: Array<(event: any) => void> } = {};

  constructor(arg: unknown) {
    FakeWebSocket.lastConstructorArg = arg;
    FakeWebSocket.last = this;
  }

  addEventListener(type: string, callback: (event: any) => void) {
    (this.listeners[type] ??= []).push(callback);
  }

  send(_data: unknown) {}

  close() {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", {});
  }

  // Test helper: dispatch an event to registered listeners.
  emit(type: string, event: any) {
    for (const callback of this.listeners[type] ?? []) callback(event);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  FakeWebSocket.lastConstructorArg = undefined;
  FakeWebSocket.last = undefined;
});

describe("React Native client compatibility", () => {
  it("calls fetch() with a string URL, never a Request object", async () => {
    // React Native's `fetch()` does not support being passed a
    // `Request`, so the client must pass a URL string plus an init
    // object. We capture the argument handed to `fetch` and assert it
    // is a string (and not a `Request`); reintroducing
    // `new Request(...)` fails this immediately.
    const fetchMock = vi.fn(async () => {
      return new Response(
        new GreetResponse({ message: "mocked" }).toJsonString(),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await httpCall({
      url: "http://example.test:9991",
      method: "Greet",
      stateRef: "greeter",
      requestType: GreetRequest,
      responseType: GreetResponse,
      // The aborted type is only consulted on error paths; this test
      // exercises the success path, so a placeholder keeps the
      // dependency surface small.
      abortedType: GreetResponse as any,
      request: new GreetRequest({ name: "World" }),
      idempotencyKey: "test-idempotency-key",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] as unknown as [unknown, any];
    expect(typeof input).toBe("string");
    expect(input instanceof Request).toBe(false);
    expect(input).toContain("/__/reboot/rpc/greeter/Greet");
    expect(init?.method).toBe("POST");
    expect(response.message).toBe("mocked");
  });

  it("constructs WebSocket from a string, never a URL", () => {
    // React Native's `WebSocket` only accepts a string, so the client
    // must call `url.toString()` rather than hand it a `URL`.
    vi.stubGlobal("WebSocket", FakeWebSocket);

    // A non-`wss:` URL takes the branch that constructs and tracks a
    // websocket (the `wss:` branch behaves identically for our check).
    websockets.create(new URL("ws://example.test:9991/__/reboot/socket"));

    expect(typeof FakeWebSocket.lastConstructorArg).toBe("string");
    expect(FakeWebSocket.lastConstructorArg).toContain(
      "ws://example.test:9991"
    );
  });

  it("does not reference MessageEvent when it is undefined", async () => {
    // React Native has no `MessageEvent` global, so referencing it
    // unguarded is a `ReferenceError`. The client guards it with
    // `typeof`; with `MessageEvent` removed, a streamed ArrayBuffer
    // message must still be decoded and yielded.
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal("MessageEvent", undefined);

    const generator = grpcWebsocketServerStream({
      url: new URL("http://example.test:9991/__/reboot/rpc/greeter/Greet"),
      request: new GreetRequest({ name: "World" }),
      heartbeatRequest: new GreetRequest({ name: "heartbeat" }),
      responseType: GreetResponse,
      signal: new AbortController().signal,
    });

    // Start the generator; it synchronously registers a "message"
    // listener before suspending on the first `await`.
    const next = generator.next();
    // Let any queued microtasks run, to be safe.
    await Promise.resolve();
    await Promise.resolve();

    const websocket = FakeWebSocket.last;
    expect(websocket).toBeDefined();

    // A native message carries `data` as an `ArrayBuffer`. Use an
    // exact-sized buffer so the decode reads only our bytes.
    const bytes = new GreetResponse({ message: "streamed" }).toBinary();
    websocket!.emit("message", { data: bytes.slice().buffer });

    const { value, done } = await next;
    expect(done).toBe(false);
    expect((value as GreetResponse | undefined)?.message).toBe("streamed");

    // Run the generator's `finally` so it closes the websocket and
    // clears its heartbeat interval.
    await generator.return(undefined);
  });
});
