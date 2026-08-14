import { reader, transaction, writer } from "@reboot-dev/reboot-api";
import { z } from "zod/v4";

export const Counter = {
  state: {
    count: z.number().default(0).meta({ tag: 1 }),
  },
  methods: {
    // A transaction that writes its own state, via a nested writer on
    // the very state it is coordinated on.
    transactionallyIncrement: transaction({
      request: z.object({}),
      response: z.object({
        count: z.number().meta({ tag: 1 }),
      }),
    }),
    increment: writer({
      request: z.object({}),
      response: z.object({
        count: z.number().meta({ tag: 1 }),
      }),
    }),
    get: reader({
      request: z.object({}),
      response: z.object({
        count: z.number().meta({ tag: 1 }),
      }),
    }),
  },
};

export const api = { Counter };
