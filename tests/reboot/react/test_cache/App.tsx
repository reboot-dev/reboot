import React from "react";
import { useGreeter } from "../../greeter_rbt_react.js";

export const App: React.FC = (props) => {
  const { adjective } = props;

  const greeter = useGreeter({ id: "greeter-test-id-1" });

  const { response } = greeter.useGreet({ name: "Klaus" });

  const handleClick = () => {
    greeter.setAdjective({ adjective });
  };

  if (response === undefined) {
    return <div data-testid="loading-status">Loading...</div>;
  }

  return (
    <div>
      <h1 data-testid="response-message">{response.message}</h1>
      {greeter.setAdjective.pending?.length && (
        <div data-testid="pendingSetAdjectiveMutations">
          {greeter.setAdjective.pending[0].request.adjective}
        </div>
      )}
      <button data-testid="adjective-button" onClick={handleClick}>
        Set Adjective
      </button>
    </div>
  );
};
