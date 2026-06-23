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
