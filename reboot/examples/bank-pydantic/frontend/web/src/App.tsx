import { useBank } from "@api/bank/v1/bank_rbt_react";
import { type UseUserApi } from "@api/bank/v1/user_rbt_react";
import {
  ArrowRightLeft,
  DollarSign,
  LogOut,
  PiggyBank,
  Wallet,
} from "lucide-react";
import { useState, type FC } from "react";
import "./App.css";

// The id of this example's single `Bank` state (see
// `backend/src/constants.py`).
const SINGLETON_BANK_ID = "reboot-bank";

const OpenAccount: FC<{ user: UseUserApi }> = ({ user }) => {
  const [initialDeposit, setInitialDeposit] = useState("");

  const handleOpenAccount = async () => {
    // Capture and clear the form synchronously, before awaiting, so a
    // clear firing after the await can't clobber a follow-up input.
    const deposit = Number(initialDeposit);
    setInitialDeposit("");
    const { aborted } = await user.openAccount({ initialDeposit: deposit });
    if (aborted !== undefined) {
      console.warn(aborted.error.type, aborted.message);
    }
  };

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 border border-purple-500/20">
      <div className="flex items-center gap-3 mb-6">
        <PiggyBank className="w-8 h-8 text-purple-400" />
        <h2 className="text-2xl font-bold text-white">Open a New Account</h2>
      </div>
      <div className="space-y-6">
        <div>
          <label className="block text-purple-200 text-sm font-medium mb-2">
            Initial Deposit ($)
          </label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-purple-400" />
            <input
              type="number"
              value={initialDeposit}
              onChange={(e) =>
                setInitialDeposit((e.target as HTMLInputElement).value)
              }
              className="w-full pl-10 pr-4 py-3 bg-white/5 border border-purple-500/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 transition-all"
              placeholder="1000.00"
              min="0"
              step="0.01"
              required
            />
          </div>
        </div>
        <button
          onClick={handleOpenAccount}
          disabled={initialDeposit === ""}
          className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-green-700 hover:to-emerald-700 transform hover:scale-[1.02] transition-all duration-200 shadow-lg disabled:opacity-50 disabled:hover:scale-100"
        >
          Open Account
        </button>
      </div>
    </div>
  );
};

