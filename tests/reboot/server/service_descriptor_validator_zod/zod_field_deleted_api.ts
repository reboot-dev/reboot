/**
 * Variant of `zod_original_api.ts` with `myField` removed.
 *
 * When compared against `zod_original_api.ts` as the updated version,
 * the `myField` field appears deleted from `EchoZod`.
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
