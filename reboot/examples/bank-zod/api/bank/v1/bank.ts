import { z } from "zod/v4";

import { reader, transaction } from "@reboot-dev/reboot-api";

export const Bank = {
  state: {
    customerIdsMapId: z.string().meta({ tag: 1 }),
  },
  methods: {
    create: transaction({
      factory: {},
      request: {},
      response: z.void(),
    }),
    signUp: transaction({
      request: {
        customerId: z.string().meta({ tag: 1 }),
      },
      response: z.void(),
    }),
    allCustomerIds: reader({
      request: {},
      response: {
        customerIds: z.array(z.string()).meta({ tag: 1 }),
      },
    }),
    transfer: transaction({
      request: {
        fromAccountId: z.string().meta({ tag: 1 }),
        toAccountId: z.string().meta({ tag: 2 }),
        amount: z.number().meta({ tag: 3 }),
      },
      response: z.void(),
    }),
    openCustomerAccount: transaction({
      request: {
        initialDeposit: z.number().meta({ tag: 1 }),
        customerId: z.string().meta({ tag: 2 }),
      },
      response: z.void(),
    }),
    accountBalances: reader({
      request: {},
      response: {
        balances: z
          .array(
            z.object({
              customerId: z.string().meta({ tag: 1 }),
              accounts: z
                .array(
                  z.object({
                    accountId: z.string().meta({ tag: 1 }),
                    balance: z.number().meta({ tag: 2 }),
                  })
                )
                .meta({ tag: 2 }),
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