const Transfer: FC<{ user: UseUserApi }> = ({ user }) => {
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");

  // Transfers are a bank-wide operation, so they go through the
  // `Bank`; the pickers below only ever offer the signed-in user's
  // own accounts.
  const bank = useBank({ id: SINGLETON_BANK_ID });

  const { response } = user.useBalances();
  const accountIds = (response?.balances ?? []).map(
    ({ accountId }) => accountId
  );

  const handleTransfer = async () => {
    // Capture and clear the form synchronously, before awaiting, so a
    // clear firing after the await can't clobber a follow-up
    // selection.
    const request = { fromAccountId, toAccountId, amount: Number(amount) };
    setFromAccountId("");
    setToAccountId("");
    setAmount("");
    const { aborted } = await bank.transfer(request);
    if (aborted !== undefined) {
      console.warn(aborted.error.type, aborted.message);
    }
  };

  const ready = fromAccountId !== "" && toAccountId !== "" && amount !== "";

  const accountSelect = (
    value: string,
    onChange: (value: string) => void,
    label: string
  ) => (
    <div>
      <label className="block text-purple-200 text-sm font-medium mb-2">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
        className="w-full px-4 py-3 bg-white/5 border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 transition-all"
      >
        <option value="" className="bg-slate-800">
          Select account
        </option>
        {accountIds.map((id) => (
          <option key={id} value={id} className="bg-slate-800">
            {id}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 border border-purple-500/20">
      <div className="flex items-center gap-3 mb-6">
        <ArrowRightLeft className="w-8 h-8 text-purple-400" />
        <h2 className="text-2xl font-bold text-white">Transfer Funds</h2>
      </div>
      {accountIds.length < 2 ? (
        <p className="text-purple-200/80">
          Open a second account to transfer money between your accounts.
        </p>
      ) : (
        <div className="space-y-6">
          {accountSelect(fromAccountId, setFromAccountId, "From Account")}
          {accountSelect(toAccountId, setToAccountId, "To Account")}
          <div>
            <label className="block text-purple-200 text-sm font-medium mb-2">
              Amount ($)
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-purple-400" />
              <input
                type="number"
                value={amount}
                onChange={(e) =>
                  setAmount((e.target as HTMLInputElement).value)
                }
                className="w-full pl-10 pr-4 py-3 bg-white/5 border border-purple-500/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 transition-all"
                placeholder="100.00"
                min="0"
                step="0.01"
              />
            </div>
          </div>
          <button
            onClick={handleTransfer}
            disabled={!ready}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-purple-700 hover:to-pink-700 transform hover:scale-[1.02] transition-all duration-200 shadow-lg disabled:opacity-50 disabled:hover:scale-100"
          >
            Transfer Funds
          </button>
        </div>
      )}
    </div>
  );
};

const AccountRow: FC<{
  accountId: string;
  balance: number;
  pending: boolean;
}> = ({ accountId, balance, pending }) => {
  return (
    <tr className="border-b border-purple-500/10 hover:bg-white/5 transition-colors">
      <td className="py-4 px-6 text-white font-medium">{accountId}</td>
      <td className="py-4 px-6 text-right">
        <span
          className={
            pending
              ? "font-semibold text-lg bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent animate-pulse"
              : "text-green-400 font-semibold text-lg"
          }
        >
          ${balance.toString()}
        </span>
      </td>
    </tr>
  );
};

const AccountsTable: FC<{ user: UseUserApi }> = ({ user }) => {
  const { response, isLoading } = user.useBalances();

  if (isLoading && response === undefined) {
    return <p className="text-purple-200 animate-pulse">Loading…</p>;
  }

  const balances = response?.balances ?? [];

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 border border-purple-500/20">
      <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
        <DollarSign className="w-8 h-8 text-purple-400" />
        Your Accounts
      </h2>
      {balances.length === 0 && user.openAccount.pending.length === 0 ? (
        <p className="text-purple-200/80">
          No accounts yet — open your first account above.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-purple-500/20">
                <th className="text-left py-4 px-6 text-purple-200 font-semibold text-sm uppercase tracking-wider">
                  Account ID
                </th>
                <th className="text-right py-4 px-6 text-purple-200 font-semibold text-sm uppercase tracking-wider">
                  Current Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {balances.map(({ accountId, balance }) => (
                <AccountRow
                  key={accountId}
                  accountId={accountId}
                  balance={balance}
                  pending={false}
                />
              ))}
              {user.openAccount.pending.map(({ request, idempotencyKey }) => (
                <AccountRow
                  key={idempotencyKey}
                  accountId="... pending ..."
                  balance={request.initialDeposit}
                  pending={true}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// The signed-in user's view of the bank: sign-in auto-constructed
// their `User`, which signed them up as a customer (see
// `UserServicer.create`), so everything here is scoped to the
// accounts they own.
const App: FC<{ user: UseUserApi; onSignOut: () => void }> = ({
  user,
  onSignOut,
}) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header. */}
        <div className="relative text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4 flex items-center justify-center gap-3">
            <Wallet className="w-12 h-12 text-purple-400" />
            Rebank
          </h1>
          <p className="text-purple-200 text-lg">A Bank Rebooted</p>
          <div className="mt-4 flex items-center justify-center gap-4 lg:absolute lg:top-0 lg:right-0 lg:mt-0">
            <span className="text-purple-200/80 text-sm">
              Signed in as{" "}
              <span className="text-white font-medium">{user.state_id}</span>
            </span>
            <button
              onClick={onSignOut}
              className="flex items-center gap-2 text-purple-200 text-sm font-medium bg-white/5 border border-purple-500/30 rounded-lg px-4 py-2 hover:bg-white/10 hover:text-white transition-all"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          <OpenAccount user={user} />
          <Transfer user={user} />
        </div>
        <AccountsTable user={user} />
      </div>
    </div>
  );
};

export default App;
