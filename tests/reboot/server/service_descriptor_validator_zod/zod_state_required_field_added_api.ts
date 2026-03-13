import { writer } from "@reboot-dev/reboot-api";
import { z } from "zod/v4";

// Variant of `zod_state_original_api.ts` with a new required field added.
const EchoZod = {
  state: {
    myField: z.string().meta({ tag: 1 }),
    myNewField: z.string().meta({ tag: 2 }),
  },
  methods: {
    doSomething: writer({ request: {}, response: z.void() }),
  },
};

export const api = { EchoZod };
