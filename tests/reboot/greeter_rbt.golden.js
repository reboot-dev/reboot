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
        return this.idempotently({ always: true });
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
                if (__classPrivateFieldGet(this, _options, "f").idempotency.always) {
                    return reboot.ALWAYS;
                }
                if (__classPrivateFieldGet(this, _options, "f").idempotency.key !== undefined) {
                    throw new Error("`.read()` must be called with one of `.perWorkflow()`, " +
                        "`.perIteration()`, or `.always()`; `.idempotently()` is not " +
                        "(currently) supported");
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
                if (__classPrivateFieldGet(this, _options, "f").idempotency.always) {
                    return reboot.ALWAYS;
                }
                if (__classPrivateFieldGet(this, _options, "f").idempotency.key !== undefined) {
                    throw new Error("`.write()` must be called with one of `.perWorkflow()`, " +
                        "`.perIteration()`, or `.always()`; `.idempotently()` is not " +
                        "(currently) supported");
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
            .idempotently({ always: true });
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
