import { reader, writer } from "@reboot-dev/reboot-api";
import { z } from "zod/v4";

export const Account = {
  state: {
    balance: z.number().default(0).meta({ tag: 1 }),
  },
  methods: {
    balance: reader({
      request: {},
      response: {
        amount: z.number().meta({ tag: 1 }),
      },
    }),
    deposit: writer({
      request: {
        amount: z.number().meta({ tag: 1 }),
      },
      response: z.void(),
    }),
    withdraw: writer({
      request: {
        amount: z.number().meta({ tag: 1 }),
      },
      response: z.void(),
      errors: [
        z
          .object({
            type: z.literal("OverdraftError"),
            amount: z.number().meta({ tag: 1 }),
          })
          .meta({ tag: 1 }),
      ] as const,
    }),
    open: writer({
      factory: {},
      request: {},
      response: z.void(),
    }),
    interest: writer({
      request: {},
      response: z.void(),
    }),
  },
};

export const api = {
  Account,
};
