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
