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
