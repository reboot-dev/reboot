// THIS FILE IS GENERATED AND WILL BE OVERWRITTEN ON THE NEXT
// 'rbt generate' INVOCATION. DO NOT MODIFY THIS FILE DIRECTLY.
// However, feel free to copy-paste sections of this file into
// your own source files; that's what this file is here for!

import { PartialMessage } from "@bufbuild/protobuf";
import {
  ReaderContext,
  WriterContext,
  TransactionContext,
  WorkflowContext,
} from "@reboot-dev/reboot";
import {
  General,
  GeneralError,
  GeneralRequest,
  GeneralResponse,
// TODO: Adjust the import path to match the actual path of the generated file.
} from "general_rbt.js";


class GeneralServicer extends General.singleton.Servicer {
  // An example of how to implement a Typescript servicer for the
  // General service, using Reboot.
  // You can copy-paste this servicer, or parts of it, to be the basis
  // for the implementation of your own servicer.


  async constructorTransaction(
    context: TransactionContext,
    state: General.State,
    request: general_pb.GeneralRequest
  ): Promise<general_pb.GeneralResponse | PartialMessage<general_pb.GeneralResponse>> {
    // TODO: implement your own business logic here!
    //
    // Update `state` as neccessary.
    //
    // state.field = ...
    //
    // return {
    //    message: "This is a partial response",
    // }
    //
    // Read more about the transaction methods in the Reboot documentation:
    // https://docs.reboot.dev/learn_more/implement/transactions
    throw new Error("Not implemented");
  }

  async constructorWriter(
    context: WriterContext,
    state: General.State,
    request: general_pb.GeneralRequest
  ): Promise<general_pb.GeneralResponse | PartialMessage<general_pb.GeneralResponse>> {
    // TODO: implement your own business logic here!
    //
    // Update `state` as neccessary.
    //
    // state.field = ...
    //
    // return {
    //    message: "This is a partial response",
    // }
    //
    // Read more about the writer methods in the Reboot documentation:
    // https://docs.reboot.dev/learn_more/implement/writers

    throw new Error("Not implemented");
  }

  async reader(
    context: ReaderContext,
    state: General.State,
    request: general_pb.GeneralRequest
  ): Promise<general_pb.GeneralResponse | PartialMessage<general_pb.GeneralResponse>> {
    // TODO: implement your own business logic here!
    //
    // TODO: fill in the response here.
    // return {
    //    message: "This is a partial response",
    // }
    //
    // Read more about the reader methods in the Reboot documentation:
    // https://docs.reboot.dev/learn_more/implement/readers
    throw new Error("Not implemented");
  }

  async writer(
    context: WriterContext,
    state: General.State,
    request: general_pb.GeneralRequest
  ): Promise<general_pb.GeneralResponse | PartialMessage<general_pb.GeneralResponse>> {
    // TODO: implement your own business logic here!
    //
    // Update `state` as neccessary.
    //
    // state.field = ...
    //
    // return {
    //    message: "This is a partial response",
    // }
    //
    // Read more about the writer methods in the Reboot documentation:
    // https://docs.reboot.dev/learn_more/implement/writers

    throw new Error("Not implemented");
  }

  async transaction(
    context: TransactionContext,
    state: General.State,
    request: general_pb.GeneralRequest
  ): Promise<general_pb.GeneralResponse | PartialMessage<general_pb.GeneralResponse>> {
    // TODO: implement your own business logic here!
    //
    // Update `state` as neccessary.
    //
    // state.field = ...
    //
    // return {
    //    message: "This is a partial response",
    // }
    //
    // Read more about the transaction methods in the Reboot documentation:
    // https://docs.reboot.dev/learn_more/implement/transactions
    throw new Error("Not implemented");
  }

  static async workflow(
    context: WorkflowContext,
    request: general_pb.GeneralRequest
  ): Promise<general_pb.GeneralResponse | PartialMessage<general_pb.GeneralResponse>> {
    // TODO: implement your own business logic here!
    //
    // Here is how to create a control loop:
    // for await (const iteration of context.loop("Some control loop")) {
    //   ...
    // }
    //
    // TODO: fill in the response here.
    // return {
    //    message: "This is a partial response",
    // }
    //
    // Read more about the workflow methods in the Reboot documentation:
    // https://docs.reboot.dev/learn_more/implement/workflows
    throw new Error("Not implemented");
  }

  static async secondWorkflow(
    context: WorkflowContext,
    request: general_pb.GeneralRequest
  ): Promise<general_pb.GeneralResponse | PartialMessage<general_pb.GeneralResponse>> {
    // TODO: implement your own business logic here!
    //
    // Here is how to create a control loop:
    // for await (const iteration of context.loop("Some control loop")) {
    //   ...
    // }
    //
    // TODO: fill in the response here.
    // return {
    //    message: "This is a partial response",
    // }
    //
    // Read more about the workflow methods in the Reboot documentation:
    // https://docs.reboot.dev/learn_more/implement/workflows
    throw new Error("Not implemented");
  }

  async serverStreamingReader(
    context: ReaderContext,
    state: General.State,
    request: general_pb.GeneralRequest
  ): Promise<general_pb.GeneralResponse | PartialMessage<general_pb.GeneralResponse>> {
    // TODO: implement your own business logic here!
    //
    // TODO: fill in the response here.
    // return {
    //    message: "This is a partial response",
    // }
    //
    // Read more about the reader methods in the Reboot documentation:
    // https://docs.reboot.dev/learn_more/implement/readers
    throw new Error("Not implemented");
  }

  async clientStreamingReader(
    context: ReaderContext,
    state: General.State,
    request: general_pb.GeneralRequest
  ): Promise<general_pb.GeneralResponse | PartialMessage<general_pb.GeneralResponse>> {
    // TODO: implement your own business logic here!
    //
    // TODO: fill in the response here.
    // return {
    //    message: "This is a partial response",
    // }
    //
    // Read more about the reader methods in the Reboot documentation:
    // https://docs.reboot.dev/learn_more/implement/readers
    throw new Error("Not implemented");
  }

  async bidirectionalStreamingReader(
    context: ReaderContext,
    state: General.State,
    request: general_pb.GeneralRequest
  ): Promise<general_pb.GeneralResponse | PartialMessage<general_pb.GeneralResponse>> {
    // TODO: implement your own business logic here!
    //
    // TODO: fill in the response here.
    // return {
    //    message: "This is a partial response",
    // }
    //
    // Read more about the reader methods in the Reboot documentation:
    // https://docs.reboot.dev/learn_more/implement/readers
    throw new Error("Not implemented");
  }
}
