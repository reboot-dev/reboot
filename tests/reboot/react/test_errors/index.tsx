import { protoInt64 } from "@bufbuild/protobuf";
import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StrictMode, useState } from "react";
import ReactDOM from "react-dom/client";
import { useAccount, useBank } from "../../bank_rbt_react";

const ID = "(singleton)/bank";

const App = () => {
  const { useBalance } = useAccount({ id: "emily" });

  const { aborted } = useBalance();

  const bank = useBank({ id: ID });

  const { response } = bank.useAssetsUnderManagement();

  const [transferError, setTransferError] = useState<string>();

  const handleClick = async () => {
    // This will cause an overdraft!
    const { response, aborted } = await bank.transfer({
      fromAccountId: "ben",
      toAccountId: "emily",
      amount: protoInt64.parse(1234),
    });

    if (response !== undefined) {
      console.log(`Not expecting a response`);
    } else {
      // Type of `ResponseOrAborted` should imply that `aborted`
      // is not undefined!
      setTransferError(aborted.error.getType().typeName);
    }
  };

  return (
    <div className="App">
      <h1 id="amount">
        {response !== undefined && response.amount.toString()}
      </h1>
      <h1 id="error">
        {aborted !== undefined && aborted.error.getType().typeName}
      </h1>
      <h1 id="transferError">{transferError !== undefined && transferError}</h1>
      <button id="transfer" onClick={handleClick}>
        Transfer
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
