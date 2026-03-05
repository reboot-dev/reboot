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
