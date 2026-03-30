import { writer } from "@reboot-dev/reboot-api";
import { z } from "zod/v4";

// Variant of `zod_request_original_api.ts` with a new required field added.
const EchoZod = {
  state: {},
  methods: {
    doSomething: writer({
      request: {
        myRequestField: z.string().meta({ tag: 1 }),
        myNewRequestField: z.string().meta({ tag: 2 }),
      },
      response: z.void(),
    }),
  },
};

export const api = { EchoZod };
