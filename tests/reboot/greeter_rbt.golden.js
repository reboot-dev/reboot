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
