/* eslint-disable */
// @ts-nocheck
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
var _GreeterBaseServicer_external, _a, _WorkflowState_external, _external, _idempotency, _b, _external_1, _c, _d, _GreeterServicer_storage, _GreeterServicer_instances, _GreeterAuthorizer_rules, _GreeterCreateAborted_error, _GreeterCreateAborted_message, _GreeterCreateTask_context, _GreeterCreateTask_promise, _GreeterGreetAborted_error, _GreeterGreetAborted_message, _GreeterGreetTask_context, _GreeterGreetTask_promise, _GreeterSetAdjectiveAborted_error, _GreeterSetAdjectiveAborted_message, _GreeterSetAdjectiveTask_context, _GreeterSetAdjectiveTask_promise, _GreeterTransactionSetAdjectiveAborted_error, _GreeterTransactionSetAdjectiveAborted_message, _GreeterTransactionSetAdjectiveTask_context, _GreeterTransactionSetAdjectiveTask_promise, _GreeterTryToConstructContextAborted_error, _GreeterTryToConstructContextAborted_message, _GreeterTryToConstructContextTask_context, _GreeterTryToConstructContextTask_promise, _GreeterTryToConstructExternalContextAborted_error, _GreeterTryToConstructExternalContextAborted_message, _GreeterTryToConstructExternalContextTask_context, _GreeterTryToConstructExternalContextTask_promise, _GreeterTestLongRunningFetchAborted_error, _GreeterTestLongRunningFetchAborted_message, _GreeterTestLongRunningFetchTask_context, _GreeterTestLongRunningFetchTask_promise, _GreeterTestLongRunningWriterAborted_error, _GreeterTestLongRunningWriterAborted_message, _GreeterTestLongRunningWriterTask_context, _GreeterTestLongRunningWriterTask_promise, _GreeterGetWholeStateAborted_error, _GreeterGetWholeStateAborted_message, _GreeterGetWholeStateTask_context, _GreeterGetWholeStateTask_promise, _GreeterFailWithExceptionAborted_error, _GreeterFailWithExceptionAborted_message, _GreeterFailWithExceptionTask_context, _GreeterFailWithExceptionTask_promise, _GreeterFailWithAbortedAborted_error, _GreeterFailWithAbortedAborted_message, _GreeterFailWithAbortedTask_context, _GreeterFailWithAbortedTask_promise, _GreeterWorkflowAborted_error, _GreeterWorkflowAborted_message, _GreeterWorkflowTask_context, _GreeterWorkflowTask_promise, _GreeterDangerousFieldsAborted_error, _GreeterDangerousFieldsAborted_message, _GreeterDangerousFieldsTask_context, _GreeterDangerousFieldsTask_promise, _GreeterStoreRecursiveMessageAborted_error, _GreeterStoreRecursiveMessageAborted_message, _GreeterStoreRecursiveMessageTask_context, _GreeterStoreRecursiveMessageTask_promise, _GreeterReadRecursiveMessageAborted_error, _GreeterReadRecursiveMessageAborted_message, _GreeterReadRecursiveMessageTask_context, _GreeterReadRecursiveMessageTask_promise, _GreeterConstructAndStoreRecursiveMessageAborted_error, _GreeterConstructAndStoreRecursiveMessageAborted_message, _GreeterConstructAndStoreRecursiveMessageTask_context, _GreeterConstructAndStoreRecursiveMessageTask_promise, _GreeterWeakReference_external, _GreeterWeakReference_id, _GreeterWeakReference_options, _weakReference, _options, _e, _weakReference_1, _options_1, _f, _weakReference_2, _options_2, _g, _ids, _h, _idempotency_1, _j;
import { reboot_native, ensureError } from "@reboot-dev/reboot";
import { Empty } from "@bufbuild/protobuf";
import { AsyncLocalStorage } from "node:async_hooks";
// Additionally re-export all messages_and_enums from the pb module.
export { CreateRequest, CreateResponse, GreetRequest, GreetResponse, SetAdjectiveRequest, SetAdjectiveResponse, TestLongRunningFetchRequest, GetWholeStateRequest, WorkflowResponse, ErrorWithValue, RecursiveMessage, StoreRecursiveMessageRequest, StoreRecursiveMessageResponse, ReadRecursiveMessageRequest, ReadRecursiveMessageResponse, ConstructAndStoreRecursiveMessageRequest, ConstructAndStoreRecursiveMessageResponse, DangerousFieldsRequest, Time, StopwatchRequest, StopwatchResponse, MatchColorRequest, MatchColorResponse, Color, } from "./greeter_pb.js";
import { Greeter as GreeterProto, } from "./greeter_pb.js";
import * as greeter_pb from "./greeter_pb.js";
import * as uuid from "uuid";
import * as reboot from "@reboot-dev/reboot";
import { InitializeContext, WorkflowContext, } from "@reboot-dev/reboot";
import * as protobuf_es from "@bufbuild/protobuf";
import * as reboot_api from "@reboot-dev/reboot-api";
reboot_api.check_bufbuild_protobuf_library(protobuf_es.Message);
// To support writers seeing partial updates of transactions,
// and transactions seeing updates from writers, we need to store
// a reference to the latest state in an ongoing transaction.
//
// Moreover, we need to update that _reference_ after each writer
// executes within a transaction. We do that in the generated
// code, see below.
const ongoingTransactionStates = {};
// Helper to get the `ongoingTransactionStates` dictionary key.
// The key should contain both the state ID and the state type name
// to avoid conflicts when multiple states share the same ID.
const ongoingTransactionStateKey = (context) => {
    return `${context.stateTypeName}/${context.stateId}`;
};
// Track state IDs that are being _constructed_ in a transaction
// so that when using Zod we don't validate the initial state which
// will fail validation if there are required fields.
const statesBeingConstructed = new Set();
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
const GreeterFromJsonString = (jsonState, options = { validate: true }) => {
    return GreeterState.fromJsonString(jsonState);
};
const GreeterFromBinary = (bytesState, options = { validate: true }) => {
    return GreeterState.fromBinary(bytesState);
};
const GreeterToProtobuf = (state, options = { validate: true }) => {
    return state instanceof GreeterState
        ? state
        : GreeterState.fromJson(state);
};
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
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterCreateRequestFromBinary = (bytesRequest) => {
    return GreeterCreateRequestFromProtobufShape(greeter_pb.CreateRequest.fromBinary(bytesRequest));
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
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterGreetRequestFromBinary = (bytesRequest) => {
    return GreeterGreetRequestFromProtobufShape(greeter_pb.GreetRequest.fromBinary(bytesRequest));
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
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterSetAdjectiveRequestFromBinary = (bytesRequest) => {
    return GreeterSetAdjectiveRequestFromProtobufShape(greeter_pb.SetAdjectiveRequest.fromBinary(bytesRequest));
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
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterTransactionSetAdjectiveRequestFromBinary = (bytesRequest) => {
    return GreeterTransactionSetAdjectiveRequestFromProtobufShape(greeter_pb.SetAdjectiveRequest.fromBinary(bytesRequest));
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
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterTryToConstructContextRequestFromBinary = (bytesRequest) => {
    return GreeterTryToConstructContextRequestFromProtobufShape(Empty.fromBinary(bytesRequest));
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
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterTryToConstructExternalContextRequestFromBinary = (bytesRequest) => {
    return GreeterTryToConstructExternalContextRequestFromProtobufShape(Empty.fromBinary(bytesRequest));
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
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterTestLongRunningFetchRequestFromBinary = (bytesRequest) => {
    return GreeterTestLongRunningFetchRequestFromProtobufShape(greeter_pb.TestLongRunningFetchRequest.fromBinary(bytesRequest));
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
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterTestLongRunningWriterRequestFromBinary = (bytesRequest) => {
    return GreeterTestLongRunningWriterRequestFromProtobufShape(Empty.fromBinary(bytesRequest));
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
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterGetWholeStateRequestFromBinary = (bytesRequest) => {
    return GreeterGetWholeStateRequestFromProtobufShape(greeter_pb.GetWholeStateRequest.fromBinary(bytesRequest));
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
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterFailWithExceptionRequestFromBinary = (bytesRequest) => {
    return GreeterFailWithExceptionRequestFromProtobufShape(Empty.fromBinary(bytesRequest));
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
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterFailWithAbortedRequestFromBinary = (bytesRequest) => {
    return GreeterFailWithAbortedRequestFromProtobufShape(Empty.fromBinary(bytesRequest));
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
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterWorkflowRequestFromBinary = (bytesRequest) => {
    return GreeterWorkflowRequestFromProtobufShape(Empty.fromBinary(bytesRequest));
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
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterDangerousFieldsRequestFromBinary = (bytesRequest) => {
    return GreeterDangerousFieldsRequestFromProtobufShape(greeter_pb.DangerousFieldsRequest.fromBinary(bytesRequest));
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
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterStoreRecursiveMessageRequestFromBinary = (bytesRequest) => {
    return GreeterStoreRecursiveMessageRequestFromProtobufShape(greeter_pb.StoreRecursiveMessageRequest.fromBinary(bytesRequest));
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
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterReadRecursiveMessageRequestFromBinary = (bytesRequest) => {
    return GreeterReadRecursiveMessageRequestFromProtobufShape(greeter_pb.ReadRecursiveMessageRequest.fromBinary(bytesRequest));
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
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterConstructAndStoreRecursiveMessageRequestFromBinary = (bytesRequest) => {
    return GreeterConstructAndStoreRecursiveMessageRequestFromProtobufShape(greeter_pb.ConstructAndStoreRecursiveMessageRequest.fromBinary(bytesRequest));
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
const GREETER_GREET_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_SET_ADJECTIVE_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_TRANSACTION_SET_ADJECTIVE_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_TRY_TO_CONSTRUCT_CONTEXT_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_TRY_TO_CONSTRUCT_EXTERNAL_CONTEXT_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_TEST_LONG_RUNNING_FETCH_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_TEST_LONG_RUNNING_WRITER_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_GET_WHOLE_STATE_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_FAIL_WITH_EXCEPTION_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_FAIL_WITH_ABORTED_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
    greeter_pb.ErrorWithValue,
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_WORKFLOW_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
    greeter_pb.ErrorWithValue,
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_DANGEROUS_FIELDS_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_STORE_RECURSIVE_MESSAGE_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_READ_RECURSIVE_MESSAGE_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_CONSTRUCT_AND_STORE_RECURSIVE_MESSAGE_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
export class GreeterBaseServicer extends reboot.Servicer {
    constructor() {
        super();
        // External reference to the native `Servicer`.
        _GreeterBaseServicer_external.set(this, void 0);
        const staticWorkflow = this.constructor.workflow;
        const instanceWorkflow = this.workflow;
        if (staticWorkflow === undefined && instanceWorkflow === undefined) {
            throw new Error(`\`Greeter\` servicer is missing implementation of static \`workflow\` method.`);
        }
        else if (staticWorkflow !== undefined && instanceWorkflow !== undefined) {
            throw new Error(`\`Greeter\` servicer has both static and instance implementations of \`workflow\` method.
        \nPlease implement the static version only.`);
        }
        else if (instanceWorkflow !== undefined) {
            console.warn(`Using instance method for \`Greeter.workflow\` is deprecated and will be removed in a future version. Please use a static method instead.`);
        }
    }
    ref(options) {
        const context = reboot.getContext();
        return new Greeter.WeakReference(context.stateId, options?.bearerToken, this);
    }
    static servicer(literal) {
        return class extends GreeterSingletonServicer {
            authorizer() {
                if (literal.authorizer !== undefined) {
                    return literal.authorizer();
                }
                return super.authorizer();
            }
            async create(context, state, request) {
                const [updatedState, response] = await literal.create(context, state, request);
                Object.assign(state, updatedState);
                return response;
            }
            async greet(context, state, request) {
                return await literal.greet(context, state, request);
            }
            async setAdjective(context, state, request) {
                const [updatedState, response] = await literal.setAdjective(context, state, request);
                Object.assign(state, updatedState);
                return response;
            }
            async transactionSetAdjective(context, state, request) {
                const [updatedState, response] = await literal.transactionSetAdjective(context, state, request);
                Object.assign(state, updatedState);
                return response;
            }
            async tryToConstructContext(context, state, request) {
                return await literal.tryToConstructContext(context, state, request);
            }
            async tryToConstructExternalContext(context, state, request) {
                return await literal.tryToConstructExternalContext(context, state, request);
            }
            async testLongRunningFetch(context, state, request) {
                return await literal.testLongRunningFetch(context, state, request);
            }
            async testLongRunningWriter(context, state, request) {
                const [updatedState, response] = await literal.testLongRunningWriter(context, state, request);
                Object.assign(state, updatedState);
                return response;
            }
            async getWholeState(context, state, request) {
                return await literal.getWholeState(context, state, request);
            }
            async failWithException(context, state, request) {
                return await literal.failWithException(context, state, request);
            }
            async failWithAborted(context, state, request) {
                return await literal.failWithAborted(context, state, request);
            }
            static async workflow(context, request) {
                return await GreeterBaseServicer.__servicer__.run({ servicer: this }, async () => {
                    return await literal.workflow(context, request);
                });
            }
            async dangerousFields(context, state, request) {
                const [updatedState, response] = await literal.dangerousFields(context, state, request);
                Object.assign(state, updatedState);
                return response;
            }
            async storeRecursiveMessage(context, state, request) {
                const [updatedState, response] = await literal.storeRecursiveMessage(context, state, request);
                Object.assign(state, updatedState);
                return response;
            }
            async readRecursiveMessage(context, state, request) {
                return await literal.readRecursiveMessage(context, state, request);
            }
            async constructAndStoreRecursiveMessage(context, state, request) {
                const [updatedState, response] = await literal.constructAndStoreRecursiveMessage(context, state, request);
                Object.assign(state, updatedState);
                return response;
            }
        };
    }
    async _Create(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            statesBeingConstructed.add(context.stateId);
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterCreateRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__Create(context, state, request);
            });
            const response = GreeterCreateResponseToProtobuf(partialResponse);
            // TODO: it's premature to overwrite the state now given that the
            // writer might still "fail" and an error will get propagated back
            // to the ongoing transaction which will still see the effects of
            // this writer. What we should be doing instead is creating a
            // callback API that we invoke only after a writer completes
            // that lets us update the state _reference_ then.
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                ongoingTransactionStates[ongoingTransactionStateKey(context)].copyFrom(state);
            }
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.state = state.toBinary();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.create'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
            statesBeingConstructed.delete(context.stateId);
        }
    }
    async _Greet(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterGreetRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__Greet(context, state, request);
            });
            const response = GreeterGreetResponseToProtobuf(partialResponse);
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.greet'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _SetAdjective(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterSetAdjectiveRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__SetAdjective(context, state, request);
            });
            const response = GreeterSetAdjectiveResponseToProtobuf(partialResponse);
            // TODO: it's premature to overwrite the state now given that the
            // writer might still "fail" and an error will get propagated back
            // to the ongoing transaction which will still see the effects of
            // this writer. What we should be doing instead is creating a
            // callback API that we invoke only after a writer completes
            // that lets us update the state _reference_ then.
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                ongoingTransactionStates[ongoingTransactionStateKey(context)].copyFrom(state);
            }
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.state = state.toBinary();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.setAdjective'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _TransactionSetAdjective(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            // TODO: assert that there are no ongoing transactions for this state.
            //
            // The `state` should be already validated above, so we can
            // just store it here.
            ongoingTransactionStates[ongoingTransactionStateKey(context)] = state;
            const request = GreeterTransactionSetAdjectiveRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__TransactionSetAdjective(context, state, request);
            });
            const response = GreeterTransactionSetAdjectiveResponseToProtobuf(partialResponse);
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.state = state.toBinary();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.transactionSetAdjective'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
            delete ongoingTransactionStates[ongoingTransactionStateKey(context)];
        }
    }
    async _TryToConstructContext(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterTryToConstructContextRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__TryToConstructContext(context, state, request);
            });
            const response = GreeterTryToConstructContextResponseToProtobuf(partialResponse);
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.tryToConstructContext'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _TryToConstructExternalContext(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterTryToConstructExternalContextRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__TryToConstructExternalContext(context, state, request);
            });
            const response = GreeterTryToConstructExternalContextResponseToProtobuf(partialResponse);
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.tryToConstructExternalContext'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _TestLongRunningFetch(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterTestLongRunningFetchRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__TestLongRunningFetch(context, state, request);
            });
            const response = GreeterTestLongRunningFetchResponseToProtobuf(partialResponse);
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.testLongRunningFetch'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _TestLongRunningWriter(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterTestLongRunningWriterRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__TestLongRunningWriter(context, state, request);
            });
            const response = GreeterTestLongRunningWriterResponseToProtobuf(partialResponse);
            // TODO: it's premature to overwrite the state now given that the
            // writer might still "fail" and an error will get propagated back
            // to the ongoing transaction which will still see the effects of
            // this writer. What we should be doing instead is creating a
            // callback API that we invoke only after a writer completes
            // that lets us update the state _reference_ then.
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                ongoingTransactionStates[ongoingTransactionStateKey(context)].copyFrom(state);
            }
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.state = state.toBinary();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.testLongRunningWriter'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _GetWholeState(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterGetWholeStateRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__GetWholeState(context, state, request);
            });
            const response = GreeterGetWholeStateResponseToProtobuf(partialResponse);
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.getWholeState'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _FailWithException(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterFailWithExceptionRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__FailWithException(context, state, request);
            });
            const response = GreeterFailWithExceptionResponseToProtobuf(partialResponse);
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.failWithException'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _FailWithAborted(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterFailWithAbortedRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__FailWithAborted(context, state, request);
            });
            const response = GreeterFailWithAbortedResponseToProtobuf(partialResponse);
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.failWithAborted'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _Workflow(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            const request = GreeterWorkflowRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__Workflow(context, request);
            });
            const response = GreeterWorkflowResponseToProtobuf(partialResponse);
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.workflow'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _DangerousFields(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterDangerousFieldsRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__DangerousFields(context, state, request);
            });
            const response = GreeterDangerousFieldsResponseToProtobuf(partialResponse);
            // TODO: it's premature to overwrite the state now given that the
            // writer might still "fail" and an error will get propagated back
            // to the ongoing transaction which will still see the effects of
            // this writer. What we should be doing instead is creating a
            // callback API that we invoke only after a writer completes
            // that lets us update the state _reference_ then.
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                ongoingTransactionStates[ongoingTransactionStateKey(context)].copyFrom(state);
            }
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.state = state.toBinary();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.dangerousFields'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _StoreRecursiveMessage(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterStoreRecursiveMessageRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__StoreRecursiveMessage(context, state, request);
            });
            const response = GreeterStoreRecursiveMessageResponseToProtobuf(partialResponse);
            // TODO: it's premature to overwrite the state now given that the
            // writer might still "fail" and an error will get propagated back
            // to the ongoing transaction which will still see the effects of
            // this writer. What we should be doing instead is creating a
            // callback API that we invoke only after a writer completes
            // that lets us update the state _reference_ then.
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                ongoingTransactionStates[ongoingTransactionStateKey(context)].copyFrom(state);
            }
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.state = state.toBinary();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.storeRecursiveMessage'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _ReadRecursiveMessage(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterReadRecursiveMessageRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__ReadRecursiveMessage(context, state, request);
            });
            const response = GreeterReadRecursiveMessageResponseToProtobuf(partialResponse);
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.readRecursiveMessage'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _ConstructAndStoreRecursiveMessage(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            // TODO: assert that there are no ongoing transactions for this state.
            //
            // The `state` should be already validated above, so we can
            // just store it here.
            ongoingTransactionStates[ongoingTransactionStateKey(context)] = state;
            const request = GreeterConstructAndStoreRecursiveMessageRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__ConstructAndStoreRecursiveMessage(context, state, request);
            });
            const response = GreeterConstructAndStoreRecursiveMessageResponseToProtobuf(partialResponse);
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.state = state.toBinary();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.constructAndStoreRecursiveMessage'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
            delete ongoingTransactionStates[ongoingTransactionStateKey(context)];
        }
    }
    async __dispatch(external, cancelled, bytesCall) {
        const call = reboot_api.nodejs_pb.TrampolineCall.fromBinary(bytesCall);
        const context = reboot.Context.fromNativeExternal({
            external,
            kind: reboot_api.nodejs_pb.Kind[call.kind],
            stateId: call.context.stateId,
            method: call.context.method,
            stateTypeName: call.context.stateTypeName,
            callerBearerToken: (call.context.callerBearerToken !== undefined
                ? call.context.callerBearerToken
                : null),
            cookie: (call.context.cookie !== undefined
                ? call.context.cookie
                : null),
            appInternal: call.context.appInternal,
            auth: (call.context.auth !== undefined
                ? reboot.Auth.fromProtoBytes(call.context.auth)
                : null),
            workflowId: (call.context.workflowId !== undefined
                ? call.context.workflowId
                : null),
            cancelled,
        });
        // TODO: as an optimization consider marking `context` as
        // "expired" before returning so that anyone else that tries to
        // use it will get an exception that the method for which this
        // context was valid has completed, that way we don't need to pay
        // to "interrupt" Python to let Python know that the Python
        // context instance can now be safely deleted.
        return this["_" + call.context.method](context, call.state, call.request);
    }
    __storeExternal(external) {
        __classPrivateFieldSet(this, _GreeterBaseServicer_external, external, "f");
    }
    get __external() {
        if (__classPrivateFieldGet(this, _GreeterBaseServicer_external, "f") === undefined) {
            throw new Error(`Unexpected undefined external`);
        }
        return __classPrivateFieldGet(this, _GreeterBaseServicer_external, "f");
    }
    authorizer() {
        return null;
    }
    _authorizer() {
        // Get authorizer, if any, converting from a rule if necessary.
        const authorizer = ((authorizerOrRule) => {
            if (authorizerOrRule instanceof reboot.AuthorizerRule) {
                return new GreeterAuthorizer({ _default: authorizerOrRule });
            }
            return authorizerOrRule;
        })(this.authorizer());
        return authorizer;
    }
}
_GreeterBaseServicer_external = new WeakMap();
GreeterBaseServicer.__rbtModule__ = "tests.reboot.greeter_rbt";
GreeterBaseServicer.__servicerNodeAdaptor__ = "GreeterServicerNodeAdaptor";
// Async local storage provides access to servicer for each workflow call, i.e.,
// there may be multiple workflows executing concurrently but each
// might have a different `servicer`.
GreeterBaseServicer.__servicer__ = new AsyncLocalStorage();
GreeterBaseServicer.WorkflowState = (_a = class {
        constructor(external) {
            _WorkflowState_external.set(this, void 0);
            __classPrivateFieldSet(this, _WorkflowState_external, external, "f");
        }
        async read(context) {
            return await (reboot.isWithinUntil()
                ? this.always()
                : (reboot.isWithinLoop()
                    ? this.perIteration()
                    : this.perWorkflow())).read(context);
        }
        async write(idempotencyAlias, context, writer, options = {}) {
            return await (reboot.isWithinLoop()
                ? this.perIteration(idempotencyAlias)
                : this.perWorkflow(idempotencyAlias)).write(context, writer, options);
        }
        perWorkflow(alias) {
            return new GreeterBaseServicer.WorkflowState._Idempotently(__classPrivateFieldGet(this, _WorkflowState_external, "f"), { alias, how: reboot.PER_WORKFLOW });
        }
        perIteration(alias) {
            return new GreeterBaseServicer.WorkflowState._Idempotently(__classPrivateFieldGet(this, _WorkflowState_external, "f"), { alias, how: reboot.PER_ITERATION });
        }
        always() {
            return new GreeterBaseServicer.WorkflowState._Always(__classPrivateFieldGet(this, _WorkflowState_external, "f"));
        }
    },
    _WorkflowState_external = new WeakMap(),
    __setFunctionName(_a, "WorkflowState"),
    _a._Idempotently = (_b = class {
            constructor(external, idempotency) {
                _external.set(this, void 0);
                _idempotency.set(this, void 0);
                __classPrivateFieldSet(this, _external, external, "f");
                __classPrivateFieldSet(this, _idempotency, idempotency, "f");
            }
            async read(context) {
                return GreeterFromJsonString(await reboot_native.Servicer_read(__classPrivateFieldGet(this, _external, "f"), context.__external, JSON.stringify(__classPrivateFieldGet(this, _idempotency, "f"))));
            }
            async write(context, writer, { schema } = {}) {
                const result = await reboot_native.Servicer_write(__classPrivateFieldGet(this, _external, "f"), context.__external, 
                // Bind with async local storage so we can check things like
                // `isWithinLoop`, etc.
                AsyncLocalStorage.bind(async (jsonState) => {
                    const state = GreeterFromJsonString(jsonState);
                    try {
                        const t = await writer(state);
                        // Fail early if the developer thinks that they have some value
                        // that they want to validate but we got `undefined`.
                        if (t === undefined && schema !== undefined) {
                            throw new Error("Not expecting 'schema' as you are returning 'void' (or explicitly 'undefined') from your inline writer; did you mean to return a value (or if you want to explicitly return the absence of a value use 'null')");
                        }
                        if (t !== undefined) {
                            // Fail early if the developer forgot to pass `schema`.
                            if (schema === undefined) {
                                throw new Error("Expecting 'schema' as you are returning a value from your inline writer");
                            }
                            let validate = schema["~standard"].validate(t);
                            if (validate instanceof Promise) {
                                validate = await validate;
                            }
                            // If the `issues` field exists, the validation failed.
                            if (validate.issues) {
                                throw new Error(`Failed to validate result of inline writer: ${JSON.stringify(validate.issues, null, 2)}`);
                            }
                        }
                        return JSON.stringify({
                            // NOTE: we use `stringify` from
                            // `@reboot-dev/reboot-api` because it can handle
                            // `BigInt` and `Uint8Array` which are common types
                            // from protobuf.
                            //
                            // We use the empty string to represent a
                            // `callable` returning `void` (or explicitly
                            // `undefined`).
                            //
                            // To differentiate returning `void` (or explicitly
                            // `undefined`) from `reboot_api.stringify` returning an empty
                            // string we use `{ value: t }`.
                            result: (t !== undefined && reboot_api.stringify({ value: t })) || "",
                            state: GreeterToProtobuf(state).toJson(),
                        });
                    }
                    catch (e) {
                        throw ensureError(e);
                    }
                }), JSON.stringify(__classPrivateFieldGet(this, _idempotency, "f")));
                // NOTE: we parse and validate `value` every time, even the first
                // time, so as to catch bugs where the `value` returned from
                // `callable` might not parse or be valid. We will have already
                // persisted `result`, so in the event of a bug the developer will
                // have to change the idempotency alias so that `callable` is
                // re-executed. These semantics are the same as Python (although
                // Python uses the `type` keyword argument instead of the
                // `schema` property we use here).
                reboot_api.assert(result !== undefined);
                if (result !== "") {
                    // NOTE: we use `parse` from `@reboot-dev/reboot-api`
                    // because it can handle `BigInt` and `Uint8Array` which are
                    // common types from protobuf.
                    const { value } = reboot_api.parse(result);
                    if (schema === undefined) {
                        throw new Error("Expecting 'schema' as we have already memoized a result, has " +
                            "the code been updated to remove a previously existing 'schema'");
                    }
                    let validate = schema["~standard"].validate(value);
                    if (validate instanceof Promise) {
                        validate = await validate;
                    }
                    // If the `issues` field exists, the validation failed.
                    if (validate.issues) {
                        throw new Error(`Failed to validate result of inline writer: ${JSON.stringify(validate.issues, null, 2)}`);
                    }
                    return validate.value;
                }
                // Otherwise `callable` must have returned void (or explicitly
                // `undefined`), fall through.
            }
        },
        _external = new WeakMap(),
        _idempotency = new WeakMap(),
        _b),
    _a._Always = (_c = class {
            constructor(external) {
                _external_1.set(this, void 0);
                __classPrivateFieldSet(this, _external_1, external, "f");
            }
            async read(context) {
                return new GreeterBaseServicer.WorkflowState._Idempotently(__classPrivateFieldGet(this, _external_1, "f"), { how: reboot.ALWAYS }).read(context);
            }
            async write(context, writer) {
                return new GreeterBaseServicer.WorkflowState._Idempotently(__classPrivateFieldGet(this, _external_1, "f"), { how: reboot.ALWAYS }).write(context, writer, {});
            }
        },
        _external_1 = new WeakMap(),
        _c),
    _a);
