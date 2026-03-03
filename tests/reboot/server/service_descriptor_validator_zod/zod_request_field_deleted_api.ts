/**
 * Variant of `zod_request_original_api.ts` with `myRequestField` removed.
 */
import { writer } from "@reboot-dev/reboot-api";
import { z } from "zod/v4";

const EchoZod = {
  state: {},
  methods: {
    doSomething: writer({ request: {}, response: z.void() }),
  },
};

export const api = { EchoZod };
