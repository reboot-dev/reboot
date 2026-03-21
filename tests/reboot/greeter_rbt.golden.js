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
