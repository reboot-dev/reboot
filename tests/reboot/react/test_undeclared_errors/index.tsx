import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { useBank } from "../../bank_rbt_react";

const ID = "(singleton)/bank";

const App = () => {
  const { useTestUndeclaredError } = useBank({ id: ID });

  const { aborted } = useTestUndeclaredError();

  if (aborted !== undefined) {
    return (
      <div className="App">
        <h1 id="message">{aborted.message}</h1>
      </div>
    );
  }

  return <>Loading...</>;
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
