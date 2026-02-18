import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { FC, StrictMode, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { useGreeter } from "../../greeter_rbt_react";

const ID = "actor-test-132";

const LongRunningConnection: FC<{
  seconds: number;
  index: number;
}> = ({ seconds, index }) => {
  const greeter = useGreeter({ id: ID });
  const hasFetched = useRef(false);

  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Necessary to avoid making additional long running fetches from
    // Strict Mode.
    if (hasFetched.current) return;
    hasFetched.current = true;

    (async () => {
      try {
        await greeter.testLongRunningFetch({ sleepTimeSeconds: seconds });
      } catch (e) {
        console.error(`Error testing long running fetch: ${e}`);
        throw e;
      }
      setIsReady(true);
    })();
  }, [greeter, seconds]);

  return (
    // Add the ID only when the fetch is ready so we can wait for that
    // ID to appear in the test.
    <div id={isReady ? `long-running-connection-${index}` : undefined}>
      Long running connection
    </div>
  );
};

const App = () => {
  const numTenSecondConnectionsPerBatch = 4;
  const [showSecondBatch, setShowSecondBatch] = useState(false);

  return (
    <div>
      <button
        onClick={() => setShowSecondBatch(true)}
        id="show-second-batch-button"
      ></button>

      <div>
        {Array.from({ length: numTenSecondConnectionsPerBatch }, (_, i) => (
          <LongRunningConnection key={`first-${i}`} seconds={10} index={i} />
        ))}
      </div>

      {showSecondBatch && (
        <div className="second-batch">
          {Array.from({ length: numTenSecondConnectionsPerBatch }, (_, i) => (
            <LongRunningConnection
              key={`second-${i}`}
              seconds={10}
              index={numTenSecondConnectionsPerBatch + i}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const render = (url: string) => {
  const root = ReactDOM.createRoot(document.getElementById("root"));

  root.render(
    <StrictMode>
      <RebootClientProvider url={url} offlineCacheEnabled>
        <App />
      </RebootClientProvider>
    </StrictMode>
  );
};
