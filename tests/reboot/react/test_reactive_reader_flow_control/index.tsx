import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { useGreeter } from "../../greeter_rbt_react";

const ID = "greeter-flow-control-test";

// How long the browser is busy with every response it renders. During
// this time the main thread — and with it the reactive read loop — is
// blocked, so responses the backend produces meanwhile have to wait
// for us.
const RENDER_MILLISECONDS = 1000;

const App = () => {
  const greeter = useGreeter({ id: ID });

  const { response } = greeter.useGreet({ name: "Jonathan" });

  useEffect(() => {
    if (response === undefined) {
      return;
    }
    const until = Date.now() + RENDER_MILLISECONDS;
    while (Date.now() < until) {
      // Deliberately spinning to occupy the main thread.
    }
  }, [response]);

  if (response === undefined) return <>Loading...</>;

  return (
    <div className="App">
      <h1 id="render">{response.message}</h1>
    </div>
  );
};

export const render = (url: string) => {
  const root = ReactDOM.createRoot(document.getElementById("root"));

  root.render(
    <RebootClientProvider url={url}>
      <App />
    </RebootClientProvider>
  );
};
