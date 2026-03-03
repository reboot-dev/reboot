import {
  ReaderContext,
  TransactionContext,
  WriterContext,
  allow,
} from "@reboot-dev/reboot";
import { SortedMap } from "@reboot-dev/reboot-std/collections/v1/sorted_map.js";
import { v4 as uuidv4, v7 as uuidv7 } from "uuid";
import { Account } from "../../api/bank/v1/account_rbt.js";
import { Bank } from "../../api/bank/v1/bank_rbt.js";

export const BankServicer = Bank.servicer({
  authorizer: () => {
    return allow();
  },
  mockWriter: async (
    context: WriterContext,
    state: Bank.State,
    request: Bank.MockWriterRequest
  ): Promise<[Bank.State]> => {
    // This is just a no-op writer method to test that writer methods work.
    return [state];
  },
  create: async (
    context: TransactionContext,
    state: Bank.State,
    request: Bank.CreateRequest
  ): Promise<[Bank.State]> => {
    state.accountIdsMapId = uuidv4();

    await SortedMap.ref(state.accountIdsMapId).insert(context, { entries: {} });

    // Test that we can call a writer method from inside a transaction,
    // which is a constructor call.
    await Bank.ref().mockWriter(context);

    return [state];
  },

  accountBalances: async (
    context: ReaderContext,
    state: Bank.State,
    request: Bank.AccountBalancesRequest
  ): Promise<Bank.AccountBalancesResponse> => {
    // Get the first "page" of account IDs (32 entries).
    const accountIdsMap = SortedMap.ref(state.accountIdsMapId);

    const accountIds = (
      await accountIdsMap.range(context, { limit: 32 })
    ).entries.map(({ value }) => new TextDecoder().decode(value));

    return {
      balances: await Promise.all(
        accountIds.map(async (accountId) => {
          const { amount } = await Account.ref(accountId).balance(context);
          return { accountId, balance: amount };
        })
      ),
    };
  },

  signUp: async (
    context: TransactionContext,
    state: Bank.State,
    { accountId, initialDeposit }: Bank.SignUpRequest
  ): Promise<[Bank.State]> => {
    const [account] = await Account.open(context, accountId, {});

    await account.deposit(context, { amount: initialDeposit });

    // Save the account ID to our _distributed_ map using a UUIDv7
    // to get a "timestamp" based ordering.
    await SortedMap.ref(state.accountIdsMapId).insert(context, {
      entries: {
        [uuidv7()]: new TextEncoder().encode(accountId),
      },
    });

    // Test that we can call a writer method from inside a transaction.
    await Bank.ref().mockWriter(context);

    return [state];
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
});
