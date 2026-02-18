import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StrictMode, useState } from "react";
import ReactDOM from "react-dom/client";
import { useGreeter } from "../../greeter_rbt_react";

const ID = "actor-test-132";

const App = () => {
  const greeter = useGreeter({ id: ID });

  const [
    savedPendingSetAdjectiveMutations,
    setSavedPendingSetAdjectiveMutations,
  ] = useState();

  const { response } = greeter.useGreet({ name: "Jonathan" });

  // We save pending mutations in state. If we don't, there's a chance the
  // mutation will be removed from pendingSetAdjectiveMutations too quickly
  // for react to render anything or for WebDriver to notice that the DOM
  // has changed.
  if (
    savedPendingSetAdjectiveMutations === undefined &&
    greeter.setAdjective.pending.length > 0
  ) {
    setSavedPendingSetAdjectiveMutations(greeter.setAdjective.pending);
  }

  const handleClick = () => {
    greeter.setAdjective({ adjective: "funky" });
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
      <RebootClientProvider url={url} offlineCacheEnabled>
        <App />
      </RebootClientProvider>
    </StrictMode>
  );
};
