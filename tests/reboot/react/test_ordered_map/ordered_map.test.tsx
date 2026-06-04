import { Value } from "@bufbuild/protobuf";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";

import React from "react";

import { allow, Application, Reboot } from "@reboot-dev/reboot";
import { RebootClientProvider } from "@reboot-dev/reboot-react";

import { useOrderedMap } from "@reboot-dev/reboot-std-api/collections/ordered_map/v1/ordered_map_rbt_react.js";
import {
  OrderedMap,
  orderedMapLibrary,
} from "@reboot-dev/reboot-std/collections/ordered_map/v1";

// A component that reads from an OrderedMap instance by `id`.
const OrderedMapDisplay: React.FC<{ id: string }> = ({ id }) => {
  const map = useOrderedMap({ id });

  const { response } = map.useSearch({ key: "my-key" });

  if (response === undefined) {
    return <div data-testid="loading">Loading...</div>;
  } else if (!response.found) {
    return <div data-testid="not-found">Not found</div>;
  }

  return <div data-testid="value">{response.value.toJson() as string}</div>;
};

// This Button is unused in tests, but is used for example code in the docs.
const OrderedMapInsertButton: React.FC = () => {
  const map = useOrderedMap({ id: "my-map" });

  const handleClick = () => {
    map.insert({ key: "my-key", value: Value.fromJson("new value") });
  };

  return (
    <button id="button" onClick={handleClick}>
      Insert New Value
    </button>
  );
};

// This component is unused in tests, but is used for example code in the docs.
const OrderedMapDisplayExampleCode: React.FC = () => {
  const map = useOrderedMap({ id: "my-map" });

  const { aborted, response } = map.useSearch({ key: "my-key" });

  if (aborted !== undefined) {
    return <div id="error">Errored while searching.</div>;
  } else if (response === undefined) {
    return <div id="loading">Loading...</div>;
  } else if (!response.found) {
    return <div id="not-found">Not found</div>;
  } else {
    return <div id="map-value">{response.value?.toJson() as string}</div>;
  }
};

describe("OrderedMap change in React", () => {
  let rbt: Reboot;

  beforeAll(async () => {
    rbt = new Reboot();
    await rbt.start();
  });

  afterAll(async () => {
    await rbt.stop();
  });

  it("Loads data", async () => {
    const authorizer = new OrderedMap.Authorizer({
      search: allow(),
      insert: allow(),
    });
    await rbt.up(
      new Application({
        libraries: [orderedMapLibrary({ authorizer })],
      }),
      {
        localEnvoy: true,
      }
    );
    const context = rbt.createExternalContext("test-map-change");

    // Insert something into the OrderedMap.
    await OrderedMap.ref("my-map").insert(context, {
      key: "my-key",
      value: Value.fromJson("This is the value."),
    });

    render(
      <RebootClientProvider url={rbt.url()}>
        <OrderedMapDisplay id="my-map" />
      </RebootClientProvider>
    );

    // Wait for the map's search to succeed.
    await waitFor(
      () => {
        expect(screen.getByTestId("value").innerHTML).toContain(
          "This is the value."
        );
      },
      { timeout: 15000 }
    );

    cleanup();
  });
});
