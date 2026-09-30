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

// A backend from before there was a websocket for the mutations of
// all states.
const OLD_URL = "https://old.reboot.test";

const stateRef = (id: string) => `tests.reboot.Greeter:${id}`;

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

  // How many of those we have responded to.
  private responded = 0;

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

  // Responds to the first mutation that we have not responded to
  // yet, or to `request` if there is one.
  respond(request?: react_pb.MutateRequest) {
    if (request === undefined) {
      request = this.sent[this.responded];
      this.responded += 1;
    }
    this.receive(
      new react_pb.MutateResponse({
        stateRef: request.stateRef,
        responseOrStatus: {
          case: "response",
          value: new SetAdjectiveResponse().toBinary(),
        },
      })
    );
  }

  // Responds like a backend from before there was a websocket for the
  // mutations of all states does, because it is missing the state
  // that it expects to find in the path.
  respondWithoutState() {
    this.receive(
      new react_pb.MutateResponse({
        responseOrStatus: { case: "status", value: "{}" },
      })
    );
    this.close();
  }

  fail() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onerror?.();
    this.onclose?.();
  }

  private receive(response: react_pb.MutateResponse) {
    const bytes = response.toBinary();
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
// mutators without having to go through the DOM, and the one from the
// last render for each ID.
let greeter: UseGreeterApi;
let greeters: { [id: string]: UseGreeterApi } = {};

const Greeter: React.FC<{ id: string }> = ({ id }) => {
  greeter = useGreeter({ id });
  greeters[id] = greeter;
  use(greeter);
  return <div />;
};

// What has been resolved, in the order that it was.
let resolved: string[] = [];

const setAdjective = (id: string, adjective: string) => {
  act(() => {
    greeters[id].setAdjective({ adjective }).then(() => {
      resolved = [...resolved, adjective];
    });
  });
};

const adjectives = (websocket: FakeWebSocket) =>
  websocket.sent.map(
    ({ request }) => SetAdjectiveRequest.fromBinary(request).adjective
  );

describe("The websocket for mutations", () => {
  beforeEach(() => {
    fetched = [];
    use = () => {};
    greeters = {};
    resolved = [];
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal("fetch", fakeFetch);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("is not opened for a state that is only read", async () => {
    use = ({ useGreet }) => {
      useGreet({ name: "World" });
    };

    render(
      <RebootClientProvider url={URL}>
        <Greeter id="greeter-read" />
      </RebootClientProvider>
    );

    await waitFor(() => {
      expect(
        fetched.filter((url) => url.endsWith("/rbt.v1alpha1.React/Query"))
          .length
      ).toBe(1);
    });

    expect(FakeWebSocket.instances.length).toBe(0);
  });

  it.each([
    ["bound", ({ setAdjective }: UseGreeterApi) => {}],
    ["bound from `mutators`", ({ mutators }: UseGreeterApi) => {}],
    [
      "bound from `idempotently()`",
      ({ idempotently }: UseGreeterApi) => {
        idempotently({ key: "key" });
      },
    ],
  ])("is opened once a mutator is %s", async (_, bind) => {
    use = bind;

    render(
      <RebootClientProvider url={URL}>
        <Greeter id="greeter-bound" />
      </RebootClientProvider>
    );

    // We have not called a mutator.
    await waitFor(() => {
      expect(FakeWebSocket.instances.length).toBe(1);
    });
  });

  it("is opened once a mutator is called", async () => {
    render(
      <RebootClientProvider url={URL}>
        <Greeter id="greeter-called" />
      </RebootClientProvider>
    );

    // Give an effect that should not be there the time to run.
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(FakeWebSocket.instances.length).toBe(0);

    let resolved = false;

    act(() => {
      greeter.setAdjective({ adjective: "friendly" }).then(() => {
        resolved = true;
      });
    });

    await waitFor(() => {
      expect(FakeWebSocket.instances.length).toBe(1);
    });

    const [websocket] = FakeWebSocket.instances;

    // The mutation is waiting for the websocket.
    expect(websocket.sent.length).toBe(0);

    act(() => {
      websocket.open();
    });

    expect(websocket.sent.length).toBe(1);

    expect(
      SetAdjectiveRequest.fromBinary(websocket.sent[0].request).adjective
    ).toBe("friendly");

    act(() => {
      websocket.respond();
    });

    await waitFor(() => {
      expect(resolved).toBe(true);
    });
  });

  it("stays open until the state is not used anymore", async () => {
    use = ({ setAdjective }) => {};

    const { rerender, unmount } = render(
      <RebootClientProvider url={URL}>
        <Greeter id="greeter-open" />
      </RebootClientProvider>
    );

    await waitFor(() => {
      expect(FakeWebSocket.instances.length).toBe(1);
    });

    const [websocket] = FakeWebSocket.instances;

    act(() => {
      websocket.open();
    });

    let resolved = 0;

    for (const adjective of ["first", "second"]) {
      act(() => {
        greeter.setAdjective({ adjective }).then(() => {
          resolved += 1;
        });
      });

      await waitFor(() => {
        expect(websocket.sent.length).toBe(resolved + 1);
      });

      act(() => {
        websocket.respond();
      });

      const expected = resolved + 1;

      await waitFor(() => {
        expect(resolved).toBe(expected);
      });

      rerender(
        <RebootClientProvider url={URL}>
          <Greeter id="greeter-open" />
        </RebootClientProvider>
      );
    }

    // Every mutation used the same websocket, which is still open.
    expect(FakeWebSocket.instances.length).toBe(1);
    expect(websocket.readyState).toBe(FakeWebSocket.OPEN);

    unmount();

    expect(websocket.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it("is for the mutations of all states", async () => {
    use = ({ setAdjective }) => {};

    render(
      <RebootClientProvider url={URL}>
        <Greeter id="first" />
        <Greeter id="second" />
      </RebootClientProvider>
    );

    await waitFor(() => {
      expect(FakeWebSocket.instances.length).toBe(1);
    });

    const [websocket] = FakeWebSocket.instances;

    expect(websocket.url).toBe("wss://reboot.test/__/reboot/websocket/mutate");

    act(() => {
      websocket.open();
    });

    setAdjective("first", "first");
    setAdjective("second", "second");
    setAdjective("first", "first again");

    await waitFor(() => {
      expect(websocket.sent.length).toBe(3);
    });

    expect(adjectives(websocket)).toEqual(["first", "second", "first again"]);

    expect(websocket.sent.map(({ stateRef }) => stateRef)).toEqual([
      stateRef("first"),
      stateRef("second"),
      stateRef("first"),
    ]);

    // A response is for the first mutation of its state that does
    // not have one yet, no matter what other states have been up to.
    act(() => {
      websocket.respond(websocket.sent[1]);
    });

    await waitFor(() => {
      expect(resolved).toEqual(["second"]);
    });

    act(() => {
      websocket.respond(websocket.sent[0]);
    });

    await waitFor(() => {
      expect(resolved).toEqual(["second", "first"]);
    });

    act(() => {
      websocket.respond(websocket.sent[2]);
    });

    await waitFor(() => {
      expect(resolved).toEqual(["second", "first", "first again"]);
    });

    expect(FakeWebSocket.instances.length).toBe(1);
  });

  it("is also used by a state that is used later", async () => {
    use = ({ setAdjective }) => {};

    const { rerender } = render(
      <RebootClientProvider url={URL}>
        <Greeter id="sooner" />
      </RebootClientProvider>
    );

    await waitFor(() => {
      expect(FakeWebSocket.instances.length).toBe(1);
    });

    const [websocket] = FakeWebSocket.instances;

    act(() => {
      websocket.open();
    });

    rerender(
      <RebootClientProvider url={URL}>
        <Greeter id="sooner" />
        <Greeter id="later" />
      </RebootClientProvider>
    );

    await waitFor(() => {
      expect(greeters["later"]).toBeDefined();
    });

    setAdjective("later", "later");

    await waitFor(() => {
      expect(websocket.sent.length).toBe(1);
    });

    act(() => {
      websocket.respond();
    });

    await waitFor(() => {
      expect(resolved).toEqual(["later"]);
    });

    expect(FakeWebSocket.instances.length).toBe(1);
  });

  it("stays open until no state is used anymore", async () => {
    use = ({ setAdjective }) => {};

    const { rerender, unmount } = render(
      <RebootClientProvider url={URL}>
        <Greeter id="first" />
        <Greeter id="second" />
      </RebootClientProvider>
    );

    await waitFor(() => {
      expect(FakeWebSocket.instances.length).toBe(1);
    });

    const [websocket] = FakeWebSocket.instances;

    act(() => {
      websocket.open();
    });

    rerender(
      <RebootClientProvider url={URL}>
        <Greeter id="second" />
      </RebootClientProvider>
    );

    expect(websocket.readyState).toBe(FakeWebSocket.OPEN);

    setAdjective("second", "second");

    await waitFor(() => {
      expect(websocket.sent.length).toBe(1);
    });

    unmount();

    expect(websocket.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it("is opened again if it gets closed", async () => {
    use = ({ setAdjective }) => {};

    render(
      <RebootClientProvider url={URL}>
        <Greeter id="first" />
        <Greeter id="second" />
      </RebootClientProvider>
    );

    await waitFor(() => {
      expect(FakeWebSocket.instances.length).toBe(1);
    });

    act(() => {
      FakeWebSocket.instances[0].open();
    });

    setAdjective("first", "first");
    setAdjective("second", "second");

    await waitFor(() => {
      expect(FakeWebSocket.instances[0].sent.length).toBe(2);
    });

    act(() => {
      FakeWebSocket.instances[0].fail();
    });

    await waitFor(
      () => {
        expect(FakeWebSocket.instances.length).toBe(2);
      },
      { timeout: 10000 }
    );

    const websocket = FakeWebSocket.instances[1];

    expect(websocket.url).toBe("wss://reboot.test/__/reboot/websocket/mutate");

    // Every state waits for a while of its own before it tries again.
    await new Promise((resolve) => setTimeout(resolve, 4000));

    expect(FakeWebSocket.instances.length).toBe(2);

    act(() => {
      websocket.open();
    });

    // The mutations that did not get a response are sent again.
    expect([...adjectives(websocket)].sort()).toEqual(["first", "second"]);

    act(() => {
      websocket.respond();
      websocket.respond();
    });

    await waitFor(() => {
      expect([...resolved].sort()).toEqual(["first", "second"]);
    });
  }, 30000);

  it("is a websocket for every state if the backend requires it", async () => {
    use = ({ setAdjective }) => {};

    render(
      <RebootClientProvider url={OLD_URL}>
        <Greeter id="first" />
        <Greeter id="second" />
      </RebootClientProvider>
    );

    await waitFor(() => {
      expect(FakeWebSocket.instances.length).toBe(1);
    });

    expect(FakeWebSocket.instances[0].url).toBe(
      "wss://old.reboot.test/__/reboot/websocket/mutate"
    );

    act(() => {
      FakeWebSocket.instances[0].open();
    });

    setAdjective("first", "first");
    setAdjective("second", "second");

    await waitFor(() => {
      expect(FakeWebSocket.instances[0].sent.length).toBe(2);
    });

    act(() => {
      FakeWebSocket.instances[0].respondWithoutState();
    });

    // Neither mutation has been resolved with that response.
    expect(resolved).toEqual([]);

    await waitFor(
      () => {
        expect(FakeWebSocket.instances.length).toBe(3);
      },
      { timeout: 10000 }
    );

    const websockets = FakeWebSocket.instances.slice(1);

    expect(websockets.map(({ url }) => url).sort()).toEqual([
      `wss://old.reboot.test/__/reboot/rpc/${stateRef("first")}`,
      `wss://old.reboot.test/__/reboot/rpc/${stateRef("second")}`,
    ]);

    for (const websocket of websockets) {
      act(() => {
        websocket.open();
      });

      // The mutation that did not get a response is sent again.
      expect(websocket.sent.length).toBe(1);

      act(() => {
        websocket.respond();
      });
    }

    await waitFor(() => {
      expect([...resolved].sort()).toEqual(["first", "second"]);
    });
  }, 30000);

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
