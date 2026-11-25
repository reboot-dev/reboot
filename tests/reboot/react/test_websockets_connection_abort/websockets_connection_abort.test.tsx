import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { act, cleanup, render, waitFor } from "@testing-library/react";

import React from "react";

import { RebootClientProvider } from "@reboot-dev/reboot-react";

import { useGreeter } from "../../greeter_rbt_react.js";

// We need TLS for there to be a `WebSocketsConnection` fetch at all,
// but nothing is listening here: `fetch` and `WebSocket` are faked.
const URL = "https://reboot.test";

// A `WebSocket` that does nothing until the test tells it to, so
// that the test decides exactly when the websocket is connected or
// disconnected.
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: FakeWebSocket[] = [];

  readyState: number = FakeWebSocket.CONNECTING;
  binaryType: string = "blob";

  onopen?: () => void;
  onerror?: () => void;
  onclose?: () => void;
  onmessage?: (event: unknown) => void;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener() {}

  send() {}

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  // What a browser does when it can't reach the backend, or when an
  // established connection breaks.
  fail() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onerror?.();
    this.onclose?.();
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

// Signals of every `WebSocketsConnection` fetch that was made.
let signals: AbortSignal[] = [];

const fakeFetch = async (url: string, init?: RequestInit) => {
  if (!url.endsWith("/rbt.v1alpha1.React/WebSocketsConnection")) {
    // E.g., the `/__/oauth/whoami` probe made by the provider.
    return new Response("", { status: 404 });
  }

  const signal = init!.signal!;

  signals.push(signal);

  // Like the backend, never respond: only an abort ends the fetch.
  return new Promise<Response>((_, reject) => {
    signal.addEventListener("abort", () => {
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
};

const UseGreeter: React.FC<{ id: string }> = ({ id }) => {
  useGreeter({ id });
  return <div />;
};

describe("WebSocketsConnection", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    signals = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal("fetch", fakeFetch);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("is aborted on unmount when the websocket is connected", async () => {
    const { unmount } = render(
      <RebootClientProvider url={URL}>
        <UseGreeter id="greeter-connected" />
      </RebootClientProvider>
    );

    await waitFor(() => {
      expect(signals.length).toBe(1);
      expect(FakeWebSocket.instances.length).toBe(1);
    });

    act(() => {
      FakeWebSocket.instances[0].open();
    });

    expect(signals[0].aborted).toBe(false);

    unmount();

    expect(signals[0].aborted).toBe(true);
  });

  it("is aborted on unmount when the websocket is disconnected", async () => {
    const { unmount } = render(
      <RebootClientProvider url={URL}>
        <UseGreeter id="greeter-disconnected" />
      </RebootClientProvider>
    );

    await waitFor(() => {
      expect(signals.length).toBe(1);
      expect(FakeWebSocket.instances.length).toBe(1);
    });

    // The backend is unreachable, so we are now backing off before
    // trying to reconnect the websocket, i.e., we don't have one.
    act(() => {
      FakeWebSocket.instances[0].fail();
    });

    expect(signals[0].aborted).toBe(false);

    unmount();

    expect(signals[0].aborted).toBe(true);

    // And we never tried to reconnect the websocket.
    expect(FakeWebSocket.instances.length).toBe(1);
  });
});
