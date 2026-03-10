import { RebootClient, RebootClientProvider } from "@reboot-dev/reboot-react";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { useAccount, useBank } from "../../bank_rbt_react";

const Account = ({ id }: { id: string }) => {
  const { useBalance } = useAccount({ id });
  const { response, aborted } = useBalance();

  if (response === undefined) return <>Loading...</>;

  return (
    <div>
      <h1 id={`Account ${id}`}>{response.amount.toString()}</h1>
    </div>
  );
};

const App = () => {
  const { useAssetsUnderManagement } = useBank({ id: "(singleton)/bank" });
  const { response } = useAssetsUnderManagement();

  if (response === undefined) return <>Loading...</>;

  const accountIds = Array.from(
    { length: response.numAccounts },
    (_, i) => `${i + 1}`
  );

  return (
    <div>
      {accountIds.map((id) => (
        <Account key={id} id={id} />
      ))}
    </div>
  );
};

export const render = (url: string) => {
  const root = ReactDOM.createRoot(document.getElementById("root"));

  const client = new RebootClient(url);
  root.render(
    <StrictMode>
      <RebootClientProvider client={client}>
        <App />
      </RebootClientProvider>
    </StrictMode>
  );
};
