import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { act, cleanup, render, waitFor } from "@testing-library/react";

import React from "react";

import { react_pb } from "@reboot-dev/reboot-api";
import { RebootClientProvider } from "@reboot-dev/reboot-react";

import { SetAdjectiveRequest, SetAdjectiveResponse } from "../../greeter_pb.js";
import { UseGreeterApi, useGreeter } from "../../greeter_rbt_react.js";

// Nothing is listening at the URLs we use: `fetch` and `WebSocket`
// are faked so that the test plays the part of the backend.

// A call to `React.Mutate` that the test responds to.
class Mutate {
  readonly request: react_pb.MutateRequest;
  readonly adjective: string;

  constructor(
    readonly url: string,
    body: string,
    private readonly resolve: (response: Response) => void,
    private readonly reject: (error: Error) => void
  ) {
    this.request = react_pb.MutateRequest.fromJsonString(body);
    this.adjective = SetAdjectiveRequest.fromBinary(
      this.request.request
    ).adjective;
  }

  get sequence() {
    const sequence = this.request.sequence!;
    return {
      id: sequence.id,
      number: Number(sequence.number),
      firstOutstandingNumber: Number(sequence.firstOutstandingNumber),
    };
  }

  respond() {
    this.resolve(
      new Response(
        new react_pb.MutateResponse({
          responseOrStatus: {
            case: "response",
            value: new SetAdjectiveResponse().toBinary(),
          },
        }).toJsonString(),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
  }

  respondWithHttpStatus(status: number) {
    this.resolve(new Response("", { status }));
  }

  disconnect() {
    this.reject(new TypeError("Failed to fetch"));
  }
}

let mutates: Mutate[] = [];

// Every other `fetch`.
let fetched: string[] = [];

const fakeFetch = (url: string, init?: RequestInit) => {
  if (url.endsWith("/rbt.v1alpha1.React/Mutate")) {
    return new Promise<Response>((resolve, reject) => {
      mutates = [
        ...mutates,
        new Mutate(url, init!.body as string, resolve, reject),
      ];
      init!.signal!.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });
    });
  }

  fetched = [...fetched, url];

  if (url.endsWith("/rbt.v1alpha1.React/WebSocketsConnection")) {
    // Like the backend, never respond.
    return new Promise<Response>(() => {});
  }

  // E.g., the `/__/oauth/whoami` probe made by the provider.
  return Promise.resolve(new Response("", { status: 404 }));
};

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

// The `greeter` from the last render, so that the test can call
// mutators without having to go through the DOM.
let greeter: UseGreeterApi;

const Greeter: React.FC<{ id: string }> = ({ id }) => {
  greeter = useGreeter({ id });
  return <div />;
};

// What has been resolved, in the order that it was.
let resolved: string[] = [];

const setAdjective = (adjective: string) => {
  act(() => {
    greeter.setAdjective({ adjective }).then(() => {
      resolved = [...resolved, adjective];
    });
  });
};

