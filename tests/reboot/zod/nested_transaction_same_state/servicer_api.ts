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
    writtenByWriterInNested: z.string().default("").meta({ tag: 4 }),
  },
  methods: {
    outerTransaction: transaction({
      mode: exclusive(),
      request: z.object({
        callNestedTransaction: z.boolean().meta({ tag: 1 }),
        callWriter: z.boolean().meta({ tag: 2 }),
        nestedCallsWriterAndReader: z.boolean().meta({ tag: 3 }),
        nestedAborts: z.boolean().meta({ tag: 4 }),
      }),
      response: z.object({
        outersWriteSeenByNested: z.string().meta({ tag: 1 }),
        nestedsWriteSeenByOuter: z.string().meta({ tag: 2 }),
        writersWriteSeenByOuter: z.string().meta({ tag: 3 }),
        outersWriteSeenByOuter: z.string().meta({ tag: 4 }),
        nestedsWriteSeenByWriterInNested: z.string().meta({ tag: 5 }),
        writerInNestedsWriteSeenByNested: z.string().meta({ tag: 6 }),
        nestedsWriteSeenByReaderInNested: z.string().meta({ tag: 7 }),
        writerInNestedsWriteSeenByReaderInNested: z.string().meta({ tag: 8 }),
        writerInNestedsWriteSeenByOuter: z.string().meta({ tag: 9 }),
      }),
    }),
    nestedTransaction: transaction({
      mode: exclusive(),
      request: z.object({
        callWriterAndReader: z.boolean().meta({ tag: 1 }),
        abort: z.boolean().meta({ tag: 2 }),
      }),
      response: z.object({
        outersWriteSeenByNested: z.string().meta({ tag: 1 }),
        nestedsWriteSeenByWriterInNested: z.string().meta({ tag: 2 }),
        writerInNestedsWriteSeenByNested: z.string().meta({ tag: 3 }),
        nestedsWriteSeenByReaderInNested: z.string().meta({ tag: 4 }),
        writerInNestedsWriteSeenByReaderInNested: z.string().meta({ tag: 5 }),
      }),
      errors: [
        z
          .object({
            type: z.literal("RequestedAbortError"),
          })
          .meta({ tag: 1 }),
      ] as const,
    }),
    writer: writer({
      request: z.object({}),
      response: z.void(),
    }),
    writerInNested: writer({
      request: z.object({}),
      response: z.object({
        nestedsWriteSeenByWriterInNested: z.string().meta({ tag: 1 }),
      }),
    }),
    get: reader({
      request: z.object({}),
      response: z.object({
        writtenByOuter: z.string().meta({ tag: 1 }),
        writtenByNested: z.string().meta({ tag: 2 }),
        writtenByWriter: z.string().meta({ tag: 3 }),
        writtenByWriterInNested: z.string().meta({ tag: 4 }),
      }),
    }),
  },
};

export const api = { Nested };
