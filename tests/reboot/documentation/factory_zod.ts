import { writer } from "@reboot-dev/reboot-api";
import { z } from "zod/v4";

export const Account = {
  state: {
    balance: z.number().default(0).meta({ tag: 1 }),
  },
  methods: {
    open: writer({
      // Must use this function to construct an instance of `Account`.
      factory: {},
      request: {},
      response: z.void(),
    }),
    // ...
  },
};

export const api = { Account };