export class GreeterSingletonServicer extends GreeterBaseServicer {
    async __Create(context, state, request) {
        return await this.create(context, state, request);
    }
    async __Greet(context, state, request) {
        return await this.greet(context, state, request);
    }
    async __SetAdjective(context, state, request) {
        return await this.setAdjective(context, state, request);
    }
    async __TransactionSetAdjective(context, state, request) {
        return await this.transactionSetAdjective(context, state, request);
    }
    async __TryToConstructContext(context, state, request) {
        return await this.tryToConstructContext(context, state, request);
    }
    async __TryToConstructExternalContext(context, state, request) {
        return await this.tryToConstructExternalContext(context, state, request);
    }
    async __TestLongRunningFetch(context, state, request) {
        return await this.testLongRunningFetch(context, state, request);
    }
    async __TestLongRunningWriter(context, state, request) {
        return await this.testLongRunningWriter(context, state, request);
    }
    async __GetWholeState(context, state, request) {
        return await this.getWholeState(context, state, request);
    }
    async __FailWithException(context, state, request) {
        return await this.failWithException(context, state, request);
    }
    async __FailWithAborted(context, state, request) {
        return await this.failWithAborted(context, state, request);
    }
    async __Workflow(context, request) {
        return await GreeterBaseServicer.__servicer__.run({ servicer: this }, async () => {
            if (this.workflow !== undefined) {
                // Call the instance method (deprecated).
                return await this.workflow(context, request);
            }
            else {
                // Call the static method.
                return await this.constructor.workflow(context, request);
            }
        });
    }
    async __DangerousFields(context, state, request) {
        return await this.dangerousFields(context, state, request);
    }
    async __StoreRecursiveMessage(context, state, request) {
        return await this.storeRecursiveMessage(context, state, request);
    }
    async __ReadRecursiveMessage(context, state, request) {
        return await this.readRecursiveMessage(context, state, request);
    }
    async __ConstructAndStoreRecursiveMessage(context, state, request) {
        return await this.constructAndStoreRecursiveMessage(context, state, request);
    }
    get state() {
        return new GreeterBaseServicer.WorkflowState(this.__external);
    }
}
export class GreeterServicer extends GreeterBaseServicer {
    get state() {
        const store = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).getStore();
        if (!store) {
            throw new Error("`state` property is only relevant within a `Servicer` method");
        }
        if (store.workflow) {
            throw new Error("`this.state` is not valid within a `workflow` because a `workflow `" +
                "is not _atomic_; use `await this.ref().read(context)` instead");
        }
        reboot_api.assert(store.state !== undefined);
        return store.state;
    }
    set state(state) {
        const store = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).getStore();
        if (!store) {
            throw new Error("`state` property is only relevant within a `Servicer` method");
        }
        if (store.workflow) {
            throw new Error("`this.state` is not valid within a `workflow` because a `workflow `" +
                "is not _atomic_; use `await this.ref().write(...)` instead");
        }
        reboot_api.assert(store.state !== undefined);
        Object.assign(store.state, state);
    }
    async __Create(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.create(context, request);
        });
    }
    async __Greet(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.greet(context, request);
        });
    }
    async __SetAdjective(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.setAdjective(context, request);
        });
    }
    async __TransactionSetAdjective(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.transactionSetAdjective(context, request);
        });
    }
    async __TryToConstructContext(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.tryToConstructContext(context, request);
        });
    }
    async __TryToConstructExternalContext(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.tryToConstructExternalContext(context, request);
        });
    }
    async __TestLongRunningFetch(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.testLongRunningFetch(context, request);
        });
    }
    async __TestLongRunningWriter(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.testLongRunningWriter(context, request);
        });
    }
    async __GetWholeState(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.getWholeState(context, request);
        });
    }
    async __FailWithException(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.failWithException(context, request);
        });
    }
    async __FailWithAborted(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.failWithAborted(context, request);
        });
    }
    async __Workflow(context, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ workflow: true }, async () => {
            return await GreeterBaseServicer.__servicer__.run({ servicer: instance }, async () => {
                if (instance.workflow !== undefined) {
                    // Call the instance method (deprecated).
                    return await instance.workflow(context, request);
                }
                else {
                    // Call the static method.
                    return await instance.constructor.workflow(context, request);
                }
            });
        });
    }
    async __DangerousFields(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.dangerousFields(context, request);
        });
    }
    async __StoreRecursiveMessage(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.storeRecursiveMessage(context, request);
        });
    }
    async __ReadRecursiveMessage(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.readRecursiveMessage(context, request);
        });
    }
    async __ConstructAndStoreRecursiveMessage(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.constructAndStoreRecursiveMessage(context, request);
        });
    }
}
_d = GreeterServicer;
// Async local storage provides access to state for each call, i.e.,
// there may be multiple readers executing concurrently but each
// might have a different `state`.
_GreeterServicer_storage = { value: new AsyncLocalStorage() };
// An instance of the derived class for each state. We need it to be
// able to keep some private data per state servicer class, but not
// making it be implicitly `static`. For example:
//
// class MyServicer extends GreeterServicer {
//  private: myData = ...;
// }
//
// Then each `stateId` will have its own instance of `MyServicer`
// stored here.
_GreeterServicer_instances = { value: new Map() };
export class GreeterAuthorizer extends reboot.Authorizer {
    constructor(rules) {
        super();
        _GreeterAuthorizer_rules.set(this, void 0);
        __classPrivateFieldSet(this, _GreeterAuthorizer_rules, { ...rules, _default: rules?._default ?? reboot.allowIf({ all: [reboot.isAppInternal] }) }, "f");
    }
    async _authorize(external, cancelled, bytesCall) {
        const call = reboot_api.nodejs_pb.AuthorizeCall.fromBinary(bytesCall);
        const context = reboot.Context.fromNativeExternal({
            external,
            kind: "reader",
            stateId: call.context.stateId,
            method: call.context.method,
            stateTypeName: call.context.stateTypeName,
            callerBearerToken: call.context.callerBearerToken,
            cookie: call.context.cookie,
            appInternal: call.context.appInternal,
            auth: (call.context.auth !== undefined
                ? reboot.Auth.fromProtoBytes(call.context.auth)
                : null),
            workflowId: (call.context.workflowId !== undefined
                ? call.context.workflowId
                : null),
            cancelled,
        });
        const anyRequest = protobuf_es.Any.fromBinary(call.request);
        if (anyRequest.is(greeter_pb.CreateRequest)) {
            const unpackedRequest = new greeter_pb.CreateRequest();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterCreateRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.create'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(greeter_pb.GreetRequest)) {
            const unpackedRequest = new greeter_pb.GreetRequest();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterGreetRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.greet'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(greeter_pb.SetAdjectiveRequest)) {
            const unpackedRequest = new greeter_pb.SetAdjectiveRequest();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterSetAdjectiveRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.setAdjective'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(greeter_pb.SetAdjectiveRequest)) {
            const unpackedRequest = new greeter_pb.SetAdjectiveRequest();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterTransactionSetAdjectiveRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.transactionSetAdjective'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(Empty)) {
            const unpackedRequest = new Empty();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterTryToConstructContextRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.tryToConstructContext'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(Empty)) {
            const unpackedRequest = new Empty();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterTryToConstructExternalContextRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.tryToConstructExternalContext'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(greeter_pb.TestLongRunningFetchRequest)) {
            const unpackedRequest = new greeter_pb.TestLongRunningFetchRequest();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterTestLongRunningFetchRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.testLongRunningFetch'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(Empty)) {
            const unpackedRequest = new Empty();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterTestLongRunningWriterRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.testLongRunningWriter'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(greeter_pb.GetWholeStateRequest)) {
            const unpackedRequest = new greeter_pb.GetWholeStateRequest();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterGetWholeStateRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.getWholeState'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(Empty)) {
            const unpackedRequest = new Empty();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterFailWithExceptionRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.failWithException'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(Empty)) {
            const unpackedRequest = new Empty();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterFailWithAbortedRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.failWithAborted'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(Empty)) {
            const unpackedRequest = new Empty();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterWorkflowRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.workflow'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(greeter_pb.DangerousFieldsRequest)) {
            const unpackedRequest = new greeter_pb.DangerousFieldsRequest();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterDangerousFieldsRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.dangerousFields'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(greeter_pb.StoreRecursiveMessageRequest)) {
            const unpackedRequest = new greeter_pb.StoreRecursiveMessageRequest();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterStoreRecursiveMessageRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.storeRecursiveMessage'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(greeter_pb.ReadRecursiveMessageRequest)) {
            const unpackedRequest = new greeter_pb.ReadRecursiveMessageRequest();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterReadRecursiveMessageRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.readRecursiveMessage'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(greeter_pb.ConstructAndStoreRecursiveMessageRequest)) {
            const unpackedRequest = new greeter_pb.ConstructAndStoreRecursiveMessageRequest();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterConstructAndStoreRecursiveMessageRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.constructAndStoreRecursiveMessage'\n`);
                throw error;
            }
        }
        else {
            throw new Error(`Unexpected type for ${request}: ${anyRequest.typeUrl}.`);
        }
    }
    ;
    async authorize(methodName, context, state, request) {
        if (methodName == 'tests.reboot.GreeterMethods.Create') {
            return await this.create(context, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.Greet') {
            return await this.greet(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.SetAdjective') {
            return await this.setAdjective(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.TransactionSetAdjective') {
            return await this.transactionSetAdjective(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.TryToConstructContext') {
            return await this.tryToConstructContext(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.TryToConstructExternalContext') {
            return await this.tryToConstructExternalContext(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.TestLongRunningFetch') {
            return await this.testLongRunningFetch(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.TestLongRunningWriter') {
            return await this.testLongRunningWriter(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.GetWholeState') {
            return await this.getWholeState(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.FailWithException') {
            return await this.failWithException(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.FailWithAborted') {
            return await this.failWithAborted(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.Workflow') {
            return await this.workflow(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.DangerousFields') {
            return await this.dangerousFields(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.StoreRecursiveMessage') {
            return await this.storeRecursiveMessage(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.ReadRecursiveMessage') {
            return await this.readRecursiveMessage(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.ConstructAndStoreRecursiveMessage') {
            return await this.constructAndStoreRecursiveMessage(context, state, request);
        }
        else {
            return new reboot_api.errors_pb.PermissionDenied();
        }
    }
    async create(context, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").create ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            request: request,
        });
    }
    async greet(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").greet ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async setAdjective(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").setAdjective ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async transactionSetAdjective(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").transactionSetAdjective ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async tryToConstructContext(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").tryToConstructContext ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async tryToConstructExternalContext(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").tryToConstructExternalContext ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async testLongRunningFetch(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").testLongRunningFetch ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async testLongRunningWriter(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").testLongRunningWriter ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async getWholeState(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").getWholeState ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async failWithException(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").failWithException ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async failWithAborted(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").failWithAborted ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async workflow(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").workflow ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async dangerousFields(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").dangerousFields ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async storeRecursiveMessage(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").storeRecursiveMessage ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async readRecursiveMessage(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").readRecursiveMessage ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async constructAndStoreRecursiveMessage(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").constructAndStoreRecursiveMessage ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
}
_GreeterAuthorizer_rules = new WeakMap();
export class GreeterState extends GreeterProto {
    static fromBinary(bytes, options) {
        const state = new GreeterState();
        state.fromBinary(bytes, options);
        return state;
    }
    static fromJson(jsonValue, options) {
        const state = new GreeterState();
        state.fromJson(jsonValue, options);
        return state;
    }
    static fromJsonString(jsonString, options) {
        const state = new GreeterState();
        state.fromJsonString(jsonString, options);
        return state;
    }
    clone() {
        const state = new GreeterState();
        state.copyFrom(super.clone());
        return state;
    }
    copyFrom(that) {
        // Unfortunately, protobuf-es does not have `CopyFrom` like Python
        // or C++ protobuf. Instead, protobuf-es has `fromJson` but it
        // performs a merge. Thus, we have to first clear all of the fields
        // in the message before calling `fromJson`.
        reboot.clearFields(this);
        this.fromJson(that.toJson());
    }
}
export class GreeterCreateAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_CREATE_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.CreateAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.CreateAborted(error, { message: status.message });
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
export class GreeterCreateTask {
    constructor(context, taskId) {
        _GreeterCreateTask_context.set(this, void 0);
        _GreeterCreateTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterCreateTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterCreateTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterCreateTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterCreateTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterCreateTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "Create",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .CreateAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterCreateResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterCreateTask_promise, "f").then(...args);
    }
}
_GreeterCreateTask_context = new WeakMap(), _GreeterCreateTask_promise = new WeakMap();
export class GreeterGreetAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_GREET_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.GreetAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.GreetAborted(error, { message: status.message });
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
export class GreeterGreetTask {
    constructor(context, taskId) {
        _GreeterGreetTask_context.set(this, void 0);
        _GreeterGreetTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterGreetTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterGreetTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterGreetTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterGreetTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterGreetTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "Greet",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .GreetAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterGreetResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterGreetTask_promise, "f").then(...args);
    }
}
_GreeterGreetTask_context = new WeakMap(), _GreeterGreetTask_promise = new WeakMap();
export class GreeterSetAdjectiveAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_SET_ADJECTIVE_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.SetAdjectiveAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.SetAdjectiveAborted(error, { message: status.message });
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
export class GreeterSetAdjectiveTask {
    constructor(context, taskId) {
        _GreeterSetAdjectiveTask_context.set(this, void 0);
        _GreeterSetAdjectiveTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterSetAdjectiveTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterSetAdjectiveTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterSetAdjectiveTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterSetAdjectiveTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterSetAdjectiveTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "SetAdjective",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .SetAdjectiveAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterSetAdjectiveResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterSetAdjectiveTask_promise, "f").then(...args);
    }
}
_GreeterSetAdjectiveTask_context = new WeakMap(), _GreeterSetAdjectiveTask_promise = new WeakMap();
export class GreeterTransactionSetAdjectiveAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_TRANSACTION_SET_ADJECTIVE_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.TransactionSetAdjectiveAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.TransactionSetAdjectiveAborted(error, { message: status.message });
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
export class GreeterTransactionSetAdjectiveTask {
    constructor(context, taskId) {
        _GreeterTransactionSetAdjectiveTask_context.set(this, void 0);
        _GreeterTransactionSetAdjectiveTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterTransactionSetAdjectiveTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterTransactionSetAdjectiveTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterTransactionSetAdjectiveTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterTransactionSetAdjectiveTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterTransactionSetAdjectiveTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "TransactionSetAdjective",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .TransactionSetAdjectiveAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterTransactionSetAdjectiveResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterTransactionSetAdjectiveTask_promise, "f").then(...args);
    }
}
_GreeterTransactionSetAdjectiveTask_context = new WeakMap(), _GreeterTransactionSetAdjectiveTask_promise = new WeakMap();
export class GreeterTryToConstructContextAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_TRY_TO_CONSTRUCT_CONTEXT_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.TryToConstructContextAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.TryToConstructContextAborted(error, { message: status.message });
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
export class GreeterTryToConstructContextTask {
    constructor(context, taskId) {
        _GreeterTryToConstructContextTask_context.set(this, void 0);
        _GreeterTryToConstructContextTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterTryToConstructContextTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterTryToConstructContextTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterTryToConstructContextTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterTryToConstructContextTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterTryToConstructContextTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "TryToConstructContext",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .TryToConstructContextAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterTryToConstructContextResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterTryToConstructContextTask_promise, "f").then(...args);
    }
}
_GreeterTryToConstructContextTask_context = new WeakMap(), _GreeterTryToConstructContextTask_promise = new WeakMap();
export class GreeterTryToConstructExternalContextAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_TRY_TO_CONSTRUCT_EXTERNAL_CONTEXT_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.TryToConstructExternalContextAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.TryToConstructExternalContextAborted(error, { message: status.message });
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
export class GreeterTryToConstructExternalContextTask {
    constructor(context, taskId) {
        _GreeterTryToConstructExternalContextTask_context.set(this, void 0);
        _GreeterTryToConstructExternalContextTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterTryToConstructExternalContextTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterTryToConstructExternalContextTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterTryToConstructExternalContextTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterTryToConstructExternalContextTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterTryToConstructExternalContextTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "TryToConstructExternalContext",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .TryToConstructExternalContextAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterTryToConstructExternalContextResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterTryToConstructExternalContextTask_promise, "f").then(...args);
    }
}
_GreeterTryToConstructExternalContextTask_context = new WeakMap(), _GreeterTryToConstructExternalContextTask_promise = new WeakMap();
export class GreeterTestLongRunningFetchAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_TEST_LONG_RUNNING_FETCH_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.TestLongRunningFetchAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.TestLongRunningFetchAborted(error, { message: status.message });
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
export class GreeterTestLongRunningFetchTask {
    constructor(context, taskId) {
        _GreeterTestLongRunningFetchTask_context.set(this, void 0);
        _GreeterTestLongRunningFetchTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterTestLongRunningFetchTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterTestLongRunningFetchTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterTestLongRunningFetchTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterTestLongRunningFetchTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterTestLongRunningFetchTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "TestLongRunningFetch",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .TestLongRunningFetchAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterTestLongRunningFetchResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterTestLongRunningFetchTask_promise, "f").then(...args);
    }
}
_GreeterTestLongRunningFetchTask_context = new WeakMap(), _GreeterTestLongRunningFetchTask_promise = new WeakMap();
export class GreeterTestLongRunningWriterAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_TEST_LONG_RUNNING_WRITER_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.TestLongRunningWriterAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.TestLongRunningWriterAborted(error, { message: status.message });
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
export class GreeterTestLongRunningWriterTask {
    constructor(context, taskId) {
        _GreeterTestLongRunningWriterTask_context.set(this, void 0);
        _GreeterTestLongRunningWriterTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterTestLongRunningWriterTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterTestLongRunningWriterTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterTestLongRunningWriterTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterTestLongRunningWriterTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterTestLongRunningWriterTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "TestLongRunningWriter",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .TestLongRunningWriterAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterTestLongRunningWriterResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterTestLongRunningWriterTask_promise, "f").then(...args);
    }
}
_GreeterTestLongRunningWriterTask_context = new WeakMap(), _GreeterTestLongRunningWriterTask_promise = new WeakMap();
export class GreeterGetWholeStateAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_GET_WHOLE_STATE_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.GetWholeStateAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.GetWholeStateAborted(error, { message: status.message });
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
export class GreeterGetWholeStateTask {
    constructor(context, taskId) {
        _GreeterGetWholeStateTask_context.set(this, void 0);
        _GreeterGetWholeStateTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterGetWholeStateTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterGetWholeStateTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterGetWholeStateTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterGetWholeStateTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterGetWholeStateTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "GetWholeState",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .GetWholeStateAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterGetWholeStateResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterGetWholeStateTask_promise, "f").then(...args);
    }
}
_GreeterGetWholeStateTask_context = new WeakMap(), _GreeterGetWholeStateTask_promise = new WeakMap();
export class GreeterFailWithExceptionAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_FAIL_WITH_EXCEPTION_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.FailWithExceptionAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.FailWithExceptionAborted(error, { message: status.message });
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
export class GreeterFailWithExceptionTask {
    constructor(context, taskId) {
        _GreeterFailWithExceptionTask_context.set(this, void 0);
        _GreeterFailWithExceptionTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterFailWithExceptionTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterFailWithExceptionTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterFailWithExceptionTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterFailWithExceptionTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterFailWithExceptionTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "FailWithException",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .FailWithExceptionAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterFailWithExceptionResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterFailWithExceptionTask_promise, "f").then(...args);
    }
}
_GreeterFailWithExceptionTask_context = new WeakMap(), _GreeterFailWithExceptionTask_promise = new WeakMap();
export class GreeterFailWithAbortedAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_FAIL_WITH_ABORTED_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.FailWithAbortedAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.FailWithAbortedAborted(error, { message: status.message });
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
export class GreeterFailWithAbortedTask {
    constructor(context, taskId) {
        _GreeterFailWithAbortedTask_context.set(this, void 0);
        _GreeterFailWithAbortedTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterFailWithAbortedTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterFailWithAbortedTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterFailWithAbortedTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterFailWithAbortedTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterFailWithAbortedTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "FailWithAborted",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .FailWithAbortedAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterFailWithAbortedResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterFailWithAbortedTask_promise, "f").then(...args);
    }
}
_GreeterFailWithAbortedTask_context = new WeakMap(), _GreeterFailWithAbortedTask_promise = new WeakMap();
export class GreeterWorkflowAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_WORKFLOW_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.WorkflowAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.WorkflowAborted(error, { message: status.message });
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
export class GreeterWorkflowTask {
    constructor(context, taskId) {
        _GreeterWorkflowTask_context.set(this, void 0);
        _GreeterWorkflowTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterWorkflowTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterWorkflowTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterWorkflowTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterWorkflowTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterWorkflowTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "Workflow",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .WorkflowAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterWorkflowResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterWorkflowTask_promise, "f").then(...args);
    }
}
_GreeterWorkflowTask_context = new WeakMap(), _GreeterWorkflowTask_promise = new WeakMap();
export class GreeterDangerousFieldsAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_DANGEROUS_FIELDS_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.DangerousFieldsAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.DangerousFieldsAborted(error, { message: status.message });
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
export class GreeterDangerousFieldsTask {
    constructor(context, taskId) {
        _GreeterDangerousFieldsTask_context.set(this, void 0);
        _GreeterDangerousFieldsTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterDangerousFieldsTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterDangerousFieldsTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterDangerousFieldsTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterDangerousFieldsTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterDangerousFieldsTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "DangerousFields",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .DangerousFieldsAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterDangerousFieldsResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterDangerousFieldsTask_promise, "f").then(...args);
    }
}
_GreeterDangerousFieldsTask_context = new WeakMap(), _GreeterDangerousFieldsTask_promise = new WeakMap();
export class GreeterStoreRecursiveMessageAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_STORE_RECURSIVE_MESSAGE_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.StoreRecursiveMessageAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.StoreRecursiveMessageAborted(error, { message: status.message });
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
export class GreeterStoreRecursiveMessageTask {
    constructor(context, taskId) {
        _GreeterStoreRecursiveMessageTask_context.set(this, void 0);
        _GreeterStoreRecursiveMessageTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterStoreRecursiveMessageTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterStoreRecursiveMessageTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterStoreRecursiveMessageTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterStoreRecursiveMessageTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterStoreRecursiveMessageTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "StoreRecursiveMessage",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .StoreRecursiveMessageAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterStoreRecursiveMessageResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterStoreRecursiveMessageTask_promise, "f").then(...args);
    }
}
_GreeterStoreRecursiveMessageTask_context = new WeakMap(), _GreeterStoreRecursiveMessageTask_promise = new WeakMap();
export class GreeterReadRecursiveMessageAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_READ_RECURSIVE_MESSAGE_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.ReadRecursiveMessageAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.ReadRecursiveMessageAborted(error, { message: status.message });
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
export class GreeterReadRecursiveMessageTask {
    constructor(context, taskId) {
        _GreeterReadRecursiveMessageTask_context.set(this, void 0);
        _GreeterReadRecursiveMessageTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterReadRecursiveMessageTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterReadRecursiveMessageTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterReadRecursiveMessageTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterReadRecursiveMessageTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterReadRecursiveMessageTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "ReadRecursiveMessage",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .ReadRecursiveMessageAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterReadRecursiveMessageResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterReadRecursiveMessageTask_promise, "f").then(...args);
    }
}
_GreeterReadRecursiveMessageTask_context = new WeakMap(), _GreeterReadRecursiveMessageTask_promise = new WeakMap();
export class GreeterConstructAndStoreRecursiveMessageAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_CONSTRUCT_AND_STORE_RECURSIVE_MESSAGE_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.ConstructAndStoreRecursiveMessageAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.ConstructAndStoreRecursiveMessageAborted(error, { message: status.message });
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
export class GreeterConstructAndStoreRecursiveMessageTask {
    constructor(context, taskId) {
        _GreeterConstructAndStoreRecursiveMessageTask_context.set(this, void 0);
        _GreeterConstructAndStoreRecursiveMessageTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterConstructAndStoreRecursiveMessageTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterConstructAndStoreRecursiveMessageTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterConstructAndStoreRecursiveMessageTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterConstructAndStoreRecursiveMessageTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterConstructAndStoreRecursiveMessageTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "ConstructAndStoreRecursiveMessage",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .ConstructAndStoreRecursiveMessageAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterConstructAndStoreRecursiveMessageResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterConstructAndStoreRecursiveMessageTask_promise, "f").then(...args);
    }
}
_GreeterConstructAndStoreRecursiveMessageTask_context = new WeakMap(), _GreeterConstructAndStoreRecursiveMessageTask_promise = new WeakMap();
export class GreeterWeakReference {
    constructor(id, bearerToken, servicer) {
        _GreeterWeakReference_external.set(this, void 0);
        _GreeterWeakReference_id.set(this, void 0);
        _GreeterWeakReference_options.set(this, void 0);
        __classPrivateFieldSet(this, _GreeterWeakReference_id, id, "f");
        __classPrivateFieldSet(this, _GreeterWeakReference_options, bearerToken === null ? {} : { bearerToken }, "f");
        this._servicer = servicer;
        __classPrivateFieldSet(this, _GreeterWeakReference_external, reboot_native.Service_constructor({
            rbtModule: "tests.reboot.greeter_rbt",
            nodeAdaptor: "GreeterWeakReferenceNodeAdaptor",
            id: __classPrivateFieldGet(this, _GreeterWeakReference_id, "f"),
        }), "f");
    }
    get stateId() {
        return __classPrivateFieldGet(this, _GreeterWeakReference_id, "f");
    }
    async read(context) {
        return await (reboot.isWithinUntil()
            ? this.always()
            : (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow())).read(context);
    }
    async write(context, writer, options = {}) {
        return await (reboot.isWithinUntil()
            ? this.always()
            : (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow())).write(context, writer, options);
    }
    async __externalServiceCallCreate(context, partialRequest, options) {
        const request = GreeterCreateRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "writer",
            method: "Create",
            requestModule: "tests.reboot.greeter_pb2",
            requestType: "CreateRequest",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .CreateAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterCreateResponseFromProtobufShape(json["response"]);
        }
    }
    async __externalServiceCallGreet(context, partialRequest, options) {
        const request = GreeterGreetRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "reader",
            method: "Greet",
            requestModule: "tests.reboot.greeter_pb2",
            requestType: "GreetRequest",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .GreetAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterGreetResponseFromProtobufShape(json["response"]);
        }
    }
    async greet(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            if (reboot.isWithinUntil()) {
                return await this.always()
                    .greet(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
            }
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).greet(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .greet(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallGreet(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallSetAdjective(context, partialRequest, options) {
        const request = GreeterSetAdjectiveRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "writer",
            method: "SetAdjective",
            requestModule: "tests.reboot.greeter_pb2",
            requestType: "SetAdjectiveRequest",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .SetAdjectiveAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterSetAdjectiveResponseFromProtobufShape(json["response"]);
        }
    }
    async setAdjective(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).setAdjective(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .setAdjective(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallSetAdjective(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallTransactionSetAdjective(context, partialRequest, options) {
        const request = GreeterTransactionSetAdjectiveRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "transaction",
            method: "TransactionSetAdjective",
            requestModule: "tests.reboot.greeter_pb2",
            requestType: "SetAdjectiveRequest",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .TransactionSetAdjectiveAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterTransactionSetAdjectiveResponseFromProtobufShape(json["response"]);
        }
    }
    async transactionSetAdjective(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).transactionSetAdjective(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .transactionSetAdjective(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallTransactionSetAdjective(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallTryToConstructContext(context, partialRequest, options) {
        const request = GreeterTryToConstructContextRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "reader",
            method: "TryToConstructContext",
            requestModule: "google.protobuf.empty_pb2",
            requestType: "Empty",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .TryToConstructContextAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterTryToConstructContextResponseFromProtobufShape(json["response"]);
        }
    }
    async tryToConstructContext(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            if (reboot.isWithinUntil()) {
                return await this.always()
                    .tryToConstructContext(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
            }
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).tryToConstructContext(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .tryToConstructContext(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallTryToConstructContext(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallTryToConstructExternalContext(context, partialRequest, options) {
        const request = GreeterTryToConstructExternalContextRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "reader",
            method: "TryToConstructExternalContext",
            requestModule: "google.protobuf.empty_pb2",
            requestType: "Empty",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .TryToConstructExternalContextAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterTryToConstructExternalContextResponseFromProtobufShape(json["response"]);
        }
    }
    async tryToConstructExternalContext(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            if (reboot.isWithinUntil()) {
                return await this.always()
                    .tryToConstructExternalContext(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
            }
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).tryToConstructExternalContext(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .tryToConstructExternalContext(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallTryToConstructExternalContext(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallTestLongRunningFetch(context, partialRequest, options) {
        const request = GreeterTestLongRunningFetchRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "reader",
            method: "TestLongRunningFetch",
            requestModule: "tests.reboot.greeter_pb2",
            requestType: "TestLongRunningFetchRequest",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .TestLongRunningFetchAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterTestLongRunningFetchResponseFromProtobufShape(json["response"]);
        }
    }
    async testLongRunningFetch(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            if (reboot.isWithinUntil()) {
                return await this.always()
                    .testLongRunningFetch(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
            }
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).testLongRunningFetch(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .testLongRunningFetch(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallTestLongRunningFetch(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallTestLongRunningWriter(context, partialRequest, options) {
        const request = GreeterTestLongRunningWriterRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "writer",
            method: "TestLongRunningWriter",
            requestModule: "google.protobuf.empty_pb2",
            requestType: "Empty",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .TestLongRunningWriterAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterTestLongRunningWriterResponseFromProtobufShape(json["response"]);
        }
    }
    async testLongRunningWriter(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).testLongRunningWriter(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .testLongRunningWriter(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallTestLongRunningWriter(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallGetWholeState(context, partialRequest, options) {
        const request = GreeterGetWholeStateRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "reader",
            method: "GetWholeState",
            requestModule: "tests.reboot.greeter_pb2",
            requestType: "GetWholeStateRequest",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .GetWholeStateAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterGetWholeStateResponseFromProtobufShape(json["response"]);
        }
    }
    async getWholeState(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            if (reboot.isWithinUntil()) {
                return await this.always()
                    .getWholeState(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
            }
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).getWholeState(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .getWholeState(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallGetWholeState(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallFailWithException(context, partialRequest, options) {
        const request = GreeterFailWithExceptionRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "reader",
            method: "FailWithException",
            requestModule: "google.protobuf.empty_pb2",
            requestType: "Empty",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .FailWithExceptionAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterFailWithExceptionResponseFromProtobufShape(json["response"]);
        }
    }
    async failWithException(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            if (reboot.isWithinUntil()) {
                return await this.always()
                    .failWithException(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
            }
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).failWithException(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .failWithException(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallFailWithException(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallFailWithAborted(context, partialRequest, options) {
        const request = GreeterFailWithAbortedRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "reader",
            method: "FailWithAborted",
            requestModule: "google.protobuf.empty_pb2",
            requestType: "Empty",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .FailWithAbortedAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterFailWithAbortedResponseFromProtobufShape(json["response"]);
        }
    }
    async failWithAborted(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            if (reboot.isWithinUntil()) {
                return await this.always()
                    .failWithAborted(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
            }
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).failWithAborted(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .failWithAborted(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallFailWithAborted(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallWorkflow(context, partialRequest, options) {
        const request = GreeterWorkflowRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "workflow",
            method: "Workflow",
            requestModule: "google.protobuf.empty_pb2",
            requestType: "Empty",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .WorkflowAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterWorkflowResponseFromProtobufShape(json["response"]);
        }
    }
    async workflow(context, partialRequest) {
        const { task } = await (context instanceof WorkflowContext
            ? (reboot.isWithinLoop() ? this.perIteration() : this.perWorkflow())
            : (context instanceof InitializeContext ? this.idempotently() : this)).spawn().workflow(context, partialRequest);
        return await task;
    }
    async __externalServiceCallDangerousFields(context, partialRequest, options) {
        const request = GreeterDangerousFieldsRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "writer",
            method: "DangerousFields",
            requestModule: "tests.reboot.greeter_pb2",
            requestType: "DangerousFieldsRequest",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .DangerousFieldsAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterDangerousFieldsResponseFromProtobufShape(json["response"]);
        }
    }
    async dangerousFields(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).dangerousFields(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .dangerousFields(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallDangerousFields(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallStoreRecursiveMessage(context, partialRequest, options) {
        const request = GreeterStoreRecursiveMessageRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "writer",
            method: "StoreRecursiveMessage",
            requestModule: "tests.reboot.greeter_pb2",
            requestType: "StoreRecursiveMessageRequest",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .StoreRecursiveMessageAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterStoreRecursiveMessageResponseFromProtobufShape(json["response"]);
        }
    }
    async storeRecursiveMessage(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).storeRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .storeRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallStoreRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallReadRecursiveMessage(context, partialRequest, options) {
        const request = GreeterReadRecursiveMessageRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "reader",
            method: "ReadRecursiveMessage",
            requestModule: "tests.reboot.greeter_pb2",
            requestType: "ReadRecursiveMessageRequest",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .ReadRecursiveMessageAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterReadRecursiveMessageResponseFromProtobufShape(json["response"]);
        }
    }
    async readRecursiveMessage(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            if (reboot.isWithinUntil()) {
                return await this.always()
                    .readRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
            }
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).readRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .readRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallReadRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallConstructAndStoreRecursiveMessage(context, partialRequest, options) {
        const request = GreeterConstructAndStoreRecursiveMessageRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "transaction",
            method: "ConstructAndStoreRecursiveMessage",
            requestModule: "tests.reboot.greeter_pb2",
            requestType: "ConstructAndStoreRecursiveMessageRequest",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .ConstructAndStoreRecursiveMessageAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterConstructAndStoreRecursiveMessageResponseFromProtobufShape(json["response"]);
        }
    }
    async constructAndStoreRecursiveMessage(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).constructAndStoreRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .constructAndStoreRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallConstructAndStoreRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    idempotently(aliasOrOptions = {}) {
        const idempotency = (typeof aliasOrOptions === "string" || aliasOrOptions instanceof String) ? { alias: aliasOrOptions } : aliasOrOptions;
        return new Greeter.WeakReference._Idempotently(this, {
            ...__classPrivateFieldGet(this, _GreeterWeakReference_options, "f"),
            idempotency: idempotency,
        });
    }
    perWorkflow(alias) {
        return this.idempotently(alias);
    }
    perIteration(alias) {
        return this.idempotently({ alias, perIteration: true });
    }
    always() {
        return this.idempotently({ key: uuid.v4(), always: true });
    }
    schedule(options) {
        return new Greeter.WeakReference._Schedule(this, {
            ...__classPrivateFieldGet(this, _GreeterWeakReference_options, "f"),
            schedule: options || { when: new Date() }
        });
    }
    spawn(options) {
        return new Greeter.WeakReference._Spawn(this, {
            ...__classPrivateFieldGet(this, _GreeterWeakReference_options, "f"),
            schedule: options || { when: new Date() }
        });
    }
}
_GreeterWeakReference_external = new WeakMap(), _GreeterWeakReference_id = new WeakMap(), _GreeterWeakReference_options = new WeakMap();
GreeterWeakReference._Idempotently = (_e = class {
        constructor(weakReference, options) {
            _weakReference.set(this, void 0);
            _options.set(this, void 0);
            __classPrivateFieldSet(this, _weakReference, weakReference, "f");
            __classPrivateFieldSet(this, _options, options, "f");
        }
        async read(context) {
            const servicer = __classPrivateFieldGet(this, _weakReference, "f")._servicer;
            if (servicer === undefined) {
                throw new Error("`read()` is currently only supported within workflows; " +
                    "Please reach out and let us know your use case if this " +
                    "is important for you!");
            }
            // TODO: pass along initial intent rather than deducing it here.
            let how = (() => {
                if (__classPrivateFieldGet(this, _options, "f").idempotency.key !== undefined) {
                    if (!__classPrivateFieldGet(this, _options, "f").idempotency.always) {
                        throw new Error("`.read()` must be called with one of `.perWorkflow()`, " +
                            "`.perIteration()`, or `.always()`; `.idempotently()` is not " +
                            "(currently) supported");
                    }
                    return reboot.ALWAYS;
                }
                return __classPrivateFieldGet(this, _options, "f").idempotency.perIteration
                    ? reboot.PER_ITERATION
                    : reboot.PER_WORKFLOW;
            })();
            return await new GreeterBaseServicer.WorkflowState._Idempotently(servicer.__external, { alias: __classPrivateFieldGet(this, _options, "f").idempotency.alias, how }).read(context);
        }
        async write(context, writer, options = {}) {
            const servicer = __classPrivateFieldGet(this, _weakReference, "f")._servicer;
            if (servicer === undefined) {
                throw new Error("`write()` is currently only supported within workflows; " +
                    "Please reach out and let us know your use case if this " +
                    "is important for you!");
            }
            // TODO: pass along initial intent rather than deducing it here.
            let how = (() => {
                if (__classPrivateFieldGet(this, _options, "f").idempotency.key !== undefined) {
                    if (!__classPrivateFieldGet(this, _options, "f").idempotency.always) {
                        throw new Error("`.write()` must be called with one of `.perWorkflow()`, " +
                            "`.perIteration()`, or `.always()`; `.idempotently()` is not " +
                            "(currently) supported");
                    }
                    return reboot.ALWAYS;
                }
                return __classPrivateFieldGet(this, _options, "f").idempotency.perIteration
                    ? reboot.PER_ITERATION
                    : reboot.PER_WORKFLOW;
            })();
            return await new GreeterBaseServicer.WorkflowState._Idempotently(servicer.__external, { alias: __classPrivateFieldGet(this, _options, "f").idempotency.alias, how }).write(context, writer, options);
        }
        async greet(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallGreet(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async setAdjective(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallSetAdjective(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async transactionSetAdjective(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallTransactionSetAdjective(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async tryToConstructContext(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallTryToConstructContext(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async tryToConstructExternalContext(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallTryToConstructExternalContext(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async testLongRunningFetch(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallTestLongRunningFetch(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async testLongRunningWriter(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallTestLongRunningWriter(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async getWholeState(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallGetWholeState(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async failWithException(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallFailWithException(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async failWithAborted(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallFailWithAborted(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async workflow(context, partialRequest) {
            const { task } = await this.spawn()
                .workflow(context, partialRequest);
            return await task;
        }
        async dangerousFields(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallDangerousFields(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async storeRecursiveMessage(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallStoreRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async readRecursiveMessage(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallReadRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async constructAndStoreRecursiveMessage(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallConstructAndStoreRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        schedule(options) {
            return new Greeter.WeakReference._Schedule(__classPrivateFieldGet(this, _weakReference, "f"), {
                ...__classPrivateFieldGet(this, _options, "f"),
                schedule: options || { when: new Date() }
            });
        }
        spawn(options) {
            return new Greeter.WeakReference._Spawn(__classPrivateFieldGet(this, _weakReference, "f"), {
                ...__classPrivateFieldGet(this, _options, "f"),
                schedule: options || { when: new Date() }
            });
        }
    },
    _weakReference = new WeakMap(),
    _options = new WeakMap(),
    _e);
GreeterWeakReference._Schedule = (_f = class {
        constructor(weakReference, options) {
            _weakReference_1.set(this, void 0);
            _options_1.set(this, void 0);
            __classPrivateFieldSet(this, _weakReference_1, weakReference, "f");
            __classPrivateFieldSet(this, _options_1, options, "f");
        }
        async greet(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallGreet(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async setAdjective(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallSetAdjective(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async transactionSetAdjective(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallTransactionSetAdjective(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async tryToConstructContext(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallTryToConstructContext(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async tryToConstructExternalContext(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallTryToConstructExternalContext(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async testLongRunningFetch(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallTestLongRunningFetch(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async testLongRunningWriter(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallTestLongRunningWriter(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async getWholeState(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallGetWholeState(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async failWithException(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallFailWithException(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async failWithAborted(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallFailWithAborted(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async workflow(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallWorkflow(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async dangerousFields(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallDangerousFields(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async storeRecursiveMessage(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallStoreRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async readRecursiveMessage(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallReadRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async constructAndStoreRecursiveMessage(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallConstructAndStoreRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
    },
    _weakReference_1 = new WeakMap(),
    _options_1 = new WeakMap(),
    _f);
GreeterWeakReference._Spawn = (_g = class {
        constructor(weakReference, options) {
            _weakReference_2.set(this, void 0);
            _options_2.set(this, void 0);
            __classPrivateFieldSet(this, _weakReference_2, weakReference, "f");
            __classPrivateFieldSet(this, _options_2, options, "f");
        }
        async greet(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallGreet(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.GreetTask
                    .retrieve(context, { taskId })
            };
        }
        async setAdjective(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallSetAdjective(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.SetAdjectiveTask
                    .retrieve(context, { taskId })
            };
        }
        async transactionSetAdjective(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallTransactionSetAdjective(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.TransactionSetAdjectiveTask
                    .retrieve(context, { taskId })
            };
        }
        async tryToConstructContext(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallTryToConstructContext(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.TryToConstructContextTask
                    .retrieve(context, { taskId })
            };
        }
        async tryToConstructExternalContext(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallTryToConstructExternalContext(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.TryToConstructExternalContextTask
                    .retrieve(context, { taskId })
            };
        }
        async testLongRunningFetch(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallTestLongRunningFetch(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.TestLongRunningFetchTask
                    .retrieve(context, { taskId })
            };
        }
        async testLongRunningWriter(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallTestLongRunningWriter(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.TestLongRunningWriterTask
                    .retrieve(context, { taskId })
            };
        }
        async getWholeState(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallGetWholeState(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.GetWholeStateTask
                    .retrieve(context, { taskId })
            };
        }
        async failWithException(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallFailWithException(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.FailWithExceptionTask
                    .retrieve(context, { taskId })
            };
        }
        async failWithAborted(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallFailWithAborted(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.FailWithAbortedTask
                    .retrieve(context, { taskId })
            };
        }
        async workflow(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallWorkflow(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.WorkflowTask
                    .retrieve(context, { taskId })
            };
        }
        async dangerousFields(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallDangerousFields(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.DangerousFieldsTask
                    .retrieve(context, { taskId })
            };
        }
        async storeRecursiveMessage(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallStoreRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.StoreRecursiveMessageTask
                    .retrieve(context, { taskId })
            };
        }
        async readRecursiveMessage(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallReadRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.ReadRecursiveMessageTask
                    .retrieve(context, { taskId })
            };
        }
        async constructAndStoreRecursiveMessage(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallConstructAndStoreRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.ConstructAndStoreRecursiveMessageTask
                    .retrieve(context, { taskId })
            };
        }
    },
    _weakReference_2 = new WeakMap(),
    _options_2 = new WeakMap(),
    _g);
export class Greeter {
    static ref(idOrOptions, options) {
        if (idOrOptions === undefined || typeof idOrOptions === "object") {
            const context = reboot.getContext();
            if (context instanceof WorkflowContext) {
                // We support calling `Greeter.ref()` with
                // no `id` __only__ inside a workflow to be able to call an
                // inline writer, inline reader or other method call, since
                // workflow is a `static` and therefor we can't get a
                // reference to outselves as `this.ref()`.
                const servicer = GreeterBaseServicer.__servicer__.getStore()?.servicer;
                if (servicer !== undefined) {
                    return new Greeter.WeakReference(context.stateId, idOrOptions?.bearerToken, servicer);
                }
            }
            return new Greeter.WeakReference(context.stateId, idOrOptions?.bearerToken);
        }
        if (typeof idOrOptions !== "string") {
            throw new TypeError(`Expecting first argument to be a 'string' "id", ` +
                `got '${typeof idOrOptions}'`);
        }
        return new Greeter.WeakReference(idOrOptions, options?.bearerToken);
    }
    static async create(context, idOrPartialRequest, partialRequestOrOptions, optionsOrUndefined) {
        let id = undefined;
        let partialRequest = undefined;
        let options = undefined;
        if (typeof idOrPartialRequest === "string" || idOrPartialRequest instanceof String) {
            id = idOrPartialRequest;
            partialRequest = partialRequestOrOptions;
            options = optionsOrUndefined;
        }
        else {
            partialRequest = idOrPartialRequest;
            options = partialRequestOrOptions;
            if (optionsOrUndefined !== undefined) {
                throw new Error(`Invalid arguments passed to 'Greeter.create'`);
            }
        }
        if (options === undefined || !("idempotency" in options)) {
            if (context instanceof WorkflowContext) {
                return await (reboot.isWithinLoop()
                    ? Greeter.perIteration()
                    : Greeter.perWorkflow()).create(context, idOrPartialRequest, partialRequestOrOptions, optionsOrUndefined);
            }
            else if (context instanceof InitializeContext) {
                return await Greeter.idempotently()
                    .create(context, idOrPartialRequest, partialRequestOrOptions, optionsOrUndefined);
            }
        }
        if (id === undefined) {
            id = uuid.v4();
        }
        const weakReference = Greeter.ref(id);
        const response = await weakReference.__externalServiceCallCreate(context, partialRequest, options);
        return [
            weakReference,
            response,
        ];
    }
    static forall(ids) {
        return new Greeter._Forall(ids);
    }
    static idempotently(aliasOrOptions = {}) {
        const idempotency = (typeof aliasOrOptions === "string" || aliasOrOptions instanceof String) ? { alias: aliasOrOptions } : aliasOrOptions;
        return new Greeter._ConstructIdempotently(idempotency);
    }
    static perWorkflow(alias) {
        return Greeter
            .idempotently({ alias });
    }
    static perIteration(alias) {
        return Greeter
            .idempotently({ alias, perIteration: true });
    }
    static always() {
        return Greeter
            .idempotently({ key: uuid.v4(), always: true });
    }
}
Greeter.singleton = { Servicer: GreeterSingletonServicer };
Greeter.Servicer = GreeterServicer;
Greeter.servicer = GreeterBaseServicer.servicer;
Greeter.State = GreeterState;
Greeter.Authorizer = GreeterAuthorizer;
Greeter.WeakReference = GreeterWeakReference;
Greeter.CreateAborted = GreeterCreateAborted;
Greeter.CreateTask = GreeterCreateTask;
Greeter.GreetAborted = GreeterGreetAborted;
Greeter.GreetTask = GreeterGreetTask;
Greeter.SetAdjectiveAborted = GreeterSetAdjectiveAborted;
Greeter.SetAdjectiveTask = GreeterSetAdjectiveTask;
Greeter.TransactionSetAdjectiveAborted = GreeterTransactionSetAdjectiveAborted;
Greeter.TransactionSetAdjectiveTask = GreeterTransactionSetAdjectiveTask;
Greeter.TryToConstructContextAborted = GreeterTryToConstructContextAborted;
Greeter.TryToConstructContextTask = GreeterTryToConstructContextTask;
Greeter.TryToConstructExternalContextAborted = GreeterTryToConstructExternalContextAborted;
Greeter.TryToConstructExternalContextTask = GreeterTryToConstructExternalContextTask;
Greeter.TestLongRunningFetchAborted = GreeterTestLongRunningFetchAborted;
Greeter.TestLongRunningFetchTask = GreeterTestLongRunningFetchTask;
Greeter.TestLongRunningWriterAborted = GreeterTestLongRunningWriterAborted;
Greeter.TestLongRunningWriterTask = GreeterTestLongRunningWriterTask;
Greeter.GetWholeStateAborted = GreeterGetWholeStateAborted;
Greeter.GetWholeStateTask = GreeterGetWholeStateTask;
Greeter.FailWithExceptionAborted = GreeterFailWithExceptionAborted;
Greeter.FailWithExceptionTask = GreeterFailWithExceptionTask;
Greeter.FailWithAbortedAborted = GreeterFailWithAbortedAborted;
Greeter.FailWithAbortedTask = GreeterFailWithAbortedTask;
Greeter.WorkflowAborted = GreeterWorkflowAborted;
Greeter.WorkflowTask = GreeterWorkflowTask;
Greeter.DangerousFieldsAborted = GreeterDangerousFieldsAborted;
Greeter.DangerousFieldsTask = GreeterDangerousFieldsTask;
Greeter.StoreRecursiveMessageAborted = GreeterStoreRecursiveMessageAborted;
Greeter.StoreRecursiveMessageTask = GreeterStoreRecursiveMessageTask;
Greeter.ReadRecursiveMessageAborted = GreeterReadRecursiveMessageAborted;
Greeter.ReadRecursiveMessageTask = GreeterReadRecursiveMessageTask;
Greeter.ConstructAndStoreRecursiveMessageAborted = GreeterConstructAndStoreRecursiveMessageAborted;
Greeter.ConstructAndStoreRecursiveMessageTask = GreeterConstructAndStoreRecursiveMessageTask;
Greeter._Forall = (_h = class {
        constructor(ids) {
            _ids.set(this, void 0);
            __classPrivateFieldSet(this, _ids, [...ids], "f");
        }
        async greet(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).greet(context, partialRequest)));
        }
        async setAdjective(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).setAdjective(context, partialRequest)));
        }
        async transactionSetAdjective(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).transactionSetAdjective(context, partialRequest)));
        }
        async tryToConstructContext(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).tryToConstructContext(context, partialRequest)));
        }
        async tryToConstructExternalContext(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).tryToConstructExternalContext(context, partialRequest)));
        }
        async testLongRunningFetch(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).testLongRunningFetch(context, partialRequest)));
        }
        async testLongRunningWriter(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).testLongRunningWriter(context, partialRequest)));
        }
        async getWholeState(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).getWholeState(context, partialRequest)));
        }
        async failWithException(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).failWithException(context, partialRequest)));
        }
        async failWithAborted(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).failWithAborted(context, partialRequest)));
        }
        async dangerousFields(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).dangerousFields(context, partialRequest)));
        }
        async storeRecursiveMessage(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).storeRecursiveMessage(context, partialRequest)));
        }
        async readRecursiveMessage(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).readRecursiveMessage(context, partialRequest)));
        }
        async constructAndStoreRecursiveMessage(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).constructAndStoreRecursiveMessage(context, partialRequest)));
        }
    },
    _ids = new WeakMap(),
    _h);
Greeter._ConstructIdempotently = (_j = class {
        constructor(idempotency) {
            _idempotency_1.set(this, void 0);
            __classPrivateFieldSet(this, _idempotency_1, idempotency, "f");
        }
        async create(context, idOrPartialRequest, partialRequestOrOptions, optionsOrUndefined) {
            let id = undefined;
            let partialRequest = undefined;
            let options = {};
            if (typeof idOrPartialRequest === "string" || idOrPartialRequest instanceof String) {
                id = idOrPartialRequest;
                partialRequest = partialRequestOrOptions;
                options = optionsOrUndefined;
            }
            else {
                partialRequest = idOrPartialRequest;
                options = partialRequestOrOptions;
                if (optionsOrUndefined !== undefined) {
                    throw new Error(`Not expecting more than 'partialRequest' and 'options' arguments after 'context'`);
                }
            }
            if (id === undefined) {
                id = await context.generateIdempotentStateId("tests.reboot.Greeter", "tests.reboot.GreeterMethods", "Create", __classPrivateFieldGet(this, _idempotency_1, "f"));
            }
            return await Greeter.create(context, id, partialRequest, {
                ...options,
                idempotency: __classPrivateFieldGet(this, _idempotency_1, "f"),
            });
        }
    },
    _idempotency_1 = new WeakMap(),
    _j);
export function importPys() {
    reboot_native.importPy("tests.reboot.greeter_pb2", "H4sIAAAAAAAC/81ba3fbxhH9rl+BMG0lOTGFJx/qcY8ZEpJVS6QCQmbSMAfFYymhJgEWWDpUf333ARCLJQACMuX2g0WJO3Pnzuzs7Axw/L3w9s1bwQ09P3i8FDZw8baHvzn5XrgGAYhsCDzBeRbgExDWUQhDN1wKzmaxABFSWq39JYjagjCaCOOJKeijG/M7pBqHm8gFlwIEMYwvIuCEIbx4jACASJrAIKF7/ImghPtn+BQGwicQxX4YXApaW+60pZNWq5VR2LftgTaSOFlE4Up4DMPHJaDIGNFfrcMICh6I3chfwzAS7Fiwsj9ralnrEFnMq5LvKvXj55UTLi3PhrZjx4Doc98V6rf9AIUnsJcpkLPxlx6g3JPfUdjev6exsPwgBhFEEUOUkOoZ1YrPT06wOctzhHd7htsjsLA3S3iGpCiJyIHtL5K9XD/ZUmo4XGPY2Fo7MjaORCwvhFYqRv5IZbBQORK048/VOFQiQykJKlit4XMKRGWIeipH/qBCe1j22k9h7CAIoZ3zjgFDgvSTkSJoJycjfTo0bu7NiYGjyqVDFtX2wPOmIPLtpf8f4F2h03HmnM6D+Vayy88CWpXnW9ElEm0qgTXwPxSzizReF0nMd1pYopeTINHMrTvUv4s0UBckSDkRNxFB7l8wricyrfnWVhE9Cbshdq8pc8pZUsmXGvThEmAyWE7AP87m0GBXZPIPC6uBvUplZVY2XcCiLhKFtvcv4EL/SyqtZNK5NfkjibAUAXeDSsgXYK1AHNuPqZ6a6G1FZ75VMDxos7FuG6niHdVDbCQx4r68xEjzbQ/pO1qCLM5bM2Q7GkYA7a8B/r1BsP8/oWlhPwgyklOVhGS8RptLFm1tt68u2de8B/ukpBJSKnW2twLIOio1rA/KLvBn+aizFtt3iaYewOjZ4LDsv+Ig50QSitQ75TN4LmKYfM/sxhd7uSmMMF3Be4ykFYI0b51jswnNJGoUrUfPQj7NcqZ3ayjMC5CGWVKmAA7S/clHu3BfpbKUn89pzs+3HSlyfBjZ0TOX9nI+7S/y0S8g0h6jH8BjDwELf7dDxyGi/mgR+IIuIcteoJpgSVYM3DDwuKREm4nBZCo7wKLSNBW0SbhRnHPGiRFSOMVFzkV2A3MBB6zYJyLV0glHNe9qtpFv6S7immn5HgeaFQu1zd5sbROJ33jYZAeSX+ctWn8cE3lwGwaPxiYIUDd1BaD7xOzxj0RKjpcArC3or0ASrZizHJHIEzETSU0TIXyYO9ShawBnT+ESTCFTdVpnZFGchdHnxTL8g0vZggMg7R+Aeesvu3qhRVEYzXz49CnRaQLzT0qGr6zNzw/NtrQUgS0szu5aRT0BaP1CyLlTdH+DPTH2UCqVRBuZZguCtCAEvBICWYGWPJpZBrC9MqKpN8UybA68ijfv58HZENmA0caFg8A7HNQ0h9CBRfdpR1vDpz0qmsFLtH6YB+c1DGXBc0iakOB0yBWFCkTwCKJwE1/5YOnFeVZ24RXGUWKXmUSOdkj51CQ6zCpjJ8q2Jl8rqZ0of3qT/I/BcrHX1BCFdIkhhfxVQjRS7I6MxvHKCcjf0T4AfSnjmJNyimo6DD+DIAHo5AEcTtZMROW0UomdXTOL1bt59WyR8XCz2VXiHudhssSGA24cIgz5YNAFtBFYzvE91PSGEAQubRMCttJwqxi+T7coxuU1uxmcXH0ii7j44wND6eBqnXd/5btRGO+lkmIwi7TiSiLK5/Ufdv7KYF0N13s4PWO31HpH+wEGJUugs7QVRaeWBVHYUy/nTz12xsi0Wn+j+HcYexguw4iheb470Ape2eMJEhNK3gSFyWm27uklyZrJ/Likd9MKL6IL1nJfYC1Ktcnfb/6cUldT6jI5GqStNPQRbYJQo48XIBW+NnR9nCxIiQY9c6jGqPLtg54s0ptr25fIwSLck/EJ9bJPIbn55TuaKrsGPdl3h2PPTRhkbisWySogYpWfV9SErZx8Erc+JF5hZmmNKu/U07GyUIIx3eFM0zwmBn+nlYZty0gBOtigEtutKrFKAozPTyTNumZkB7Ht4nH3f8DGTtlMaC9tRs9muLvihllpxgWlzT8t0vEcn+xG2eqBjZjRNiRvV9/Sp1DfwD6+N2hHW9Q6k8rCFaXKDvsrmKQ7kMefRX72qOOYEWAy0SAzJtvQk1Uurwo7fmpZKziJiPQBhz+m46PawbvgL3Gjr29dQB4xveam/5pOdazlgRNGaPr7WrsSZze5PcXL0pHmH/SqT4emWgS4/nhv4Com0qomMtuFZb9Rxet/yhsd2SWt7Fcl45Yeg8LWGq+/4apdda9v/1BLvG7N3tBSUTTnFJSKqpEJUXtTR7redYYueJc+4Pnu4HySDGIdvjWpPT/hxyXdxtr1LiLcq7j2zjnSFC1D9zMmfU87afzVJopAANlmt/K0FPSV5IRolIinzLcApXxfoWREOsVEFy61Q56UJE8ZlbTHRZ3OangcHsTxXSeH3YS7HjrBBXtpzDfqGH9RKsVEXzxLLf1Czzv15RtYTH1UdrcunvVo10u6bXrR/YxWgqz7TvhwloqGAFsol2Hp0JlR7JA9Uk7x26rHZejYy1h4JyS/nZ2fpC+82j/hzySRUYLrwWY12r19ic+y9zI/CikQr22Ga0YFgSRwee3THP3kBQ1++3PKIvsLIQgh+waobT1MdWtoZVjTyxNByP5sW8vQ9oCXvjJDfo7DACCZFPa3UwvPFKZunP7eVDrevW1iNJzTuYwOk4xGcxFtvCiKpwUAhv7zgz41rTvdHIwG5kAfm8avTRiUApSQ6iEm0mmhKwjiw2Q0RcorOhpZzrOFXzD8dkrnmmaRqQVXL3TqXJRl9Cknn2JjB0hLdjT+O7R69HEtfwlpdpI5GncetK4LL418yXx3NH8q8Gu7przUtYJh8YiOlaC/btJVTqKv5FyBlVd2smCIPZ5vJeDf1CU6N7+WTxn6a5eP3NR9vALOo77u3lzZ3HB/NEcKkb+NM8nzgqO7wuDWckROHLmci1JHzw31jX1LnyMczSkWsK43rWN5wz2gOJpTBbivXQYKh+rj9URl6K/tVtEzj6N5VQb+uuXh4KOQ400RdSx9XQ84vJ0MPxbazp581PSnLlQVYUVW5oqqzmX0SUhLXZJ6+Sc1vA+T2wk/psbQjuA7GWEelgWBhySVfp3xl+JKWq+OMAZWZJ6BoQ+QKJ1qC9EVWa2vgm2oklSsML2fjKd6oRFVUhroECtyv3w8L7ahyLU1sAWt333hAwBqT1N6L9Svsl4RRK3fr6+CbXRUMa8wxaT+rg/Nm0+VOdFRlaaK2F6P96lAzRqjH/roTp9OB9fFfvZU6etganCpCHOPD3MNTWyx3+HywUQUbyfja+NhPL4ZX1/p5vBDVdT7XfGlANi+JKoalx+6OfswuUXiB2oAUu02VqU2O1ywZhPj49XtZFYZYknsSo3UiC2JLzy6YUyM2Y354dPg9qHEksRXnkolakfj7Bj68MGYot2vylqkpjRSI7ZklU82c2LovGbl3sk83QYQhIOi1ONQtaGKKr0cg7Loynz4BqNGgVC66ksRCANVVOroV4VBFbUXQ1AOff6iRJKm8TA0B+NR89xQ+9pR4Ag3Tes3BqsKltaRjoNH2HVEbvdHgzHSmDxMr27029G0Mk4dsfsCZWK3L3FRMW/uShzuy9JBUYpZcKTvZ4MD9wdSUxqpUVv9cltVu9fvK830SOMratwu3WEN0idXuYb0Os30iDVJ6pVrVTgnS7LYUJG29aJ4YOoqmhpUuYES6fK7e8c6mYYK2vtuv3dYlvb1cq9gfCGel0wmqK0Xa6vQrl7uVv2Hv1XobZbAit1wDc5P/gsZ7xSIyTkAAA==");
    reboot_native.importPy("tests.reboot.greeter_pb2_grpc", "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");
    reboot_native.importPy("tests.reboot.greeter_rbt", "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");
}
importPys();
