import {
  Application,
  Auth,
  ReaderContext,
  TokenVerifier,
  WriterContext,
  allowIf,
  hasVerifiedToken,
} from "@reboot-dev/reboot";
import { Hello } from "../../api/hello/v1/hello_rbt.js";

import {
  MessagesRequest,
  MessagesResponse,
  SendRequest,
  SendResponse,
} from "../../api/hello/v1/hello_rbt.js";

const TOKEN_FOR_TEST = "a_secret";

export class HelloServicer extends Hello.singleton.Servicer {
  authorizer() {
    return new Hello.Authorizer({
      send: allowIf({ all: [hasVerifiedToken] }),
    });
  }

  async messages(
    context: ReaderContext,
    state: Hello.State,
    request: MessagesRequest
  ): Promise<MessagesResponse> {
    return new MessagesResponse({ messages: state.messages });
  }

  async send(
    context: WriterContext,
    state: Hello.State,
    request: SendRequest
  ): Promise<SendResponse> {
    state.messages.push(request.message);

    return new SendResponse();
  }
}

class HelloTokenVerifier extends TokenVerifier {
  async verifyToken(
    context: ReaderContext,
    token?: string
  ): Promise<Auth | null> {
    if (token === TOKEN_FOR_TEST) {
      return new Auth();
    }
    return null;
  }
}

const initialize = async (context) => {
  const hello = Hello.ref("hello-nodejs");
  const response = await hello.send(context, { message: "Hello, World!" });
};

new Application({
  servicers: [HelloServicer],
  initialize,
  initializeBearerToken: process.env.TEST_BEARER_TOKEN,
  tokenVerifier: new HelloTokenVerifier(),
}).run();
