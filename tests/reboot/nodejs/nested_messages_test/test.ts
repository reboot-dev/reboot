import { Empty } from "@bufbuild/protobuf";
import { Reboot, allow } from "@reboot-dev/reboot";
import { strict as assert } from "node:assert";
import test from "node:test";
import { Hello } from "./hello_rbt.js";

import { Application, ReaderContext, WriterContext } from "@reboot-dev/reboot";
import {
  Base_MessagesResponse,
  OtherBase_Inner_SendRequest,
  OtherBase_Inner_SendResponse,
} from "./hello_pb.js";

export class HelloServicer extends Hello.singleton.Servicer {
  constructor() {
    super();
  }

  authorizer() {
    return allow();
  }

  async messages(
    context: ReaderContext,
    state: Hello.State,
    request: Empty
  ): Promise<Base_MessagesResponse> {
    return new Base_MessagesResponse({ messages: state.messages });
  }

  async send(
    context: WriterContext,
    state: Hello.State,
    request: OtherBase_Inner_SendRequest
  ): Promise<OtherBase_Inner_SendResponse> {
    const message = request.message;
    state.messages.push(message);

    return new OtherBase_Inner_SendResponse();
  }
}

test("Calling Hello.Send", async (t) => {
  const rbt = new Reboot();
  await rbt.start();

  await rbt.up(new Application({ servicers: [HelloServicer] }));

  const context = rbt.createExternalContext("test");

  const hello = Hello.ref("hello-nodejs");

  await hello.send(context, { message: "Hello, World!" });

  const response = await hello.messages(context, {});

  assert(response.equals({ messages: ["Hello, World!"] }));

  await rbt.stop();
});
