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
    reboot_native.importPy("tests.reboot.greeter_pb2_grpc", "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");
    reboot_native.importPy("tests.reboot.greeter_rbt", "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");
}
importPys();
