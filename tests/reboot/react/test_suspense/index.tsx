import { assert } from "@reboot-dev/reboot-api";
import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StrictMode, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { useBank } from "../../bank_rbt_react";

const ShowAmount = () => {
  const bank = useBank({ id: "(singleton)/bank" });

  const { response } = bank.useAssetsUnderManagement();

  if (response === undefined) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1 id="amount">{response.amount.toString()}</h1>
    </div>
  );
};

const ShowAmountIfAtLeast = ({ amount }) => {
  const bank = useBank({ id: "(singleton)/bank" });

  const { response } = bank.useAssetsUnderManagement(
    { waitForAmountAtLeast: amount },
    { suspense: true }
  );

  assert(response !== undefined);

  return (
    <div>
      <h1 id={`amount${amount}`}>{response.amount.toString()}</h1>
    </div>
  );
};

export const render = (url: string) => {
  const root = ReactDOM.createRoot(document.getElementById("root"));

  root.render(
    <StrictMode>
      <RebootClientProvider url={url} offlineCacheEnabled>
        <ShowAmount />
        <Suspense fallback={<div>Loading...</div>}>
          <ShowAmountIfAtLeast amount={42} />
          <ShowAmountIfAtLeast amount={1234} />
        </Suspense>
      </RebootClientProvider>
    </StrictMode>
  );
};
