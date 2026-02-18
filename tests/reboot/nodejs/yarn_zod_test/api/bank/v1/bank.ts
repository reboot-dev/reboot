import { reader, transaction, writer } from "@reboot-dev/reboot-api";
import { z } from "zod/v4";

export const Bank = {
  state: {
    accountIdsMapId: z.string().meta({ tag: 1 }),
  },
  methods: {
    mockWriter: writer({
      request: {},
      response: z.void(),
    }),
    create: transaction({
      factory: {},
      request: {},
      response: z.void(),
    }),
    signUp: transaction({
      request: {
        accountId: z.string().meta({ tag: 1 }),
        initialDeposit: z.number().meta({ tag: 2 }),
      },
      response: z.void(),
    }),
    transfer: transaction({
      request: {
        fromAccountId: z.string().meta({ tag: 1 }),
        toAccountId: z.string().meta({ tag: 2 }),
        amount: z.number().meta({ tag: 3 }),
      },
      response: z.void(),
    }),
    accountBalances: reader({
      request: {},
      response: {
        balances: z
          .array(
            z.object({
              accountId: z.string().meta({ tag: 1 }),
              balance: z.number().meta({ tag: 2 }),
            })
          )
          .default(() => [])
          .meta({ tag: 1 }),
      },
    }),
  },
};

export const api = {
  Bank,
};
