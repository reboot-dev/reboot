import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StrictMode, useState } from "react";
import ReactDOM from "react-dom/client";
import { RaiseErrorRequest } from "./servicer_api_rbt_types";
import { useTest } from "./servicer_api_zod_rbt_react";

const STATE_ID = "pydantic-web-errors-test";

const App = () => {
  const test = useTest({ id: STATE_ID });
  const [initialized, setInitialized] = useState(false);
  const [errorResult, setErrorResult] = useState<string | null>(null);

  // Show `Initialize` button before state is created.
  if (!initialized) {
    return (
      <div className="App">
        <h1 id="status">not initialized</h1>
        <button
          id="initialize"
          onClick={async () => {
            await test.initialize();
            setInitialized(true);
          }}
        >
          Initialize
        </button>
      </div>
    );
  }

  const triggerError = async (
    errorToTrigger: RaiseErrorRequest["errorToTrigger"]
  ) => {
    setErrorResult(null);
    try {
      const { aborted } = await test.raiseError({ errorToTrigger });
      if (aborted !== undefined) {
        const error = aborted.error;
        switch (error.type) {
          case "MyError":
            setErrorResult(`MyError: ${error.message} (code: ${error.code})`);
            return;
          case "AnotherError":
            setErrorResult(`AnotherError: ${error.reason}`);
            return;
          case "FailedPrecondition":
            // `FailedPrecondition` doesn't have additional details.
            setErrorResult(`FailedPrecondition`);
        }
      } else {
        setErrorResult("No error");
      }
    } catch (e) {
      setErrorResult(`Unexpected error: ${e}`);
    }
  };

  return (
    <div className="App">
      <h1 id="status">initialized</h1>
      <p id="error-result">{errorResult ?? "No result yet"}</p>
      <button id="trigger-my-error" onClick={() => triggerError("my_error")}>
        Trigger MyError
      </button>
      <button
        id="trigger-another-error"
        onClick={() => triggerError("another_error")}
      >
        Trigger AnotherError
      </button>
      <button
        id="trigger-failed-precondition"
        onClick={() => triggerError("failed_precondition")}
      >
        Trigger FailedPrecondition
      </button>
      <button id="trigger-none" onClick={() => triggerError("none")}>
        No Error
      </button>
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
