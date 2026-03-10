import { reader, transaction, workflow, writer } from "@reboot-dev/reboot-api";
import { z } from "zod/v4";

// A `Change` is a prosemirror `step` from a specific `client`.
export const Change = z.object({
  // See prosemirror `Step` type which can be converted to/from JSON
  // via `step.toJSON()` and `step.fromJSON()` for storing and passing
  // around.
  step: z.json().meta({ tag: 1 }),

  // The client that authored this change.
  client: z.string().meta({ tag: 2 }),
});

export const Changes = z.array(Change);

// See prosemirror `Node` type which is used to represent a "doc",
// which can be converted to/from JSON via `node.toJSON()` and
// `node.fromJSON()` for storing and passing around.
export const Doc = z.json();

export const Authority = {
  state: {
    changes: Changes.default(() => []).meta({ tag: 1 }),
    version: z.number().default(0).meta({ tag: 2 }),
  },
  methods: {
    create: transaction({
      request: {},
      response: {
        doc: Doc.meta({ tag: 1 }),
        version: z.number().meta({ tag: 2 }),
      },
    }),
    apply: writer({
      request: {
        version: z.number().meta({ tag: 1 }),
        changes: Changes.meta({ tag: 2 }),
      },
      response: z.void(),
    }),
    changes: reader({
      request: {
        sinceVersion: z.number().meta({ tag: 1 }),
      },
      response: {
        version: z.number().meta({ tag: 1 }),
        changes: Changes.meta({ tag: 2 }),
      },
    }),
    // Internal `workflow`, not intended to get externally.
    checkpoint: workflow({
      request: {},
      response: {},
    }),
  },
};

export const api = {
  Authority,
};
