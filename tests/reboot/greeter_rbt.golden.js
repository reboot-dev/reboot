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
