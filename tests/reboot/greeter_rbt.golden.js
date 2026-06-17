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
