/* eslint-disable */
// @ts-nocheck
"use client";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var _GreeterCreateAborted_error, _GreeterCreateAborted_message, _GreeterGreetAborted_error, _GreeterGreetAborted_message, _GreeterSetAdjectiveAborted_error, _GreeterSetAdjectiveAborted_message, _GreeterTransactionSetAdjectiveAborted_error, _GreeterTransactionSetAdjectiveAborted_message, _GreeterTryToConstructContextAborted_error, _GreeterTryToConstructContextAborted_message, _GreeterTryToConstructExternalContextAborted_error, _GreeterTryToConstructExternalContextAborted_message, _GreeterTestLongRunningFetchAborted_error, _GreeterTestLongRunningFetchAborted_message, _GreeterTestLongRunningWriterAborted_error, _GreeterTestLongRunningWriterAborted_message, _GreeterGetWholeStateAborted_error, _GreeterGetWholeStateAborted_message, _GreeterFailWithExceptionAborted_error, _GreeterFailWithExceptionAborted_message, _GreeterFailWithAbortedAborted_error, _GreeterFailWithAbortedAborted_message, _GreeterWorkflowAborted_error, _GreeterWorkflowAborted_message, _GreeterDangerousFieldsAborted_error, _GreeterDangerousFieldsAborted_message, _GreeterStoreRecursiveMessageAborted_error, _GreeterStoreRecursiveMessageAborted_message, _GreeterReadRecursiveMessageAborted_error, _GreeterReadRecursiveMessageAborted_message, _GreeterConstructAndStoreRecursiveMessageAborted_error, _GreeterConstructAndStoreRecursiveMessageAborted_message;
import * as protobuf_es from "@bufbuild/protobuf";
import { Empty } from "@bufbuild/protobuf";
import * as reboot_react from "@reboot-dev/reboot-react";
import * as reboot_web from "@reboot-dev/reboot-web";
import * as reboot_api from "@reboot-dev/reboot-api";
import React, { useEffect, useMemo, useState, } from "react";
import { v4 as uuidv4 } from "uuid";
// NOTE NOTE NOTE
//
// If you are reading this comment because you are trying to debug
// the error:
//
// Module not found: Error: Can't resolve './greeter_pb.js'
//
// You can resolve this by passing --react-extensions to `rbt
// generate` (or better put it in your `.rbtrc` file).
//
// This is a known issue if you're using `webpack` which uses
// `ts-loader` (https://github.com/TypeStrong/ts-loader/issues/465).
import { Greeter as GreeterProto, } from "./greeter_pb.js";
import * as greeter_pb from "./greeter_pb.js";
// Additionally re-export all messages_and_enums from the pb module.
export { CreateRequest, CreateResponse, GreetRequest, GreetResponse, SetAdjectiveRequest, SetAdjectiveResponse, TestLongRunningFetchRequest, GetWholeStateRequest, WorkflowResponse, ErrorWithValue, RecursiveMessage, StoreRecursiveMessageRequest, StoreRecursiveMessageResponse, ReadRecursiveMessageRequest, ReadRecursiveMessageResponse, ConstructAndStoreRecursiveMessageRequest, ConstructAndStoreRecursiveMessageResponse, DangerousFieldsRequest, Time, StopwatchRequest, StopwatchResponse, MatchColorRequest, MatchColorResponse, Color, } from "./greeter_pb.js";
// It is important that the following is a function, so we can lazily
// initialize the cache, so users who do not use offline cache do not
// see any logs about its initialization.
export const offlineCacheStorageType = () => reboot_web.offlineCache().offlineCacheStorageType;
reboot_api.check_bufbuild_protobuf_library(protobuf_es.Message);
const ERROR_TYPES = [
    // gRPC errors.
    reboot_api.errors_pb.Cancelled,
    reboot_api.errors_pb.Unknown,
    reboot_api.errors_pb.InvalidArgument,
    reboot_api.errors_pb.DeadlineExceeded,
    reboot_api.errors_pb.NotFound,
    reboot_api.errors_pb.AlreadyExists,
    reboot_api.errors_pb.PermissionDenied,
    reboot_api.errors_pb.ResourceExhausted,
    reboot_api.errors_pb.FailedPrecondition,
    reboot_api.errors_pb.Aborted,
    reboot_api.errors_pb.OutOfRange,
    reboot_api.errors_pb.Unimplemented,
    reboot_api.errors_pb.Internal,
    reboot_api.errors_pb.Unavailable,
    reboot_api.errors_pb.DataLoss,
    reboot_api.errors_pb.Unauthenticated,
    // Reboot errors.
    //
    // NOTE: also add any new errors into `rbt/v1alpha1/index.ts`.
    reboot_api.errors_pb.StateAlreadyConstructed,
    reboot_api.errors_pb.StateNotConstructed,
    reboot_api.errors_pb.TransactionParticipantFailedToPrepare,
    reboot_api.errors_pb.TransactionParticipantFailedToCommit,
    reboot_api.errors_pb.UnknownService,
    reboot_api.errors_pb.UnknownTask,
]; // Need `as const` to ensure TypeScript infers this as a tuple!
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterCreateRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof greeter_pb.CreateRequest
        ? partialRequest
        : greeter_pb.CreateRequest.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterCreateRequestFromJsonString = (jsonRequest) => {
    return GreeterCreateRequestFromProtobufShape(greeter_pb.CreateRequest.fromJsonString(jsonRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterCreateRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof greeter_pb.CreateRequest
        ? partialRequest
        : new greeter_pb.CreateRequest(partialRequest);
};
const GreeterCreateResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof greeter_pb.CreateResponse
        ? partialResponse
        : greeter_pb.CreateResponse.fromJson(partialResponse);
    return response;
};
const GreeterCreateResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof greeter_pb.CreateResponse
        ? partialResponse
        : new greeter_pb.CreateResponse(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterGreetRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof greeter_pb.GreetRequest
        ? partialRequest
        : greeter_pb.GreetRequest.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterGreetRequestFromJsonString = (jsonRequest) => {
    return GreeterGreetRequestFromProtobufShape(greeter_pb.GreetRequest.fromJsonString(jsonRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterGreetRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof greeter_pb.GreetRequest
        ? partialRequest
        : new greeter_pb.GreetRequest(partialRequest);
};
const GreeterGreetResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof greeter_pb.GreetResponse
        ? partialResponse
        : greeter_pb.GreetResponse.fromJson(partialResponse);
    return response;
};
const GreeterGreetResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof greeter_pb.GreetResponse
        ? partialResponse
        : new greeter_pb.GreetResponse(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterSetAdjectiveRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof greeter_pb.SetAdjectiveRequest
        ? partialRequest
        : greeter_pb.SetAdjectiveRequest.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterSetAdjectiveRequestFromJsonString = (jsonRequest) => {
    return GreeterSetAdjectiveRequestFromProtobufShape(greeter_pb.SetAdjectiveRequest.fromJsonString(jsonRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterSetAdjectiveRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof greeter_pb.SetAdjectiveRequest
        ? partialRequest
        : new greeter_pb.SetAdjectiveRequest(partialRequest);
};
const GreeterSetAdjectiveResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof greeter_pb.SetAdjectiveResponse
        ? partialResponse
        : greeter_pb.SetAdjectiveResponse.fromJson(partialResponse);
    return response;
};
const GreeterSetAdjectiveResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof greeter_pb.SetAdjectiveResponse
        ? partialResponse
        : new greeter_pb.SetAdjectiveResponse(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterTransactionSetAdjectiveRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof greeter_pb.SetAdjectiveRequest
        ? partialRequest
        : greeter_pb.SetAdjectiveRequest.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterTransactionSetAdjectiveRequestFromJsonString = (jsonRequest) => {
    return GreeterTransactionSetAdjectiveRequestFromProtobufShape(greeter_pb.SetAdjectiveRequest.fromJsonString(jsonRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterTransactionSetAdjectiveRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof greeter_pb.SetAdjectiveRequest
        ? partialRequest
        : new greeter_pb.SetAdjectiveRequest(partialRequest);
};
const GreeterTransactionSetAdjectiveResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof greeter_pb.SetAdjectiveResponse
        ? partialResponse
        : greeter_pb.SetAdjectiveResponse.fromJson(partialResponse);
    return response;
};
const GreeterTransactionSetAdjectiveResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof greeter_pb.SetAdjectiveResponse
        ? partialResponse
        : new greeter_pb.SetAdjectiveResponse(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterTryToConstructContextRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof Empty
        ? partialRequest
        : Empty.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterTryToConstructContextRequestFromJsonString = (jsonRequest) => {
    return GreeterTryToConstructContextRequestFromProtobufShape(Empty.fromJsonString(jsonRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterTryToConstructContextRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof Empty
        ? partialRequest
        : new Empty(partialRequest);
};
const GreeterTryToConstructContextResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof Empty
        ? partialResponse
        : Empty.fromJson(partialResponse);
    return response;
};
const GreeterTryToConstructContextResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof Empty
        ? partialResponse
        : new Empty(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterTryToConstructExternalContextRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof Empty
        ? partialRequest
        : Empty.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterTryToConstructExternalContextRequestFromJsonString = (jsonRequest) => {
    return GreeterTryToConstructExternalContextRequestFromProtobufShape(Empty.fromJsonString(jsonRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterTryToConstructExternalContextRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof Empty
        ? partialRequest
        : new Empty(partialRequest);
};
const GreeterTryToConstructExternalContextResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof Empty
        ? partialResponse
        : Empty.fromJson(partialResponse);
    return response;
};
const GreeterTryToConstructExternalContextResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof Empty
        ? partialResponse
        : new Empty(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterTestLongRunningFetchRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof greeter_pb.TestLongRunningFetchRequest
        ? partialRequest
        : greeter_pb.TestLongRunningFetchRequest.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterTestLongRunningFetchRequestFromJsonString = (jsonRequest) => {
    return GreeterTestLongRunningFetchRequestFromProtobufShape(greeter_pb.TestLongRunningFetchRequest.fromJsonString(jsonRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterTestLongRunningFetchRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof greeter_pb.TestLongRunningFetchRequest
        ? partialRequest
        : new greeter_pb.TestLongRunningFetchRequest(partialRequest);
};
const GreeterTestLongRunningFetchResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof Empty
        ? partialResponse
        : Empty.fromJson(partialResponse);
    return response;
};
const GreeterTestLongRunningFetchResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof Empty
        ? partialResponse
        : new Empty(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterTestLongRunningWriterRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof Empty
        ? partialRequest
        : Empty.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterTestLongRunningWriterRequestFromJsonString = (jsonRequest) => {
    return GreeterTestLongRunningWriterRequestFromProtobufShape(Empty.fromJsonString(jsonRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterTestLongRunningWriterRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof Empty
        ? partialRequest
        : new Empty(partialRequest);
};
const GreeterTestLongRunningWriterResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof Empty
        ? partialResponse
        : Empty.fromJson(partialResponse);
    return response;
};
const GreeterTestLongRunningWriterResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof Empty
        ? partialResponse
        : new Empty(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterGetWholeStateRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof greeter_pb.GetWholeStateRequest
        ? partialRequest
        : greeter_pb.GetWholeStateRequest.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterGetWholeStateRequestFromJsonString = (jsonRequest) => {
    return GreeterGetWholeStateRequestFromProtobufShape(greeter_pb.GetWholeStateRequest.fromJsonString(jsonRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterGetWholeStateRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof greeter_pb.GetWholeStateRequest
        ? partialRequest
        : new greeter_pb.GetWholeStateRequest(partialRequest);
};
const GreeterGetWholeStateResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof GreeterProto
        ? partialResponse
        : GreeterProto.fromJson(partialResponse);
    return response;
};
const GreeterGetWholeStateResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof GreeterProto
        ? partialResponse
        : new GreeterProto(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterFailWithExceptionRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof Empty
        ? partialRequest
        : Empty.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterFailWithExceptionRequestFromJsonString = (jsonRequest) => {
    return GreeterFailWithExceptionRequestFromProtobufShape(Empty.fromJsonString(jsonRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterFailWithExceptionRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof Empty
        ? partialRequest
        : new Empty(partialRequest);
};
const GreeterFailWithExceptionResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof Empty
        ? partialResponse
        : Empty.fromJson(partialResponse);
    return response;
};
const GreeterFailWithExceptionResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof Empty
        ? partialResponse
        : new Empty(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterFailWithAbortedRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof Empty
        ? partialRequest
        : Empty.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterFailWithAbortedRequestFromJsonString = (jsonRequest) => {
    return GreeterFailWithAbortedRequestFromProtobufShape(Empty.fromJsonString(jsonRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterFailWithAbortedRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof Empty
        ? partialRequest
        : new Empty(partialRequest);
};
const GreeterFailWithAbortedResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof Empty
        ? partialResponse
        : Empty.fromJson(partialResponse);
    return response;
};
const GreeterFailWithAbortedResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof Empty
        ? partialResponse
        : new Empty(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterWorkflowRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof Empty
        ? partialRequest
        : Empty.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterWorkflowRequestFromJsonString = (jsonRequest) => {
    return GreeterWorkflowRequestFromProtobufShape(Empty.fromJsonString(jsonRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterWorkflowRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof Empty
        ? partialRequest
        : new Empty(partialRequest);
};
const GreeterWorkflowResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof greeter_pb.WorkflowResponse
        ? partialResponse
        : greeter_pb.WorkflowResponse.fromJson(partialResponse);
    return response;
};
const GreeterWorkflowResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof greeter_pb.WorkflowResponse
        ? partialResponse
        : new greeter_pb.WorkflowResponse(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterDangerousFieldsRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof greeter_pb.DangerousFieldsRequest
        ? partialRequest
        : greeter_pb.DangerousFieldsRequest.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterDangerousFieldsRequestFromJsonString = (jsonRequest) => {
    return GreeterDangerousFieldsRequestFromProtobufShape(greeter_pb.DangerousFieldsRequest.fromJsonString(jsonRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterDangerousFieldsRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof greeter_pb.DangerousFieldsRequest
        ? partialRequest
        : new greeter_pb.DangerousFieldsRequest(partialRequest);
};
const GreeterDangerousFieldsResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof Empty
        ? partialResponse
        : Empty.fromJson(partialResponse);
    return response;
};
const GreeterDangerousFieldsResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof Empty
        ? partialResponse
        : new Empty(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterStoreRecursiveMessageRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof greeter_pb.StoreRecursiveMessageRequest
        ? partialRequest
        : greeter_pb.StoreRecursiveMessageRequest.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterStoreRecursiveMessageRequestFromJsonString = (jsonRequest) => {
    return GreeterStoreRecursiveMessageRequestFromProtobufShape(greeter_pb.StoreRecursiveMessageRequest.fromJsonString(jsonRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterStoreRecursiveMessageRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof greeter_pb.StoreRecursiveMessageRequest
        ? partialRequest
        : new greeter_pb.StoreRecursiveMessageRequest(partialRequest);
};
const GreeterStoreRecursiveMessageResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof greeter_pb.StoreRecursiveMessageResponse
        ? partialResponse
        : greeter_pb.StoreRecursiveMessageResponse.fromJson(partialResponse);
    return response;
};
const GreeterStoreRecursiveMessageResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof greeter_pb.StoreRecursiveMessageResponse
        ? partialResponse
        : new greeter_pb.StoreRecursiveMessageResponse(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterReadRecursiveMessageRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof greeter_pb.ReadRecursiveMessageRequest
        ? partialRequest
        : greeter_pb.ReadRecursiveMessageRequest.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterReadRecursiveMessageRequestFromJsonString = (jsonRequest) => {
    return GreeterReadRecursiveMessageRequestFromProtobufShape(greeter_pb.ReadRecursiveMessageRequest.fromJsonString(jsonRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterReadRecursiveMessageRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof greeter_pb.ReadRecursiveMessageRequest
        ? partialRequest
        : new greeter_pb.ReadRecursiveMessageRequest(partialRequest);
};
const GreeterReadRecursiveMessageResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof greeter_pb.ReadRecursiveMessageResponse
        ? partialResponse
        : greeter_pb.ReadRecursiveMessageResponse.fromJson(partialResponse);
    return response;
};
const GreeterReadRecursiveMessageResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof greeter_pb.ReadRecursiveMessageResponse
        ? partialResponse
        : new greeter_pb.ReadRecursiveMessageResponse(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterConstructAndStoreRecursiveMessageRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof greeter_pb.ConstructAndStoreRecursiveMessageRequest
        ? partialRequest
        : greeter_pb.ConstructAndStoreRecursiveMessageRequest.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterConstructAndStoreRecursiveMessageRequestFromJsonString = (jsonRequest) => {
    return GreeterConstructAndStoreRecursiveMessageRequestFromProtobufShape(greeter_pb.ConstructAndStoreRecursiveMessageRequest.fromJsonString(jsonRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterConstructAndStoreRecursiveMessageRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof greeter_pb.ConstructAndStoreRecursiveMessageRequest
        ? partialRequest
        : new greeter_pb.ConstructAndStoreRecursiveMessageRequest(partialRequest);
};
const GreeterConstructAndStoreRecursiveMessageResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof greeter_pb.ConstructAndStoreRecursiveMessageResponse
        ? partialResponse
        : greeter_pb.ConstructAndStoreRecursiveMessageResponse.fromJson(partialResponse);
    return response;
};
const GreeterConstructAndStoreRecursiveMessageResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof greeter_pb.ConstructAndStoreRecursiveMessageResponse
        ? partialResponse
        : new greeter_pb.ConstructAndStoreRecursiveMessageResponse(partialResponse);
};
const GREETER_CREATE_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
export class GreeterCreateAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_CREATE_ERROR_TYPES);
        if (error !== undefined) {
            return new GreeterCreateAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new GreeterCreateAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterCreateAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterCreateAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterCreateAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterCreateAborted_error.set(this, void 0);
        _GreeterCreateAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterCreateAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterCreateAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterCreateAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterCreateAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterCreateAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterCreateAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterCreateAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterCreateAborted_error, "f");
    }
}
_GreeterCreateAborted_error = new WeakMap(), _GreeterCreateAborted_message = new WeakMap();
const GREETER_GREET_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
export class GreeterGreetAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_GREET_ERROR_TYPES);
        if (error !== undefined) {
            return new GreeterGreetAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new GreeterGreetAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterGreetAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterGreetAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterGreetAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterGreetAborted_error.set(this, void 0);
        _GreeterGreetAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterGreetAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterGreetAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterGreetAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterGreetAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterGreetAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterGreetAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterGreetAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterGreetAborted_error, "f");
    }
}
_GreeterGreetAborted_error = new WeakMap(), _GreeterGreetAborted_message = new WeakMap();
const GREETER_SET_ADJECTIVE_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
export class GreeterSetAdjectiveAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_SET_ADJECTIVE_ERROR_TYPES);
        if (error !== undefined) {
            return new GreeterSetAdjectiveAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new GreeterSetAdjectiveAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterSetAdjectiveAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterSetAdjectiveAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterSetAdjectiveAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterSetAdjectiveAborted_error.set(this, void 0);
        _GreeterSetAdjectiveAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterSetAdjectiveAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterSetAdjectiveAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterSetAdjectiveAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterSetAdjectiveAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterSetAdjectiveAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterSetAdjectiveAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterSetAdjectiveAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterSetAdjectiveAborted_error, "f");
    }
}
_GreeterSetAdjectiveAborted_error = new WeakMap(), _GreeterSetAdjectiveAborted_message = new WeakMap();
const GREETER_TRANSACTION_SET_ADJECTIVE_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
export class GreeterTransactionSetAdjectiveAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_TRANSACTION_SET_ADJECTIVE_ERROR_TYPES);
        if (error !== undefined) {
            return new GreeterTransactionSetAdjectiveAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new GreeterTransactionSetAdjectiveAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterTransactionSetAdjectiveAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterTransactionSetAdjectiveAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterTransactionSetAdjectiveAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterTransactionSetAdjectiveAborted_error.set(this, void 0);
        _GreeterTransactionSetAdjectiveAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterTransactionSetAdjectiveAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterTransactionSetAdjectiveAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterTransactionSetAdjectiveAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterTransactionSetAdjectiveAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterTransactionSetAdjectiveAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterTransactionSetAdjectiveAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterTransactionSetAdjectiveAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterTransactionSetAdjectiveAborted_error, "f");
    }
}
_GreeterTransactionSetAdjectiveAborted_error = new WeakMap(), _GreeterTransactionSetAdjectiveAborted_message = new WeakMap();
const GREETER_TRY_TO_CONSTRUCT_CONTEXT_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
export class GreeterTryToConstructContextAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_TRY_TO_CONSTRUCT_CONTEXT_ERROR_TYPES);
        if (error !== undefined) {
            return new GreeterTryToConstructContextAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new GreeterTryToConstructContextAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterTryToConstructContextAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterTryToConstructContextAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterTryToConstructContextAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterTryToConstructContextAborted_error.set(this, void 0);
        _GreeterTryToConstructContextAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterTryToConstructContextAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterTryToConstructContextAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterTryToConstructContextAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterTryToConstructContextAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterTryToConstructContextAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterTryToConstructContextAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterTryToConstructContextAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterTryToConstructContextAborted_error, "f");
    }
}
_GreeterTryToConstructContextAborted_error = new WeakMap(), _GreeterTryToConstructContextAborted_message = new WeakMap();
const GREETER_TRY_TO_CONSTRUCT_EXTERNAL_CONTEXT_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
export class GreeterTryToConstructExternalContextAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_TRY_TO_CONSTRUCT_EXTERNAL_CONTEXT_ERROR_TYPES);
        if (error !== undefined) {
            return new GreeterTryToConstructExternalContextAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new GreeterTryToConstructExternalContextAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterTryToConstructExternalContextAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterTryToConstructExternalContextAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterTryToConstructExternalContextAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterTryToConstructExternalContextAborted_error.set(this, void 0);
        _GreeterTryToConstructExternalContextAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterTryToConstructExternalContextAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterTryToConstructExternalContextAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterTryToConstructExternalContextAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterTryToConstructExternalContextAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterTryToConstructExternalContextAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterTryToConstructExternalContextAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterTryToConstructExternalContextAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterTryToConstructExternalContextAborted_error, "f");
    }
}
_GreeterTryToConstructExternalContextAborted_error = new WeakMap(), _GreeterTryToConstructExternalContextAborted_message = new WeakMap();
const GREETER_TEST_LONG_RUNNING_FETCH_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
export class GreeterTestLongRunningFetchAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_TEST_LONG_RUNNING_FETCH_ERROR_TYPES);
        if (error !== undefined) {
            return new GreeterTestLongRunningFetchAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new GreeterTestLongRunningFetchAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterTestLongRunningFetchAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterTestLongRunningFetchAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterTestLongRunningFetchAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterTestLongRunningFetchAborted_error.set(this, void 0);
        _GreeterTestLongRunningFetchAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterTestLongRunningFetchAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterTestLongRunningFetchAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterTestLongRunningFetchAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterTestLongRunningFetchAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterTestLongRunningFetchAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterTestLongRunningFetchAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterTestLongRunningFetchAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterTestLongRunningFetchAborted_error, "f");
    }
}
_GreeterTestLongRunningFetchAborted_error = new WeakMap(), _GreeterTestLongRunningFetchAborted_message = new WeakMap();
const GREETER_TEST_LONG_RUNNING_WRITER_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
export class GreeterTestLongRunningWriterAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_TEST_LONG_RUNNING_WRITER_ERROR_TYPES);
        if (error !== undefined) {
            return new GreeterTestLongRunningWriterAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new GreeterTestLongRunningWriterAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterTestLongRunningWriterAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterTestLongRunningWriterAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterTestLongRunningWriterAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterTestLongRunningWriterAborted_error.set(this, void 0);
        _GreeterTestLongRunningWriterAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterTestLongRunningWriterAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterTestLongRunningWriterAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterTestLongRunningWriterAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterTestLongRunningWriterAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterTestLongRunningWriterAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterTestLongRunningWriterAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterTestLongRunningWriterAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterTestLongRunningWriterAborted_error, "f");
    }
}
_GreeterTestLongRunningWriterAborted_error = new WeakMap(), _GreeterTestLongRunningWriterAborted_message = new WeakMap();
const GREETER_GET_WHOLE_STATE_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
export class GreeterGetWholeStateAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_GET_WHOLE_STATE_ERROR_TYPES);
        if (error !== undefined) {
            return new GreeterGetWholeStateAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new GreeterGetWholeStateAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterGetWholeStateAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterGetWholeStateAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterGetWholeStateAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterGetWholeStateAborted_error.set(this, void 0);
        _GreeterGetWholeStateAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterGetWholeStateAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterGetWholeStateAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterGetWholeStateAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterGetWholeStateAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterGetWholeStateAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterGetWholeStateAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterGetWholeStateAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterGetWholeStateAborted_error, "f");
    }
}
_GreeterGetWholeStateAborted_error = new WeakMap(), _GreeterGetWholeStateAborted_message = new WeakMap();
const GREETER_FAIL_WITH_EXCEPTION_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
export class GreeterFailWithExceptionAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_FAIL_WITH_EXCEPTION_ERROR_TYPES);
        if (error !== undefined) {
            return new GreeterFailWithExceptionAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new GreeterFailWithExceptionAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterFailWithExceptionAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterFailWithExceptionAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterFailWithExceptionAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterFailWithExceptionAborted_error.set(this, void 0);
        _GreeterFailWithExceptionAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterFailWithExceptionAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterFailWithExceptionAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterFailWithExceptionAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterFailWithExceptionAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterFailWithExceptionAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterFailWithExceptionAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterFailWithExceptionAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterFailWithExceptionAborted_error, "f");
    }
}
_GreeterFailWithExceptionAborted_error = new WeakMap(), _GreeterFailWithExceptionAborted_message = new WeakMap();
const GREETER_FAIL_WITH_ABORTED_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
    greeter_pb.ErrorWithValue,
]; // Need `as const` to ensure TypeScript infers this as a tuple!
export class GreeterFailWithAbortedAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_FAIL_WITH_ABORTED_ERROR_TYPES);
        if (error !== undefined) {
            return new GreeterFailWithAbortedAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new GreeterFailWithAbortedAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterFailWithAbortedAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterFailWithAbortedAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterFailWithAbortedAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterFailWithAbortedAborted_error.set(this, void 0);
        _GreeterFailWithAbortedAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterFailWithAbortedAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterFailWithAbortedAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterFailWithAbortedAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterFailWithAbortedAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterFailWithAbortedAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterFailWithAbortedAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterFailWithAbortedAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterFailWithAbortedAborted_error, "f");
    }
}
_GreeterFailWithAbortedAborted_error = new WeakMap(), _GreeterFailWithAbortedAborted_message = new WeakMap();
const GREETER_WORKFLOW_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
    greeter_pb.ErrorWithValue,
]; // Need `as const` to ensure TypeScript infers this as a tuple!
export class GreeterWorkflowAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_WORKFLOW_ERROR_TYPES);
        if (error !== undefined) {
            return new GreeterWorkflowAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new GreeterWorkflowAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterWorkflowAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterWorkflowAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterWorkflowAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterWorkflowAborted_error.set(this, void 0);
        _GreeterWorkflowAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterWorkflowAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterWorkflowAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterWorkflowAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterWorkflowAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterWorkflowAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterWorkflowAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterWorkflowAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterWorkflowAborted_error, "f");
    }
}
_GreeterWorkflowAborted_error = new WeakMap(), _GreeterWorkflowAborted_message = new WeakMap();
const GREETER_DANGEROUS_FIELDS_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
export class GreeterDangerousFieldsAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_DANGEROUS_FIELDS_ERROR_TYPES);
        if (error !== undefined) {
            return new GreeterDangerousFieldsAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new GreeterDangerousFieldsAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterDangerousFieldsAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterDangerousFieldsAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterDangerousFieldsAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterDangerousFieldsAborted_error.set(this, void 0);
        _GreeterDangerousFieldsAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterDangerousFieldsAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterDangerousFieldsAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterDangerousFieldsAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterDangerousFieldsAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterDangerousFieldsAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterDangerousFieldsAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterDangerousFieldsAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterDangerousFieldsAborted_error, "f");
    }
}
_GreeterDangerousFieldsAborted_error = new WeakMap(), _GreeterDangerousFieldsAborted_message = new WeakMap();
const GREETER_STORE_RECURSIVE_MESSAGE_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
export class GreeterStoreRecursiveMessageAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_STORE_RECURSIVE_MESSAGE_ERROR_TYPES);
        if (error !== undefined) {
            return new GreeterStoreRecursiveMessageAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new GreeterStoreRecursiveMessageAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterStoreRecursiveMessageAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterStoreRecursiveMessageAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterStoreRecursiveMessageAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterStoreRecursiveMessageAborted_error.set(this, void 0);
        _GreeterStoreRecursiveMessageAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterStoreRecursiveMessageAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterStoreRecursiveMessageAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterStoreRecursiveMessageAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterStoreRecursiveMessageAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterStoreRecursiveMessageAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterStoreRecursiveMessageAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterStoreRecursiveMessageAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterStoreRecursiveMessageAborted_error, "f");
    }
}
_GreeterStoreRecursiveMessageAborted_error = new WeakMap(), _GreeterStoreRecursiveMessageAborted_message = new WeakMap();
const GREETER_READ_RECURSIVE_MESSAGE_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
export class GreeterReadRecursiveMessageAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_READ_RECURSIVE_MESSAGE_ERROR_TYPES);
        if (error !== undefined) {
            return new GreeterReadRecursiveMessageAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new GreeterReadRecursiveMessageAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterReadRecursiveMessageAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterReadRecursiveMessageAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterReadRecursiveMessageAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterReadRecursiveMessageAborted_error.set(this, void 0);
        _GreeterReadRecursiveMessageAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterReadRecursiveMessageAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterReadRecursiveMessageAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterReadRecursiveMessageAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterReadRecursiveMessageAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterReadRecursiveMessageAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterReadRecursiveMessageAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterReadRecursiveMessageAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterReadRecursiveMessageAborted_error, "f");
    }
}
_GreeterReadRecursiveMessageAborted_error = new WeakMap(), _GreeterReadRecursiveMessageAborted_message = new WeakMap();
const GREETER_CONSTRUCT_AND_STORE_RECURSIVE_MESSAGE_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
export class GreeterConstructAndStoreRecursiveMessageAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_CONSTRUCT_AND_STORE_RECURSIVE_MESSAGE_ERROR_TYPES);
        if (error !== undefined) {
            return new GreeterConstructAndStoreRecursiveMessageAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new GreeterConstructAndStoreRecursiveMessageAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterConstructAndStoreRecursiveMessageAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterConstructAndStoreRecursiveMessageAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterConstructAndStoreRecursiveMessageAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterConstructAndStoreRecursiveMessageAborted_error.set(this, void 0);
        _GreeterConstructAndStoreRecursiveMessageAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterConstructAndStoreRecursiveMessageAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterConstructAndStoreRecursiveMessageAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterConstructAndStoreRecursiveMessageAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterConstructAndStoreRecursiveMessageAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterConstructAndStoreRecursiveMessageAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterConstructAndStoreRecursiveMessageAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterConstructAndStoreRecursiveMessageAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterConstructAndStoreRecursiveMessageAborted_error, "f");
    }
}
_GreeterConstructAndStoreRecursiveMessageAborted_error = new WeakMap(), _GreeterConstructAndStoreRecursiveMessageAborted_message = new WeakMap();
class GreeterInstance {
    constructor(id, stateRef, url) {
        this.observers = {};
        this.loadingReaders = 0;
        this.runningMutates = [];
        this.queuedMutates = [];
        this.flushMutates = undefined;
        this.websocket = undefined;
        this.backoff = new reboot_api.Backoff();
        this.useCreateMutations = [];
        this.useCreateSetPendings = {};
        this.useGreetReaders = {};
        this.greetFinalizationRegistry = new FinalizationRegistry((finalize) => finalize());
        this.useSetAdjectiveMutations = [];
        this.useSetAdjectiveSetPendings = {};
        this.useTransactionSetAdjectiveMutations = [];
        this.useTransactionSetAdjectiveSetPendings = {};
        this.useTryToConstructContextReaders = {};
        this.tryToConstructContextFinalizationRegistry = new FinalizationRegistry((finalize) => finalize());
        this.useTryToConstructExternalContextReaders = {};
        this.tryToConstructExternalContextFinalizationRegistry = new FinalizationRegistry((finalize) => finalize());
        this.useTestLongRunningFetchReaders = {};
        this.testLongRunningFetchFinalizationRegistry = new FinalizationRegistry((finalize) => finalize());
        this.useTestLongRunningWriterMutations = [];
        this.useTestLongRunningWriterSetPendings = {};
        this.useGetWholeStateReaders = {};
        this.getWholeStateFinalizationRegistry = new FinalizationRegistry((finalize) => finalize());
        this.useFailWithExceptionReaders = {};
        this.failWithExceptionFinalizationRegistry = new FinalizationRegistry((finalize) => finalize());
        this.useFailWithAbortedReaders = {};
        this.failWithAbortedFinalizationRegistry = new FinalizationRegistry((finalize) => finalize());
        this.useDangerousFieldsMutations = [];
        this.useDangerousFieldsSetPendings = {};
        this.useStoreRecursiveMessageMutations = [];
        this.useStoreRecursiveMessageSetPendings = {};
        this.useReadRecursiveMessageReaders = {};
        this.readRecursiveMessageFinalizationRegistry = new FinalizationRegistry((finalize) => finalize());
        this.useConstructAndStoreRecursiveMessageMutations = [];
        this.useConstructAndStoreRecursiveMessageSetPendings = {};
        this.id = id;
        this.stateRef = stateRef;
        this.url = url;
        this.refs = 1;
        reboot_web.websockets.connect(this.url, this.stateRef);
        this.initializeWebSocket();
    }
    ref() {
        this.refs += 1;
        return this.refs;
    }
    unref() {
        this.refs -= 1;
        if (this.refs === 0 && this.websocket !== undefined) {
            this.websocket.close();
            reboot_web.websockets.disconnect(this.url, this.stateRef);
        }
        return this.refs;
    }
    hasRunningMutations() {
        return this.runningMutates.length > 0;
    }
    async flushMutations() {
        if (this.flushMutates === undefined) {
            this.flushMutates = new reboot_api.Event();
        }
        await this.flushMutates.wait();
    }
    readersLoadedOrFailed() {
        var _a;
        this.flushMutates = undefined;
        if (this.queuedMutates.length > 0) {
            this.runningMutates = this.queuedMutates;
            this.queuedMutates = [];
            if (((_a = this.websocket) === null || _a === void 0 ? void 0 : _a.readyState) === WebSocket.OPEN) {
                for (const { request, update } of this.runningMutates) {
                    update({ isLoading: true });
                    try {
                        this.websocket.send(request.toBinary());
                    }
                    catch (_b) {
                        // We'll retry since we've stored in `*Mutates`.
                    }
                }
            }
        }
    }
    initializeWebSocket() {
        if (this.websocket === undefined && this.refs > 0) {
            const url = new URL(`${this.url}/__/reboot/rpc/${this.stateRef}`);
            url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
            this.websocket = reboot_web.websockets.create(url);
            this.websocket.binaryType = "arraybuffer";
            this.websocket.onopen = () => {
                var _a;
                if (((_a = this.websocket) === null || _a === void 0 ? void 0 : _a.readyState) === WebSocket.OPEN) {
                    for (const { request, update } of this.runningMutates) {
                        update({ isLoading: true });
                        try {
                            this.websocket.send(request.toBinary());
                        }
                        catch (_b) {
                            // We'll retry since we've stored in `*Mutates`.
                        }
                    }
                }
            };
            this.websocket.onerror = async () => {
                if (this.websocket !== undefined) {
                    this.websocket = undefined;
                    for (const { update } of this.runningMutates) {
                        update({ isLoading: false, error: "WebSocket disconnected" });
                    }
                    if (this.refs > 0) {
                        if (this.runningMutates.length > 0) {
                            console.warn(`[Reboot] WebSocket disconnected, ${this.runningMutates.length} outstanding mutations will be retried when we reconnect`);
                        }
                        await this.backoff.wait();
                        this.initializeWebSocket();
                    }
                }
            };
            this.websocket.onclose = async () => {
                if (this.websocket !== undefined) {
                    this.websocket = undefined;
                    for (const { update } of this.runningMutates) {
                        update({ isLoading: false, error: "WebSocket disconnected" });
                    }
                    if (this.refs > 0) {
                        await this.backoff.wait();
                        this.initializeWebSocket();
                    }
                }
            };
            this.websocket.onmessage = async (event) => {
                const { resolve } = this.runningMutates[0];
                this.runningMutates.shift();
                const response = reboot_api.react_pb.MutateResponse.fromBinary(new Uint8Array(event.data));
                resolve(response);
                if (this.flushMutates !== undefined &&
                    this.runningMutates.length === 0) {
                    this.flushMutates.set();
                }
            };
        }
    }
    async mutate(partialRequest, update) {
        const request = partialRequest instanceof reboot_api.react_pb.MutateRequest
            ? partialRequest
            : new reboot_api.react_pb.MutateRequest(partialRequest);
        return new Promise((resolve, _) => {
            var _a;
            if (this.loadingReaders === 0) {
                this.runningMutates = this.runningMutates.concat({ request, resolve, update });
                if (((_a = this.websocket) === null || _a === void 0 ? void 0 : _a.readyState) === WebSocket.OPEN) {
                    update({ isLoading: true });
                    try {
                        this.websocket.send(request.toBinary());
                    }
                    catch (_b) {
                        // We'll retry since we've stored in `*Mutates`.
                    }
                }
            }
            else {
                this.queuedMutates = this.queuedMutates.concat({ request, resolve, update });
            }
        });
    }
    async read(method, serializedRequest, bearerToken, responseType, reader) {
        const queryRequest = new reboot_api.react_pb.QueryRequest({
            method,
            request: serializedRequest,
            ...(bearerToken !== undefined && { bearerToken } || {}),
        });
        let expecteds = [];
        // When we disconnect we may not be able to observe
        // responses due to mutations yet there may still be
        // some outstanding responses that are expected which
        // we treat as "orphans" in the sense that we won't
        // observe their idempotency keys but once we reconnect
        // we will still have observed their effects and can
        // call `observed()` on them.
        let orphans = [];
        const id = `${uuidv4()}`;
        this.observers[id] = {
            observe: (idempotencyKey, observed, aborted) => {
                expecteds = expecteds.concat({ idempotencyKey, observed, aborted });
            },
            unobserve: (idempotencyKey) => {
                expecteds = expecteds.filter(expected => expected.idempotencyKey !== idempotencyKey);
                orphans = orphans.filter(orphan => orphan.idempotencyKey !== idempotencyKey);
            }
        };
        try {
            await reboot_api.retryForever(async () => {
                let loaded = false;
                this.loadingReaders += 1;
                // Any mutations started after we've incremented
                // `this.loadingReaders` will be queued until after
                // all the readers have loaded and thus (1) we know all
                // current `expected` are actually `orphans` that
                // we will haved "observed" once we are (re)connected
                // because we flush mutations before starting to read
                // and (2) all queued mutations can stay in `expected`
                // because we will in fact be able to observe them
                // since they won't get sent over the websocket
                // until after we are (re)connected.
                //
                // NOTE: we need to concatenate with `orphans`
                // because we may try to (re)connect multiple times
                // and between each try more mutations may have been
                // made (or queued ones will be moved to running).
                orphans = [...orphans, ...expecteds];
                expecteds = [];
                try {
                    // Wait for potentially completed mutations to flush
                    // before starting to read so that we read the latest
                    // state including those mutations.
                    if (this.hasRunningMutations()) {
                        await this.flushMutations();
                    }
                    reader.setIsLoading(true);
                    const queryResponses = reboot_web.reactiveReader({
                        endpoint: `${this.url}/__/reboot/rpc/${this.stateRef}`,
                        request: queryRequest,
                        signal: reader.abortController.signal,
                    });
                    for await (const queryResponse of queryResponses) {
                        if (!loaded) {
                            if ((this.loadingReaders -= 1) === 0) {
                                this.readersLoadedOrFailed();
                            }
                            loaded = true;
                        }
                        reader.setIsLoading(false);
                        const response = queryResponse.responseOrStatus.case === "response"
                            ? responseType.fromBinary(queryResponse.responseOrStatus.value)
                            : undefined;
                        // If we were disconnected it must be that we've
                        // observed all `orphans` because we waited
                        // for any mutations to flush before we re-started to
                        // read.
                        const haveOrphans = orphans.length;
                        if (haveOrphans > 0) {
                            // We mark all mutations as observed except the
                            // last one which we also invoke all `setResponse`s.
                            // In this way we effectively create a barrier
                            // for all readers that will synchronize on the last
                            // mutation, but note that this still may lead
                            // to some partial state/response updates because
                            // one reader may have actually received a response
                            // while another reader got disconnected. While this
                            // is likely very rare, it is possible. Mitigating
                            // this issue is non-trivial and for now we have
                            // no plans to address it.
                            for (let i = 0; i < orphans.length - 1; i++) {
                                orphans[i].observed(() => { });
                            }
                            await orphans[orphans.length - 1].observed(() => {
                                if (response !== undefined) {
                                    reader.setResponse(response);
                                }
                            });
                            orphans = [];
                        }
                        // We want to check the orphans list AND the expecteds list because
                        // it could be possible that we receive a query response that
                        // contains an idempotency key that we are expecting while having an
                        // orphans list with a length greater than 0. In this case, we don't
                        // want to skip checking the expecteds list just because we have
                        // already checked the orphans list.
                        if (expecteds.length > 0 &&
                            queryResponse.idempotencyKeys.includes(expecteds[0].idempotencyKey)) {
                            await expecteds[0].observed(() => {
                                if (response !== undefined) {
                                    reader.setResponse(response);
                                }
                                expecteds.shift();
                            });
                        }
                        // If we don't have any orphans to observe and we don't have any expecteds to observe,
                        // or at least, the first expecteds _is not observed_ by this response, then go ahead and
                        // pass on the response because it might contain new data that should get shown to the
                        // user (e.g., in a chat app this could be a new chat message from a different user).
                        else if (response !== undefined && !haveOrphans) {
                            reader.setResponse(response);
                        }
                    }
                    throw new Error('Not expecting stream to ever be done');
                }
                catch (e) {
                    if (!loaded) {
                        if ((this.loadingReaders -= 1) === 0) {
                            this.readersLoadedOrFailed();
                        }
                    }
                    loaded = false;
                    if (reader.abortController.signal.aborted) {
                        for (const { aborted } of [...orphans, ...expecteds]) {
                            aborted();
                        }
                        return;
                    }
                    reader.setIsLoading(false);
                    if (e instanceof reboot_api.Status) {
                        reader.setStatus(e);
                    }
                    else {
                        console.warn(`[Reboot] Caught unknown exception: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
                    }
                    throw e; // This just retries!
                }
            });
        }
        finally {
            delete this.observers[id];
        }
    }
    async create(mutation) {
        // We always have at least 1 observer which is this function!
        let remainingObservers = 1;
        const event = new reboot_api.Event();
        let callbacks = [];
        const observed = (callback) => {
            callbacks = callbacks.concat(callback);
            remainingObservers -= 1;
            if (remainingObservers === 0) {
                for (const callback of callbacks) {
                    callback();
                }
                event.set();
            }
            return event.wait();
        };
        const aborted = () => {
            observed(() => { });
        };
        // Tell observers about this pending mutation.
        for (const id in this.observers) {
            remainingObservers += 1;
            this.observers[id].observe(mutation.idempotencyKey, observed, aborted);
        }
        this.useCreateMutations = this.useCreateMutations.concat(mutation);
        for (const setPending of Object.values(this.useCreateSetPendings)) {
            setPending(this.useCreateMutations);
        }
        return new Promise(async (resolve, reject) => {
            const { responseOrStatus } = await this.mutate({
                method: "Create",
                request: mutation.request.toBinary(),
                idempotencyKey: mutation.idempotencyKey,
                bearerToken: mutation.bearerToken,
            }, ({ isLoading, error }) => {
                let rerender = false;
                for (const m of this.useCreateMutations) {
                    if (m === mutation) {
                        if (m.isLoading !== isLoading) {
                            m.isLoading = isLoading;
                            rerender = true;
                        }
                        if (error !== undefined && m.error !== error) {
                            m.error = error;
                            rerender = true;
                        }
                    }
                }
                if (rerender) {
                    for (const setPending of Object.values(this.useCreateSetPendings)) {
                        setPending(this.useCreateMutations);
                    }
                }
            });
            const removeMutationsAndSetPending = () => {
                this.useCreateMutations =
                    this.useCreateMutations.filter(m => m !== mutation);
                for (const setPending of Object.values(this.useCreateSetPendings)) {
                    setPending(this.useCreateMutations);
                }
            };
            switch (responseOrStatus.case) {
                case "response": {
                    await observed(() => {
                        removeMutationsAndSetPending();
                        resolve({
                            response: GreeterCreateResponseFromProtobufShape(greeter_pb.CreateResponse.fromBinary(responseOrStatus.value))
                        });
                    });
                    break;
                }
                case "status": {
                    // Let the observers know they no longer should expect to
                    // observe this idempotency key.
                    for (const id in this.observers) {
                        this.observers[id].unobserve(mutation.idempotencyKey);
                    }
                    const status = reboot_api.Status.fromJsonString(responseOrStatus.value);
                    const aborted = GreeterCreateAborted.fromStatus(status);
                    console.warn(`[Reboot] 'Greeter.Create' aborted with ${aborted.message}`);
                    removeMutationsAndSetPending();
                    resolve({ aborted });
                    break;
                }
                default: {
                    // TODO(benh): while this is a _really_ fatal error,
                    // should we still set `aborted` instead of throwing?
                    reject(new Error('Expecting either a response or a status'));
                }
            }
        });
    }
    useCreate(id, setPending) {
        this.useCreateSetPendings[id] = setPending;
    }
    unuseCreate(id) {
        delete this.useCreateSetPendings[id];
    }
    startGreet(requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey) {
        let reader = this.useGreetReaders[requestBearerTokenHash];
        if (reader === undefined) {
            const event = new reboot_api.Event();
            const promise = event.wait();
            reader = {
                abortController: new AbortController(),
                event,
                promise,
                used: false,
                scheduledUnusedTimeoutsCount: 0,
                setResponses: {},
                setIsLoadings: {},
                setStatuses: {},
                setResponse(response, { cache } = { cache: true }) {
                    // Store the response, delete the status.
                    this.response = response;
                    delete this.status;
                    // Trigger response or aborted has been received event (if
                    // it wasn't triggered already).
                    this.event.set();
                    // Dispatch to all listeners.
                    for (const setResponse of Object.values(this.setResponses)) {
                        setResponse(response);
                    }
                    // Cache response if applicable.
                    if (cache && offlineCacheEnabled) {
                        reboot_api.assert(cacheKey !== null);
                        const cachedResponse = response.toJsonString();
                        reboot_web.offlineCache().set(cacheKey, cachedResponse)
                            .catch((error) => {
                            console.warn(`[Reboot] Setting of offline reader cache entry for 'Greeter.Greet' errored with ${error}`);
                        });
                    }
                },
                setIsLoading(isLoading) {
                    for (const setIsLoading of Object.values(this.setIsLoadings)) {
                        setIsLoading(isLoading);
                    }
                },
                setStatus(status) {
                    // Store the status, delete the response.
                    this.status = status;
                    delete this.response;
                    // Trigger response or aborted has been received event (if
                    // it wasn't triggered already).
                    this.event.set();
                    for (const setStatus of Object.values(this.setStatuses)) {
                        setStatus(status);
                    }
                },
            };
            this.greetFinalizationRegistry.register(promise, () => {
                if (!reader.used) {
                    delete this.useGreetReaders[requestBearerTokenHash];
                    reader.abortController.abort();
                }
            });
            // We want to remove the promise so that it can be garbage collected
            // which is our indication that React is no longer using it. But this
            // races with calls to `useGreet(...)`
            // that might be adding their `setResponse`, `setIsLoading`, etc, so
            // we delay deleting the promise for at least a second.
            //
            // Note that deleting the promise is okay because all subsequent calls
            // will simply use the `reader.response` since it will no longer be
            // undefined.
            reader.promise.then(async () => {
                // Allow the call to `useGreet(...)`
                // at least 5 seconds to indicate that the reader is being used,
                // afterwhich, once `reader.promise` gets garbage collected
                // we'll know that it must have been abandoned by React, e.g.,
                // because the component was suspended and never committed.
                await reboot_api.sleep({ ms: 5000 });
                delete reader.promise;
            });
            this.useGreetReaders[requestBearerTokenHash] = reader;
            // Start fetching from the server.
            this.read("Greet", serializedRequest, bearerToken, greeter_pb.GreetResponse, reader);
            // Check if there is a cached result if applicable.
            if (offlineCacheEnabled) {
                reboot_api.assert(cacheKey !== null);
                reboot_web.offlineCache().get(cacheKey).then((cachedResponse) => {
                    if (cachedResponse !== null) {
                        // We only want to set the response if we haven't already
                        // gotten a response from the server as it is the authority
                        // and should take precedence.
                        if (reader.response === undefined) {
                            reader.setResponse(greeter_pb.GreetResponse.fromJsonString(cachedResponse), { cache: false } // Don't re-cache the value!
                            );
                        }
                    }
                }).catch((error) => {
                    console.warn(`[Reboot] Retrieval of offline reader cache entry for 'Greeter.Greet' errored with ${error}`);
                });
            }
        }
        reboot_api.assert(reader !== undefined);
        return reader;
    }
    useGreet(id, requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey, setResponse, setIsLoading, setStatus) {
        // We need to call start here because with strict mode the
        // `useEffect` that calls this method will also call "unuse"
        // which will mean the next time the `useEffect` calls here
        // we'll create a new reader in start.
        const reader = this.startGreet(requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey);
        reboot_api.assert(reader !== undefined);
        // Indicate that the reader has properly been used so that we don't
        // clean it up prematurely.
        reader.used = true;
        reader.setResponses[id] = setResponse;
        reader.setIsLoadings[id] = setIsLoading;
        reader.setStatuses[id] = setStatus;
        // If we already have a `response` or `status` need to set it.
        if (reader.response) {
            setResponse(reader.response);
            setIsLoading(false);
        }
        else if (reader.status) {
            setStatus(reader.status);
        }
    }
    unuseGreet(id, requestBearerTokenHash) {
        const reader = this.useGreetReaders[requestBearerTokenHash];
        reboot_api.assert(reader !== undefined);
        delete reader.setResponses[id];
        delete reader.setIsLoadings[id];
        delete reader.setStatuses[id];
        // Schedule a timeout to delete and abort this reader if we're the
        // last user. We need a timeout because, with StrictMode turned on,
        // we can't remove the reader right away otherwise we won't have a
        // stable Event and Promise. We use 3 seconds but may need to make
        // configurable depending on the application.
        if (Object.values(reader.setResponses).length === 0) {
            reader.scheduledUnusedTimeoutsCount += 1;
            setTimeout(() => {
                reader.scheduledUnusedTimeoutsCount -= 1;
                if (reader.scheduledUnusedTimeoutsCount === 0 &&
                    Object.values(reader.setResponses).length === 0) {
                    delete this.useGreetReaders[requestBearerTokenHash];
                    reader.abortController.abort();
                }
            }, 3000);
        }
    }
    async setAdjective(mutation) {
        // We always have at least 1 observer which is this function!
        let remainingObservers = 1;
        const event = new reboot_api.Event();
        let callbacks = [];
        const observed = (callback) => {
            callbacks = callbacks.concat(callback);
            remainingObservers -= 1;
            if (remainingObservers === 0) {
                for (const callback of callbacks) {
                    callback();
                }
                event.set();
            }
            return event.wait();
        };
        const aborted = () => {
            observed(() => { });
        };
        // Tell observers about this pending mutation.
        for (const id in this.observers) {
            remainingObservers += 1;
            this.observers[id].observe(mutation.idempotencyKey, observed, aborted);
        }
        this.useSetAdjectiveMutations = this.useSetAdjectiveMutations.concat(mutation);
        for (const setPending of Object.values(this.useSetAdjectiveSetPendings)) {
            setPending(this.useSetAdjectiveMutations);
        }
        return new Promise(async (resolve, reject) => {
            const { responseOrStatus } = await this.mutate({
                method: "SetAdjective",
                request: mutation.request.toBinary(),
                idempotencyKey: mutation.idempotencyKey,
                bearerToken: mutation.bearerToken,
            }, ({ isLoading, error }) => {
                let rerender = false;
                for (const m of this.useSetAdjectiveMutations) {
                    if (m === mutation) {
                        if (m.isLoading !== isLoading) {
                            m.isLoading = isLoading;
                            rerender = true;
                        }
                        if (error !== undefined && m.error !== error) {
                            m.error = error;
                            rerender = true;
                        }
                    }
                }
                if (rerender) {
                    for (const setPending of Object.values(this.useSetAdjectiveSetPendings)) {
                        setPending(this.useSetAdjectiveMutations);
                    }
                }
            });
            const removeMutationsAndSetPending = () => {
                this.useSetAdjectiveMutations =
                    this.useSetAdjectiveMutations.filter(m => m !== mutation);
                for (const setPending of Object.values(this.useSetAdjectiveSetPendings)) {
                    setPending(this.useSetAdjectiveMutations);
                }
            };
            switch (responseOrStatus.case) {
                case "response": {
                    await observed(() => {
                        removeMutationsAndSetPending();
                        resolve({
                            response: GreeterSetAdjectiveResponseFromProtobufShape(greeter_pb.SetAdjectiveResponse.fromBinary(responseOrStatus.value))
                        });
                    });
                    break;
                }
                case "status": {
                    // Let the observers know they no longer should expect to
                    // observe this idempotency key.
                    for (const id in this.observers) {
                        this.observers[id].unobserve(mutation.idempotencyKey);
                    }
                    const status = reboot_api.Status.fromJsonString(responseOrStatus.value);
                    const aborted = GreeterSetAdjectiveAborted.fromStatus(status);
                    console.warn(`[Reboot] 'Greeter.SetAdjective' aborted with ${aborted.message}`);
                    removeMutationsAndSetPending();
                    resolve({ aborted });
                    break;
                }
                default: {
                    // TODO(benh): while this is a _really_ fatal error,
                    // should we still set `aborted` instead of throwing?
                    reject(new Error('Expecting either a response or a status'));
                }
            }
        });
    }
    useSetAdjective(id, setPending) {
        this.useSetAdjectiveSetPendings[id] = setPending;
    }
    unuseSetAdjective(id) {
        delete this.useSetAdjectiveSetPendings[id];
    }
    async transactionSetAdjective(mutation) {
        // We always have at least 1 observer which is this function!
        let remainingObservers = 1;
        const event = new reboot_api.Event();
        let callbacks = [];
        const observed = (callback) => {
            callbacks = callbacks.concat(callback);
            remainingObservers -= 1;
            if (remainingObservers === 0) {
                for (const callback of callbacks) {
                    callback();
                }
                event.set();
            }
            return event.wait();
        };
        const aborted = () => {
            observed(() => { });
        };
        // Tell observers about this pending mutation.
        for (const id in this.observers) {
            remainingObservers += 1;
            this.observers[id].observe(mutation.idempotencyKey, observed, aborted);
        }
        this.useTransactionSetAdjectiveMutations = this.useTransactionSetAdjectiveMutations.concat(mutation);
        for (const setPending of Object.values(this.useTransactionSetAdjectiveSetPendings)) {
            setPending(this.useTransactionSetAdjectiveMutations);
        }
        return new Promise(async (resolve, reject) => {
            const { responseOrStatus } = await this.mutate({
                method: "TransactionSetAdjective",
                request: mutation.request.toBinary(),
                idempotencyKey: mutation.idempotencyKey,
                bearerToken: mutation.bearerToken,
            }, ({ isLoading, error }) => {
                let rerender = false;
                for (const m of this.useTransactionSetAdjectiveMutations) {
                    if (m === mutation) {
                        if (m.isLoading !== isLoading) {
                            m.isLoading = isLoading;
                            rerender = true;
                        }
                        if (error !== undefined && m.error !== error) {
                            m.error = error;
                            rerender = true;
                        }
                    }
                }
                if (rerender) {
                    for (const setPending of Object.values(this.useTransactionSetAdjectiveSetPendings)) {
                        setPending(this.useTransactionSetAdjectiveMutations);
                    }
                }
            });
            const removeMutationsAndSetPending = () => {
                this.useTransactionSetAdjectiveMutations =
                    this.useTransactionSetAdjectiveMutations.filter(m => m !== mutation);
                for (const setPending of Object.values(this.useTransactionSetAdjectiveSetPendings)) {
                    setPending(this.useTransactionSetAdjectiveMutations);
                }
            };
            switch (responseOrStatus.case) {
                case "response": {
                    await observed(() => {
                        removeMutationsAndSetPending();
                        resolve({
                            response: GreeterTransactionSetAdjectiveResponseFromProtobufShape(greeter_pb.SetAdjectiveResponse.fromBinary(responseOrStatus.value))
                        });
                    });
                    break;
                }
                case "status": {
                    // Let the observers know they no longer should expect to
                    // observe this idempotency key.
                    for (const id in this.observers) {
                        this.observers[id].unobserve(mutation.idempotencyKey);
                    }
                    const status = reboot_api.Status.fromJsonString(responseOrStatus.value);
                    const aborted = GreeterTransactionSetAdjectiveAborted.fromStatus(status);
                    console.warn(`[Reboot] 'Greeter.TransactionSetAdjective' aborted with ${aborted.message}`);
                    removeMutationsAndSetPending();
                    resolve({ aborted });
                    break;
                }
                default: {
                    // TODO(benh): while this is a _really_ fatal error,
                    // should we still set `aborted` instead of throwing?
                    reject(new Error('Expecting either a response or a status'));
                }
            }
        });
    }
    useTransactionSetAdjective(id, setPending) {
        this.useTransactionSetAdjectiveSetPendings[id] = setPending;
    }
    unuseTransactionSetAdjective(id) {
        delete this.useTransactionSetAdjectiveSetPendings[id];
    }
    startTryToConstructContext(requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey) {
        let reader = this.useTryToConstructContextReaders[requestBearerTokenHash];
        if (reader === undefined) {
            const event = new reboot_api.Event();
            const promise = event.wait();
            reader = {
                abortController: new AbortController(),
                event,
                promise,
                used: false,
                scheduledUnusedTimeoutsCount: 0,
                setResponses: {},
                setIsLoadings: {},
                setStatuses: {},
                setResponse(response, { cache } = { cache: true }) {
                    // Store the response, delete the status.
                    this.response = response;
                    delete this.status;
                    // Trigger response or aborted has been received event (if
                    // it wasn't triggered already).
                    this.event.set();
                    // Dispatch to all listeners.
                    for (const setResponse of Object.values(this.setResponses)) {
                        setResponse(response);
                    }
                    // Cache response if applicable.
                    if (cache && offlineCacheEnabled) {
                        reboot_api.assert(cacheKey !== null);
                        const cachedResponse = response.toJsonString();
                        reboot_web.offlineCache().set(cacheKey, cachedResponse)
                            .catch((error) => {
                            console.warn(`[Reboot] Setting of offline reader cache entry for 'Greeter.TryToConstructContext' errored with ${error}`);
                        });
                    }
                },
                setIsLoading(isLoading) {
                    for (const setIsLoading of Object.values(this.setIsLoadings)) {
                        setIsLoading(isLoading);
                    }
                },
                setStatus(status) {
                    // Store the status, delete the response.
                    this.status = status;
                    delete this.response;
                    // Trigger response or aborted has been received event (if
                    // it wasn't triggered already).
                    this.event.set();
                    for (const setStatus of Object.values(this.setStatuses)) {
                        setStatus(status);
                    }
                },
            };
            this.tryToConstructContextFinalizationRegistry.register(promise, () => {
                if (!reader.used) {
                    delete this.useTryToConstructContextReaders[requestBearerTokenHash];
                    reader.abortController.abort();
                }
            });
            // We want to remove the promise so that it can be garbage collected
            // which is our indication that React is no longer using it. But this
            // races with calls to `useTryToConstructContext(...)`
            // that might be adding their `setResponse`, `setIsLoading`, etc, so
            // we delay deleting the promise for at least a second.
            //
            // Note that deleting the promise is okay because all subsequent calls
            // will simply use the `reader.response` since it will no longer be
            // undefined.
            reader.promise.then(async () => {
                // Allow the call to `useTryToConstructContext(...)`
                // at least 5 seconds to indicate that the reader is being used,
                // afterwhich, once `reader.promise` gets garbage collected
                // we'll know that it must have been abandoned by React, e.g.,
                // because the component was suspended and never committed.
                await reboot_api.sleep({ ms: 5000 });
                delete reader.promise;
            });
            this.useTryToConstructContextReaders[requestBearerTokenHash] = reader;
            // Start fetching from the server.
            this.read("TryToConstructContext", serializedRequest, bearerToken, Empty, reader);
            // Check if there is a cached result if applicable.
            if (offlineCacheEnabled) {
                reboot_api.assert(cacheKey !== null);
                reboot_web.offlineCache().get(cacheKey).then((cachedResponse) => {
                    if (cachedResponse !== null) {
                        // We only want to set the response if we haven't already
                        // gotten a response from the server as it is the authority
                        // and should take precedence.
                        if (reader.response === undefined) {
                            reader.setResponse(Empty.fromJsonString(cachedResponse), { cache: false } // Don't re-cache the value!
                            );
                        }
                    }
                }).catch((error) => {
                    console.warn(`[Reboot] Retrieval of offline reader cache entry for 'Greeter.TryToConstructContext' errored with ${error}`);
                });
            }
        }
        reboot_api.assert(reader !== undefined);
        return reader;
    }
    useTryToConstructContext(id, requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey, setResponse, setIsLoading, setStatus) {
        // We need to call start here because with strict mode the
        // `useEffect` that calls this method will also call "unuse"
        // which will mean the next time the `useEffect` calls here
        // we'll create a new reader in start.
        const reader = this.startTryToConstructContext(requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey);
        reboot_api.assert(reader !== undefined);
        // Indicate that the reader has properly been used so that we don't
        // clean it up prematurely.
        reader.used = true;
        reader.setResponses[id] = setResponse;
        reader.setIsLoadings[id] = setIsLoading;
        reader.setStatuses[id] = setStatus;
        // If we already have a `response` or `status` need to set it.
        if (reader.response) {
            setResponse(reader.response);
            setIsLoading(false);
        }
        else if (reader.status) {
            setStatus(reader.status);
        }
    }
    unuseTryToConstructContext(id, requestBearerTokenHash) {
        const reader = this.useTryToConstructContextReaders[requestBearerTokenHash];
        reboot_api.assert(reader !== undefined);
        delete reader.setResponses[id];
        delete reader.setIsLoadings[id];
        delete reader.setStatuses[id];
        // Schedule a timeout to delete and abort this reader if we're the
        // last user. We need a timeout because, with StrictMode turned on,
        // we can't remove the reader right away otherwise we won't have a
        // stable Event and Promise. We use 3 seconds but may need to make
        // configurable depending on the application.
        if (Object.values(reader.setResponses).length === 0) {
            reader.scheduledUnusedTimeoutsCount += 1;
            setTimeout(() => {
                reader.scheduledUnusedTimeoutsCount -= 1;
                if (reader.scheduledUnusedTimeoutsCount === 0 &&
                    Object.values(reader.setResponses).length === 0) {
                    delete this.useTryToConstructContextReaders[requestBearerTokenHash];
                    reader.abortController.abort();
                }
            }, 3000);
        }
    }
    startTryToConstructExternalContext(requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey) {
        let reader = this.useTryToConstructExternalContextReaders[requestBearerTokenHash];
        if (reader === undefined) {
            const event = new reboot_api.Event();
            const promise = event.wait();
            reader = {
                abortController: new AbortController(),
                event,
                promise,
                used: false,
                scheduledUnusedTimeoutsCount: 0,
                setResponses: {},
                setIsLoadings: {},
                setStatuses: {},
                setResponse(response, { cache } = { cache: true }) {
                    // Store the response, delete the status.
                    this.response = response;
                    delete this.status;
                    // Trigger response or aborted has been received event (if
                    // it wasn't triggered already).
                    this.event.set();
                    // Dispatch to all listeners.
                    for (const setResponse of Object.values(this.setResponses)) {
                        setResponse(response);
                    }
                    // Cache response if applicable.
                    if (cache && offlineCacheEnabled) {
                        reboot_api.assert(cacheKey !== null);
                        const cachedResponse = response.toJsonString();
                        reboot_web.offlineCache().set(cacheKey, cachedResponse)
                            .catch((error) => {
                            console.warn(`[Reboot] Setting of offline reader cache entry for 'Greeter.TryToConstructExternalContext' errored with ${error}`);
                        });
                    }
                },
                setIsLoading(isLoading) {
                    for (const setIsLoading of Object.values(this.setIsLoadings)) {
                        setIsLoading(isLoading);
                    }
                },
                setStatus(status) {
                    // Store the status, delete the response.
                    this.status = status;
                    delete this.response;
                    // Trigger response or aborted has been received event (if
                    // it wasn't triggered already).
                    this.event.set();
                    for (const setStatus of Object.values(this.setStatuses)) {
                        setStatus(status);
                    }
                },
            };
            this.tryToConstructExternalContextFinalizationRegistry.register(promise, () => {
                if (!reader.used) {
                    delete this.useTryToConstructExternalContextReaders[requestBearerTokenHash];
                    reader.abortController.abort();
                }
            });
            // We want to remove the promise so that it can be garbage collected
            // which is our indication that React is no longer using it. But this
            // races with calls to `useTryToConstructExternalContext(...)`
            // that might be adding their `setResponse`, `setIsLoading`, etc, so
            // we delay deleting the promise for at least a second.
            //
            // Note that deleting the promise is okay because all subsequent calls
            // will simply use the `reader.response` since it will no longer be
            // undefined.
            reader.promise.then(async () => {
                // Allow the call to `useTryToConstructExternalContext(...)`
                // at least 5 seconds to indicate that the reader is being used,
                // afterwhich, once `reader.promise` gets garbage collected
                // we'll know that it must have been abandoned by React, e.g.,
                // because the component was suspended and never committed.
                await reboot_api.sleep({ ms: 5000 });
                delete reader.promise;
            });
            this.useTryToConstructExternalContextReaders[requestBearerTokenHash] = reader;
            // Start fetching from the server.
            this.read("TryToConstructExternalContext", serializedRequest, bearerToken, Empty, reader);
            // Check if there is a cached result if applicable.
            if (offlineCacheEnabled) {
                reboot_api.assert(cacheKey !== null);
                reboot_web.offlineCache().get(cacheKey).then((cachedResponse) => {
                    if (cachedResponse !== null) {
                        // We only want to set the response if we haven't already
                        // gotten a response from the server as it is the authority
                        // and should take precedence.
                        if (reader.response === undefined) {
                            reader.setResponse(Empty.fromJsonString(cachedResponse), { cache: false } // Don't re-cache the value!
                            );
                        }
                    }
                }).catch((error) => {
                    console.warn(`[Reboot] Retrieval of offline reader cache entry for 'Greeter.TryToConstructExternalContext' errored with ${error}`);
                });
            }
        }
        reboot_api.assert(reader !== undefined);
        return reader;
    }
    useTryToConstructExternalContext(id, requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey, setResponse, setIsLoading, setStatus) {
        // We need to call start here because with strict mode the
        // `useEffect` that calls this method will also call "unuse"
        // which will mean the next time the `useEffect` calls here
        // we'll create a new reader in start.
        const reader = this.startTryToConstructExternalContext(requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey);
        reboot_api.assert(reader !== undefined);
        // Indicate that the reader has properly been used so that we don't
        // clean it up prematurely.
        reader.used = true;
        reader.setResponses[id] = setResponse;
        reader.setIsLoadings[id] = setIsLoading;
        reader.setStatuses[id] = setStatus;
        // If we already have a `response` or `status` need to set it.
        if (reader.response) {
            setResponse(reader.response);
            setIsLoading(false);
        }
        else if (reader.status) {
            setStatus(reader.status);
        }
    }
    unuseTryToConstructExternalContext(id, requestBearerTokenHash) {
        const reader = this.useTryToConstructExternalContextReaders[requestBearerTokenHash];
        reboot_api.assert(reader !== undefined);
        delete reader.setResponses[id];
        delete reader.setIsLoadings[id];
        delete reader.setStatuses[id];
        // Schedule a timeout to delete and abort this reader if we're the
        // last user. We need a timeout because, with StrictMode turned on,
        // we can't remove the reader right away otherwise we won't have a
        // stable Event and Promise. We use 3 seconds but may need to make
        // configurable depending on the application.
        if (Object.values(reader.setResponses).length === 0) {
            reader.scheduledUnusedTimeoutsCount += 1;
            setTimeout(() => {
                reader.scheduledUnusedTimeoutsCount -= 1;
                if (reader.scheduledUnusedTimeoutsCount === 0 &&
                    Object.values(reader.setResponses).length === 0) {
                    delete this.useTryToConstructExternalContextReaders[requestBearerTokenHash];
                    reader.abortController.abort();
                }
            }, 3000);
        }
    }
    startTestLongRunningFetch(requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey) {
        let reader = this.useTestLongRunningFetchReaders[requestBearerTokenHash];
        if (reader === undefined) {
            const event = new reboot_api.Event();
            const promise = event.wait();
            reader = {
                abortController: new AbortController(),
                event,
                promise,
                used: false,
                scheduledUnusedTimeoutsCount: 0,
                setResponses: {},
                setIsLoadings: {},
                setStatuses: {},
                setResponse(response, { cache } = { cache: true }) {
                    // Store the response, delete the status.
                    this.response = response;
                    delete this.status;
                    // Trigger response or aborted has been received event (if
                    // it wasn't triggered already).
                    this.event.set();
                    // Dispatch to all listeners.
                    for (const setResponse of Object.values(this.setResponses)) {
                        setResponse(response);
                    }
                    // Cache response if applicable.
                    if (cache && offlineCacheEnabled) {
                        reboot_api.assert(cacheKey !== null);
                        const cachedResponse = response.toJsonString();
                        reboot_web.offlineCache().set(cacheKey, cachedResponse)
                            .catch((error) => {
                            console.warn(`[Reboot] Setting of offline reader cache entry for 'Greeter.TestLongRunningFetch' errored with ${error}`);
                        });
                    }
                },
                setIsLoading(isLoading) {
                    for (const setIsLoading of Object.values(this.setIsLoadings)) {
                        setIsLoading(isLoading);
                    }
                },
                setStatus(status) {
                    // Store the status, delete the response.
                    this.status = status;
                    delete this.response;
                    // Trigger response or aborted has been received event (if
                    // it wasn't triggered already).
                    this.event.set();
                    for (const setStatus of Object.values(this.setStatuses)) {
                        setStatus(status);
                    }
                },
            };
            this.testLongRunningFetchFinalizationRegistry.register(promise, () => {
                if (!reader.used) {
                    delete this.useTestLongRunningFetchReaders[requestBearerTokenHash];
                    reader.abortController.abort();
                }
            });
            // We want to remove the promise so that it can be garbage collected
            // which is our indication that React is no longer using it. But this
            // races with calls to `useTestLongRunningFetch(...)`
            // that might be adding their `setResponse`, `setIsLoading`, etc, so
            // we delay deleting the promise for at least a second.
            //
            // Note that deleting the promise is okay because all subsequent calls
            // will simply use the `reader.response` since it will no longer be
            // undefined.
            reader.promise.then(async () => {
                // Allow the call to `useTestLongRunningFetch(...)`
                // at least 5 seconds to indicate that the reader is being used,
                // afterwhich, once `reader.promise` gets garbage collected
                // we'll know that it must have been abandoned by React, e.g.,
                // because the component was suspended and never committed.
                await reboot_api.sleep({ ms: 5000 });
                delete reader.promise;
            });
            this.useTestLongRunningFetchReaders[requestBearerTokenHash] = reader;
            // Start fetching from the server.
            this.read("TestLongRunningFetch", serializedRequest, bearerToken, Empty, reader);
            // Check if there is a cached result if applicable.
            if (offlineCacheEnabled) {
                reboot_api.assert(cacheKey !== null);
                reboot_web.offlineCache().get(cacheKey).then((cachedResponse) => {
                    if (cachedResponse !== null) {
                        // We only want to set the response if we haven't already
                        // gotten a response from the server as it is the authority
                        // and should take precedence.
                        if (reader.response === undefined) {
                            reader.setResponse(Empty.fromJsonString(cachedResponse), { cache: false } // Don't re-cache the value!
                            );
                        }
                    }
                }).catch((error) => {
                    console.warn(`[Reboot] Retrieval of offline reader cache entry for 'Greeter.TestLongRunningFetch' errored with ${error}`);
                });
            }
        }
        reboot_api.assert(reader !== undefined);
        return reader;
    }
    useTestLongRunningFetch(id, requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey, setResponse, setIsLoading, setStatus) {
        // We need to call start here because with strict mode the
        // `useEffect` that calls this method will also call "unuse"
        // which will mean the next time the `useEffect` calls here
        // we'll create a new reader in start.
        const reader = this.startTestLongRunningFetch(requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey);
        reboot_api.assert(reader !== undefined);
        // Indicate that the reader has properly been used so that we don't
        // clean it up prematurely.
        reader.used = true;
        reader.setResponses[id] = setResponse;
        reader.setIsLoadings[id] = setIsLoading;
        reader.setStatuses[id] = setStatus;
        // If we already have a `response` or `status` need to set it.
        if (reader.response) {
            setResponse(reader.response);
            setIsLoading(false);
        }
        else if (reader.status) {
            setStatus(reader.status);
        }
    }
    unuseTestLongRunningFetch(id, requestBearerTokenHash) {
        const reader = this.useTestLongRunningFetchReaders[requestBearerTokenHash];
        reboot_api.assert(reader !== undefined);
        delete reader.setResponses[id];
        delete reader.setIsLoadings[id];
        delete reader.setStatuses[id];
        // Schedule a timeout to delete and abort this reader if we're the
        // last user. We need a timeout because, with StrictMode turned on,
        // we can't remove the reader right away otherwise we won't have a
        // stable Event and Promise. We use 3 seconds but may need to make
        // configurable depending on the application.
        if (Object.values(reader.setResponses).length === 0) {
            reader.scheduledUnusedTimeoutsCount += 1;
            setTimeout(() => {
                reader.scheduledUnusedTimeoutsCount -= 1;
                if (reader.scheduledUnusedTimeoutsCount === 0 &&
                    Object.values(reader.setResponses).length === 0) {
                    delete this.useTestLongRunningFetchReaders[requestBearerTokenHash];
                    reader.abortController.abort();
                }
            }, 3000);
        }
    }
    async testLongRunningWriter(mutation) {
        // We always have at least 1 observer which is this function!
        let remainingObservers = 1;
        const event = new reboot_api.Event();
        let callbacks = [];
        const observed = (callback) => {
            callbacks = callbacks.concat(callback);
            remainingObservers -= 1;
            if (remainingObservers === 0) {
                for (const callback of callbacks) {
                    callback();
                }
                event.set();
            }
            return event.wait();
        };
        const aborted = () => {
            observed(() => { });
        };
        // Tell observers about this pending mutation.
        for (const id in this.observers) {
            remainingObservers += 1;
            this.observers[id].observe(mutation.idempotencyKey, observed, aborted);
        }
        this.useTestLongRunningWriterMutations = this.useTestLongRunningWriterMutations.concat(mutation);
        for (const setPending of Object.values(this.useTestLongRunningWriterSetPendings)) {
            setPending(this.useTestLongRunningWriterMutations);
        }
        return new Promise(async (resolve, reject) => {
            const { responseOrStatus } = await this.mutate({
                method: "TestLongRunningWriter",
                request: mutation.request.toBinary(),
                idempotencyKey: mutation.idempotencyKey,
                bearerToken: mutation.bearerToken,
            }, ({ isLoading, error }) => {
                let rerender = false;
                for (const m of this.useTestLongRunningWriterMutations) {
                    if (m === mutation) {
                        if (m.isLoading !== isLoading) {
                            m.isLoading = isLoading;
                            rerender = true;
                        }
                        if (error !== undefined && m.error !== error) {
                            m.error = error;
                            rerender = true;
                        }
                    }
                }
                if (rerender) {
                    for (const setPending of Object.values(this.useTestLongRunningWriterSetPendings)) {
                        setPending(this.useTestLongRunningWriterMutations);
                    }
                }
            });
            const removeMutationsAndSetPending = () => {
                this.useTestLongRunningWriterMutations =
                    this.useTestLongRunningWriterMutations.filter(m => m !== mutation);
                for (const setPending of Object.values(this.useTestLongRunningWriterSetPendings)) {
                    setPending(this.useTestLongRunningWriterMutations);
                }
            };
            switch (responseOrStatus.case) {
                case "response": {
                    await observed(() => {
                        removeMutationsAndSetPending();
                        resolve({
                            response: GreeterTestLongRunningWriterResponseFromProtobufShape(Empty.fromBinary(responseOrStatus.value))
                        });
                    });
                    break;
                }
                case "status": {
                    // Let the observers know they no longer should expect to
                    // observe this idempotency key.
                    for (const id in this.observers) {
                        this.observers[id].unobserve(mutation.idempotencyKey);
                    }
                    const status = reboot_api.Status.fromJsonString(responseOrStatus.value);
                    const aborted = GreeterTestLongRunningWriterAborted.fromStatus(status);
                    console.warn(`[Reboot] 'Greeter.TestLongRunningWriter' aborted with ${aborted.message}`);
                    removeMutationsAndSetPending();
                    resolve({ aborted });
                    break;
                }
                default: {
                    // TODO(benh): while this is a _really_ fatal error,
                    // should we still set `aborted` instead of throwing?
                    reject(new Error('Expecting either a response or a status'));
                }
            }
        });
    }
    useTestLongRunningWriter(id, setPending) {
        this.useTestLongRunningWriterSetPendings[id] = setPending;
    }
    unuseTestLongRunningWriter(id) {
        delete this.useTestLongRunningWriterSetPendings[id];
    }
    startGetWholeState(requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey) {
        let reader = this.useGetWholeStateReaders[requestBearerTokenHash];
        if (reader === undefined) {
            const event = new reboot_api.Event();
            const promise = event.wait();
            reader = {
                abortController: new AbortController(),
                event,
                promise,
                used: false,
                scheduledUnusedTimeoutsCount: 0,
                setResponses: {},
                setIsLoadings: {},
                setStatuses: {},
                setResponse(response, { cache } = { cache: true }) {
                    // Store the response, delete the status.
                    this.response = response;
                    delete this.status;
                    // Trigger response or aborted has been received event (if
                    // it wasn't triggered already).
                    this.event.set();
                    // Dispatch to all listeners.
                    for (const setResponse of Object.values(this.setResponses)) {
                        setResponse(response);
                    }
                    // Cache response if applicable.
                    if (cache && offlineCacheEnabled) {
                        reboot_api.assert(cacheKey !== null);
                        const cachedResponse = response.toJsonString();
                        reboot_web.offlineCache().set(cacheKey, cachedResponse)
                            .catch((error) => {
                            console.warn(`[Reboot] Setting of offline reader cache entry for 'Greeter.GetWholeState' errored with ${error}`);
                        });
                    }
                },
                setIsLoading(isLoading) {
                    for (const setIsLoading of Object.values(this.setIsLoadings)) {
                        setIsLoading(isLoading);
                    }
                },
                setStatus(status) {
                    // Store the status, delete the response.
                    this.status = status;
                    delete this.response;
                    // Trigger response or aborted has been received event (if
                    // it wasn't triggered already).
                    this.event.set();
                    for (const setStatus of Object.values(this.setStatuses)) {
                        setStatus(status);
                    }
                },
            };
            this.getWholeStateFinalizationRegistry.register(promise, () => {
                if (!reader.used) {
                    delete this.useGetWholeStateReaders[requestBearerTokenHash];
                    reader.abortController.abort();
                }
            });
            // We want to remove the promise so that it can be garbage collected
            // which is our indication that React is no longer using it. But this
            // races with calls to `useGetWholeState(...)`
            // that might be adding their `setResponse`, `setIsLoading`, etc, so
            // we delay deleting the promise for at least a second.
            //
            // Note that deleting the promise is okay because all subsequent calls
            // will simply use the `reader.response` since it will no longer be
            // undefined.
            reader.promise.then(async () => {
                // Allow the call to `useGetWholeState(...)`
                // at least 5 seconds to indicate that the reader is being used,
                // afterwhich, once `reader.promise` gets garbage collected
                // we'll know that it must have been abandoned by React, e.g.,
                // because the component was suspended and never committed.
                await reboot_api.sleep({ ms: 5000 });
                delete reader.promise;
            });
            this.useGetWholeStateReaders[requestBearerTokenHash] = reader;
            // Start fetching from the server.
            this.read("GetWholeState", serializedRequest, bearerToken, GreeterProto, reader);
            // Check if there is a cached result if applicable.
            if (offlineCacheEnabled) {
                reboot_api.assert(cacheKey !== null);
                reboot_web.offlineCache().get(cacheKey).then((cachedResponse) => {
                    if (cachedResponse !== null) {
                        // We only want to set the response if we haven't already
                        // gotten a response from the server as it is the authority
                        // and should take precedence.
                        if (reader.response === undefined) {
                            reader.setResponse(GreeterProto.fromJsonString(cachedResponse), { cache: false } // Don't re-cache the value!
                            );
                        }
                    }
                }).catch((error) => {
                    console.warn(`[Reboot] Retrieval of offline reader cache entry for 'Greeter.GetWholeState' errored with ${error}`);
                });
            }
        }
        reboot_api.assert(reader !== undefined);
        return reader;
    }
    useGetWholeState(id, requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey, setResponse, setIsLoading, setStatus) {
        // We need to call start here because with strict mode the
        // `useEffect` that calls this method will also call "unuse"
        // which will mean the next time the `useEffect` calls here
        // we'll create a new reader in start.
        const reader = this.startGetWholeState(requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey);
        reboot_api.assert(reader !== undefined);
        // Indicate that the reader has properly been used so that we don't
        // clean it up prematurely.
        reader.used = true;
        reader.setResponses[id] = setResponse;
        reader.setIsLoadings[id] = setIsLoading;
        reader.setStatuses[id] = setStatus;
        // If we already have a `response` or `status` need to set it.
        if (reader.response) {
            setResponse(reader.response);
            setIsLoading(false);
        }
        else if (reader.status) {
            setStatus(reader.status);
        }
    }
    unuseGetWholeState(id, requestBearerTokenHash) {
        const reader = this.useGetWholeStateReaders[requestBearerTokenHash];
        reboot_api.assert(reader !== undefined);
        delete reader.setResponses[id];
        delete reader.setIsLoadings[id];
        delete reader.setStatuses[id];
        // Schedule a timeout to delete and abort this reader if we're the
        // last user. We need a timeout because, with StrictMode turned on,
        // we can't remove the reader right away otherwise we won't have a
        // stable Event and Promise. We use 3 seconds but may need to make
        // configurable depending on the application.
        if (Object.values(reader.setResponses).length === 0) {
            reader.scheduledUnusedTimeoutsCount += 1;
            setTimeout(() => {
                reader.scheduledUnusedTimeoutsCount -= 1;
                if (reader.scheduledUnusedTimeoutsCount === 0 &&
                    Object.values(reader.setResponses).length === 0) {
                    delete this.useGetWholeStateReaders[requestBearerTokenHash];
                    reader.abortController.abort();
                }
            }, 3000);
        }
    }
    startFailWithException(requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey) {
        let reader = this.useFailWithExceptionReaders[requestBearerTokenHash];
        if (reader === undefined) {
            const event = new reboot_api.Event();
            const promise = event.wait();
            reader = {
                abortController: new AbortController(),
                event,
                promise,
                used: false,
                scheduledUnusedTimeoutsCount: 0,
                setResponses: {},
                setIsLoadings: {},
                setStatuses: {},
                setResponse(response, { cache } = { cache: true }) {
                    // Store the response, delete the status.
                    this.response = response;
                    delete this.status;
                    // Trigger response or aborted has been received event (if
                    // it wasn't triggered already).
                    this.event.set();
                    // Dispatch to all listeners.
                    for (const setResponse of Object.values(this.setResponses)) {
                        setResponse(response);
                    }
                    // Cache response if applicable.
                    if (cache && offlineCacheEnabled) {
                        reboot_api.assert(cacheKey !== null);
                        const cachedResponse = response.toJsonString();
                        reboot_web.offlineCache().set(cacheKey, cachedResponse)
                            .catch((error) => {
                            console.warn(`[Reboot] Setting of offline reader cache entry for 'Greeter.FailWithException' errored with ${error}`);
                        });
                    }
                },
                setIsLoading(isLoading) {
                    for (const setIsLoading of Object.values(this.setIsLoadings)) {
                        setIsLoading(isLoading);
                    }
                },
                setStatus(status) {
                    // Store the status, delete the response.
                    this.status = status;
                    delete this.response;
                    // Trigger response or aborted has been received event (if
                    // it wasn't triggered already).
                    this.event.set();
                    for (const setStatus of Object.values(this.setStatuses)) {
                        setStatus(status);
                    }
                },
            };
            this.failWithExceptionFinalizationRegistry.register(promise, () => {
                if (!reader.used) {
                    delete this.useFailWithExceptionReaders[requestBearerTokenHash];
                    reader.abortController.abort();
                }
            });
            // We want to remove the promise so that it can be garbage collected
            // which is our indication that React is no longer using it. But this
            // races with calls to `useFailWithException(...)`
            // that might be adding their `setResponse`, `setIsLoading`, etc, so
            // we delay deleting the promise for at least a second.
            //
            // Note that deleting the promise is okay because all subsequent calls
            // will simply use the `reader.response` since it will no longer be
            // undefined.
            reader.promise.then(async () => {
                // Allow the call to `useFailWithException(...)`
                // at least 5 seconds to indicate that the reader is being used,
                // afterwhich, once `reader.promise` gets garbage collected
                // we'll know that it must have been abandoned by React, e.g.,
                // because the component was suspended and never committed.
                await reboot_api.sleep({ ms: 5000 });
                delete reader.promise;
            });
            this.useFailWithExceptionReaders[requestBearerTokenHash] = reader;
            // Start fetching from the server.
            this.read("FailWithException", serializedRequest, bearerToken, Empty, reader);
            // Check if there is a cached result if applicable.
            if (offlineCacheEnabled) {
                reboot_api.assert(cacheKey !== null);
                reboot_web.offlineCache().get(cacheKey).then((cachedResponse) => {
                    if (cachedResponse !== null) {
                        // We only want to set the response if we haven't already
                        // gotten a response from the server as it is the authority
                        // and should take precedence.
                        if (reader.response === undefined) {
                            reader.setResponse(Empty.fromJsonString(cachedResponse), { cache: false } // Don't re-cache the value!
                            );
                        }
                    }
                }).catch((error) => {
                    console.warn(`[Reboot] Retrieval of offline reader cache entry for 'Greeter.FailWithException' errored with ${error}`);
                });
            }
        }
        reboot_api.assert(reader !== undefined);
        return reader;
    }
    useFailWithException(id, requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey, setResponse, setIsLoading, setStatus) {
        // We need to call start here because with strict mode the
        // `useEffect` that calls this method will also call "unuse"
        // which will mean the next time the `useEffect` calls here
        // we'll create a new reader in start.
        const reader = this.startFailWithException(requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey);
        reboot_api.assert(reader !== undefined);
        // Indicate that the reader has properly been used so that we don't
        // clean it up prematurely.
        reader.used = true;
        reader.setResponses[id] = setResponse;
        reader.setIsLoadings[id] = setIsLoading;
        reader.setStatuses[id] = setStatus;
        // If we already have a `response` or `status` need to set it.
        if (reader.response) {
            setResponse(reader.response);
            setIsLoading(false);
        }
        else if (reader.status) {
            setStatus(reader.status);
        }
    }
    unuseFailWithException(id, requestBearerTokenHash) {
        const reader = this.useFailWithExceptionReaders[requestBearerTokenHash];
        reboot_api.assert(reader !== undefined);
        delete reader.setResponses[id];
        delete reader.setIsLoadings[id];
        delete reader.setStatuses[id];
        // Schedule a timeout to delete and abort this reader if we're the
        // last user. We need a timeout because, with StrictMode turned on,
        // we can't remove the reader right away otherwise we won't have a
        // stable Event and Promise. We use 3 seconds but may need to make
        // configurable depending on the application.
        if (Object.values(reader.setResponses).length === 0) {
            reader.scheduledUnusedTimeoutsCount += 1;
            setTimeout(() => {
                reader.scheduledUnusedTimeoutsCount -= 1;
                if (reader.scheduledUnusedTimeoutsCount === 0 &&
                    Object.values(reader.setResponses).length === 0) {
                    delete this.useFailWithExceptionReaders[requestBearerTokenHash];
                    reader.abortController.abort();
                }
            }, 3000);
        }
    }
    startFailWithAborted(requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey) {
        let reader = this.useFailWithAbortedReaders[requestBearerTokenHash];
        if (reader === undefined) {
            const event = new reboot_api.Event();
            const promise = event.wait();
            reader = {
                abortController: new AbortController(),
                event,
                promise,
                used: false,
                scheduledUnusedTimeoutsCount: 0,
                setResponses: {},
                setIsLoadings: {},
                setStatuses: {},
                setResponse(response, { cache } = { cache: true }) {
                    // Store the response, delete the status.
                    this.response = response;
                    delete this.status;
                    // Trigger response or aborted has been received event (if
                    // it wasn't triggered already).
                    this.event.set();
                    // Dispatch to all listeners.
                    for (const setResponse of Object.values(this.setResponses)) {
                        setResponse(response);
                    }
                    // Cache response if applicable.
                    if (cache && offlineCacheEnabled) {
                        reboot_api.assert(cacheKey !== null);
                        const cachedResponse = response.toJsonString();
                        reboot_web.offlineCache().set(cacheKey, cachedResponse)
                            .catch((error) => {
                            console.warn(`[Reboot] Setting of offline reader cache entry for 'Greeter.FailWithAborted' errored with ${error}`);
                        });
                    }
                },
                setIsLoading(isLoading) {
                    for (const setIsLoading of Object.values(this.setIsLoadings)) {
                        setIsLoading(isLoading);
                    }
                },
                setStatus(status) {
                    // Store the status, delete the response.
                    this.status = status;
                    delete this.response;
                    // Trigger response or aborted has been received event (if
                    // it wasn't triggered already).
                    this.event.set();
                    for (const setStatus of Object.values(this.setStatuses)) {
                        setStatus(status);
                    }
                },
            };
            this.failWithAbortedFinalizationRegistry.register(promise, () => {
                if (!reader.used) {
                    delete this.useFailWithAbortedReaders[requestBearerTokenHash];
                    reader.abortController.abort();
                }
            });
            // We want to remove the promise so that it can be garbage collected
            // which is our indication that React is no longer using it. But this
            // races with calls to `useFailWithAborted(...)`
            // that might be adding their `setResponse`, `setIsLoading`, etc, so
            // we delay deleting the promise for at least a second.
            //
            // Note that deleting the promise is okay because all subsequent calls
            // will simply use the `reader.response` since it will no longer be
            // undefined.
            reader.promise.then(async () => {
                // Allow the call to `useFailWithAborted(...)`
                // at least 5 seconds to indicate that the reader is being used,
                // afterwhich, once `reader.promise` gets garbage collected
                // we'll know that it must have been abandoned by React, e.g.,
                // because the component was suspended and never committed.
                await reboot_api.sleep({ ms: 5000 });
                delete reader.promise;
            });
            this.useFailWithAbortedReaders[requestBearerTokenHash] = reader;
            // Start fetching from the server.
            this.read("FailWithAborted", serializedRequest, bearerToken, Empty, reader);
            // Check if there is a cached result if applicable.
            if (offlineCacheEnabled) {
                reboot_api.assert(cacheKey !== null);
                reboot_web.offlineCache().get(cacheKey).then((cachedResponse) => {
                    if (cachedResponse !== null) {
                        // We only want to set the response if we haven't already
                        // gotten a response from the server as it is the authority
                        // and should take precedence.
                        if (reader.response === undefined) {
                            reader.setResponse(Empty.fromJsonString(cachedResponse), { cache: false } // Don't re-cache the value!
                            );
                        }
                    }
                }).catch((error) => {
                    console.warn(`[Reboot] Retrieval of offline reader cache entry for 'Greeter.FailWithAborted' errored with ${error}`);
                });
            }
        }
        reboot_api.assert(reader !== undefined);
        return reader;
    }
    useFailWithAborted(id, requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey, setResponse, setIsLoading, setStatus) {
        // We need to call start here because with strict mode the
        // `useEffect` that calls this method will also call "unuse"
        // which will mean the next time the `useEffect` calls here
        // we'll create a new reader in start.
        const reader = this.startFailWithAborted(requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey);
        reboot_api.assert(reader !== undefined);
        // Indicate that the reader has properly been used so that we don't
        // clean it up prematurely.
        reader.used = true;
        reader.setResponses[id] = setResponse;
        reader.setIsLoadings[id] = setIsLoading;
        reader.setStatuses[id] = setStatus;
        // If we already have a `response` or `status` need to set it.
        if (reader.response) {
            setResponse(reader.response);
            setIsLoading(false);
        }
        else if (reader.status) {
            setStatus(reader.status);
        }
    }
    unuseFailWithAborted(id, requestBearerTokenHash) {
        const reader = this.useFailWithAbortedReaders[requestBearerTokenHash];
        reboot_api.assert(reader !== undefined);
        delete reader.setResponses[id];
        delete reader.setIsLoadings[id];
        delete reader.setStatuses[id];
        // Schedule a timeout to delete and abort this reader if we're the
        // last user. We need a timeout because, with StrictMode turned on,
        // we can't remove the reader right away otherwise we won't have a
        // stable Event and Promise. We use 3 seconds but may need to make
        // configurable depending on the application.
        if (Object.values(reader.setResponses).length === 0) {
            reader.scheduledUnusedTimeoutsCount += 1;
            setTimeout(() => {
                reader.scheduledUnusedTimeoutsCount -= 1;
                if (reader.scheduledUnusedTimeoutsCount === 0 &&
                    Object.values(reader.setResponses).length === 0) {
                    delete this.useFailWithAbortedReaders[requestBearerTokenHash];
                    reader.abortController.abort();
                }
            }, 3000);
        }
    }
    async dangerousFields(mutation) {
        // We always have at least 1 observer which is this function!
        let remainingObservers = 1;
        const event = new reboot_api.Event();
        let callbacks = [];
        const observed = (callback) => {
            callbacks = callbacks.concat(callback);
            remainingObservers -= 1;
            if (remainingObservers === 0) {
                for (const callback of callbacks) {
                    callback();
                }
                event.set();
            }
            return event.wait();
        };
        const aborted = () => {
            observed(() => { });
        };
        // Tell observers about this pending mutation.
        for (const id in this.observers) {
            remainingObservers += 1;
            this.observers[id].observe(mutation.idempotencyKey, observed, aborted);
        }
        this.useDangerousFieldsMutations = this.useDangerousFieldsMutations.concat(mutation);
        for (const setPending of Object.values(this.useDangerousFieldsSetPendings)) {
            setPending(this.useDangerousFieldsMutations);
        }
        return new Promise(async (resolve, reject) => {
            const { responseOrStatus } = await this.mutate({
                method: "DangerousFields",
                request: mutation.request.toBinary(),
                idempotencyKey: mutation.idempotencyKey,
                bearerToken: mutation.bearerToken,
            }, ({ isLoading, error }) => {
                let rerender = false;
                for (const m of this.useDangerousFieldsMutations) {
                    if (m === mutation) {
                        if (m.isLoading !== isLoading) {
                            m.isLoading = isLoading;
                            rerender = true;
                        }
                        if (error !== undefined && m.error !== error) {
                            m.error = error;
                            rerender = true;
                        }
                    }
                }
                if (rerender) {
                    for (const setPending of Object.values(this.useDangerousFieldsSetPendings)) {
                        setPending(this.useDangerousFieldsMutations);
                    }
                }
            });
            const removeMutationsAndSetPending = () => {
                this.useDangerousFieldsMutations =
                    this.useDangerousFieldsMutations.filter(m => m !== mutation);
                for (const setPending of Object.values(this.useDangerousFieldsSetPendings)) {
                    setPending(this.useDangerousFieldsMutations);
                }
            };
            switch (responseOrStatus.case) {
                case "response": {
                    await observed(() => {
                        removeMutationsAndSetPending();
                        resolve({
                            response: GreeterDangerousFieldsResponseFromProtobufShape(Empty.fromBinary(responseOrStatus.value))
                        });
                    });
                    break;
                }
                case "status": {
                    // Let the observers know they no longer should expect to
                    // observe this idempotency key.
                    for (const id in this.observers) {
                        this.observers[id].unobserve(mutation.idempotencyKey);
                    }
                    const status = reboot_api.Status.fromJsonString(responseOrStatus.value);
                    const aborted = GreeterDangerousFieldsAborted.fromStatus(status);
                    console.warn(`[Reboot] 'Greeter.DangerousFields' aborted with ${aborted.message}`);
                    removeMutationsAndSetPending();
                    resolve({ aborted });
                    break;
                }
                default: {
                    // TODO(benh): while this is a _really_ fatal error,
                    // should we still set `aborted` instead of throwing?
                    reject(new Error('Expecting either a response or a status'));
                }
            }
        });
    }
    useDangerousFields(id, setPending) {
        this.useDangerousFieldsSetPendings[id] = setPending;
    }
    unuseDangerousFields(id) {
        delete this.useDangerousFieldsSetPendings[id];
    }
    async storeRecursiveMessage(mutation) {
        // We always have at least 1 observer which is this function!
        let remainingObservers = 1;
        const event = new reboot_api.Event();
        let callbacks = [];
        const observed = (callback) => {
            callbacks = callbacks.concat(callback);
            remainingObservers -= 1;
            if (remainingObservers === 0) {
                for (const callback of callbacks) {
                    callback();
                }
                event.set();
            }
            return event.wait();
        };
        const aborted = () => {
            observed(() => { });
        };
        // Tell observers about this pending mutation.
        for (const id in this.observers) {
            remainingObservers += 1;
            this.observers[id].observe(mutation.idempotencyKey, observed, aborted);
        }
        this.useStoreRecursiveMessageMutations = this.useStoreRecursiveMessageMutations.concat(mutation);
        for (const setPending of Object.values(this.useStoreRecursiveMessageSetPendings)) {
            setPending(this.useStoreRecursiveMessageMutations);
        }
        return new Promise(async (resolve, reject) => {
            const { responseOrStatus } = await this.mutate({
                method: "StoreRecursiveMessage",
                request: mutation.request.toBinary(),
                idempotencyKey: mutation.idempotencyKey,
                bearerToken: mutation.bearerToken,
            }, ({ isLoading, error }) => {
                let rerender = false;
                for (const m of this.useStoreRecursiveMessageMutations) {
                    if (m === mutation) {
                        if (m.isLoading !== isLoading) {
                            m.isLoading = isLoading;
                            rerender = true;
                        }
                        if (error !== undefined && m.error !== error) {
                            m.error = error;
                            rerender = true;
                        }
                    }
                }
                if (rerender) {
                    for (const setPending of Object.values(this.useStoreRecursiveMessageSetPendings)) {
                        setPending(this.useStoreRecursiveMessageMutations);
                    }
                }
            });
            const removeMutationsAndSetPending = () => {
                this.useStoreRecursiveMessageMutations =
                    this.useStoreRecursiveMessageMutations.filter(m => m !== mutation);
                for (const setPending of Object.values(this.useStoreRecursiveMessageSetPendings)) {
                    setPending(this.useStoreRecursiveMessageMutations);
                }
            };
            switch (responseOrStatus.case) {
                case "response": {
                    await observed(() => {
                        removeMutationsAndSetPending();
                        resolve({
                            response: GreeterStoreRecursiveMessageResponseFromProtobufShape(greeter_pb.StoreRecursiveMessageResponse.fromBinary(responseOrStatus.value))
                        });
                    });
                    break;
                }
                case "status": {
                    // Let the observers know they no longer should expect to
                    // observe this idempotency key.
                    for (const id in this.observers) {
                        this.observers[id].unobserve(mutation.idempotencyKey);
                    }
                    const status = reboot_api.Status.fromJsonString(responseOrStatus.value);
                    const aborted = GreeterStoreRecursiveMessageAborted.fromStatus(status);
                    console.warn(`[Reboot] 'Greeter.StoreRecursiveMessage' aborted with ${aborted.message}`);
                    removeMutationsAndSetPending();
                    resolve({ aborted });
                    break;
                }
                default: {
                    // TODO(benh): while this is a _really_ fatal error,
                    // should we still set `aborted` instead of throwing?
                    reject(new Error('Expecting either a response or a status'));
                }
            }
        });
    }
    useStoreRecursiveMessage(id, setPending) {
        this.useStoreRecursiveMessageSetPendings[id] = setPending;
    }
    unuseStoreRecursiveMessage(id) {
        delete this.useStoreRecursiveMessageSetPendings[id];
    }
    startReadRecursiveMessage(requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey) {
        let reader = this.useReadRecursiveMessageReaders[requestBearerTokenHash];
        if (reader === undefined) {
            const event = new reboot_api.Event();
            const promise = event.wait();
            reader = {
                abortController: new AbortController(),
                event,
                promise,
                used: false,
                scheduledUnusedTimeoutsCount: 0,
                setResponses: {},
                setIsLoadings: {},
                setStatuses: {},
                setResponse(response, { cache } = { cache: true }) {
                    // Store the response, delete the status.
                    this.response = response;
                    delete this.status;
                    // Trigger response or aborted has been received event (if
                    // it wasn't triggered already).
                    this.event.set();
                    // Dispatch to all listeners.
                    for (const setResponse of Object.values(this.setResponses)) {
                        setResponse(response);
                    }
                    // Cache response if applicable.
                    if (cache && offlineCacheEnabled) {
                        reboot_api.assert(cacheKey !== null);
                        const cachedResponse = response.toJsonString();
                        reboot_web.offlineCache().set(cacheKey, cachedResponse)
                            .catch((error) => {
                            console.warn(`[Reboot] Setting of offline reader cache entry for 'Greeter.ReadRecursiveMessage' errored with ${error}`);
                        });
                    }
                },
                setIsLoading(isLoading) {
                    for (const setIsLoading of Object.values(this.setIsLoadings)) {
                        setIsLoading(isLoading);
                    }
                },
                setStatus(status) {
                    // Store the status, delete the response.
                    this.status = status;
                    delete this.response;
                    // Trigger response or aborted has been received event (if
                    // it wasn't triggered already).
                    this.event.set();
                    for (const setStatus of Object.values(this.setStatuses)) {
                        setStatus(status);
                    }
                },
            };
            this.readRecursiveMessageFinalizationRegistry.register(promise, () => {
                if (!reader.used) {
                    delete this.useReadRecursiveMessageReaders[requestBearerTokenHash];
                    reader.abortController.abort();
                }
            });
            // We want to remove the promise so that it can be garbage collected
            // which is our indication that React is no longer using it. But this
            // races with calls to `useReadRecursiveMessage(...)`
            // that might be adding their `setResponse`, `setIsLoading`, etc, so
            // we delay deleting the promise for at least a second.
            //
            // Note that deleting the promise is okay because all subsequent calls
            // will simply use the `reader.response` since it will no longer be
            // undefined.
            reader.promise.then(async () => {
                // Allow the call to `useReadRecursiveMessage(...)`
                // at least 5 seconds to indicate that the reader is being used,
                // afterwhich, once `reader.promise` gets garbage collected
                // we'll know that it must have been abandoned by React, e.g.,
                // because the component was suspended and never committed.
                await reboot_api.sleep({ ms: 5000 });
                delete reader.promise;
            });
            this.useReadRecursiveMessageReaders[requestBearerTokenHash] = reader;
            // Start fetching from the server.
            this.read("ReadRecursiveMessage", serializedRequest, bearerToken, greeter_pb.ReadRecursiveMessageResponse, reader);
            // Check if there is a cached result if applicable.
            if (offlineCacheEnabled) {
                reboot_api.assert(cacheKey !== null);
                reboot_web.offlineCache().get(cacheKey).then((cachedResponse) => {
                    if (cachedResponse !== null) {
                        // We only want to set the response if we haven't already
                        // gotten a response from the server as it is the authority
                        // and should take precedence.
                        if (reader.response === undefined) {
                            reader.setResponse(greeter_pb.ReadRecursiveMessageResponse.fromJsonString(cachedResponse), { cache: false } // Don't re-cache the value!
                            );
                        }
                    }
                }).catch((error) => {
                    console.warn(`[Reboot] Retrieval of offline reader cache entry for 'Greeter.ReadRecursiveMessage' errored with ${error}`);
                });
            }
        }
        reboot_api.assert(reader !== undefined);
        return reader;
    }
    useReadRecursiveMessage(id, requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey, setResponse, setIsLoading, setStatus) {
        // We need to call start here because with strict mode the
        // `useEffect` that calls this method will also call "unuse"
        // which will mean the next time the `useEffect` calls here
        // we'll create a new reader in start.
        const reader = this.startReadRecursiveMessage(requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey);
        reboot_api.assert(reader !== undefined);
        // Indicate that the reader has properly been used so that we don't
        // clean it up prematurely.
        reader.used = true;
        reader.setResponses[id] = setResponse;
        reader.setIsLoadings[id] = setIsLoading;
        reader.setStatuses[id] = setStatus;
        // If we already have a `response` or `status` need to set it.
        if (reader.response) {
            setResponse(reader.response);
            setIsLoading(false);
        }
        else if (reader.status) {
            setStatus(reader.status);
        }
    }
    unuseReadRecursiveMessage(id, requestBearerTokenHash) {
        const reader = this.useReadRecursiveMessageReaders[requestBearerTokenHash];
        reboot_api.assert(reader !== undefined);
        delete reader.setResponses[id];
        delete reader.setIsLoadings[id];
        delete reader.setStatuses[id];
        // Schedule a timeout to delete and abort this reader if we're the
        // last user. We need a timeout because, with StrictMode turned on,
        // we can't remove the reader right away otherwise we won't have a
        // stable Event and Promise. We use 3 seconds but may need to make
        // configurable depending on the application.
        if (Object.values(reader.setResponses).length === 0) {
            reader.scheduledUnusedTimeoutsCount += 1;
            setTimeout(() => {
                reader.scheduledUnusedTimeoutsCount -= 1;
                if (reader.scheduledUnusedTimeoutsCount === 0 &&
                    Object.values(reader.setResponses).length === 0) {
                    delete this.useReadRecursiveMessageReaders[requestBearerTokenHash];
                    reader.abortController.abort();
                }
            }, 3000);
        }
    }
    async constructAndStoreRecursiveMessage(mutation) {
        // We always have at least 1 observer which is this function!
        let remainingObservers = 1;
        const event = new reboot_api.Event();
        let callbacks = [];
        const observed = (callback) => {
            callbacks = callbacks.concat(callback);
            remainingObservers -= 1;
            if (remainingObservers === 0) {
                for (const callback of callbacks) {
                    callback();
                }
                event.set();
            }
            return event.wait();
        };
        const aborted = () => {
            observed(() => { });
        };
        // Tell observers about this pending mutation.
        for (const id in this.observers) {
            remainingObservers += 1;
            this.observers[id].observe(mutation.idempotencyKey, observed, aborted);
        }
        this.useConstructAndStoreRecursiveMessageMutations = this.useConstructAndStoreRecursiveMessageMutations.concat(mutation);
        for (const setPending of Object.values(this.useConstructAndStoreRecursiveMessageSetPendings)) {
            setPending(this.useConstructAndStoreRecursiveMessageMutations);
        }
        return new Promise(async (resolve, reject) => {
            const { responseOrStatus } = await this.mutate({
                method: "ConstructAndStoreRecursiveMessage",
                request: mutation.request.toBinary(),
                idempotencyKey: mutation.idempotencyKey,
                bearerToken: mutation.bearerToken,
            }, ({ isLoading, error }) => {
                let rerender = false;
                for (const m of this.useConstructAndStoreRecursiveMessageMutations) {
                    if (m === mutation) {
                        if (m.isLoading !== isLoading) {
                            m.isLoading = isLoading;
                            rerender = true;
                        }
                        if (error !== undefined && m.error !== error) {
                            m.error = error;
                            rerender = true;
                        }
                    }
                }
                if (rerender) {
                    for (const setPending of Object.values(this.useConstructAndStoreRecursiveMessageSetPendings)) {
                        setPending(this.useConstructAndStoreRecursiveMessageMutations);
                    }
                }
            });
            const removeMutationsAndSetPending = () => {
                this.useConstructAndStoreRecursiveMessageMutations =
                    this.useConstructAndStoreRecursiveMessageMutations.filter(m => m !== mutation);
                for (const setPending of Object.values(this.useConstructAndStoreRecursiveMessageSetPendings)) {
                    setPending(this.useConstructAndStoreRecursiveMessageMutations);
                }
            };
            switch (responseOrStatus.case) {
                case "response": {
                    await observed(() => {
                        removeMutationsAndSetPending();
                        resolve({
                            response: GreeterConstructAndStoreRecursiveMessageResponseFromProtobufShape(greeter_pb.ConstructAndStoreRecursiveMessageResponse.fromBinary(responseOrStatus.value))
                        });
                    });
                    break;
                }
                case "status": {
                    // Let the observers know they no longer should expect to
                    // observe this idempotency key.
                    for (const id in this.observers) {
                        this.observers[id].unobserve(mutation.idempotencyKey);
                    }
                    const status = reboot_api.Status.fromJsonString(responseOrStatus.value);
                    const aborted = GreeterConstructAndStoreRecursiveMessageAborted.fromStatus(status);
                    console.warn(`[Reboot] 'Greeter.ConstructAndStoreRecursiveMessage' aborted with ${aborted.message}`);
                    removeMutationsAndSetPending();
                    resolve({ aborted });
                    break;
                }
                default: {
                    // TODO(benh): while this is a _really_ fatal error,
                    // should we still set `aborted` instead of throwing?
                    reject(new Error('Expecting either a response or a status'));
                }
            }
        });
    }
    useConstructAndStoreRecursiveMessage(id, setPending) {
        this.useConstructAndStoreRecursiveMessageSetPendings[id] = setPending;
    }
    unuseConstructAndStoreRecursiveMessage(id) {
        delete this.useConstructAndStoreRecursiveMessageSetPendings[id];
    }
    static use(id, stateRef, url) {
        if (!(id in this.instances)) {
            this.instances[id] = new GreeterInstance(id, stateRef, url);
        }
        else {
            this.instances[id].ref();
        }
        return this.instances[id];
    }
    unuse() {
        if (this.unref() === 0) {
            delete GreeterInstance.instances[this.id];
        }
    }
}
GreeterInstance.instances = {};
export const useGreeter = ({ id }) => {
    const stateRef = reboot_api.stateIdToRef("tests.reboot.Greeter", id);
    const rebootClient = reboot_react.useRebootClient();
    const url = rebootClient.url;
    const bearerToken = rebootClient.bearerToken;
    const [instance, setInstance] = useState(() => {
        return GreeterInstance.use(id, stateRef, url);
    });
    if (instance.id !== id) {
        setInstance(GreeterInstance.use(id, stateRef, url));
    }
    useEffect(() => {
        return () => {
            instance.unuse();
        };
    }, [instance]);
    const headers = useMemo(() => {
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        headers.append("Connection", "keep-alive");
        if (bearerToken !== undefined) {
            headers.append("Authorization", `Bearer ${bearerToken}`);
        }
        return headers;
    }, [bearerToken]);
    function useCreate() {
        const [pending, setPending] = useState([]);
        useEffect(() => {
            const id = uuidv4();
            instance.useCreate(id, setPending);
            return () => {
                instance.unuseCreate(id);
            };
        }, []);
        const rebootClient = reboot_react.useRebootClient();
        const bearerToken = rebootClient.bearerToken;
        const create = useMemo(() => {
            const method = async (partialRequest = {}, options) => {
                var _a, _b;
                const request = GreeterCreateRequestToProtobuf(partialRequest);
                const idempotencyKey = (_b = (_a = options === null || options === void 0 ? void 0 : options.idempotencyKey) !== null && _a !== void 0 ? _a : options === null || options === void 0 ? void 0 : options.key) !== null && _b !== void 0 ? _b : reboot_web.makeExpiringIdempotencyKey();
                const mutation = {
                    request,
                    idempotencyKey,
                    bearerToken,
                    metadata: options === null || options === void 0 ? void 0 : options.metadata,
                    isLoading: false, // Won't start loading if we're flushing mutations.
                };
                return instance.create(mutation);
            };
            method.pending =
                new Array();
            return method;
        }, [instance, bearerToken]);
        create.pending = pending;
        return create;
    }
    const create = useCreate();
    function useGreet(partialRequest = {}, options = { suspense: false }) {
        const newRequest = GreeterGreetRequestToProtobuf(partialRequest);
        const [request, setRequest] = useState(newRequest);
        const [isLoading, setIsLoading] = useState(true);
        const rebootClient = reboot_react.useRebootClient();
        const bearerToken = rebootClient.bearerToken;
        const serializedRequest = useMemo(() => request.toBinary(), [request]);
        // To distinguish this call from others when caching responses on
        // the client we compute a "request hash" using SHA256 from the
        // `request`.
        // We memoize this so we don't do it every time.
        const requestHash = useMemo(() => {
            const hash = reboot_web.calcSha256();
            hash.add(serializedRequest);
            return hash.digest().hex();
        }, [serializedRequest]);
        // To create a map of unused readers globally on the client, we
        // compute a "request hash" using SHA256 from the `request`
        // including the bearerToken.
        // We memoize this so we don't do it every time.
        const requestBearerTokenHash = useMemo(() => {
            const hash = reboot_web.calcSha256();
            hash.add(serializedRequest);
            if (bearerToken) {
                hash.add(bearerToken);
            }
            return hash.digest().hex();
        }, [serializedRequest, bearerToken]);
        const offlineCacheEnabled = rebootClient.offlineCacheEnabled;
        const cacheKey = useMemo(() => {
            if (offlineCacheEnabled) {
                return `${stateRef}:Greet:${requestHash}`;
            }
            return null;
        }, [stateRef, offlineCacheEnabled, requestHash]);
        // We start reading here, or if another component already started
        // the reading then we just get back the reader. We need to do this
        // before setting up our `useState`s because when using suspense
        // we need to use the `reader.response` or `reader.status` during
        // render where one of them will be defined, i.e., after we've
        // waited for `reader.promise` via `React.use()`.
        const reader = instance.startGreet(requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey);
        const [response, setResponse] = useState(reader.response && GreeterGreetResponseFromProtobufShape(reader.response));
        const [aborted, setAborted] = useState(reader.status && GreeterGreetAborted.fromStatus(reader.status));
        useEffect(() => {
            const id = uuidv4();
            instance.useGreet(id, requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey, (response) => {
                setAborted(undefined);
                setResponse(GreeterGreetResponseFromProtobufShape(response));
            }, setIsLoading, (status) => {
                const aborted = GreeterGreetAborted.fromStatus(status);
                console.warn(`[Reboot] 'Greeter.Greet' aborted with ${aborted.message}`);
                setAborted(aborted);
                setResponse(undefined);
            });
            return () => {
                instance.unuseGreet(id, requestBearerTokenHash);
            };
        }, [
            instance,
            serializedRequest,
            requestBearerTokenHash,
            bearerToken,
            offlineCacheEnabled,
            cacheKey,
        ]);
        // If the user has requested suspense via `options.suspense` then
        // we need to use `useMemo` to create a stable promise to pass
        // to `React.use()`. This is important for two reasons:
        //
        // 1. `reader.promise` gets deleted after 5 seconds to
        //    allow GC-based detection of abandoned readers (via
        //    `FinalizationRegistry`), so we can't pass it directly
        //    on every render.
        //
        // 2. `React.use()` suspends at least once for each new
        //    promise it sees (to call `.then()`), so we must
        //    return the same promise across re-renders for a given
        //    reader.
        //
        // When suspense is not requested, or the reader's event is
        // already set (i.e., we have a response or aborted status),
        // we return a pre-resolved promise. Note that `React.use()`
        // will suspend at least once even for a pre-resolved promise
        // in order to set internal state on it, but on subsequent
        // renders it will recognize the same promise and return
        // without suspending.
        const suspensePromise = useMemo(() => {
            if (!options.suspense || reader.event.isSet()) {
                return Promise.resolve();
            }
            reboot_api.assert(reader.promise !== undefined);
            return reader.promise.then(() => { });
        }, [reader, options.suspense]);
        if (options.suspense) {
            if (!("use" in React)) {
                // Raise if it doesn't look like we are using React>=19.
                const error = "In order to pass `suspense: true` to a Reboot reactive reader you must be using React>=19 which provides `React.use`";
                console.error(error);
                throw new Error(error);
            }
            React.use(suspensePromise);
        }
        if (!request.equals(newRequest)) {
            setRequest(newRequest);
            setIsLoading(true);
            return { response, isLoading: true, aborted };
        }
        return { response, isLoading, aborted };
    }
    async function greet(partialRequest = {}, options) {
        let retry = true;
        if (options !== undefined && options.retry !== undefined) {
            retry = options.retry;
        }
        const request = GreeterGreetRequestToProtobuf(partialRequest);
        // Fetch with retry, using a backoff, i.e., if we get disconnected.
        const { response, aborted } = await (async () => {
            var _a;
            const backoff = new reboot_api.Backoff();
            while (true) {
                try {
                    // Invariant here is that we use the '/package.service.method' path and
                    // HTTP 'POST' method (we need 'POST' because we send an HTTP body).
                    //
                    // See also 'reboot/helpers.py'.
                    return {
                        response: await reboot_web.guardedFetch(new Request(`${rebootClient.url}/__/reboot/rpc/${stateRef}/tests.reboot.GreeterMethods/Greet`, {
                            method: "POST",
                            headers,
                            body: request.toJsonString()
                        }), options)
                    };
                }
                catch (e) {
                    if (((_a = options === null || options === void 0 ? void 0 : options.signal) === null || _a === void 0 ? void 0 : _a.aborted) || !retry) {
                        const aborted = new GreeterGreetAborted(new reboot_api.errors_pb.Aborted(), {
                            message: e instanceof Error
                                ? `${e}`
                                : `Unknown error: ${JSON.stringify(e)}`
                        });
                        return { aborted };
                    }
                    else if (e instanceof Error) {
                        console.error(e);
                    }
                    else {
                        console.error(`[Reboot] Unknown error: ${JSON.stringify(e)}`);
                    }
                }
                await backoff.wait(`[Reboot] Retrying call to \`tests.reboot.GreeterMethods.Greet\` with backoff...`);
            }
        })();
        if (aborted) {
            return { aborted };
        }
        else if (!response.ok) {
            if (response.headers.get("content-type") === "application/json") {
                const status = reboot_api.Status.fromJson(await response.json());
                const aborted = GreeterGreetAborted.fromStatus(status);
                console.warn(`[Reboot] 'Greeter.Greet' aborted with ${aborted.message}`);
                return { aborted };
            }
            else {
                const aborted = new GreeterGreetAborted(new reboot_api.errors_pb.Unknown(), {
                    message: `Unknown error with HTTP status ${response.status}`
                });
                return { aborted };
            }
        }
        else {
            return {
                response: GreeterGreetResponseFromProtobufShape((greeter_pb.GreetResponse.fromJson(await response.json())))
            };
        }
    }
    function useSetAdjective() {
        const [pending, setPending] = useState([]);
        useEffect(() => {
            const id = uuidv4();
            instance.useSetAdjective(id, setPending);
            return () => {
                instance.unuseSetAdjective(id);
            };
        }, []);
        const rebootClient = reboot_react.useRebootClient();
        const bearerToken = rebootClient.bearerToken;
        const setAdjective = useMemo(() => {
            const method = async (partialRequest = {}, options) => {
                var _a, _b;
                const request = GreeterSetAdjectiveRequestToProtobuf(partialRequest);
                const idempotencyKey = (_b = (_a = options === null || options === void 0 ? void 0 : options.idempotencyKey) !== null && _a !== void 0 ? _a : options === null || options === void 0 ? void 0 : options.key) !== null && _b !== void 0 ? _b : reboot_web.makeExpiringIdempotencyKey();
                const mutation = {
                    request,
                    idempotencyKey,
                    bearerToken,
                    metadata: options === null || options === void 0 ? void 0 : options.metadata,
                    isLoading: false, // Won't start loading if we're flushing mutations.
                };
                return instance.setAdjective(mutation);
            };
            method.pending =
                new Array();
            return method;
        }, [instance, bearerToken]);
        setAdjective.pending = pending;
        return setAdjective;
    }
    const setAdjective = useSetAdjective();
    function useTransactionSetAdjective() {
        const [pending, setPending] = useState([]);
        useEffect(() => {
            const id = uuidv4();
            instance.useTransactionSetAdjective(id, setPending);
            return () => {
                instance.unuseTransactionSetAdjective(id);
            };
        }, []);
        const rebootClient = reboot_react.useRebootClient();
        const bearerToken = rebootClient.bearerToken;
        const transactionSetAdjective = useMemo(() => {
            const method = async (partialRequest = {}, options) => {
                var _a, _b;
                const request = GreeterTransactionSetAdjectiveRequestToProtobuf(partialRequest);
                const idempotencyKey = (_b = (_a = options === null || options === void 0 ? void 0 : options.idempotencyKey) !== null && _a !== void 0 ? _a : options === null || options === void 0 ? void 0 : options.key) !== null && _b !== void 0 ? _b : reboot_web.makeExpiringIdempotencyKey();
                const mutation = {
                    request,
                    idempotencyKey,
                    bearerToken,
                    metadata: options === null || options === void 0 ? void 0 : options.metadata,
                    isLoading: false, // Won't start loading if we're flushing mutations.
                };
                return instance.transactionSetAdjective(mutation);
            };
            method.pending =
                new Array();
            return method;
        }, [instance, bearerToken]);
        transactionSetAdjective.pending = pending;
        return transactionSetAdjective;
    }
    const transactionSetAdjective = useTransactionSetAdjective();
    function useTryToConstructContext(partialRequest = {}, options = { suspense: false }) {
        const newRequest = GreeterTryToConstructContextRequestToProtobuf(partialRequest);
        const [request, setRequest] = useState(newRequest);
        const [isLoading, setIsLoading] = useState(true);
        const rebootClient = reboot_react.useRebootClient();
        const bearerToken = rebootClient.bearerToken;
        const serializedRequest = useMemo(() => request.toBinary(), [request]);
        // To distinguish this call from others when caching responses on
        // the client we compute a "request hash" using SHA256 from the
        // `request`.
        // We memoize this so we don't do it every time.
        const requestHash = useMemo(() => {
            const hash = reboot_web.calcSha256();
            hash.add(serializedRequest);
            return hash.digest().hex();
        }, [serializedRequest]);
        // To create a map of unused readers globally on the client, we
        // compute a "request hash" using SHA256 from the `request`
        // including the bearerToken.
        // We memoize this so we don't do it every time.
        const requestBearerTokenHash = useMemo(() => {
            const hash = reboot_web.calcSha256();
            hash.add(serializedRequest);
            if (bearerToken) {
                hash.add(bearerToken);
            }
            return hash.digest().hex();
        }, [serializedRequest, bearerToken]);
        const offlineCacheEnabled = rebootClient.offlineCacheEnabled;
        const cacheKey = useMemo(() => {
            if (offlineCacheEnabled) {
                return `${stateRef}:TryToConstructContext:${requestHash}`;
            }
            return null;
        }, [stateRef, offlineCacheEnabled, requestHash]);
        // We start reading here, or if another component already started
        // the reading then we just get back the reader. We need to do this
        // before setting up our `useState`s because when using suspense
        // we need to use the `reader.response` or `reader.status` during
        // render where one of them will be defined, i.e., after we've
        // waited for `reader.promise` via `React.use()`.
        const reader = instance.startTryToConstructContext(requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey);
        const [response, setResponse] = useState(reader.response && GreeterTryToConstructContextResponseFromProtobufShape(reader.response));
        const [aborted, setAborted] = useState(reader.status && GreeterTryToConstructContextAborted.fromStatus(reader.status));
        useEffect(() => {
            const id = uuidv4();
            instance.useTryToConstructContext(id, requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey, (response) => {
                setAborted(undefined);
                setResponse(GreeterTryToConstructContextResponseFromProtobufShape(response));
            }, setIsLoading, (status) => {
                const aborted = GreeterTryToConstructContextAborted.fromStatus(status);
                console.warn(`[Reboot] 'Greeter.TryToConstructContext' aborted with ${aborted.message}`);
                setAborted(aborted);
                setResponse(undefined);
            });
            return () => {
                instance.unuseTryToConstructContext(id, requestBearerTokenHash);
            };
        }, [
            instance,
            serializedRequest,
            requestBearerTokenHash,
            bearerToken,
            offlineCacheEnabled,
            cacheKey,
        ]);
        // If the user has requested suspense via `options.suspense` then
        // we need to use `useMemo` to create a stable promise to pass
        // to `React.use()`. This is important for two reasons:
        //
        // 1. `reader.promise` gets deleted after 5 seconds to
        //    allow GC-based detection of abandoned readers (via
        //    `FinalizationRegistry`), so we can't pass it directly
        //    on every render.
        //
        // 2. `React.use()` suspends at least once for each new
        //    promise it sees (to call `.then()`), so we must
        //    return the same promise across re-renders for a given
        //    reader.
        //
        // When suspense is not requested, or the reader's event is
        // already set (i.e., we have a response or aborted status),
        // we return a pre-resolved promise. Note that `React.use()`
        // will suspend at least once even for a pre-resolved promise
        // in order to set internal state on it, but on subsequent
        // renders it will recognize the same promise and return
        // without suspending.
        const suspensePromise = useMemo(() => {
            if (!options.suspense || reader.event.isSet()) {
                return Promise.resolve();
            }
            reboot_api.assert(reader.promise !== undefined);
            return reader.promise.then(() => { });
        }, [reader, options.suspense]);
        if (options.suspense) {
            if (!("use" in React)) {
                // Raise if it doesn't look like we are using React>=19.
                const error = "In order to pass `suspense: true` to a Reboot reactive reader you must be using React>=19 which provides `React.use`";
                console.error(error);
                throw new Error(error);
            }
            React.use(suspensePromise);
        }
        if (!request.equals(newRequest)) {
            setRequest(newRequest);
            setIsLoading(true);
            return { response, isLoading: true, aborted };
        }
        return { response, isLoading, aborted };
    }
    async function tryToConstructContext(partialRequest = {}, options) {
        let retry = true;
        if (options !== undefined && options.retry !== undefined) {
            retry = options.retry;
        }
        const request = GreeterTryToConstructContextRequestToProtobuf(partialRequest);
        // Fetch with retry, using a backoff, i.e., if we get disconnected.
        const { response, aborted } = await (async () => {
            var _a;
            const backoff = new reboot_api.Backoff();
            while (true) {
                try {
                    // Invariant here is that we use the '/package.service.method' path and
                    // HTTP 'POST' method (we need 'POST' because we send an HTTP body).
                    //
                    // See also 'reboot/helpers.py'.
                    return {
                        response: await reboot_web.guardedFetch(new Request(`${rebootClient.url}/__/reboot/rpc/${stateRef}/tests.reboot.GreeterMethods/TryToConstructContext`, {
                            method: "POST",
                            headers,
                            body: request.toJsonString()
                        }), options)
                    };
                }
                catch (e) {
                    if (((_a = options === null || options === void 0 ? void 0 : options.signal) === null || _a === void 0 ? void 0 : _a.aborted) || !retry) {
                        const aborted = new GreeterTryToConstructContextAborted(new reboot_api.errors_pb.Aborted(), {
                            message: e instanceof Error
                                ? `${e}`
                                : `Unknown error: ${JSON.stringify(e)}`
                        });
                        return { aborted };
                    }
                    else if (e instanceof Error) {
                        console.error(e);
                    }
                    else {
                        console.error(`[Reboot] Unknown error: ${JSON.stringify(e)}`);
                    }
                }
                await backoff.wait(`[Reboot] Retrying call to \`tests.reboot.GreeterMethods.TryToConstructContext\` with backoff...`);
            }
        })();
        if (aborted) {
            return { aborted };
        }
        else if (!response.ok) {
            if (response.headers.get("content-type") === "application/json") {
                const status = reboot_api.Status.fromJson(await response.json());
                const aborted = GreeterTryToConstructContextAborted.fromStatus(status);
                console.warn(`[Reboot] 'Greeter.TryToConstructContext' aborted with ${aborted.message}`);
                return { aborted };
            }
            else {
                const aborted = new GreeterTryToConstructContextAborted(new reboot_api.errors_pb.Unknown(), {
                    message: `Unknown error with HTTP status ${response.status}`
                });
                return { aborted };
            }
        }
        else {
            return {
                response: GreeterTryToConstructContextResponseFromProtobufShape((Empty.fromJson(await response.json())))
            };
        }
    }
    function useTryToConstructExternalContext(partialRequest = {}, options = { suspense: false }) {
        const newRequest = GreeterTryToConstructExternalContextRequestToProtobuf(partialRequest);
        const [request, setRequest] = useState(newRequest);
        const [isLoading, setIsLoading] = useState(true);
        const rebootClient = reboot_react.useRebootClient();
        const bearerToken = rebootClient.bearerToken;
        const serializedRequest = useMemo(() => request.toBinary(), [request]);
        // To distinguish this call from others when caching responses on
        // the client we compute a "request hash" using SHA256 from the
        // `request`.
        // We memoize this so we don't do it every time.
        const requestHash = useMemo(() => {
            const hash = reboot_web.calcSha256();
            hash.add(serializedRequest);
            return hash.digest().hex();
        }, [serializedRequest]);
        // To create a map of unused readers globally on the client, we
        // compute a "request hash" using SHA256 from the `request`
        // including the bearerToken.
        // We memoize this so we don't do it every time.
        const requestBearerTokenHash = useMemo(() => {
            const hash = reboot_web.calcSha256();
            hash.add(serializedRequest);
            if (bearerToken) {
                hash.add(bearerToken);
            }
            return hash.digest().hex();
        }, [serializedRequest, bearerToken]);
        const offlineCacheEnabled = rebootClient.offlineCacheEnabled;
        const cacheKey = useMemo(() => {
            if (offlineCacheEnabled) {
                return `${stateRef}:TryToConstructExternalContext:${requestHash}`;
            }
            return null;
        }, [stateRef, offlineCacheEnabled, requestHash]);
        // We start reading here, or if another component already started
        // the reading then we just get back the reader. We need to do this
        // before setting up our `useState`s because when using suspense
        // we need to use the `reader.response` or `reader.status` during
        // render where one of them will be defined, i.e., after we've
        // waited for `reader.promise` via `React.use()`.
        const reader = instance.startTryToConstructExternalContext(requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey);
        const [response, setResponse] = useState(reader.response && GreeterTryToConstructExternalContextResponseFromProtobufShape(reader.response));
        const [aborted, setAborted] = useState(reader.status && GreeterTryToConstructExternalContextAborted.fromStatus(reader.status));
        useEffect(() => {
            const id = uuidv4();
            instance.useTryToConstructExternalContext(id, requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey, (response) => {
                setAborted(undefined);
                setResponse(GreeterTryToConstructExternalContextResponseFromProtobufShape(response));
            }, setIsLoading, (status) => {
                const aborted = GreeterTryToConstructExternalContextAborted.fromStatus(status);
                console.warn(`[Reboot] 'Greeter.TryToConstructExternalContext' aborted with ${aborted.message}`);
                setAborted(aborted);
                setResponse(undefined);
            });
            return () => {
                instance.unuseTryToConstructExternalContext(id, requestBearerTokenHash);
            };
        }, [
            instance,
            serializedRequest,
            requestBearerTokenHash,
            bearerToken,
            offlineCacheEnabled,
            cacheKey,
        ]);
        // If the user has requested suspense via `options.suspense` then
        // we need to use `useMemo` to create a stable promise to pass
        // to `React.use()`. This is important for two reasons:
        //
        // 1. `reader.promise` gets deleted after 5 seconds to
        //    allow GC-based detection of abandoned readers (via
        //    `FinalizationRegistry`), so we can't pass it directly
        //    on every render.
        //
        // 2. `React.use()` suspends at least once for each new
        //    promise it sees (to call `.then()`), so we must
        //    return the same promise across re-renders for a given
        //    reader.
        //
        // When suspense is not requested, or the reader's event is
        // already set (i.e., we have a response or aborted status),
        // we return a pre-resolved promise. Note that `React.use()`
        // will suspend at least once even for a pre-resolved promise
        // in order to set internal state on it, but on subsequent
        // renders it will recognize the same promise and return
        // without suspending.
        const suspensePromise = useMemo(() => {
            if (!options.suspense || reader.event.isSet()) {
                return Promise.resolve();
            }
            reboot_api.assert(reader.promise !== undefined);
            return reader.promise.then(() => { });
        }, [reader, options.suspense]);
        if (options.suspense) {
            if (!("use" in React)) {
                // Raise if it doesn't look like we are using React>=19.
                const error = "In order to pass `suspense: true` to a Reboot reactive reader you must be using React>=19 which provides `React.use`";
                console.error(error);
                throw new Error(error);
            }
            React.use(suspensePromise);
        }
        if (!request.equals(newRequest)) {
            setRequest(newRequest);
            setIsLoading(true);
            return { response, isLoading: true, aborted };
        }
        return { response, isLoading, aborted };
    }
    async function tryToConstructExternalContext(partialRequest = {}, options) {
        let retry = true;
        if (options !== undefined && options.retry !== undefined) {
            retry = options.retry;
        }
        const request = GreeterTryToConstructExternalContextRequestToProtobuf(partialRequest);
        // Fetch with retry, using a backoff, i.e., if we get disconnected.
        const { response, aborted } = await (async () => {
            var _a;
            const backoff = new reboot_api.Backoff();
            while (true) {
                try {
                    // Invariant here is that we use the '/package.service.method' path and
                    // HTTP 'POST' method (we need 'POST' because we send an HTTP body).
                    //
                    // See also 'reboot/helpers.py'.
                    return {
                        response: await reboot_web.guardedFetch(new Request(`${rebootClient.url}/__/reboot/rpc/${stateRef}/tests.reboot.GreeterMethods/TryToConstructExternalContext`, {
                            method: "POST",
                            headers,
                            body: request.toJsonString()
                        }), options)
                    };
                }
                catch (e) {
                    if (((_a = options === null || options === void 0 ? void 0 : options.signal) === null || _a === void 0 ? void 0 : _a.aborted) || !retry) {
                        const aborted = new GreeterTryToConstructExternalContextAborted(new reboot_api.errors_pb.Aborted(), {
                            message: e instanceof Error
                                ? `${e}`
                                : `Unknown error: ${JSON.stringify(e)}`
                        });
                        return { aborted };
                    }
                    else if (e instanceof Error) {
                        console.error(e);
                    }
                    else {
                        console.error(`[Reboot] Unknown error: ${JSON.stringify(e)}`);
                    }
                }
                await backoff.wait(`[Reboot] Retrying call to \`tests.reboot.GreeterMethods.TryToConstructExternalContext\` with backoff...`);
            }
        })();
        if (aborted) {
            return { aborted };
        }
        else if (!response.ok) {
            if (response.headers.get("content-type") === "application/json") {
                const status = reboot_api.Status.fromJson(await response.json());
                const aborted = GreeterTryToConstructExternalContextAborted.fromStatus(status);
                console.warn(`[Reboot] 'Greeter.TryToConstructExternalContext' aborted with ${aborted.message}`);
                return { aborted };
            }
            else {
                const aborted = new GreeterTryToConstructExternalContextAborted(new reboot_api.errors_pb.Unknown(), {
                    message: `Unknown error with HTTP status ${response.status}`
                });
                return { aborted };
            }
        }
        else {
            return {
                response: GreeterTryToConstructExternalContextResponseFromProtobufShape((Empty.fromJson(await response.json())))
            };
        }
    }
    function useTestLongRunningFetch(partialRequest = {}, options = { suspense: false }) {
        const newRequest = GreeterTestLongRunningFetchRequestToProtobuf(partialRequest);
        const [request, setRequest] = useState(newRequest);
        const [isLoading, setIsLoading] = useState(true);
        const rebootClient = reboot_react.useRebootClient();
        const bearerToken = rebootClient.bearerToken;
        const serializedRequest = useMemo(() => request.toBinary(), [request]);
        // To distinguish this call from others when caching responses on
        // the client we compute a "request hash" using SHA256 from the
        // `request`.
        // We memoize this so we don't do it every time.
        const requestHash = useMemo(() => {
            const hash = reboot_web.calcSha256();
            hash.add(serializedRequest);
            return hash.digest().hex();
        }, [serializedRequest]);
        // To create a map of unused readers globally on the client, we
        // compute a "request hash" using SHA256 from the `request`
        // including the bearerToken.
        // We memoize this so we don't do it every time.
        const requestBearerTokenHash = useMemo(() => {
            const hash = reboot_web.calcSha256();
            hash.add(serializedRequest);
            if (bearerToken) {
                hash.add(bearerToken);
            }
            return hash.digest().hex();
        }, [serializedRequest, bearerToken]);
        const offlineCacheEnabled = rebootClient.offlineCacheEnabled;
        const cacheKey = useMemo(() => {
            if (offlineCacheEnabled) {
                return `${stateRef}:TestLongRunningFetch:${requestHash}`;
            }
            return null;
        }, [stateRef, offlineCacheEnabled, requestHash]);
        // We start reading here, or if another component already started
        // the reading then we just get back the reader. We need to do this
        // before setting up our `useState`s because when using suspense
        // we need to use the `reader.response` or `reader.status` during
        // render where one of them will be defined, i.e., after we've
        // waited for `reader.promise` via `React.use()`.
        const reader = instance.startTestLongRunningFetch(requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey);
        const [response, setResponse] = useState(reader.response && GreeterTestLongRunningFetchResponseFromProtobufShape(reader.response));
        const [aborted, setAborted] = useState(reader.status && GreeterTestLongRunningFetchAborted.fromStatus(reader.status));
        useEffect(() => {
            const id = uuidv4();
            instance.useTestLongRunningFetch(id, requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey, (response) => {
                setAborted(undefined);
                setResponse(GreeterTestLongRunningFetchResponseFromProtobufShape(response));
            }, setIsLoading, (status) => {
                const aborted = GreeterTestLongRunningFetchAborted.fromStatus(status);
                console.warn(`[Reboot] 'Greeter.TestLongRunningFetch' aborted with ${aborted.message}`);
                setAborted(aborted);
                setResponse(undefined);
            });
            return () => {
                instance.unuseTestLongRunningFetch(id, requestBearerTokenHash);
            };
        }, [
            instance,
            serializedRequest,
            requestBearerTokenHash,
            bearerToken,
            offlineCacheEnabled,
            cacheKey,
        ]);
        // If the user has requested suspense via `options.suspense` then
        // we need to use `useMemo` to create a stable promise to pass
        // to `React.use()`. This is important for two reasons:
        //
        // 1. `reader.promise` gets deleted after 5 seconds to
        //    allow GC-based detection of abandoned readers (via
        //    `FinalizationRegistry`), so we can't pass it directly
        //    on every render.
        //
        // 2. `React.use()` suspends at least once for each new
        //    promise it sees (to call `.then()`), so we must
        //    return the same promise across re-renders for a given
        //    reader.
        //
        // When suspense is not requested, or the reader's event is
        // already set (i.e., we have a response or aborted status),
        // we return a pre-resolved promise. Note that `React.use()`
        // will suspend at least once even for a pre-resolved promise
        // in order to set internal state on it, but on subsequent
        // renders it will recognize the same promise and return
        // without suspending.
        const suspensePromise = useMemo(() => {
            if (!options.suspense || reader.event.isSet()) {
                return Promise.resolve();
            }
            reboot_api.assert(reader.promise !== undefined);
            return reader.promise.then(() => { });
        }, [reader, options.suspense]);
        if (options.suspense) {
            if (!("use" in React)) {
                // Raise if it doesn't look like we are using React>=19.
                const error = "In order to pass `suspense: true` to a Reboot reactive reader you must be using React>=19 which provides `React.use`";
                console.error(error);
                throw new Error(error);
            }
            React.use(suspensePromise);
        }
        if (!request.equals(newRequest)) {
            setRequest(newRequest);
            setIsLoading(true);
            return { response, isLoading: true, aborted };
        }
        return { response, isLoading, aborted };
    }
    async function testLongRunningFetch(partialRequest = {}, options) {
        let retry = true;
        if (options !== undefined && options.retry !== undefined) {
            retry = options.retry;
        }
        const request = GreeterTestLongRunningFetchRequestToProtobuf(partialRequest);
        // Fetch with retry, using a backoff, i.e., if we get disconnected.
        const { response, aborted } = await (async () => {
            var _a;
            const backoff = new reboot_api.Backoff();
            while (true) {
                try {
                    // Invariant here is that we use the '/package.service.method' path and
                    // HTTP 'POST' method (we need 'POST' because we send an HTTP body).
                    //
                    // See also 'reboot/helpers.py'.
                    return {
                        response: await reboot_web.guardedFetch(new Request(`${rebootClient.url}/__/reboot/rpc/${stateRef}/tests.reboot.GreeterMethods/TestLongRunningFetch`, {
                            method: "POST",
                            headers,
                            body: request.toJsonString()
                        }), options)
                    };
                }
                catch (e) {
                    if (((_a = options === null || options === void 0 ? void 0 : options.signal) === null || _a === void 0 ? void 0 : _a.aborted) || !retry) {
                        const aborted = new GreeterTestLongRunningFetchAborted(new reboot_api.errors_pb.Aborted(), {
                            message: e instanceof Error
                                ? `${e}`
                                : `Unknown error: ${JSON.stringify(e)}`
                        });
                        return { aborted };
                    }
                    else if (e instanceof Error) {
                        console.error(e);
                    }
                    else {
                        console.error(`[Reboot] Unknown error: ${JSON.stringify(e)}`);
                    }
                }
                await backoff.wait(`[Reboot] Retrying call to \`tests.reboot.GreeterMethods.TestLongRunningFetch\` with backoff...`);
            }
        })();
        if (aborted) {
            return { aborted };
        }
        else if (!response.ok) {
            if (response.headers.get("content-type") === "application/json") {
                const status = reboot_api.Status.fromJson(await response.json());
                const aborted = GreeterTestLongRunningFetchAborted.fromStatus(status);
                console.warn(`[Reboot] 'Greeter.TestLongRunningFetch' aborted with ${aborted.message}`);
                return { aborted };
            }
            else {
                const aborted = new GreeterTestLongRunningFetchAborted(new reboot_api.errors_pb.Unknown(), {
                    message: `Unknown error with HTTP status ${response.status}`
                });
                return { aborted };
            }
        }
        else {
            return {
                response: GreeterTestLongRunningFetchResponseFromProtobufShape((Empty.fromJson(await response.json())))
            };
        }
    }
    function useTestLongRunningWriter() {
        const [pending, setPending] = useState([]);
        useEffect(() => {
            const id = uuidv4();
            instance.useTestLongRunningWriter(id, setPending);
            return () => {
                instance.unuseTestLongRunningWriter(id);
            };
        }, []);
        const rebootClient = reboot_react.useRebootClient();
        const bearerToken = rebootClient.bearerToken;
        const testLongRunningWriter = useMemo(() => {
            const method = async (partialRequest = {}, options) => {
                var _a, _b;
                const request = GreeterTestLongRunningWriterRequestToProtobuf(partialRequest);
                const idempotencyKey = (_b = (_a = options === null || options === void 0 ? void 0 : options.idempotencyKey) !== null && _a !== void 0 ? _a : options === null || options === void 0 ? void 0 : options.key) !== null && _b !== void 0 ? _b : reboot_web.makeExpiringIdempotencyKey();
                const mutation = {
                    request,
                    idempotencyKey,
                    bearerToken,
                    metadata: options === null || options === void 0 ? void 0 : options.metadata,
                    isLoading: false, // Won't start loading if we're flushing mutations.
                };
                return instance.testLongRunningWriter(mutation);
            };
            method.pending =
                new Array();
            return method;
        }, [instance, bearerToken]);
        testLongRunningWriter.pending = pending;
        return testLongRunningWriter;
    }
    const testLongRunningWriter = useTestLongRunningWriter();
    function useGetWholeState(partialRequest = {}, options = { suspense: false }) {
        const newRequest = GreeterGetWholeStateRequestToProtobuf(partialRequest);
        const [request, setRequest] = useState(newRequest);
        const [isLoading, setIsLoading] = useState(true);
        const rebootClient = reboot_react.useRebootClient();
        const bearerToken = rebootClient.bearerToken;
        const serializedRequest = useMemo(() => request.toBinary(), [request]);
        // To distinguish this call from others when caching responses on
        // the client we compute a "request hash" using SHA256 from the
        // `request`.
        // We memoize this so we don't do it every time.
        const requestHash = useMemo(() => {
            const hash = reboot_web.calcSha256();
            hash.add(serializedRequest);
            return hash.digest().hex();
        }, [serializedRequest]);
        // To create a map of unused readers globally on the client, we
        // compute a "request hash" using SHA256 from the `request`
        // including the bearerToken.
        // We memoize this so we don't do it every time.
        const requestBearerTokenHash = useMemo(() => {
            const hash = reboot_web.calcSha256();
            hash.add(serializedRequest);
            if (bearerToken) {
                hash.add(bearerToken);
            }
            return hash.digest().hex();
        }, [serializedRequest, bearerToken]);
        const offlineCacheEnabled = rebootClient.offlineCacheEnabled;
        const cacheKey = useMemo(() => {
            if (offlineCacheEnabled) {
                return `${stateRef}:GetWholeState:${requestHash}`;
            }
            return null;
        }, [stateRef, offlineCacheEnabled, requestHash]);
        // We start reading here, or if another component already started
        // the reading then we just get back the reader. We need to do this
        // before setting up our `useState`s because when using suspense
        // we need to use the `reader.response` or `reader.status` during
        // render where one of them will be defined, i.e., after we've
        // waited for `reader.promise` via `React.use()`.
        const reader = instance.startGetWholeState(requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey);
        const [response, setResponse] = useState(reader.response && GreeterGetWholeStateResponseFromProtobufShape(reader.response));
        const [aborted, setAborted] = useState(reader.status && GreeterGetWholeStateAborted.fromStatus(reader.status));
        useEffect(() => {
            const id = uuidv4();
            instance.useGetWholeState(id, requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey, (response) => {
                setAborted(undefined);
                setResponse(GreeterGetWholeStateResponseFromProtobufShape(response));
            }, setIsLoading, (status) => {
                const aborted = GreeterGetWholeStateAborted.fromStatus(status);
                console.warn(`[Reboot] 'Greeter.GetWholeState' aborted with ${aborted.message}`);
                setAborted(aborted);
                setResponse(undefined);
            });
            return () => {
                instance.unuseGetWholeState(id, requestBearerTokenHash);
            };
        }, [
            instance,
            serializedRequest,
            requestBearerTokenHash,
            bearerToken,
            offlineCacheEnabled,
            cacheKey,
        ]);
        // If the user has requested suspense via `options.suspense` then
        // we need to use `useMemo` to create a stable promise to pass
        // to `React.use()`. This is important for two reasons:
        //
        // 1. `reader.promise` gets deleted after 5 seconds to
        //    allow GC-based detection of abandoned readers (via
        //    `FinalizationRegistry`), so we can't pass it directly
        //    on every render.
        //
        // 2. `React.use()` suspends at least once for each new
        //    promise it sees (to call `.then()`), so we must
        //    return the same promise across re-renders for a given
        //    reader.
        //
        // When suspense is not requested, or the reader's event is
        // already set (i.e., we have a response or aborted status),
        // we return a pre-resolved promise. Note that `React.use()`
        // will suspend at least once even for a pre-resolved promise
        // in order to set internal state on it, but on subsequent
        // renders it will recognize the same promise and return
        // without suspending.
        const suspensePromise = useMemo(() => {
            if (!options.suspense || reader.event.isSet()) {
                return Promise.resolve();
            }
            reboot_api.assert(reader.promise !== undefined);
            return reader.promise.then(() => { });
        }, [reader, options.suspense]);
        if (options.suspense) {
            if (!("use" in React)) {
                // Raise if it doesn't look like we are using React>=19.
                const error = "In order to pass `suspense: true` to a Reboot reactive reader you must be using React>=19 which provides `React.use`";
                console.error(error);
                throw new Error(error);
            }
            React.use(suspensePromise);
        }
        if (!request.equals(newRequest)) {
            setRequest(newRequest);
            setIsLoading(true);
            return { response, isLoading: true, aborted };
        }
        return { response, isLoading, aborted };
    }
    async function getWholeState(partialRequest = {}, options) {
        let retry = true;
        if (options !== undefined && options.retry !== undefined) {
            retry = options.retry;
        }
        const request = GreeterGetWholeStateRequestToProtobuf(partialRequest);
        // Fetch with retry, using a backoff, i.e., if we get disconnected.
        const { response, aborted } = await (async () => {
            var _a;
            const backoff = new reboot_api.Backoff();
            while (true) {
                try {
                    // Invariant here is that we use the '/package.service.method' path and
                    // HTTP 'POST' method (we need 'POST' because we send an HTTP body).
                    //
                    // See also 'reboot/helpers.py'.
                    return {
                        response: await reboot_web.guardedFetch(new Request(`${rebootClient.url}/__/reboot/rpc/${stateRef}/tests.reboot.GreeterMethods/GetWholeState`, {
                            method: "POST",
                            headers,
                            body: request.toJsonString()
                        }), options)
                    };
                }
                catch (e) {
                    if (((_a = options === null || options === void 0 ? void 0 : options.signal) === null || _a === void 0 ? void 0 : _a.aborted) || !retry) {
                        const aborted = new GreeterGetWholeStateAborted(new reboot_api.errors_pb.Aborted(), {
                            message: e instanceof Error
                                ? `${e}`
                                : `Unknown error: ${JSON.stringify(e)}`
                        });
                        return { aborted };
                    }
                    else if (e instanceof Error) {
                        console.error(e);
                    }
                    else {
                        console.error(`[Reboot] Unknown error: ${JSON.stringify(e)}`);
                    }
                }
                await backoff.wait(`[Reboot] Retrying call to \`tests.reboot.GreeterMethods.GetWholeState\` with backoff...`);
            }
        })();
        if (aborted) {
            return { aborted };
        }
        else if (!response.ok) {
            if (response.headers.get("content-type") === "application/json") {
                const status = reboot_api.Status.fromJson(await response.json());
                const aborted = GreeterGetWholeStateAborted.fromStatus(status);
                console.warn(`[Reboot] 'Greeter.GetWholeState' aborted with ${aborted.message}`);
                return { aborted };
            }
            else {
                const aborted = new GreeterGetWholeStateAborted(new reboot_api.errors_pb.Unknown(), {
                    message: `Unknown error with HTTP status ${response.status}`
                });
                return { aborted };
            }
        }
        else {
            return {
                response: GreeterGetWholeStateResponseFromProtobufShape((GreeterProto.fromJson(await response.json())))
            };
        }
    }
    function useFailWithException(partialRequest = {}, options = { suspense: false }) {
        const newRequest = GreeterFailWithExceptionRequestToProtobuf(partialRequest);
        const [request, setRequest] = useState(newRequest);
        const [isLoading, setIsLoading] = useState(true);
        const rebootClient = reboot_react.useRebootClient();
        const bearerToken = rebootClient.bearerToken;
        const serializedRequest = useMemo(() => request.toBinary(), [request]);
        // To distinguish this call from others when caching responses on
        // the client we compute a "request hash" using SHA256 from the
        // `request`.
        // We memoize this so we don't do it every time.
        const requestHash = useMemo(() => {
            const hash = reboot_web.calcSha256();
            hash.add(serializedRequest);
            return hash.digest().hex();
        }, [serializedRequest]);
        // To create a map of unused readers globally on the client, we
        // compute a "request hash" using SHA256 from the `request`
        // including the bearerToken.
        // We memoize this so we don't do it every time.
        const requestBearerTokenHash = useMemo(() => {
            const hash = reboot_web.calcSha256();
            hash.add(serializedRequest);
            if (bearerToken) {
                hash.add(bearerToken);
            }
            return hash.digest().hex();
        }, [serializedRequest, bearerToken]);
        const offlineCacheEnabled = rebootClient.offlineCacheEnabled;
        const cacheKey = useMemo(() => {
            if (offlineCacheEnabled) {
                return `${stateRef}:FailWithException:${requestHash}`;
            }
            return null;
        }, [stateRef, offlineCacheEnabled, requestHash]);
        // We start reading here, or if another component already started
        // the reading then we just get back the reader. We need to do this
        // before setting up our `useState`s because when using suspense
        // we need to use the `reader.response` or `reader.status` during
        // render where one of them will be defined, i.e., after we've
        // waited for `reader.promise` via `React.use()`.
        const reader = instance.startFailWithException(requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey);
        const [response, setResponse] = useState(reader.response && GreeterFailWithExceptionResponseFromProtobufShape(reader.response));
        const [aborted, setAborted] = useState(reader.status && GreeterFailWithExceptionAborted.fromStatus(reader.status));
        useEffect(() => {
            const id = uuidv4();
            instance.useFailWithException(id, requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey, (response) => {
                setAborted(undefined);
                setResponse(GreeterFailWithExceptionResponseFromProtobufShape(response));
            }, setIsLoading, (status) => {
                const aborted = GreeterFailWithExceptionAborted.fromStatus(status);
                console.warn(`[Reboot] 'Greeter.FailWithException' aborted with ${aborted.message}`);
                setAborted(aborted);
                setResponse(undefined);
            });
            return () => {
                instance.unuseFailWithException(id, requestBearerTokenHash);
            };
        }, [
            instance,
            serializedRequest,
            requestBearerTokenHash,
            bearerToken,
            offlineCacheEnabled,
            cacheKey,
        ]);
        // If the user has requested suspense via `options.suspense` then
        // we need to use `useMemo` to create a stable promise to pass
        // to `React.use()`. This is important for two reasons:
        //
        // 1. `reader.promise` gets deleted after 5 seconds to
        //    allow GC-based detection of abandoned readers (via
        //    `FinalizationRegistry`), so we can't pass it directly
        //    on every render.
        //
        // 2. `React.use()` suspends at least once for each new
        //    promise it sees (to call `.then()`), so we must
        //    return the same promise across re-renders for a given
        //    reader.
        //
        // When suspense is not requested, or the reader's event is
        // already set (i.e., we have a response or aborted status),
        // we return a pre-resolved promise. Note that `React.use()`
        // will suspend at least once even for a pre-resolved promise
        // in order to set internal state on it, but on subsequent
        // renders it will recognize the same promise and return
        // without suspending.
        const suspensePromise = useMemo(() => {
            if (!options.suspense || reader.event.isSet()) {
                return Promise.resolve();
            }
            reboot_api.assert(reader.promise !== undefined);
            return reader.promise.then(() => { });
        }, [reader, options.suspense]);
        if (options.suspense) {
            if (!("use" in React)) {
                // Raise if it doesn't look like we are using React>=19.
                const error = "In order to pass `suspense: true` to a Reboot reactive reader you must be using React>=19 which provides `React.use`";
                console.error(error);
                throw new Error(error);
            }
            React.use(suspensePromise);
        }
        if (!request.equals(newRequest)) {
            setRequest(newRequest);
            setIsLoading(true);
            return { response, isLoading: true, aborted };
        }
        return { response, isLoading, aborted };
    }
    async function failWithException(partialRequest = {}, options) {
        let retry = true;
        if (options !== undefined && options.retry !== undefined) {
            retry = options.retry;
        }
        const request = GreeterFailWithExceptionRequestToProtobuf(partialRequest);
        // Fetch with retry, using a backoff, i.e., if we get disconnected.
        const { response, aborted } = await (async () => {
            var _a;
            const backoff = new reboot_api.Backoff();
            while (true) {
                try {
                    // Invariant here is that we use the '/package.service.method' path and
                    // HTTP 'POST' method (we need 'POST' because we send an HTTP body).
                    //
                    // See also 'reboot/helpers.py'.
                    return {
                        response: await reboot_web.guardedFetch(new Request(`${rebootClient.url}/__/reboot/rpc/${stateRef}/tests.reboot.GreeterMethods/FailWithException`, {
                            method: "POST",
                            headers,
                            body: request.toJsonString()
                        }), options)
                    };
                }
                catch (e) {
                    if (((_a = options === null || options === void 0 ? void 0 : options.signal) === null || _a === void 0 ? void 0 : _a.aborted) || !retry) {
                        const aborted = new GreeterFailWithExceptionAborted(new reboot_api.errors_pb.Aborted(), {
                            message: e instanceof Error
                                ? `${e}`
                                : `Unknown error: ${JSON.stringify(e)}`
                        });
                        return { aborted };
                    }
                    else if (e instanceof Error) {
                        console.error(e);
                    }
                    else {
                        console.error(`[Reboot] Unknown error: ${JSON.stringify(e)}`);
                    }
                }
                await backoff.wait(`[Reboot] Retrying call to \`tests.reboot.GreeterMethods.FailWithException\` with backoff...`);
            }
        })();
        if (aborted) {
            return { aborted };
        }
        else if (!response.ok) {
            if (response.headers.get("content-type") === "application/json") {
                const status = reboot_api.Status.fromJson(await response.json());
                const aborted = GreeterFailWithExceptionAborted.fromStatus(status);
                console.warn(`[Reboot] 'Greeter.FailWithException' aborted with ${aborted.message}`);
                return { aborted };
            }
            else {
                const aborted = new GreeterFailWithExceptionAborted(new reboot_api.errors_pb.Unknown(), {
                    message: `Unknown error with HTTP status ${response.status}`
                });
                return { aborted };
            }
        }
        else {
            return {
                response: GreeterFailWithExceptionResponseFromProtobufShape((Empty.fromJson(await response.json())))
            };
        }
    }
    function useFailWithAborted(partialRequest = {}, options = { suspense: false }) {
        const newRequest = GreeterFailWithAbortedRequestToProtobuf(partialRequest);
        const [request, setRequest] = useState(newRequest);
        const [isLoading, setIsLoading] = useState(true);
        const rebootClient = reboot_react.useRebootClient();
        const bearerToken = rebootClient.bearerToken;
        const serializedRequest = useMemo(() => request.toBinary(), [request]);
        // To distinguish this call from others when caching responses on
        // the client we compute a "request hash" using SHA256 from the
        // `request`.
        // We memoize this so we don't do it every time.
        const requestHash = useMemo(() => {
            const hash = reboot_web.calcSha256();
            hash.add(serializedRequest);
            return hash.digest().hex();
        }, [serializedRequest]);
        // To create a map of unused readers globally on the client, we
        // compute a "request hash" using SHA256 from the `request`
        // including the bearerToken.
        // We memoize this so we don't do it every time.
        const requestBearerTokenHash = useMemo(() => {
            const hash = reboot_web.calcSha256();
            hash.add(serializedRequest);
            if (bearerToken) {
                hash.add(bearerToken);
            }
            return hash.digest().hex();
        }, [serializedRequest, bearerToken]);
        const offlineCacheEnabled = rebootClient.offlineCacheEnabled;
        const cacheKey = useMemo(() => {
            if (offlineCacheEnabled) {
                return `${stateRef}:FailWithAborted:${requestHash}`;
            }
            return null;
        }, [stateRef, offlineCacheEnabled, requestHash]);
        // We start reading here, or if another component already started
        // the reading then we just get back the reader. We need to do this
        // before setting up our `useState`s because when using suspense
        // we need to use the `reader.response` or `reader.status` during
        // render where one of them will be defined, i.e., after we've
        // waited for `reader.promise` via `React.use()`.
        const reader = instance.startFailWithAborted(requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey);
        const [response, setResponse] = useState(reader.response && GreeterFailWithAbortedResponseFromProtobufShape(reader.response));
        const [aborted, setAborted] = useState(reader.status && GreeterFailWithAbortedAborted.fromStatus(reader.status));
        useEffect(() => {
            const id = uuidv4();
            instance.useFailWithAborted(id, requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey, (response) => {
                setAborted(undefined);
                setResponse(GreeterFailWithAbortedResponseFromProtobufShape(response));
            }, setIsLoading, (status) => {
                const aborted = GreeterFailWithAbortedAborted.fromStatus(status);
                console.warn(`[Reboot] 'Greeter.FailWithAborted' aborted with ${aborted.message}`);
                setAborted(aborted);
                setResponse(undefined);
            });
            return () => {
                instance.unuseFailWithAborted(id, requestBearerTokenHash);
            };
        }, [
            instance,
            serializedRequest,
            requestBearerTokenHash,
            bearerToken,
            offlineCacheEnabled,
            cacheKey,
        ]);
        // If the user has requested suspense via `options.suspense` then
        // we need to use `useMemo` to create a stable promise to pass
        // to `React.use()`. This is important for two reasons:
        //
        // 1. `reader.promise` gets deleted after 5 seconds to
        //    allow GC-based detection of abandoned readers (via
        //    `FinalizationRegistry`), so we can't pass it directly
        //    on every render.
        //
        // 2. `React.use()` suspends at least once for each new
        //    promise it sees (to call `.then()`), so we must
        //    return the same promise across re-renders for a given
        //    reader.
        //
        // When suspense is not requested, or the reader's event is
        // already set (i.e., we have a response or aborted status),
        // we return a pre-resolved promise. Note that `React.use()`
        // will suspend at least once even for a pre-resolved promise
        // in order to set internal state on it, but on subsequent
        // renders it will recognize the same promise and return
        // without suspending.
        const suspensePromise = useMemo(() => {
            if (!options.suspense || reader.event.isSet()) {
                return Promise.resolve();
            }
            reboot_api.assert(reader.promise !== undefined);
            return reader.promise.then(() => { });
        }, [reader, options.suspense]);
        if (options.suspense) {
            if (!("use" in React)) {
                // Raise if it doesn't look like we are using React>=19.
                const error = "In order to pass `suspense: true` to a Reboot reactive reader you must be using React>=19 which provides `React.use`";
                console.error(error);
                throw new Error(error);
            }
            React.use(suspensePromise);
        }
        if (!request.equals(newRequest)) {
            setRequest(newRequest);
            setIsLoading(true);
            return { response, isLoading: true, aborted };
        }
        return { response, isLoading, aborted };
    }
    async function failWithAborted(partialRequest = {}, options) {
        let retry = true;
        if (options !== undefined && options.retry !== undefined) {
            retry = options.retry;
        }
        const request = GreeterFailWithAbortedRequestToProtobuf(partialRequest);
        // Fetch with retry, using a backoff, i.e., if we get disconnected.
        const { response, aborted } = await (async () => {
            var _a;
            const backoff = new reboot_api.Backoff();
            while (true) {
                try {
                    // Invariant here is that we use the '/package.service.method' path and
                    // HTTP 'POST' method (we need 'POST' because we send an HTTP body).
                    //
                    // See also 'reboot/helpers.py'.
                    return {
                        response: await reboot_web.guardedFetch(new Request(`${rebootClient.url}/__/reboot/rpc/${stateRef}/tests.reboot.GreeterMethods/FailWithAborted`, {
                            method: "POST",
                            headers,
                            body: request.toJsonString()
                        }), options)
                    };
                }
                catch (e) {
                    if (((_a = options === null || options === void 0 ? void 0 : options.signal) === null || _a === void 0 ? void 0 : _a.aborted) || !retry) {
                        const aborted = new GreeterFailWithAbortedAborted(new reboot_api.errors_pb.Aborted(), {
                            message: e instanceof Error
                                ? `${e}`
                                : `Unknown error: ${JSON.stringify(e)}`
                        });
                        return { aborted };
                    }
                    else if (e instanceof Error) {
                        console.error(e);
                    }
                    else {
                        console.error(`[Reboot] Unknown error: ${JSON.stringify(e)}`);
                    }
                }
                await backoff.wait(`[Reboot] Retrying call to \`tests.reboot.GreeterMethods.FailWithAborted\` with backoff...`);
            }
        })();
        if (aborted) {
            return { aborted };
        }
        else if (!response.ok) {
            if (response.headers.get("content-type") === "application/json") {
                const status = reboot_api.Status.fromJson(await response.json());
                const aborted = GreeterFailWithAbortedAborted.fromStatus(status);
                console.warn(`[Reboot] 'Greeter.FailWithAborted' aborted with ${aborted.message}`);
                return { aborted };
            }
            else {
                const aborted = new GreeterFailWithAbortedAborted(new reboot_api.errors_pb.Unknown(), {
                    message: `Unknown error with HTTP status ${response.status}`
                });
                return { aborted };
            }
        }
        else {
            return {
                response: GreeterFailWithAbortedResponseFromProtobufShape((Empty.fromJson(await response.json())))
            };
        }
    }
    function useDangerousFields() {
        const [pending, setPending] = useState([]);
        useEffect(() => {
            const id = uuidv4();
            instance.useDangerousFields(id, setPending);
            return () => {
                instance.unuseDangerousFields(id);
            };
        }, []);
        const rebootClient = reboot_react.useRebootClient();
        const bearerToken = rebootClient.bearerToken;
        const dangerousFields = useMemo(() => {
            const method = async (partialRequest = {}, options) => {
                var _a, _b;
                const request = GreeterDangerousFieldsRequestToProtobuf(partialRequest);
                const idempotencyKey = (_b = (_a = options === null || options === void 0 ? void 0 : options.idempotencyKey) !== null && _a !== void 0 ? _a : options === null || options === void 0 ? void 0 : options.key) !== null && _b !== void 0 ? _b : reboot_web.makeExpiringIdempotencyKey();
                const mutation = {
                    request,
                    idempotencyKey,
                    bearerToken,
                    metadata: options === null || options === void 0 ? void 0 : options.metadata,
                    isLoading: false, // Won't start loading if we're flushing mutations.
                };
                return instance.dangerousFields(mutation);
            };
            method.pending =
                new Array();
            return method;
        }, [instance, bearerToken]);
        dangerousFields.pending = pending;
        return dangerousFields;
    }
    const dangerousFields = useDangerousFields();
    function useStoreRecursiveMessage() {
        const [pending, setPending] = useState([]);
        useEffect(() => {
            const id = uuidv4();
            instance.useStoreRecursiveMessage(id, setPending);
            return () => {
                instance.unuseStoreRecursiveMessage(id);
            };
        }, []);
        const rebootClient = reboot_react.useRebootClient();
        const bearerToken = rebootClient.bearerToken;
        const storeRecursiveMessage = useMemo(() => {
            const method = async (partialRequest = {}, options) => {
                var _a, _b;
                const request = GreeterStoreRecursiveMessageRequestToProtobuf(partialRequest);
                const idempotencyKey = (_b = (_a = options === null || options === void 0 ? void 0 : options.idempotencyKey) !== null && _a !== void 0 ? _a : options === null || options === void 0 ? void 0 : options.key) !== null && _b !== void 0 ? _b : reboot_web.makeExpiringIdempotencyKey();
                const mutation = {
                    request,
                    idempotencyKey,
                    bearerToken,
                    metadata: options === null || options === void 0 ? void 0 : options.metadata,
                    isLoading: false, // Won't start loading if we're flushing mutations.
                };
                return instance.storeRecursiveMessage(mutation);
            };
            method.pending =
                new Array();
            return method;
        }, [instance, bearerToken]);
        storeRecursiveMessage.pending = pending;
        return storeRecursiveMessage;
    }
    const storeRecursiveMessage = useStoreRecursiveMessage();
    function useReadRecursiveMessage(partialRequest = {}, options = { suspense: false }) {
        const newRequest = GreeterReadRecursiveMessageRequestToProtobuf(partialRequest);
        const [request, setRequest] = useState(newRequest);
        const [isLoading, setIsLoading] = useState(true);
        const rebootClient = reboot_react.useRebootClient();
        const bearerToken = rebootClient.bearerToken;
        const serializedRequest = useMemo(() => request.toBinary(), [request]);
        // To distinguish this call from others when caching responses on
        // the client we compute a "request hash" using SHA256 from the
        // `request`.
        // We memoize this so we don't do it every time.
        const requestHash = useMemo(() => {
            const hash = reboot_web.calcSha256();
            hash.add(serializedRequest);
            return hash.digest().hex();
        }, [serializedRequest]);
        // To create a map of unused readers globally on the client, we
        // compute a "request hash" using SHA256 from the `request`
        // including the bearerToken.
        // We memoize this so we don't do it every time.
        const requestBearerTokenHash = useMemo(() => {
            const hash = reboot_web.calcSha256();
            hash.add(serializedRequest);
            if (bearerToken) {
                hash.add(bearerToken);
            }
            return hash.digest().hex();
        }, [serializedRequest, bearerToken]);
        const offlineCacheEnabled = rebootClient.offlineCacheEnabled;
        const cacheKey = useMemo(() => {
            if (offlineCacheEnabled) {
                return `${stateRef}:ReadRecursiveMessage:${requestHash}`;
            }
            return null;
        }, [stateRef, offlineCacheEnabled, requestHash]);
        // We start reading here, or if another component already started
        // the reading then we just get back the reader. We need to do this
        // before setting up our `useState`s because when using suspense
        // we need to use the `reader.response` or `reader.status` during
        // render where one of them will be defined, i.e., after we've
        // waited for `reader.promise` via `React.use()`.
        const reader = instance.startReadRecursiveMessage(requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey);
        const [response, setResponse] = useState(reader.response && GreeterReadRecursiveMessageResponseFromProtobufShape(reader.response));
        const [aborted, setAborted] = useState(reader.status && GreeterReadRecursiveMessageAborted.fromStatus(reader.status));
        useEffect(() => {
            const id = uuidv4();
            instance.useReadRecursiveMessage(id, requestBearerTokenHash, serializedRequest, bearerToken, offlineCacheEnabled, cacheKey, (response) => {
                setAborted(undefined);
                setResponse(GreeterReadRecursiveMessageResponseFromProtobufShape(response));
            }, setIsLoading, (status) => {
                const aborted = GreeterReadRecursiveMessageAborted.fromStatus(status);
                console.warn(`[Reboot] 'Greeter.ReadRecursiveMessage' aborted with ${aborted.message}`);
                setAborted(aborted);
                setResponse(undefined);
            });
            return () => {
                instance.unuseReadRecursiveMessage(id, requestBearerTokenHash);
            };
        }, [
            instance,
            serializedRequest,
            requestBearerTokenHash,
            bearerToken,
            offlineCacheEnabled,
            cacheKey,
        ]);
        // If the user has requested suspense via `options.suspense` then
        // we need to use `useMemo` to create a stable promise to pass
        // to `React.use()`. This is important for two reasons:
        //
        // 1. `reader.promise` gets deleted after 5 seconds to
        //    allow GC-based detection of abandoned readers (via
        //    `FinalizationRegistry`), so we can't pass it directly
        //    on every render.
        //
        // 2. `React.use()` suspends at least once for each new
        //    promise it sees (to call `.then()`), so we must
        //    return the same promise across re-renders for a given
        //    reader.
        //
        // When suspense is not requested, or the reader's event is
        // already set (i.e., we have a response or aborted status),
        // we return a pre-resolved promise. Note that `React.use()`
        // will suspend at least once even for a pre-resolved promise
        // in order to set internal state on it, but on subsequent
        // renders it will recognize the same promise and return
        // without suspending.
        const suspensePromise = useMemo(() => {
            if (!options.suspense || reader.event.isSet()) {
                return Promise.resolve();
            }
            reboot_api.assert(reader.promise !== undefined);
            return reader.promise.then(() => { });
        }, [reader, options.suspense]);
        if (options.suspense) {
            if (!("use" in React)) {
                // Raise if it doesn't look like we are using React>=19.
                const error = "In order to pass `suspense: true` to a Reboot reactive reader you must be using React>=19 which provides `React.use`";
                console.error(error);
                throw new Error(error);
            }
            React.use(suspensePromise);
        }
        if (!request.equals(newRequest)) {
            setRequest(newRequest);
            setIsLoading(true);
            return { response, isLoading: true, aborted };
        }
        return { response, isLoading, aborted };
    }
    async function readRecursiveMessage(partialRequest = {}, options) {
        let retry = true;
        if (options !== undefined && options.retry !== undefined) {
            retry = options.retry;
        }
        const request = GreeterReadRecursiveMessageRequestToProtobuf(partialRequest);
        // Fetch with retry, using a backoff, i.e., if we get disconnected.
        const { response, aborted } = await (async () => {
            var _a;
            const backoff = new reboot_api.Backoff();
            while (true) {
                try {
                    // Invariant here is that we use the '/package.service.method' path and
                    // HTTP 'POST' method (we need 'POST' because we send an HTTP body).
                    //
                    // See also 'reboot/helpers.py'.
                    return {
                        response: await reboot_web.guardedFetch(new Request(`${rebootClient.url}/__/reboot/rpc/${stateRef}/tests.reboot.GreeterMethods/ReadRecursiveMessage`, {
                            method: "POST",
                            headers,
                            body: request.toJsonString()
                        }), options)
                    };
                }
                catch (e) {
                    if (((_a = options === null || options === void 0 ? void 0 : options.signal) === null || _a === void 0 ? void 0 : _a.aborted) || !retry) {
                        const aborted = new GreeterReadRecursiveMessageAborted(new reboot_api.errors_pb.Aborted(), {
                            message: e instanceof Error
                                ? `${e}`
                                : `Unknown error: ${JSON.stringify(e)}`
                        });
                        return { aborted };
                    }
                    else if (e instanceof Error) {
                        console.error(e);
                    }
                    else {
                        console.error(`[Reboot] Unknown error: ${JSON.stringify(e)}`);
                    }
                }
                await backoff.wait(`[Reboot] Retrying call to \`tests.reboot.GreeterMethods.ReadRecursiveMessage\` with backoff...`);
            }
        })();
        if (aborted) {
            return { aborted };
        }
        else if (!response.ok) {
            if (response.headers.get("content-type") === "application/json") {
                const status = reboot_api.Status.fromJson(await response.json());
                const aborted = GreeterReadRecursiveMessageAborted.fromStatus(status);
                console.warn(`[Reboot] 'Greeter.ReadRecursiveMessage' aborted with ${aborted.message}`);
                return { aborted };
            }
            else {
                const aborted = new GreeterReadRecursiveMessageAborted(new reboot_api.errors_pb.Unknown(), {
                    message: `Unknown error with HTTP status ${response.status}`
                });
                return { aborted };
            }
        }
        else {
            return {
                response: GreeterReadRecursiveMessageResponseFromProtobufShape((greeter_pb.ReadRecursiveMessageResponse.fromJson(await response.json())))
            };
        }
    }
    function useConstructAndStoreRecursiveMessage() {
        const [pending, setPending] = useState([]);
        useEffect(() => {
            const id = uuidv4();
            instance.useConstructAndStoreRecursiveMessage(id, setPending);
            return () => {
                instance.unuseConstructAndStoreRecursiveMessage(id);
            };
        }, []);
        const rebootClient = reboot_react.useRebootClient();
        const bearerToken = rebootClient.bearerToken;
        const constructAndStoreRecursiveMessage = useMemo(() => {
            const method = async (partialRequest = {}, options) => {
                var _a, _b;
                const request = GreeterConstructAndStoreRecursiveMessageRequestToProtobuf(partialRequest);
                const idempotencyKey = (_b = (_a = options === null || options === void 0 ? void 0 : options.idempotencyKey) !== null && _a !== void 0 ? _a : options === null || options === void 0 ? void 0 : options.key) !== null && _b !== void 0 ? _b : reboot_web.makeExpiringIdempotencyKey();
                const mutation = {
                    request,
                    idempotencyKey,
                    bearerToken,
                    metadata: options === null || options === void 0 ? void 0 : options.metadata,
                    isLoading: false, // Won't start loading if we're flushing mutations.
                };
                return instance.constructAndStoreRecursiveMessage(mutation);
            };
            method.pending =
                new Array();
            return method;
        }, [instance, bearerToken]);
        constructAndStoreRecursiveMessage.pending = pending;
        return constructAndStoreRecursiveMessage;
    }
    const constructAndStoreRecursiveMessage = useConstructAndStoreRecursiveMessage();
    // Don't re-render if `id` hasn't changed.
    return useMemo(() => ({
        mutators: {
            create,
            setAdjective,
            transactionSetAdjective,
            testLongRunningWriter,
            dangerousFields,
            storeRecursiveMessage,
            constructAndStoreRecursiveMessage,
        },
        idempotently: ({ key }) => {
            return {
                create: (partialRequest, options) => create(partialRequest, { ...options, key }),
                setAdjective: (partialRequest, options) => setAdjective(partialRequest, { ...options, key }),
                transactionSetAdjective: (partialRequest, options) => transactionSetAdjective(partialRequest, { ...options, key }),
                testLongRunningWriter: (partialRequest, options) => testLongRunningWriter(partialRequest, { ...options, key }),
                dangerousFields: (partialRequest, options) => dangerousFields(partialRequest, { ...options, key }),
                storeRecursiveMessage: (partialRequest, options) => storeRecursiveMessage(partialRequest, { ...options, key }),
                constructAndStoreRecursiveMessage: (partialRequest, options) => constructAndStoreRecursiveMessage(partialRequest, { ...options, key }),
            };
        },
        create,
        greet,
        useGreet,
        setAdjective,
        transactionSetAdjective,
        tryToConstructContext,
        useTryToConstructContext,
        tryToConstructExternalContext,
        useTryToConstructExternalContext,
        testLongRunningFetch,
        useTestLongRunningFetch,
        testLongRunningWriter,
        getWholeState,
        useGetWholeState,
        failWithException,
        useFailWithException,
        failWithAborted,
        useFailWithAborted,
        dangerousFields,
        storeRecursiveMessage,
        readRecursiveMessage,
        useReadRecursiveMessage,
        constructAndStoreRecursiveMessage,
    }), [id, bearerToken]);
};
export class Greeter {
}
Greeter.State = GreeterProto;
