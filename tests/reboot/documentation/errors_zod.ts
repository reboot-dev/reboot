import { writer } from "@reboot-dev/reboot-api";
import { z } from "zod/v4";

export const Account = {
  state: {
    balance: z.number().default(0).meta({ tag: 1 }),
  },
  methods: {
    withdraw: writer({
      request: {
        amount: z.number().meta({ tag: 1 }),
      },
      response: z.void(),
      errors: [
        // Error returned when a withdrawal would overdraft the
        // account; the `type` literal names the error.
        z
          .object({
            type: z.literal("OverdraftError"),
            amount: z.number().meta({ tag: 1 }),
          })
          .meta({ tag: 1 }),
      ] as const,
    }),
    // ...
  },
};

export const api = { Account };
