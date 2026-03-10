import { Mutation, RebootClientProvider } from "@reboot-dev/reboot-react";
import React, { ChangeEvent, FC, useEffect, useState } from "react";
import "./App.css";
import { SignUpRequest, useBank } from "./api/bank/v1/bank_rbt_react";

const SignUp: FC = () => {
  const [accountId, setAccountId] = useState("");
  const [initialDeposit, setInitialDeposit] = useState("");

  const bank = useBank({ id: "SVB" });

  const handleClick = () => {
    bank.signUp({ accountId, initialDeposit: BigInt(initialDeposit) });
    setAccountId("");
    setInitialDeposit("");
  };

  return (
    <FormCard cardTitle="Sign Up">
      <Input
        title="Account ID:"
        onChange={(e) => setAccountId((e.target as HTMLSelectElement).value)}
        value={accountId}
      />
      <Input
        title="Balance:"
        onChange={(e) =>
          setInitialDeposit((e.target as HTMLSelectElement).value)
        }
        value={initialDeposit}
      />
      <button onClick={handleClick} style={cl.button}>
        Sign Up
      </button>
    </FormCard>
  );
};

const Transfer: FC = () => {
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");

  const bank = useBank({ id: "SVB" });

  const { response } = bank.useAccountBalances();

  const accountIds: string[] = (response?.balances || []).map(
    ({ accountId }) => accountId
  );

  const handleClick = () => {
    bank.transfer({ fromAccountId, toAccountId, amount: BigInt(amount) });
    setFromAccountId("");
    setToAccountId("");
    setAmount("");
  };

  return (
    <FormCard cardTitle="Transfer">
      <Select
        title="From:"
        onChange={(e) =>
          setFromAccountId((e.target as HTMLSelectElement).value)
        }
        options={accountIds}
        value={fromAccountId}
      />
      <Select
        title="To:"
        value={toAccountId}
        onChange={(e) => setToAccountId((e.target as HTMLSelectElement).value)}
        options={accountIds}
      />
      <Input
        title="Amount:"
        onChange={(e) => setAmount((e.target as HTMLSelectElement).value)}
        value={amount}
      />
      <button onClick={handleClick} style={cl.button}>
        Transfer
      </button>
    </FormCard>
  );
};

const AccountBalances: FC<{
  balances: { accountId: string; balance: bigint }[];
  pendingSignups: Mutation<SignUpRequest>[];
}> = ({ balances, pendingSignups }) => {
  return (
    <div style={cl.AccountBalancesContainer}>
      <table style={cl.table}>
        <thead style={cl.thead}>
          <tr>
            <th>Account ID</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          {balances.map(({ accountId, balance }) => (
            <tr style={cl.tr} key={accountId}>
              <td>{accountId}</td>
              <td>{balance.toString()}</td>
            </tr>
          ))}
          {pendingSignups.map(({ request, idempotencyKey }) => (
            <tr style={cl.tr} key={idempotencyKey}>
              <td>{request.accountId}</td>
              <td>{request.initialDeposit.toString()}</td>
              <td className="loader"></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const Accounts: FC = () => {
  const bank = useBank({ id: "SVB" });

  const { response } = bank.useAccountBalances();

  return (
    <AccountBalances
      balances={response?.balances || []}
      pendingSignups={bank.signUp.pending || []}
    />
  );
};

function App() {
  useEffect(() => {
    document.title = "Reboot Bank";
  }, []);

  return (
    <Layout>
      <div style={cl.container}>
        <SignUp />
        <Transfer />
      </div>
      <Accounts />
    </Layout>
  );
}

export default App;

const url =
  (import.meta.env.VITE_REBOOT_URL as string) ||
  "https://dev.localhost.direct:9991";

const Layout: FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <RebootClientProvider url={url}>
      <div style={cl.pageContainer}>
        <div style={cl.fixedWidthPageContainer}>
          <header style={cl.header}>
            <img
              src={`https://i.imgur.com/vp4iV97.png`}
              alt="Reboot"
              referrerPolicy="no-referrer"
            />
            Reboot Bank
          </header>
          {children}
        </div>
      </div>
    </RebootClientProvider>
  );
};

const FormCard: FC<{ cardTitle: string; children: React.ReactNode }> = ({
  cardTitle,
  children,
}) => {
  return (
    <div style={{ margin: "1rem" }}>
      <div
        style={{ fontSize: "1.2rem", fontWeight: "bold", marginBottom: "1rem" }}
      >
        {cardTitle}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end" }}>{children}</div>
    </div>
  );
};

const Select: FC<{
  title: string;
  value: string;
  onChange: (e: ChangeEvent) => void;
  options: string[];
}> = ({ title, value, onChange, options }) => {
  return (
    <div>
      <div>{title}</div>
      <select
        name={title}
        id={title}
        style={{ ...cl.input, ...cl.select }}
        value={value}
        onChange={onChange}
      >
        <option disabled value={""}>
          {" "}
          - Select account ID -{" "}
        </option>
        {options.map((id: string) => (
          <option value={id} key={id}>
            {id}
          </option>
        ))}
      </select>
    </div>
  );
};

const Input: FC<{
  title: string;
  value: string;
  onChange: (e: ChangeEvent) => void;
}> = ({ title, value, onChange }) => {
  return (
    <div>
      <div>{title}</div>
      <input style={cl.input} type="text" onChange={onChange} value={value} />
    </div>
  );
};

const cl = {
  pageContainer: { width: "100vw", height: "100vh" },
  fixedWidthPageContainer: {
    maxWidth: "1440px",
    width: "100%",
    margin: "auto",
  },
  AccountBalancesContainer: {
    margin: "0 2rem",
  },
  thead: {
    textAlign: "left" as const,
    fontSize: "large",
  },
  container: {
    display: "flex",
    borderTop: "1px solid lightgrey",
    borderBottom: "1px solid lightgrey",
    padding: "1rem 0",
    justifyContent: "space-around",
    margin: "1rem",
  },
  header: {
    display: "flex",
    gap: "1rem",
    margin: "1rem",
    marginBottom: "3rem",
    alignItems: "flex-end",
    fontSize: "2em",
    color: "#103761",
    fontWeight: "bold",
  },
  ul: {
    listStyleType: "none",
    padding: 0,
    margin: 0,
  },
  table: {
    margin: "2rem",
    fontSize: "0.9em",
    fontfamily: "sans-serif",
    minWidth: "300px",
  },
  tr: {
    border: "1px solid red",
    backgroundColor: "#f7fafc",
    lineHeight: "1.5rem",
    fontSize: "large",
  },
  button: {
    backgroundColor: "#3FBDBD",
    borderRadius: "4px",
    borderStyle: "none",
    color: "#ffffff",
    cursor: "pointer",
    display: "inline-block",
    fontFamily:
      "Haas Grot Text R Web, Helvetica Neue, Helvetica, Arial sans-serif",
    fontSize: "14px",
    fontWeight: "500",
    height: "40px",
    lineHeight: "20px",
    listStyle: "none",
    margin: "0",
    outline: "none",
    padding: "10px 16px",
    textDecoration: "none",
    transition: "color 100ms",
    verticalAlign: "baseline",
  },
  input: {
    lineHeight: "1.5rem",
    padding: "0 1rem",
    margin: "2px 1rem",
    border: "2px solid transparent",
    borderRadius: "4px",
    outline: "none",
    backgroundColor: "#f8fafc",
    color: "#0d0c22",
    transition: "0.5s ease",
  },
  select: {
    height: "28px",
  },
};
