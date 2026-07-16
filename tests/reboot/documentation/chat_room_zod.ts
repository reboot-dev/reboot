import { reader, writer } from "@reboot-dev/reboot-api";
import { z } from "zod/v4";

export const ChatRoom = {
  state: {
    messages: z.array(z.string()).default([]).meta({ tag: 1 }),
  },
  methods: {
    // Returns the current list of recorded messages.
    messages: reader({
      request: {},
      response: {
        messages: z.array(z.string()).meta({ tag: 1 }),
      },
    }),
    // Adds a new message to the list of recorded messages.
    send: writer({
      request: {
        message: z.string().meta({ tag: 1 }), // E.g. "Hello, World".
      },
      response: z.void(),
    }),
  },
};

export const api = {
  ChatRoom,
};
