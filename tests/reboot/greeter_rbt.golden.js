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
