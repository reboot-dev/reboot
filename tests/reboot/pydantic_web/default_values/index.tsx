import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StrictMode, useState } from "react";
import ReactDOM from "react-dom/client";
import { GetStateResponse, UpdateStateRequest } from "./servicer_api_rbt_types";
import { useDefaultValuesTest } from "./servicer_api_zod_rbt_react";

const STATE_ID = "default-values-test";

type TestPhase = "not-initialized" | "initialized-with-defaults" | "updated";

const App = () => {
  const test = useDefaultValuesTest({ id: STATE_ID });
  const [phase, setPhase] = useState<TestPhase>("not-initialized");

  // Always call `useGetState` unconditionally to satisfy React's "Rules of Hooks":
  //   https://react.dev/reference/rules/rules-of-hooks
  // Test that we can type-annotate `UseGetState() response` with the
  // type generated from Pydantic model.
  const { response }: { response: GetStateResponse | undefined } =
    test.useGetState();

  // Phase 1: Show initialize button.
  if (phase === "not-initialized") {
    return (
      <div className="App">
        <h1 id="phase">not-initialized</h1>
        <button
          id="initialize"
          onClick={async () => {
            // Call writer without factory - triggers implicit construction.
            await test.initializeWithDefaults();
            setPhase("initialized-with-defaults");
          }}
        >
          Initialize with Defaults
        </button>
      </div>
    );
  }

  if (response === undefined) return <>Loading...</>;

  // Phase 2: Show default values and update button.
  if (phase === "initialized-with-defaults") {
    return (
      <div className="App">
        <h1 id="phase">initialized-with-defaults</h1>
        <div id="state-display">
          <p id="text">text: "{response.text}"</p>
          <p id="number">number: {response.number}</p>
          <p id="flag">flag: {response.flag ? "true" : "false"}</p>
          <p id="status">status: {response.status}</p>
          <p id="items">items: [{response.items?.join(", ") ?? ""}]</p>
          <p id="mapping">mapping: {JSON.stringify(response.mapping ?? {})}</p>
          <p id="optional-text">
            optionalText:{" "}
            {response.optionalText === undefined
              ? "undefined"
              : `"${response.optionalText}"`}
          </p>
          <p id="variant">
            variant:{" "}
            {response.variant === undefined
              ? "undefined"
              : JSON.stringify(response.variant)}
          </p>
        </div>
        <button
          id="update"
          onClick={async () => {
            const request: UpdateStateRequest = {
              text: "hello",
              number: 42,
              flag: true,
              status: "second",
              items: ["a", "b", "c"],
              mapping: { key1: "value1", key2: "value2" },
              optionalText: "optional-value",
              variant: { kind: "A", valueA: "variant-value" },
            };
            await test.updateState(request);
            setPhase("updated");
          }}
        >
          Update State
        </button>
      </div>
    );
  }

  // Phase 3: Show updated values.
  return (
    <div className="App">
      <h1 id="phase">updated</h1>
      <div id="state-display">
        <p id="text">text: "{response.text}"</p>
        <p id="number">number: {response.number}</p>
        <p id="flag">flag: {response.flag ? "true" : "false"}</p>
        <p id="status">status: {response.status}</p>
        <p id="items">items: [{response.items?.join(", ") ?? ""}]</p>
        <p id="mapping">mapping: {JSON.stringify(response.mapping ?? {})}</p>
        <p id="optional-text">
          optionalText:{" "}
          {response.optionalText === undefined
            ? "undefined"
            : `"${response.optionalText}"`}
        </p>
        <p id="variant">
          variant:{" "}
          {response.variant === undefined
            ? "undefined"
            : JSON.stringify(response.variant)}
        </p>
      </div>
    </div>
  );
};

export const render = (url: string) => {
  const root = ReactDOM.createRoot(
    document.getElementById("root") as HTMLElement
  );

  root.render(
    <StrictMode>
      <RebootClientProvider url={url}>
        <App />
      </RebootClientProvider>
    </StrictMode>
  );
};
