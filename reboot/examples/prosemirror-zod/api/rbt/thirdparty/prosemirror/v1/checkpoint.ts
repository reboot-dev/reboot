import { reader, writer } from "@reboot-dev/reboot-api";
import { z } from "zod/v4";
import { Changes, Doc } from "./authority";

export const Checkpoint = {
  state: {
    doc: Doc.optional().meta({ tag: 1 }),
    version: z.number().default(0).meta({ tag: 2 }),
  },
  methods: {
    latest: reader({
      request: {},
      response: {
        doc: Doc.meta({ tag: 1 }),
        version: z.number().meta({ tag: 2 }),
      },
    }),
    update: writer({
      request: {
        changes: Changes.default(() => []).meta({ tag: 1 }),
        client: z.string().optional().meta({ tag: 2 }),
      },
      response: z.void(),
    }),
  },
};

export const api = {
  Checkpoint,
};
