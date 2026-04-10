import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";

import React from "react";

import { Application, Reboot } from "@reboot-dev/reboot";
import { RebootClientProvider } from "@reboot-dev/reboot-react";

import { Greeter } from "../../greeter_rbt.js";
import { useGreeter } from "../../greeter_rbt_react.js";
import { GreeterServicer } from "../../nodejs/greeter.js";

// A component that reads from a Greeter instance by `id`.
// Deliberately does NOT use a Suspense boundary so we
// directly test the hook's own state-reset behavior, not
// the Suspense-key trick.
const GreetDisplay: React.FC<{ id: string }> = ({ id }) => {
  const greeter = useGreeter({ id });
  const { response } = greeter.useGreet({ name: "World" });

  if (response === undefined) {
    return <div data-testid="loading">Loading...</div>;
  }

  return <div data-testid="message">{response.message}</div>;
};

describe("Reader state-ID change", () => {
  let rbt: Reboot;

  beforeAll(async () => {
    rbt = new Reboot();
    await rbt.start();
    await rbt.up(
      new Application({
        servicers: [GreeterServicer],
      }),
      {
        localEnvoy: true,
      }
    );
  });

  afterAll(async () => {
    await rbt.stop();
  });

  it("clears stale response and loads new data when state ID changes", async () => {
    const context = rbt.createExternalContext("test-state-id-change");

    // Create two independent Greeter state instances.
    await Greeter.create(context, "greeter-alpha", {
      title: "Dr",
      name: "Alpha",
      adjective: "first",
    });

    await Greeter.create(context, "greeter-beta", {
      title: "Mr",
      name: "Beta",
      adjective: "second",
    });

    const { rerender } = render(
      <RebootClientProvider url={rbt.url()}>
        <GreetDisplay id="greeter-alpha" />
      </RebootClientProvider>
    );

    // Wait for Alpha's greeting to appear.
    await waitFor(() => {
      expect(screen.getByTestId("message").innerHTML).toContain("Alpha");
    });

    // Switch to greeter-beta via rerender.
    rerender(
      <RebootClientProvider url={rbt.url()}>
        <GreetDisplay id="greeter-beta" />
      </RebootClientProvider>
    );

    // The hook should immediately reset to its loading state.
    //
    // These checks run synchronously, before React's effects fire, so
    // we're confident that no Beta data could be loaded yet.
    expect(screen.queryByTestId("message")).toBeNull();
    expect(screen.getByTestId("loading")).toBeDefined();

    // Wait for Beta's data to load.
    await waitFor(
      () => {
        expect(screen.getByTestId("message").innerHTML).toContain("Beta");
      },
      { timeout: 15000 }
    );

    cleanup();
  });
});
