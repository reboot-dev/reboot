import { protoInt64 } from "@bufbuild/protobuf";
import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StrictMode, useState } from "react";
import ReactDOM from "react-dom/client";
import { useBank } from "../../bank_rbt_react";

const App = () => {
  const bank = useBank({ id: "(singleton)/bank" });

  const [signedUp, setSignedUp] = useState(false);

  const signUp = () => {
    bank
      .signUp({
        accountId: "emily",
        initialDeposit: protoInt64.parse(1234),
      })
      .then(({ response }) => {
        if (response !== undefined) {
          setSignedUp(true);
        }
      });
  };

  return (
    <div className="App">
      <button id="sign-up" onClick={signUp}>
        Sign Up
      </button>
      <h1 id="signed-up">{signedUp.toString()}</h1>
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
