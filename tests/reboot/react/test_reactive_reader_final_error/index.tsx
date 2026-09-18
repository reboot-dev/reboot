import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StrictMode, useState } from "react";
import ReactDOM from "react-dom/client";
import { useTest } from "./test_rbt_react";

const ID = "actor-test";

// A reader that takes a while to load, so that a mutation made in the
// meantime is queued behind it.
const Slow = () => {
  const { useSlow } = useTest({ id: ID });

  useSlow();

  return <h1 id="slow-mounted">slow mounted</h1>;
};

const App = () => {
  const test = useTest({ id: ID });

  const { response, isLoading, aborted } = test.useGet();

  const [slow, setSlow] = useState(false);

  // How many mutations have completed, since a mutation's promise
  // resolves only once every reader on the state has observed it, or
  // released it.
  const [completed, setCompleted] = useState(0);

  return (
    <div className="App">
      <h1 id="loading">{isLoading ? "loading" : "settled"}</h1>
      <h1 id="error">
        {aborted !== undefined && aborted.error.getType().typeName}
      </h1>
      <h1 id="message">{response !== undefined && response.message}</h1>
      <h1 id="completed">{completed}</h1>
      <button
        id="create"
        onClick={async () => {
          await test.create();
          setCompleted((completed) => completed + 1);
        }}
      >
        Create
      </button>
      <button
        id="set"
        onClick={async () => {
          await test.setMessage({ message: "Hello, Reboot!" });
          setCompleted((completed) => completed + 1);
        }}
      >
        Set
      </button>
      <button id="slow" onClick={() => setSlow(true)}>
        Slow
      </button>
      {slow && <Slow />}
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
