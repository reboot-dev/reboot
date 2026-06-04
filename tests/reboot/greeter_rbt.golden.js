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
