import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { useBank } from "../../bank_rbt_react";

const App = () => {
  const { useAssetsUnderManagement } = useBank({ id: "(singleton)/bank" });
  const { response } = useAssetsUnderManagement();

  if (response === undefined) return <>Loading...</>;

  return (
    <div className="App">
      <h1 id="amount">{response.amount.toString()}</h1>
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
