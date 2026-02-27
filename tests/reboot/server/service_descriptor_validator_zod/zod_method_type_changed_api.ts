import { reader } from "@reboot-dev/reboot-api";
import { z } from "zod/v4";

const EchoZod = {
  state: {
    myField: z.string().meta({ tag: 1 }),
  },
  methods: {
    doSomething: reader({ request: {}, response: z.void() }),
  },
};

export const api = { EchoZod };
