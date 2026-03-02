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
