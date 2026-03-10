import { writer } from "@reboot-dev/reboot-api";
import { z } from "zod/v4";

const EchoZodV2 = {
  state: {
    myField: z.string().meta({ tag: 1 }),
  },
  methods: {
    doSomething: writer({ request: {}, response: z.void() }),
  },
};

export const api = { EchoZodV2 };
