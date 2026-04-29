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
