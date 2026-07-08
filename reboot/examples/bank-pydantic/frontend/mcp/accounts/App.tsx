// frontend/mcp/accounts/App.tsx
import { useBank } from "@api/bank/v1/pydantic/bank_rbt_react";
import { type FC } from "react";
import css from "./App.module.css";

// A live view of every customer's accounts and balances. The bank's
// id is inferred from the MCP tool call that opened this UI, and
// `useAccountBalances` is reactive, so balances update in place as
// the AI (or anybody else) signs up customers, opens accounts, and
// transfers funds.
export const AccountsApp: FC = () => {
  const bank = useBank();
  const { response, isLoading } = bank.useAccountBalances();

  if (isLoading && response === undefined) {
    return <div className={css.loading}>loading...</div>;
  }

  const balances = response?.balances ?? [];

  return (
    <div className={css.container}>
      <h1 className={css.title}>Rebank Accounts</h1>
      {balances.length === 0 ? (
        <div className={css.empty}>
          No customers yet. Ask the AI to sign one up!
        </div>
      ) : (
        <table className={css.table}>
          <thead>
            <tr>
              <th>Customer / Account</th>
              <th className={css.amount}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {balances.map(({ customerId, accounts }) => (
              <>
                <tr key={customerId} className={css.customer}>
                  <td colSpan={2}>{customerId}</td>
                </tr>
                {(accounts ?? []).map(({ accountId, balance }) => (
                  <tr key={accountId}>
                    <td className={css.account}>{accountId}</td>
                    <td className={css.amount}>${balance}</td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
