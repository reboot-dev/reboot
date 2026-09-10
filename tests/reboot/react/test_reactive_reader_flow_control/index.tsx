import { WebContext } from "@reboot-dev/reboot-web";
import { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { Greeter } from "../../greeter_rbt_web";

const ID = "greeter-flow-control-test";

declare global {
  interface Window {
    // Lets the query continue past the response currently on screen,
    // and past every response after it. The test calls this once it
    // has made every state change that it wants the backend to have
    // had no room to send.
    stopHolding: () => void;
  }
}

const App = ({ url }: { url: string }) => {
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    const abortController = new AbortController();

    // Whether every response is held back until the test says
    // otherwise, and the release of the response held right now.
    let holding = true;
    let release: (() => void) | undefined = undefined;

    // `window.stopHolding` is assigned here, synchronously, before the
    // read below has anything to render, so a test that has seen a
    // message rendered knows the hold is in place.
    window.stopHolding = () => {
      holding = false;
      release?.();
      release = undefined;
    };

    const read = async () => {
      const context = new WebContext({ url });

      // We consume the reactive read ourselves rather than through
      // `useGreet` so that we decide when each response lets the
      // query continue: `reactively()` reports a response as
      // processed only once we ask this generator for a next one, so
      // a response we have not asked for yet is a response the
      // backend has been given no room to follow.
      const [responses] = await Greeter.ref(ID).reactively().greet(
        context,
        { name: "Jonathan" },
        {
          signal: abortController.signal,
        }
      );

      for await (const response of responses) {
        setMessages((messages) => [...messages, response.message]);

        if (holding) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
      }
    };

    read();

    return () => abortController.abort();
  }, [url]);

  if (messages.length === 0) return <>Loading...</>;

  return (
    <div className="App">
      <h1 id="render">{messages[messages.length - 1]}</h1>
      {/* One message per line, oldest first. */}
      <pre id="rendered">{messages.join("\n")}</pre>
    </div>
  );
};

export const render = (url: string) => {
  const root = ReactDOM.createRoot(document.getElementById("root"));

  root.render(<App url={url} />);
};