describe("Mutations", () => {
  beforeEach(() => {
    mutates = [];
    fetched = [];
    resolved = [];
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal("fetch", fakeFetch);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("are sent without waiting for responses when using TLS", async () => {
    render(
      <RebootClientProvider url="https://pipelined.reboot.test">
        <Greeter id="greeter" />
      </RebootClientProvider>
    );

    setAdjective("first");
    setAdjective("second");

    await waitFor(() => {
      expect(mutates.length).toBe(2);
    });

    // Both mutations were sent even though neither has a response.
    expect(resolved).toEqual([]);

    expect(mutates.map(({ adjective }) => adjective)).toEqual([
      "first",
      "second",
    ]);

    // And they are in a sequence, so that the backend can perform
    // them in the order that we made them.
    const [first, second] = mutates;

    expect(first.sequence.id).not.toBe("");
    expect(second.sequence.id).toBe(first.sequence.id);

    expect(second.sequence.number).toBe(first.sequence.number + 1);

    expect(first.sequence.firstOutstandingNumber).toBe(first.sequence.number);
    expect(second.sequence.firstOutstandingNumber).toBe(first.sequence.number);

    // We don't need any websockets, nor the connection for them.
    expect(FakeWebSocket.instances.length).toBe(0);
    expect(
      fetched.filter((url) => url.endsWith("WebSocketsConnection"))
    ).toEqual([]);

    // Each response is for a request of its own, so it doesn't
    // matter what order the responses arrive in.
    second.respond();

    await waitFor(() => {
      expect(resolved).toEqual(["second"]);
    });

    first.respond();

    await waitFor(() => {
      expect(resolved).toEqual(["second", "first"]);
    });

    // Now that we have the responses of both mutations the next one
    // is the first that is outstanding.
    setAdjective("third");

    await waitFor(() => {
      expect(mutates.length).toBe(3);
    });

    const third = mutates[2];

    expect(third.sequence.id).toBe(first.sequence.id);
    expect(third.sequence.number).toBe(second.sequence.number + 1);
    expect(third.sequence.firstOutstandingNumber).toBe(third.sequence.number);
  });

  it("are retried with the same number", async () => {
    render(
      <RebootClientProvider url="https://retried.reboot.test">
        <Greeter id="greeter" />
      </RebootClientProvider>
    );

    setAdjective("first");
    setAdjective("second");

    await waitFor(() => {
      expect(mutates.length).toBe(2);
    });

    const [first, second] = mutates;

    // The backend never gets the first mutation, and it must not
    // perform the second one until it does.
    first.disconnect();

    await waitFor(
      () => {
        expect(mutates.length).toBe(3);
      },
      { timeout: 10000 }
    );

    const retried = mutates[2];

    expect(retried.adjective).toBe("first");
    expect(retried.request.idempotencyKey).toBe(first.request.idempotencyKey);
    expect(retried.sequence).toEqual(first.sequence);

    retried.respond();
    second.respond();

    await waitFor(() => {
      expect(resolved).toEqual(["first", "second"]);
    });
  });

  it("are aborted once nobody is using the state", async () => {
    const { unmount } = render(
      <RebootClientProvider url="https://aborted.reboot.test">
        <Greeter id="greeter" />
      </RebootClientProvider>
    );

    setAdjective("first");

    await waitFor(() => {
      expect(mutates.length).toBe(1);
    });

    unmount();

    // Wait for longer than it would take to retry.
    await new Promise((resolve) => setTimeout(resolve, 5000));

    expect(mutates.length).toBe(1);
  });

  it("are sent over a websocket if the backend requires it", async () => {
    render(
      <RebootClientProvider url="https://websocket.reboot.test">
        <Greeter id="greeter" />
      </RebootClientProvider>
    );

    setAdjective("first");
    setAdjective("second");

    await waitFor(() => {
      expect(mutates.length).toBe(2);
    });

    expect(FakeWebSocket.instances.length).toBe(0);

    // This is what a backend from before `React.Mutate` responds
    // with.
    act(() => {
      mutates[0].respondWithHttpStatus(404);
      mutates[1].respondWithHttpStatus(404);
    });

    await waitFor(() => {
      expect(FakeWebSocket.instances.length).toBe(1);
    });

    const [websocket] = FakeWebSocket.instances;

    act(() => {
      websocket.open();
    });

    expect(websocket.sent.map(({ sequence }) => sequence)).toEqual([
      undefined,
      undefined,
    ]);

    expect(
      websocket.sent.map(
        ({ request }) => SetAdjectiveRequest.fromBinary(request).adjective
      )
    ).toEqual(["first", "second"]);

    act(() => {
      websocket.respond();
      websocket.respond();
    });

    await waitFor(() => {
      expect(resolved).toEqual(["first", "second"]);
    });

    // And we don't try `React.Mutate` again.
    setAdjective("third");

    await waitFor(() => {
      expect(websocket.sent.length).toBe(3);
    });

    expect(mutates.length).toBe(2);
  });

  it("are sent over a websocket when not using TLS", async () => {
    render(
      <RebootClientProvider url="http://websocket.reboot.test">
        <Greeter id="greeter" />
      </RebootClientProvider>
    );

    await waitFor(() => {
      expect(FakeWebSocket.instances.length).toBe(1);
    });

    const [websocket] = FakeWebSocket.instances;

    act(() => {
      websocket.open();
    });

    setAdjective("first");

    await waitFor(() => {
      expect(websocket.sent.length).toBe(1);
    });

    expect(mutates.length).toBe(0);
  });
});
