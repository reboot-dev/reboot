import { writer } from "@reboot-dev/reboot-api";
import { z } from "zod/v4";

// Variant of `zod_state_original_api.ts` with `myField` being optional.
const EchoZod = {
  state: {
    myField: z.string().optional().meta({ tag: 1 }),
  },
  methods: {
    doSomething: writer({ request: {}, response: z.void() }),
  },
};

export const api = { EchoZod };
