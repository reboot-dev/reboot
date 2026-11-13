import { exclusive, reader, transaction, writer } from "@reboot-dev/reboot-api";
import { z } from "zod/v4";

export const Nested = {
  state: {
    // One field per call that writes, so that a lost write shows up
    // as the field belonging to the call whose write went missing,
    // rather than as a number whose meaning the reader has to
    // reconstruct.
    writtenByOuter: z.string().default("").meta({ tag: 1 }),
    writtenByNested: z.string().default("").meta({ tag: 2 }),
    writtenByWriter: z.string().default("").meta({ tag: 3 }),
  },
  methods: {
    outerTransaction: transaction({
      mode: exclusive(),
      request: z.object({
        callNestedTransaction: z.boolean().meta({ tag: 1 }),
        callWriter: z.boolean().meta({ tag: 2 }),
      }),
      response: z.object({
        outersWriteSeenByNested: z.string().meta({ tag: 1 }),
        nestedsWriteSeenByOuter: z.string().meta({ tag: 2 }),
        writersWriteSeenByOuter: z.string().meta({ tag: 3 }),
        outersWriteSeenByOuter: z.string().meta({ tag: 4 }),
      }),
    }),
    nestedTransaction: transaction({
      mode: exclusive(),
      request: z.object({}),
      response: z.object({
        outersWriteSeenByNested: z.string().meta({ tag: 1 }),
      }),
    }),
    writer: writer({
      request: z.object({}),
      response: z.void(),
    }),
    get: reader({
      request: z.object({}),
      response: z.object({
        writtenByOuter: z.string().meta({ tag: 1 }),
        writtenByNested: z.string().meta({ tag: 2 }),
        writtenByWriter: z.string().meta({ tag: 3 }),
      }),
    }),
  },
};

export const api = { Nested };
