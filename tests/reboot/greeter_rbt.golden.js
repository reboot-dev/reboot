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
