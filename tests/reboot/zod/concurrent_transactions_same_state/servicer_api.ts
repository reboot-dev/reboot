import {
  exclusive,
  reader,
  transaction,
  writer,
  shared,
} from "@reboot-dev/reboot-api";
import { z } from "zod/v4";

export const Counter = {
  state: {
    count: z.number().default(0).meta({ tag: 1 }),
  },
  methods: {
    // Must use this method to create an instance of `Counter`.
    create: writer({
      factory: {},
      request: z.object({}),
      response: z.void(),
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
    // The rest are pairs of a root transaction and the nested
    // transaction it calls on `peerId`. A nested call carries no
    // idempotency key, and the nested transaction is declared shared,
    // so it takes its state's lock in shared mode, which is what lets
    // several of them run on one state at the same time.
    callInner: transaction({
      mode: exclusive(),
      request: z.object({
        peerId: z.string().meta({ tag: 1 }),
      }),
      response: z.void(),
    }),
    // Takes the name of the driver that called it, because it runs
    // on the peer's state rather than the driver's and so cannot work
    // that out from its own context.
    inner: transaction({
      mode: shared(),
      request: z.object({
        driverId: z.string().meta({ tag: 1 }),
      }),
      response: z.object({
        count: z.number().meta({ tag: 1 }),
      }),
    }),
    callParkedIncrement: transaction({
      mode: exclusive(),
      request: z.object({
        peerId: z.string().meta({ tag: 1 }),
      }),
      response: z.void(),
    }),
    // Waits to be released, then increments through a writer.
    parkedIncrement: transaction({
      mode: shared(),
      request: z.object({}),
      response: z.object({
        count: z.number().meta({ tag: 1 }),
      }),
    }),
    callTouch: transaction({
      mode: exclusive(),
      request: z.object({
        peerId: z.string().meta({ tag: 1 }),
      }),
      response: z.void(),
    }),
    // Becomes a participant on the state and completes without
    // writing anything.
    touch: transaction({
      mode: shared(),
      request: z.object({}),
      response: z.void(),
    }),
  },
};

export const api = { Counter };
