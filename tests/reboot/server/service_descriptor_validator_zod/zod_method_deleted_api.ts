import { z } from "zod/v4";

const EchoZod = {
  state: {
    myField: z.string().meta({ tag: 1 }),
  },
  methods: {},
};

export const api = { EchoZod };
