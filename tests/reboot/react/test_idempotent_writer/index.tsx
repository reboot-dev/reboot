import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { v4 as uuidv4 } from "uuid";
import { useGreeter } from "../../greeter_rbt_react";

const ID = "actor-test-132";
const IDEMPOTENCY_KEY = uuidv4();

const App = () => {
  const greeter = useGreeter({ id: ID });

  const [
    savedPendingSetAdjectiveMutations,
    setSavedPendingSetAdjectiveMutations,
  ] = useState();

  const [numberOfTimesPendingCleared, setNumberOfTimesPendingCleared] =
    useState();

  const { response } = greeter.useGreet({ name: "Jonathan" });

  // We save pending mutations in state. If we don't, there's a chance the
  // mutation will be removed from pendingSetAdjectiveMutations too quickly
  // for react to render anything or for WebDriver to notice that the DOM
  // has changed.
  useEffect(() => {
    if (greeter.setAdjective.pending.length > 0) {
      setSavedPendingSetAdjectiveMutations(greeter.setAdjective.pending);
    } else if (savedPendingSetAdjectiveMutations !== undefined) {
      setNumberOfTimesPendingCleared((prev) =>
        prev === undefined ? 1 : prev + 1
      );
    }
  }, [greeter.setAdjective.pending]);

  const handleClick = () => {
    let adjective = "funky";
    if (savedPendingSetAdjectiveMutations !== undefined) {
      // Change the adjective for the second call to see that it won't
      // take effect because the mutation is idempotent.
      adjective = "happy";
    }
    greeter.idempotently({ key: IDEMPOTENCY_KEY }).setAdjective({ adjective });

    // This is not the preferred way to use the idempotent writer, but it's
    // still valid.
    greeter.setAdjective({ adjective }, { idempotencyKey: IDEMPOTENCY_KEY });
  };

  if (response === undefined) return <>Loading...</>;

  return (
    <div className="App">
      <h1 id="render">{response.message}</h1>
      {savedPendingSetAdjectiveMutations !== undefined && (
        <div id="pendingSetAdjectiveMutations">
          {savedPendingSetAdjectiveMutations[0].request.adjective}
        </div>
      )}
      {numberOfTimesPendingCleared !== undefined && (
        <div id="numberOfTimesPendingCleared">
          {numberOfTimesPendingCleared}
        </div>
      )}
      <button id="button" onClick={handleClick}>
        Set Adjective
      </button>
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
