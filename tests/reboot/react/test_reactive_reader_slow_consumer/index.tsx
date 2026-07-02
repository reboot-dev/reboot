import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { useGreeter } from "../../greeter_rbt_react";

const ID = "greeter-slow-consumer-test";

// How much later than its actual arrival the client sees each
// mutation response.
const MUTATION_RESPONSE_DELAY_MILLISECONDS = 5000;

// Wrap the browser's `WebSocket` to add artificial latency to
// everything received on mutation websockets: the ones connected to
// a bare `/__/reboot/rpc/<stateRef>` endpoint, which receive via an
// `onmessage` assignment. While a mutation response is delayed, the
// reactive `read(...)` loop in the generated client sits in `await
// observed(...)`, so query responses arriving on the (real,
// unmodified) reader websocket during that window exercise the
// client's buffering of responses for a busy consumer.
const RealWebSocket = window.WebSocket;

window.WebSocket = function (url: string | URL, protocols?: string | string[]) {
  const websocket = new RealWebSocket(url, protocols);
  if (!String(url).includes("/rbt.v1alpha1.React/")) {
    Object.defineProperty(websocket, "onmessage", {
      set(listener: (event: MessageEvent) => void) {
        websocket.addEventListener("message", (event) => {
          setTimeout(
            () => listener(event),
            MUTATION_RESPONSE_DELAY_MILLISECONDS
          );
        });
      },
    });
  }
  return websocket;
} as any;

for (const constant of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) {
  (window.WebSocket as any)[constant] = (RealWebSocket as any)[constant];
}

const App = () => {
  const greeter = useGreeter({ id: ID });

  const { response } = greeter.useGreet({ name: "Jonathan" });

  const handleClick = () => {
    greeter.setAdjective({ adjective: "funky" });
  };

  if (response === undefined) return <>Loading...</>;

  return (
    <div className="App">
      <h1 id="render">{response.message}</h1>
      <button id="button" onClick={handleClick}>
        Set Adjective
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
