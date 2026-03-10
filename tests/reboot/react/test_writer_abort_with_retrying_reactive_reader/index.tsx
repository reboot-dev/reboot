import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StrictMode, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { useTest } from "./test_rbt_react";

const ID = "actor-test-132";

const App = () => {
  const test = useTest({ id: ID });

  const { response } = test.useReturnResponseOrRaise();

  useEffect(() => {
    (async () => {
      await test.failWithAborted();
    })();
  }, []);

  if (response === undefined) return <>Loading...</>;

  return (
    <div className="App">
      <h1 id="message">{response.message}</h1>
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
