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
        return this.idempotently({ alias, eachIteration: true });
    }
    always() {
        return this.idempotently({ key: uuid.v4(), generated: true });
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
                    if (!__classPrivateFieldGet(this, _options, "f").idempotency.generated) {
                        throw new Error("`.read()` must be called with one of `.perWorkflow()`, " +
                            "`.perIteration()`, or `.always()`; `.idempotently()` is not " +
                            "(currently) supported");
                    }
                    return reboot.ALWAYS;
                }
                return __classPrivateFieldGet(this, _options, "f").idempotency.eachIteration
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
                    if (!__classPrivateFieldGet(this, _options, "f").idempotency.generated) {
                        throw new Error("`.write()` must be called with one of `.perWorkflow()`, " +
                            "`.perIteration()`, or `.always()`; `.idempotently()` is not " +
                            "(currently) supported");
                    }
                    return reboot.ALWAYS;
                }
                return __classPrivateFieldGet(this, _options, "f").idempotency.eachIteration
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
            .idempotently({ alias, eachIteration: true });
    }
    static always() {
        return Greeter
            .idempotently({ key: uuid.v4(), generated: true });
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
    reboot_native.importPy("tests.reboot.greeter_pb2", "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");
    reboot_native.importPy("tests.reboot.greeter_pb2_grpc", "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");
    reboot_native.importPy("tests.reboot.greeter_rbt", "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");
}
importPys();
