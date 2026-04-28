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
