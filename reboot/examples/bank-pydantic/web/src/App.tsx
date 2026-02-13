import { ArrowRightLeft, DollarSign, UserPlus, Wallet } from "lucide-react";
import { useState, type FC } from "react";
import {
  useBank,
  type UseBankApi,
} from "../api/bank/v1/pydantic/bank_rbt_react";
import "./App.css";

const Transfer: FC<{ bank: UseBankApi }> = ({ bank }) => {
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [fromCustomerId, setFromCustomerId] = useState("");
  const [toCustomerId, setToCustomerId] = useState("");

  const { response } = bank.useAccountBalances();
  if (response == undefined) return <>Loading...</>;

  // Group accounts by customerId.
  const customerAccounts: Record<string, { accountId: string }[]> = {};
  (response.balances || []).forEach((balance: any) => {
    if (!customerAccounts[balance.customerId])
      customerAccounts[balance.customerId] = [];
    (balance.accounts || []).forEach((account: any) => {
      customerAccounts[balance.customerId].push({
        accountId: account.accountId,
      });
    });
  });
  const customerIds = Object.keys(customerAccounts);
  const fromAccounts = fromCustomerId
    ? customerAccounts[fromCustomerId] || []
    : [];
  const toAccounts = toCustomerId ? customerAccounts[toCustomerId] || [] : [];

  const handleTransfer = () => {
    bank.transfer({ fromAccountId, toAccountId, amount: Number(amount) });
    setFromCustomerId("");
    setToCustomerId("");
    setFromAccountId("");
    setToAccountId("");
    setAmount("");
  };

  return (
    <>
      {/* Transfer Card. */}
      <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 border border-purple-500/20">
        <div className="flex items-center gap-3 mb-6">
          <ArrowRightLeft className="w-8 h-8 text-purple-400" />
          <h2 className="text-2xl font-bold text-white">Transfer Funds</h2>
        </div>
        <div className="space-y-6">
          <div className="flex justify-center items-center gap-20 py-2">
            <div>
              <label className="block text-purple-200 text-sm font-medium mb-2">
                From Customer
              </label>
              <select
                value={fromCustomerId}
                onChange={(e) => {
                  setFromCustomerId((e.target as HTMLSelectElement).value);
                  setFromAccountId("");
                }}
                className="w-72 px-4 py-3 bg-white/5 border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 transition-all"
              >
                <option value="" className="bg-slate-800">
                  Select customer
                </option>
                {customerIds.map((id) => (
                  <option key={id} value={id} className="bg-slate-800">
                    {id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-purple-200 text-sm font-medium mb-2">
                From Account
              </label>
              <select
                value={fromAccountId}
                onChange={(e) =>
                  setFromAccountId((e.target as HTMLSelectElement).value)
                }
                className="w-72 px-4 py-3 bg-white/5 border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 transition-all"
                disabled={!fromCustomerId}
              >
                <option value="" className="bg-slate-800">
                  Select account
                </option>
                {fromAccounts.map((account) => (
                  <option
                    key={account.accountId}
                    value={account.accountId}
                    className="bg-slate-800"
                  >
                    {account.accountId}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-center items-center gap-20 py-2">
            <div>
              <label className="block text-purple-200 text-sm font-medium mb-2">
                To Customer
              </label>
              <select
                value={toCustomerId}
                onChange={(e) => {
                  setToCustomerId((e.target as HTMLSelectElement).value);
                  setToAccountId("");
                }}
                className="w-72 px-4 py-3 bg-white/5 border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 transition-all"
              >
                <option value="" className="bg-slate-800">
                  Select customer
                </option>
                {customerIds.map((id) => (
                  <option key={id} value={id} className="bg-slate-800">
                    {id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-purple-200 text-sm font-medium mb-2">
                To Account
              </label>
              <select
                value={toAccountId}
                onChange={(e) =>
                  setToAccountId((e.target as HTMLSelectElement).value)
                }
                className="w-72 px-4 py-3 bg-white/5 border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 transition-all"
                disabled={!toCustomerId}
              >
                <option value="" className="bg-slate-800">
                  Select account
                </option>
                {toAccounts.map((account) => (
                  <option
                    key={account.accountId}
                    value={account.accountId}
                    className="bg-slate-800"
                  >
                    {account.accountId}
                  </option>
                ))}
              </select>
            </div>
          </div>
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
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-purple-700 hover:to-pink-700 transform hover:scale-[1.02] transition-all duration-200 shadow-lg"
          >
            Transfer Funds
          </button>
        </div>
      </div>
    </>
  );
};

const CustomersAndAccounts: FC<{
  bank: UseBankApi;
}> = ({ bank }) => {
  const [newCustomerId, setNewCustomerId] = useState("");

  const [accountCustomerId, setAccountCustomerId] = useState("");
  const [initialDeposit, setInitialDeposit] = useState("");

  const { response: allCustomerIdsResponse } = bank.useAllCustomerIds();
  const customerIds: string[] = (allCustomerIdsResponse?.customerIds || []).map(
    (c: any) => c
  );

  const handleCreateCustomer = () => {
    bank.signUp({
      customerId: newCustomerId,
    });
    setNewCustomerId("");
  };

  const handleAddAccount = () => {
    if (accountCustomerId) {
      bank.openCustomerAccount({
        initialDeposit: Number(initialDeposit),
        customerId: accountCustomerId,
      });
    }

    setAccountCustomerId("");
    setInitialDeposit("");
  };

  return (
    <>
      {/* Customer & Account Card. */}
      <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 border border-purple-500/20">
        <div className="flex items-center gap-3 mb-6">
          <UserPlus className="w-8 h-8 text-purple-400" />
          <h2 className="text-2xl font-bold text-white">Customer & Account</h2>
        </div>
        <div className="space-y-10">
          {/* Create Customer Card. */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-purple-200 mb-2">
              Create New Customer
            </h3>
            <div>
              <label className="block text-purple-200 text-sm font-medium mb-2">
                Customer ID
              </label>
              <input
                type="text"
                value={newCustomerId}
                onChange={(e) =>
                  setNewCustomerId((e.target as HTMLInputElement).value)
                }
                className="w-full px-4 py-3 bg-white/5 border border-purple-500/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 transition-all"
                placeholder="e.g., team@reboot.dev"
                required
              />
            </div>
            <button
              className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-green-700 hover:to-emerald-700 transform hover:scale-[1.02] transition-all duration-200 shadow-lg"
              onClick={handleCreateCustomer}
            >
              Create Customer
            </button>
          </div>

          {/* Add Account to Customer Card. */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-purple-200 mb-2">
              Add Account to Customer
            </h3>
            <div>
              <label className="block text-purple-200 text-sm font-medium mb-2">
                Customer ID
              </label>
              <select
                value={accountCustomerId}
                onChange={(e) =>
                  setAccountCustomerId((e.target as HTMLSelectElement).value)
                }
                className="w-full px-4 py-3 bg-white/5 border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 transition-all"
                required
              >
                <option value="" className="bg-slate-800">
                  Select customer
                </option>
                {customerIds.map((id: string) => (
                  <option key={id} value={id} className="bg-slate-800">
                    {id}
                  </option>
                ))}
              </select>
            </div>
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
              onClick={handleAddAccount}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-purple-700 hover:to-pink-700 transform hover:scale-[1.02] transition-all duration-200 shadow-lg"
            >
              Add Account
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

const TableRow: FC<{
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

const CustomerTableRow: FC<{
  customerId: string;
  pending: boolean;
}> = ({ customerId, pending }) => {
  return (
    <tr key={customerId} className="bg-slate-900/40">
      <td
        colSpan={2}
        className={
          `py-3 px-6 font-bold text-base border-b border-purple-500/20 ` +
          (pending ? "text-pink-400 animate-pulse" : "text-purple-300")
        }
      >
        {customerId}
        {pending && (
          <span className="ml-3 text-xs font-semibold bg-pink-900/40 text-pink-300 px-2 py-1 rounded animate-pulse align-middle">
            Pending...
          </span>
        )}
      </td>
    </tr>
  );
};

const AccountsTable: FC<{
  bank: UseBankApi;
}> = ({ bank }) => {
  // NOTE: this code commented out to show what you would be doing if
  // you wanted to do a non reactive read!
  //
  // const [response, setResponse] = useState<{
  //   balances: { customerId: string; accounts: { accountId: string; balance: number }[] }[];
  // }>();

  // useEffect(() => {
  //   (async () => {
  //     const { response } = await bank.accountBalances();
  //     if (response) {
  //       setResponse(response);
  //     }
  //   })();
  // }, [bank]);

  const { response } = bank.useAccountBalances();

  if (response == undefined) return <>Loading...</>;

  const { balances } = response;

  return (
    <>
      {/* Accounts Table. */}
      <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 border border-purple-500/20">
        <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
          <DollarSign className="w-8 h-8 text-purple-400" />
          All Accounts
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-purple-500/20">
                <th className="text-left py-4 px-6 text-purple-200 font-semibold text-sm uppercase tracking-wider">
                  Customer ID / Account ID
                </th>
                <th className="text-right py-4 px-6 text-purple-200 font-semibold text-sm uppercase tracking-wider">
                  Current Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {balances.map(
                ({
                  customerId,
                  accounts,
                }: {
                  customerId: string;
                  accounts: { accountId: string; balance: number }[];
                }) => (
                  <>
                    <CustomerTableRow customerId={customerId} pending={false} />
                    {accounts.map(({ accountId, balance }) => (
                      <TableRow
                        key={accountId}
                        accountId={accountId}
                        balance={balance}
                        pending={false}
                      />
                    ))}
                    {bank.openCustomerAccount.pending
                      .filter(
                        ({ request }) => request.customerId === customerId
                      )
                      .map(({ request, idempotencyKey }) => (
                        <TableRow
                          key={idempotencyKey}
                          accountId="... pending ..."
                          balance={request.initialDeposit}
                          pending={true}
                        />
                      ))}
                  </>
                )
              )}
              {bank.signUp.pending.map(({ request }) => (
                <CustomerTableRow
                  customerId={request.customerId}
                  pending={true}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

const BankInterface = () => {
  const bank = useBank({ id: "reboot-bank" });
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header. */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4 flex items-center justify-center gap-3">
            <Wallet className="w-12 h-12 text-purple-400" />
            Rebank
          </h1>
          <p className="text-purple-200 text-lg">A Bank Rebooted</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          <CustomersAndAccounts bank={bank} />
          <Transfer bank={bank} />
        </div>
        <AccountsTable bank={bank} />
      </div>
    </div>
  );
};

export default BankInterface;
