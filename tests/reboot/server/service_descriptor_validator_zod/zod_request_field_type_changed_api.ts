/**
 * Variant of `zod_request_original_api.ts` with `myRequestField` type changed
 * from string to boolean.
 */
import { writer } from "@reboot-dev/reboot-api";
import { z } from "zod/v4";

const EchoZod = {
  state: {},
  methods: {
    doSomething: writer({
      request: { myRequestField: z.boolean().meta({ tag: 1 }) },
      response: z.void(),
    }),
  },
};

export const api = { EchoZod };
