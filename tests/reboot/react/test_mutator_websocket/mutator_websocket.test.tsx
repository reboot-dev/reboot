import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { act, cleanup, render, waitFor } from "@testing-library/react";

import React from "react";

import { react_pb } from "@reboot-dev/reboot-api";
import { RebootClientProvider } from "@reboot-dev/reboot-react";

import { SetAdjectiveRequest, SetAdjectiveResponse } from "../../greeter_pb.js";
import { UseGreeterApi, useGreeter } from "../../greeter_rbt_react.js";

// Nothing is listening here: `fetch` and `WebSocket` are faked so
// that the test plays the part of the backend. We use TLS so that
// the only websockets are the ones for mutations.
const URL = "https://reboot.test";

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

  // Everything that was sent to the backend.
  sent: react_pb.MutateRequest[] = [];

  readonly url: string;

  constructor(url: string | URL) {
    this.url = url.toString();
    FakeWebSocket.instances.push(this);
  }

  addEventListener() {}

  send(data: Uint8Array) {
    this.sent.push(react_pb.MutateRequest.fromBinary(data));
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  respond() {
    const bytes = new react_pb.MutateResponse({
      responseOrStatus: {
        case: "response",
        value: new SetAdjectiveResponse().toBinary(),
      },
    }).toBinary();
    this.onmessage?.({
      data: bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ),
    });
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

// Every `fetch` that was made.
let fetched: string[] = [];

const fakeFetch = (url: string) => {
  fetched = [...fetched, url];

  if (url.endsWith("/rbt.v1alpha1.React/Query")) {
    // A reactive reader that never gets a response.
    return new Promise<Response>(() => {});
  }

  // E.g., the `/__/oauth/whoami` probe made by the provider.
  return Promise.resolve(new Response("", { status: 404 }));
};

// What each test does with a `greeter`.
let use: (greeter: UseGreeterApi) => void = () => {};

// The `greeter` from the last render, so that the test can call
// mutators without having to go through the DOM.
let greeter: UseGreeterApi;

const Greeter: React.FC<{ id: string }> = ({ id }) => {
  greeter = useGreeter({ id });
  use(greeter);
  return <div />;
};

describe("The websocket for mutations", () => {
  beforeEach(() => {
    fetched = [];
    use = () => {};
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal("fetch", fakeFetch);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("does not need a request of its own", async () => {
    use = ({ setAdjective }) => {};

    render(
      <RebootClientProvider url={URL}>
        <Greeter id="greeter-request" />
      </RebootClientProvider>
    );

    await waitFor(() => {
      expect(FakeWebSocket.instances.length).toBe(1);
    });

    const [websocket] = FakeWebSocket.instances;

    act(() => {
      websocket.open();
    });

    let resolved = false;

    act(() => {
      greeter.setAdjective({ adjective: "friendly" }).then(() => {
        resolved = true;
      });
    });

    await waitFor(() => {
      expect(websocket.sent.length).toBe(1);
    });

    expect(
      SetAdjectiveRequest.fromBinary(websocket.sent[0].request).adjective
    ).toBe("friendly");

    act(() => {
      websocket.respond();
    });

    await waitFor(() => {
      expect(resolved).toBe(true);
    });

    // The only request is from the provider, none is for the
    // websocket.
    expect(fetched).toEqual([`${URL}/__/oauth/whoami`]);
  });
});
