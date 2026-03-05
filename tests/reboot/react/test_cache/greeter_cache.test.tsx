import { expect, describe, it, beforeAll } from "vitest";

import { render, waitFor, act, screen } from "@testing-library/react";

import { Application, Reboot } from "@reboot-dev/reboot";
import { RebootClientProvider } from "@reboot-dev/reboot-react";

import { GreeterServicer } from "../../nodejs/greeter.js";
import { Greeter } from "../../greeter_rbt.js";
import { setTimeout } from "timers/promises";

import { App } from "./App.js";

async function rebootUp(rbt: Reboot) {
  await rbt.up(
    new Application({
      servicers: [GreeterServicer],
    }),
    {
      localEnvoy: true,
    }
  );
}

describe("Disconnected mode - offline cache enabled", () => {
  let rbt: Reboot;

  beforeAll(async () => {
    rbt = new Reboot();
    await rbt.start();
    await rebootUp(rbt);
  });

  describe("Reader", () => {
    it("creates Greeter and changes adjective", async () => {
      const context = rbt.createExternalContext("test-context-1");

      await Greeter.create(context, "greeter-test-id-1", {
        title: "Dr",
        name: "Jonathan",
        adjective: "Best",
      });

      const { findByTestId } = render(
        <RebootClientProvider url={rbt.url()} offlineCacheEnabled>
          <App adjective="funky" />
        </RebootClientProvider>
      );

      const responseMessageElement = await findByTestId("response-message");

      expect(responseMessageElement.innerHTML).toBe(
        "Hi Klaus, I am Dr Jonathan the Best"
      );

      await act(async () => {
        const button = await findByTestId("adjective-button");
        button.click();
      });

      await waitFor(
        async () => {
          expect(responseMessageElement.innerHTML).toBe(
            "Hi Klaus, I am Dr Jonathan the funky"
          );
        },
        {
          timeout: 10000,
        }
      );
    });

    it("has cached reader response message if disconnected", async () => {
      const rebootUrl = rbt.url();

      // Shutdown the reboot back end.
      await rbt.down();

      const { findByTestId } = render(
        <RebootClientProvider url={rebootUrl} offlineCacheEnabled>
          <App adjective="interrupted" />
        </RebootClientProvider>
      );

      const responseMessageElement = await findByTestId("response-message");

      expect(responseMessageElement.innerHTML).toBe(
        "Hi Klaus, I am Dr Jonathan the funky"
      );
    });

    it("changes to a new adjective when reloaded and reconnected", async () => {
      await rebootUp(rbt);

      await setTimeout(5000);

      const { findByTestId } = render(
        <RebootClientProvider url={rbt.url()} offlineCacheEnabled>
          <App adjective="maestro" />
        </RebootClientProvider>
      );

      const responseMessageElement = await findByTestId("response-message");

      expect(responseMessageElement.innerHTML).toBe(
        "Hi Klaus, I am Dr Jonathan the funky"
      );

      await act(async () => {
        const button = await findByTestId("adjective-button");
        button.click();
      });

      await waitFor(
        async () => {
          expect(responseMessageElement.innerHTML).toBe(
            "Hi Klaus, I am Dr Jonathan the maestro"
          );
        },
        {
          timeout: 10000,
        }
      );
    });
  });

  it("has updated cached reader response message if disconnected again", async () => {
    const rebootUrl = rbt.url();

    // Shutdown the reboot back end.
    await rbt.down();

    const { findByTestId } = render(
      <RebootClientProvider url={rebootUrl} offlineCacheEnabled>
        <App adjective="interrupted" />
      </RebootClientProvider>
    );

    const responseMessageElement = await findByTestId("response-message");

    expect(responseMessageElement.innerHTML).toBe(
      "Hi Klaus, I am Dr Jonathan the maestro"
    );
  });
});

describe("Disconnected mode - offline cache disabled", () => {
  let rbt: Reboot;

  beforeAll(async () => {
    rbt = new Reboot();
    await rbt.start();
    await rebootUp(rbt);
  });

  describe("Reader", () => {
    it("creates Greeter and changes adjectiv", async () => {
      const context = rbt.createExternalContext("test-context-1");

      await Greeter.create(context, "greeter-test-id-1", {
        title: "Dr",
        name: "Jonathan",
        adjective: "Best",
      });

      const { findByTestId } = render(
        <RebootClientProvider url={rbt.url()}>
          <App adjective="funky" />
        </RebootClientProvider>
      );

      const responseMessageElement = await findByTestId("response-message");

      expect(responseMessageElement.innerHTML).toBe(
        "Hi Klaus, I am Dr Jonathan the Best"
      );

      await act(async () => {
        const button = await findByTestId("adjective-button");
        button.click();
      });

      await waitFor(
        async () => {
          expect(responseMessageElement.innerHTML).toBe(
            "Hi Klaus, I am Dr Jonathan the funky"
          );
        },
        {
          timeout: 10000,
        }
      );
    });

    it("does not has cached reader response message if disconnected", async () => {
      const rebootUrl = rbt.url();

      // Shutdown the reboot back end.
      await rbt.down();

      const { findByTestId } = render(
        <RebootClientProvider url={rebootUrl}>
          <App adjective="interrupted" />
        </RebootClientProvider>
      );

      expect(screen.queryByTestId("loading-status")).toBeDefined();

      expect(screen.queryByTestId("response-message")).toBeNull();
    });
  });
});
