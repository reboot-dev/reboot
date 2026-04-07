// Copy of the original `EchoZod` API definition, but in a different
// folder.
import { writer } from "@reboot-dev/reboot-api";
import { z } from "zod/v4";

const EchoZod = {
  state: {
    myField: z.string().meta({ tag: 1 }),
  },
  methods: {
    doSomething: writer({ request: {}, response: z.void() }),
  },
};

export const api = { EchoZod };
