import { protoInt64 } from "@bufbuild/protobuf";
import {
  RebootClientProvider,
  useRebootClient,
} from "@reboot-dev/reboot-react";
import { FC, StrictMode, useState } from "react";
import ReactDOM from "react-dom/client";
import { useBank } from "../../bank_rbt_react";

const ID = "(singleton)/bank";

const Home: FC = ({ logout }) => {
  const bank = useBank({ id: ID });

  const { response } = bank.useAssetsUnderManagement();

  const signUp = () => {
    bank.signUp({
      accountId: "emily",
      initialDeposit: protoInt64.parse(1234),
    });
  };

  return (
    <div>
      <button id="signup" onClick={signUp}>
        Sign Up
      </button>
      <h1 id="amount">
        {response !== undefined ? response.amount.toString() : "TBD"}
      </h1>
      <button id="logout" onClick={logout}>
        Log Out
      </button>
    </div>
  );
};

const App = () => {
  const { setBearerToken } = useRebootClient();

  const [authenticated, setAuthenticated] = useState(false);

  const { useAssetsUnderManagement } = useBank({ id: ID });

  const { aborted } = useAssetsUnderManagement();

  const login = () => {
    // This is a simple web token of:
    // {
    //   "sub": "emily"
    // }
    // Signed using HS256 and key "S3CR3T!".
    setBearerToken(
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlbWlseSJ9.qcsoYvGX8pMLhZf1HPjLnfQnOIz6paN7_DldAZw6rgY"
    );
    setAuthenticated(true);
  };

  const logout = () => {
    setBearerToken();
    setAuthenticated(false);
  };

  if (authenticated) {
    return (
      <div className="App">
        <Home logout={logout} />
      </div>
    );
  } else {
    return (
      <div className="App">
        <button id="login" onClick={login}>
          Login
        </button>
        <h1 id="error">
          {aborted !== undefined && aborted.error.getType().typeName}
        </h1>
      </div>
    );
  }
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
