import { reader, transaction, writer } from "@reboot-dev/reboot-api";
import { z } from "zod/v4";

export const MainTest = {
  state: {
    data: z.string().default("").meta({ tag: 1 }),
  },
  methods: {
    transaction: transaction({
      request: z.object({
        mainTestData: z.string().meta({ tag: 1 }),
        secondaryTestData: z.array(z.string()).meta({ tag: 2 }),
      }),
      response: z.void(),
    }),
    getData: reader({
      request: z.object({}),
      response: z.object({
        mainTestData: z.string().meta({ tag: 1 }),
        secondaryTestData: z.array(z.string()).meta({ tag: 2 }),
      }),
    }),
  },
};

export const SecondaryTest = {
  state: {
    data: z
      .array(z.string())
      .default(() => [])
      .meta({ tag: 1 }),
  },
  methods: {
    writer: writer({
      request: z.object({
        data: z.array(z.string()).meta({ tag: 1 }),
      }),
      response: z.void(),
    }),
    getData: reader({
      request: z.object({}),
      response: z.object({
        data: z.array(z.string()).meta({ tag: 1 }),
      }),
    }),
  },
};

export const api = { MainTest, SecondaryTest };
