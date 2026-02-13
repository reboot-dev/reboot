import {
  allow,
  ReaderContext,
  TransactionContext,
  WriterContext,
} from "@reboot-dev/reboot";
import { v4 as uuidv4 } from "uuid";
import { Account } from "../../api/bank/v1/account_rbt.js";
import { Customer } from "../../api/bank/v1/customer_rbt.js";

export const CustomerServicer = Customer.servicer({
  authorizer: () => {
    return allow();
  },

  signUp: async (
    context: WriterContext,
    state: Customer.State,
    request: Customer.SignUpRequest
  ): Promise<[Customer.State, Customer.PartialSignUpResponse]> => {
    return [state, {}];
  },

  openAccount: async (
    context: TransactionContext,
    state: Customer.State,
    { initialDeposit }: Customer.OpenAccountRequest
  ): Promise<[Customer.State, Customer.PartialOpenAccountResponse]> => {
    const accountId = uuidv4();
    state.accountIds.push(accountId);

    const [account] = await Account.open(context, accountId, {});

    await account.deposit(context, { amount: initialDeposit });

    return [state, { accountId }];
  },

  balances: async (
    context: ReaderContext,
    state: Customer.State,
    request: Customer.BalancesRequest
  ): Promise<Customer.PartialBalancesResponse> => {
    let balances = [];
    for (const accountId of state.accountIds) {
      const balance = await Account.ref(accountId).balance(context);
      balances.push({ accountId, balance: balance.amount });
    }
    return { balances };
  },
});
