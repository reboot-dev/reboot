import { writer } from "@reboot-dev/reboot-api";
import { z } from "zod/v4";

// Variant of `zod_request_original_api.ts` with `myRequestField` optional.
const EchoZod = {
  state: {},
  methods: {
    doSomething: writer({
      request: {
        myRequestField: z.string().optional().meta({ tag: 1 }),
      },
      response: z.void(),
    }),
  },
};

export const api = { EchoZod };
