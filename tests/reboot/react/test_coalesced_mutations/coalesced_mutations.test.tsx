import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

import React from "react";

import { react_pb } from "@reboot-dev/reboot-api";
import { RebootClientProvider } from "@reboot-dev/reboot-react";

import { GreetResponse, SetAdjectiveResponse } from "../../greeter_pb.js";
import { UseGreeterApi, useGreeter } from "../../greeter_rbt_react.js";

// Nothing is listening here: `fetch` and `WebSocket` are faked. We
// don't use TLS so that the reactive reader also uses a websocket,
// which lets the test decide exactly what every response carries.
const URL = "http://reboot.test";

// A `WebSocket` that does nothing until the test tells it to, so
// that the test plays the part of the backend.
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
  sent: Uint8Array[] = [];

  private listeners: { [type: string]: ((event: unknown) => void)[] } = {};

  readonly url: string;

  constructor(url: string | URL) {
    this.url = url.toString();
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners[type] = [...(this.listeners[type] ?? []), listener];
  }

  send(data: Uint8Array) {
    this.sent.push(data);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  // Delivers a message from the backend.
  receive(message: { toBinary: () => Uint8Array }) {
    const bytes = message.toBinary();
    const event = {
      data: bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ),
    };
    this.onmessage?.(event);
    for (const listener of this.listeners["message"] ?? []) {
      listener(event);
    }
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
    for (const listener of this.listeners["close"] ?? []) {
      listener({});
    }
  }
}

const fakeFetch = async () => {
  // E.g., the `/__/oauth/whoami` probe made by the provider.
  return new Response("", { status: 404 });
};

const queryResponse = (message: string, idempotencyKeys: string[]) =>
  new react_pb.QueryResponse({
    responseOrStatus: {
      case: "response",
      value: new GreetResponse({ message }).toBinary(),
    },
    idempotencyKeys,
  });

const mutateResponse = () =>
  new react_pb.MutateResponse({
    responseOrStatus: {
      case: "response",
      value: new SetAdjectiveResponse().toBinary(),
    },
  });

// The `greeter` from the last render, so that the test can call
// mutators without having to go through the DOM.
let greeter: UseGreeterApi;

const Greeting: React.FC<{ id: string }> = ({ id }) => {
  greeter = useGreeter({ id });

  const { response } = greeter.useGreet({ name: "World" });

  return (
    <div>
      <div data-testid="message">{response?.message}</div>
      <div data-testid="pending">{greeter.setAdjective.pending.length}</div>
    </div>
  );
};

describe("Mutations observed in a single response", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal("fetch", fakeFetch);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("are all no longer pending", async () => {
    render(
      <RebootClientProvider url={URL}>
        <Greeting id="greeter" />
      </RebootClientProvider>
    );

    // One websocket for mutations and one for the reactive reader.
    await waitFor(() => {
      expect(FakeWebSocket.instances.length).toBe(2);
    });

    const reader = FakeWebSocket.instances.find((websocket) =>
      websocket.url.includes("rbt.v1alpha1.React/Query")
    )!;

    const mutator = FakeWebSocket.instances.find(
      (websocket) => websocket !== reader
    )!;

    expect(reader).toBeDefined();
    expect(mutator).toBeDefined();

    act(() => {
      mutator.open();
      reader.open();
    });

    act(() => {
      reader.receive(queryResponse("Hello, World!", []));
    });

    await waitFor(() => {
      expect(screen.getByTestId("message").innerHTML).toBe("Hello, World!");
    });

    // Now make two mutations, one right after the other.
    let resolved: string[] = [];

    act(() => {
      greeter.setAdjective({ adjective: "first" }).then(() => {
        resolved = [...resolved, "first"];
      });
      greeter.setAdjective({ adjective: "second" }).then(() => {
        resolved = [...resolved, "second"];
      });
    });

    await waitFor(() => {
      expect(mutator.sent.length).toBe(2);
      expect(screen.getByTestId("pending").innerHTML).toBe("2");
    });

    const idempotencyKeys = mutator.sent.map(
      (bytes) => react_pb.MutateRequest.fromBinary(bytes).idempotencyKey
    );

    // The backend performs both mutations ...
    act(() => {
      mutator.receive(mutateResponse());
      mutator.receive(mutateResponse());
    });

    // ... and the reactive reader hears about both of them in a
    // single response, which is what the backend sends when more
    // than one mutation happened since the last response it sent.
    act(() => {
      reader.receive(queryResponse("Hello, second World!", idempotencyKeys));
    });

    await waitFor(
      () => {
        expect(screen.getByTestId("message").innerHTML).toBe(
          "Hello, second World!"
        );
        expect(resolved).toEqual(["first", "second"]);
        expect(screen.getByTestId("pending").innerHTML).toBe("0");
      },
      { timeout: 5000 }
    );
  });

  // The same two mutations, but observed in a response each, to show
  // that it is the single response that matters.
  it("are all no longer pending when observed separately", async () => {
    render(
      <RebootClientProvider url={URL}>
        <Greeting id="greeter-separately" />
      </RebootClientProvider>
    );

    await waitFor(() => {
      expect(FakeWebSocket.instances.length).toBe(2);
    });

    const reader = FakeWebSocket.instances.find((websocket) =>
      websocket.url.includes("rbt.v1alpha1.React/Query")
    )!;

    const mutator = FakeWebSocket.instances.find(
      (websocket) => websocket !== reader
    )!;

    act(() => {
      mutator.open();
      reader.open();
    });

    act(() => {
      reader.receive(queryResponse("Hello, World!", []));
    });

    await waitFor(() => {
      expect(screen.getByTestId("message").innerHTML).toBe("Hello, World!");
    });

    let resolved: string[] = [];

    act(() => {
      greeter.setAdjective({ adjective: "first" }).then(() => {
        resolved = [...resolved, "first"];
      });
      greeter.setAdjective({ adjective: "second" }).then(() => {
        resolved = [...resolved, "second"];
      });
    });

    await waitFor(() => {
      expect(mutator.sent.length).toBe(2);
      expect(screen.getByTestId("pending").innerHTML).toBe("2");
    });

    const idempotencyKeys = mutator.sent.map(
      (bytes) => react_pb.MutateRequest.fromBinary(bytes).idempotencyKey
    );

    act(() => {
      mutator.receive(mutateResponse());
      mutator.receive(mutateResponse());
    });

    act(() => {
      reader.receive(
        queryResponse("Hello, first World!", [idempotencyKeys[0]])
      );
    });

    act(() => {
      reader.receive(
        queryResponse("Hello, second World!", [idempotencyKeys[1]])
      );
    });

    await waitFor(
      () => {
        expect(screen.getByTestId("message").innerHTML).toBe(
          "Hello, second World!"
        );
        expect(resolved).toEqual(["first", "second"]);
        expect(screen.getByTestId("pending").innerHTML).toBe("0");
      },
      { timeout: 5000 }
    );
  });
});
