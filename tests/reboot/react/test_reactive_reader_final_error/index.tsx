import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { useTest } from "./test_rbt_react";

const ID = "actor-test";

const App = () => {
  const test = useTest({ id: ID });

  const { response, isLoading, aborted } = test.useGet();

  return (
    <div className="App">
      <h1 id="loading">{isLoading ? "loading" : "settled"}</h1>
      <h1 id="error">
        {aborted !== undefined && aborted.error.getType().typeName}
      </h1>
      <h1 id="message">{response !== undefined && response.message}</h1>
      <button id="create" onClick={() => test.create()}>
        Create
      </button>
      <button
        id="set"
        onClick={() => test.setMessage({ message: "Hello, Reboot!" })}
      >
        Set
      </button>
    </div>
  );
};

export const render = (url: string) => {
  const root = ReactDOM.createRoot(document.getElementById("root"));

  root.render(
    <StrictMode>
      <RebootClientProvider url={url}>
        <App />
      </RebootClientProvider>
    </StrictMode>
  );
};
