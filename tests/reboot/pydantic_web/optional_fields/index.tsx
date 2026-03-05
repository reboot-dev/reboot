import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StrictMode, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  GetStateResponse,
  SetMessageAndCounterRequest,
} from "./servicer_api_rbt_types";
import { useTest } from "./servicer_api_zod_rbt_react";

const STATE_ID = "pydantic-web-test";

const App = () => {
  const test = useTest({ id: STATE_ID });
  const [initialized, setInitialized] = useState(false);

  // Always call `useGetState` unconditionally to satisfy React's "Rules of Hooks":
  //   https://react.dev/reference/rules/rules-of-hooks
  // Test that we can type-annotate `UseGetState() response` with the
  // type generated from Pydantic model.
  const { response }: { response: GetStateResponse | undefined } =
    test.useGetState();

  // Show `Initialize` button before state is created.
  if (!initialized) {
    return (
      <div className="App">
        <h1 id="message">not initialized</h1>
        <button
          id="initialize"
          onClick={async () => {
            // Test that we can type-annotate `UseGetState() response` with the
            // type generated from Pydantic model.
            // It should has only `optional` fileds, so we can send an
            // empty request.
            const request: SetMessageAndCounterRequest = {};
            await test.setMessageAndCounter(request);
            setInitialized(true);
          }}
        >
          Initialize
        </button>
      </div>
    );
  }

  if (response === undefined) return <>Loading...</>;

  if (response.counter === undefined && response.message === undefined) {
    return (
      <div className="App">
        <h1 id="message">undefined</h1>
        <button
          id="set-and-counter"
          onClick={() => {
            // Test that we can type-annotate `UseGetState() response` with the
            // type generated from Pydantic model.
            // Now set the `optional` fields.
            const request: SetMessageAndCounterRequest = {
              message: "Hello from button!",
              counter: 5,
            };
            test.setMessageAndCounter(request);
          }}
        >
          Set Message and Counter
        </button>
      </div>
    );
  }

  return (
    <div className="App">
      <h1 id="message">{response.message}</h1>
      <p id="counter">Counter: {response.counter}</p>
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
