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
