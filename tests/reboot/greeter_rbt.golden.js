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
    reboot_native.importPy("tests.reboot.greeter_pb2", "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");
    reboot_native.importPy("tests.reboot.greeter_pb2_grpc", "H4sIAAAAAAAC/+1dW3OjOBp951doeh7s1HrIbO/MPnRtttaVkGy2knTK8Wz2jcIgO2xj5JHEpL1d/d9XF7ABC/BFuOlYeUj5Ih3BkY4QRx+ffwQ3MIbYozAAkyWgLxDMRo+X4HFJX1AMFhhR5KMI+Gi+CCOIwSJKZmFsg6uP4OHjGDhXt+MfrHfv3l1GIYwp8OIAEIj/YCX9yCMEElYVY0gWKA7CeAYokqCTZPpTAKdhDGWF0IfEZjhWOF8gTMEML/zs9auHY1aXWNYUozmYITSLoJ3BgLQUnC/o0l1M3gOPpGXcAFE3KyfeyEK8lMSikFBiYzhBiIJV0xBSiDMoUURUlsXEy6yMQLJuGGXujfPgjIZj58r9tzN6uv34AC5A78/2X3+x/9KTJdaf87OzXZfRREIUu67l/OfRueR1ndHo48gdOXfO8MlJEX61f+5ZT5f/dK5+u2NF0i/dK9YYL/GvJIbg/a8D8P7n97/0rBVqzI6TJAt+TozkC3DtRQRaFsXLDxZgf5JMcSQJDaOQhqy3Ug6mISZ0hRQSN0KvEItqlfjqOv38qQ+AmqozC3724YKCW9G8gzHCH+pbG+OEnUw4rSgha2cjx+Yv+uIjcea9MR/o7NTBwvM/eTMIwphQL4oYdEiAR0EKCr7kD//roLfC+BNDAZOESs2sROSjgIPJUXMuR8x5bkS5gvDFEgRwAeOAABSXMHmBEP394ouaqq92qfxjBD0CQbKYYY+1vUQJlqc2R0ESQa64JsgSIsIgQK9xHq94fgnhUpaoP1GEIvK3iyJR5YMcvzBa094Ar2EUgQlkcwpkEwaAvLc5Z1/UKthgnfgvkJ9aAKasIoaSAN5ZapGwoxmsEEZJTMM5fJbHIj4+syxLzFbgRnbUPWSzX0CeaDLpo8l/oU/P5HhiE9R9SMTZs+LIDwUnAfKTOZv9PMpHDDst/oafkJyjmDDYdMXnNoHBZj3gumEcUtftExhNB8B/8eIYRmkjaUOXiA1JnPgUYdtafTHEM7Iuxv/Syh/AUIr5Ur6381ir17w9+xJDdtxMQ2lVO4k9vHTF/34Bm//1zvOTpF2k6Fxi5fjN/jD8PWH1XDa5h14U/g/ii8aZND2ykaxqP2VVx+iJYka6qhV+ZSFspod7NSRr29dsKqxqgmHMQsJqwsCdi7O+4HPPWZFTQYseSsVbXYwKsCMQmrajjc8nSIcBV174h6aRmkfUxW4e8wgkF5vTxvUYezHxfD576ae9Atz0QLEHlmO0mvDZCwo/U138K6C3Y795EW07/OX+hG/dgm6Knc+sfOxFLVJdauIUKWcnd4fiGVty8bXWNaT+iyamFci6ZhQV9sEzy7dj/RmHrEYrtEvoExzYN5A+v6AIPlFt6+gCpLbFXx70WItAiDUwfO2F0XNIXxxhC/DbKi0sb8Ce4ODNOBhOMitFI7Ep6AnS+ozwp2mEXvXwmaF1hchm7WdHrHFVfOXFM4hRQq5DGAVED7MlUF1TbQn2e1owPFGE2dXBTzBhdzX3kBBuiOq551ZBa7v1U4Ef4x5Q3a62YT+CXtBOd6iQdfWGCvsInaFuVltfrO7mhnHQok4am9FmsDY1dAzvtfkYDum/Ci9f7jHidvx8aSenbn7aMQNWU9z5F239Q9pbWf4S2CaQunxDpi+Mf77KT8gle2//9nB7/3jn3DsPY+fqTFkvgJSt2Ui/JwkCsdwAjSBvHAY/9NbVsBcSCB4QvV1/L7bo6iqvuBH9YKhRUZN3Ew1DKoYq3GNDlposhdVrqGqmqmTVGsqUlCl8UcPUFkxJm9RQpVwc5B1KQ5GKog3P0tBUR1PqQBqSVCRlJp1hR8VOycMzJCnvWVR37IYqFVUqb8owpWKq0RIytOVpszhnXhC4ao/LpciVQfj9NLQeD9Ko/JQwdk6paea+eHEQQcx3V74UTLZeGtr5QYaV5txNd7P6puEpLVTZehpuOVAWynzMPSM4pV1Z5xQWvMpDokQbPNGz4tuejOPUQZ9A0speISy0HfKKEaE7clcIFdRBYR5QK5OqAMR2CFXGHu7Ia1U0pg6KK7BPmm1V7KUerhXIOzCtZXu5ilxd4Qj1dJbjK/XTWmrhzdOrCqrUwqoCWOusUBey2WGG0/jJFiiWyG99wBZjJrUstPKIehdcqlDMFhdeYsmzE5ubsZE6GN1AfeuDshwJqZPEFPOtU7gKftTBXQbWFdL2iKTckb5yhKMOFkuYWqfGitDJLo1IdUyWlvtSFbLeW6a6MK+W7p1qo7p25F4ZtKiDehWwVubrQiLbIb42GnJH3ptjErU4g02t6DUNtw1/bMlP3Drycbu++ir+i+QMoZ8RnqUXKfm7bqlYsV96NdGpvYHKL5YetnSVbe5FZ/i8bFao3y+1OjjbqLcRx7muvc9RWRb4UaabkGGg7MXCwxSgKc81wTNMjG65eT+8A8PHW1sZLKo/SPQfhBf05dGWw0azXY1Cj1APz8qmLxIraHLRL2k1jUB2fUYiOwo2csjFA4pL2vG9qKlIyMYeG5HwQuSKKVVH8wUb9jwriqLmqxdSd4ow604vWCoK8KQbKKGKbxgpXuBRT3yV29HBkCY4loMZfl6wYST4rgm03prIPXJaaE5eoS1FRTomGgeEuqPrR0jlAKjre2W3q3u8+Gl1RHe1gmRwsRFQtwSkymCiN1WJroQkp62eQki1EVG3RFSTLaWVtCiak5+ctrKqnlswIuuWyLbLTmT01n29qR59MWrrmtqac1HpsnAPNvGNoKofkDLC6rKw6jOPGYF1Q2Cqx+mMrjqmq+Y8c60mlDMa06mx9EFMI7JOi0yZVdBctLphtxce1zVC6pjtXpNDsp1kkYenhDxtPW0+22001S1NNWUMNRemTgkpe/rfyKibMlLnhzUi6oSIVtkhjHq6pZ6KbMC6ZKMxue9pC6icQMToqFs6qs/93FaSZ3NVOixISZkPxEirY9FKW2Qtbjeld1uJu09bfcocRkZ83RLfFnndW03g3lKa9tNWXnNOLCPDjj03smMW/+Ol6z9GUv5TUGv6tNhlhPxPb/bXgROM2RGOGV97/riFoOc8h/P9/IoRP1otP6nDRuC8jkkiSmxJ5QbcCRKKFq9e8fcjJYU7jckVjMbfIJKAx/ndoawtfT+zLDisYXePcWpILl8p2v3tmfW0YLKkqjMWl2ZPQ1NFYmc58ov0uDway2PLDMNTfjgZtrZMUVyYAXVlJs6thLQkIVnjfT9posTKauc8RuWFZIG+9Jq/RxKjEuxbZzFb4KTs5Veie6WAknC60z4VF02tpXoqrZf2GpJVlB42Ik+S2baSAomJvCu5gGoPZr8UQALyaJl/cqtRY+N+Yxu3ya86XpxNrVty6mEA5bs4o5t9dKMydA4TTpM7aeTTjSia9H51407V6Gc7/VT7zbtTupM7rd8h1emDmstS3g0y6jpMXTWXp8PlVbc7YUTWlc11FCF8z1mB+K3usYvTEye67xZ7jqTzNZquHbc14hG23PKNadlzyw+gVrfe1kdutpTU5r+iKzTtAeQGvY4tgDWcVq9wU0jtmIUKDX1jtzDX850xDbc4pj29wxzysSzE3ORjnJBv7SBudTlu4bqr9ep6AovM/wNf+HyF8KYAAA==");
    reboot_native.importPy("tests.reboot.greeter_rbt", "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");
}
importPys();
