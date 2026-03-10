import {
  EMPTY_ARRAY,
  EMPTY_RECORD,
  reader,
  transaction,
  writer,
} from "@reboot-dev/reboot-api";
import { z } from "zod/v4";

export const LiteralValueType = z.literal(["option1", "option2", "option3"]);

export const Test = {
  state: {
    data: z.string().meta({ tag: 1 }),
    literalValue: LiteralValueType.meta({ tag: 2 }),

    // Empty default values.
    stringDefaultValue: z.string().default("").meta({ tag: 3 }),
    booleanDefaultValue: z.boolean().default(false).meta({ tag: 4 }),
    numberDefaultValue: z.number().default(0).meta({ tag: 5 }),
    arrayDefaultValue: z
      .array(z.string())
      .default(EMPTY_ARRAY)
      .meta({ tag: 6 }),
    recordDefaultValue: z
      .record(z.string(), z.string())
      .default(EMPTY_RECORD)
      .meta({ tag: 7 }),
  },
  methods: {
    construct: writer({
      factory: {},
      request: {},
      response: z.void(),
    }),
    writer: writer({
      request: {
        data: z.string().meta({ tag: 1 }),
        previousLiteralValue: LiteralValueType.meta({ tag: 2 }),
        newLiteralValue: LiteralValueType.optional().meta({ tag: 3 }),
      },
      response: z.void(),
    }),
    checkDefaults: reader({ request: {}, response: z.void() }),
    reader: reader({
      request: {},
      response: {
        data: z.string().meta({ tag: 1 }),
        literalValue: LiteralValueType.meta({ tag: 2 }),
      },
    }),
    transaction: transaction({
      request: {},
      response: z.void(),
    }),
    transactionReader: reader({
      request: {},
      response: z.void(),
    }),
    transactionWriter: writer({
      request: {
        shouldFail: z.boolean().meta({ tag: 1 }),
      },
      response: z.void(),
    }),
  },
};

export const api = { Test };
