import { Application, WriterContext } from "@reboot-dev/reboot";

import {
  Hello,
  SendRequest,
  SendResponse,
} from "../../api/hello/v1/hello_rbt.js";

export class HelloServicer extends Hello.Servicer {
  authorizer() {
    if (process.env.THROW_IN_AUTHORIZER) {
      throw new Error("As requested!");
    }
    return null;
  }

  async send(
    context: WriterContext,
    request: SendRequest
  ): Promise<SendResponse> {
    return new SendResponse();
  }
}

const initialize = async (context) => {
  if (process.env.THROW_IN_INITIALIZE) {
    throw new Error("As requested!");
  }
};

new Application({
  servicers: [HelloServicer],
  initialize,
}).run();
