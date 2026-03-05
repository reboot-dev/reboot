import { writer } from "@reboot-dev/reboot-api";
import { z } from "zod/v4";

const EchoZod = {
  state: {},
  methods: {
    doSomething: writer({
      request: { myRequestField: z.string().meta({ tag: 1 }) },
      response: z.void(),
    }),
  },
};

export const api = { EchoZod };
