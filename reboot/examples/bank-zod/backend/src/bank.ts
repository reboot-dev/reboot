import { ReaderContext, TransactionContext, allow } from "@reboot-dev/reboot";
import { SortedMap } from "@reboot-dev/reboot-std/collections/v1/sorted_map.js";
import { v4 as uuidv4, v7 as uuidv7 } from "uuid";
import { Account } from "../../api/bank/v1/account_rbt.js";
import { Bank } from "../../api/bank/v1/bank_rbt.js";
import { Customer } from "../../api/bank/v1/customer_rbt.js";

export const BankServicer = Bank.servicer({
  authorizer: () => {
    return allow();
  },

  create: async (
    context: TransactionContext,
    state: Bank.State,
    request: Bank.CreateRequest
  ): Promise<[Bank.State]> => {
    state.customerIdsMapId = uuidv4();

    await SortedMap.ref(state.customerIdsMapId).insert(context, {
      entries: {},
    });

    return [state];
  },

  accountBalances: async (
    context: ReaderContext,
    state: Bank.State,
    request: Bank.AccountBalancesRequest
  ): Promise<Bank.AccountBalancesResponse> => {
    // Get the first "page" of account IDs (32 entries).
    const customerIdsMap = SortedMap.ref(state.customerIdsMapId);

    const customerIds = (
      await customerIdsMap.range(context, { limit: 32 })
    ).entries.map(({ value }) => new TextDecoder().decode(value));

    return {
      balances: await Promise.all(
        customerIds.map(async (customerId) => {
          const balance = await Customer.ref(customerId).balances(context);
          return { customerId, accounts: balance.balances };
        })
      ),
    };
  },

  signUp: async (
    context: TransactionContext,
    state: Bank.State,
    { customerId }: Bank.SignUpRequest
  ): Promise<[Bank.State]> => {
    await Customer.signUp(context, customerId);

    // Save the account ID to our _distributed_ map using a UUIDv7
    // to get a "timestamp" based ordering.
    await SortedMap.ref(state.customerIdsMapId).insert(context, {
      entries: {
        [uuidv7()]: new TextEncoder().encode(customerId),
      },
    });

    return [state];
  },

  allCustomerIds: async (
    context: ReaderContext,
    state: Bank.State,
    request: Bank.AllCustomerIdsRequest
  ): Promise<Bank.AllCustomerIdsResponse> => {
    const customerIdsMap = SortedMap.ref(state.customerIdsMapId);

    const customerIds = (
      await customerIdsMap.range(context, { limit: 32 })
    ).entries.map(({ value }) => new TextDecoder().decode(value));

    return { customerIds };
  },

  transfer: async (
    context: TransactionContext,
    state: Bank.State,
    { fromAccountId, toAccountId, amount }: Bank.TransferRequest
  ): Promise<[Bank.State]> => {
    await Account.ref(fromAccountId).withdraw(context, { amount });
    await Account.ref(toAccountId).deposit(context, { amount });

    return [state];
  },

  openCustomerAccount: async (
    context: TransactionContext,
    state: Bank.State,
    { initialDeposit, customerId }: Bank.OpenCustomerAccountRequest
  ): Promise<[Bank.State]> => {
    await Customer.ref(customerId).openAccount(context, { initialDeposit });
    return [state];
  },
});
