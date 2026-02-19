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
        if (authorizer !== null) {
            authorizer._authorize = async function (external, cancelled, bytesCall) {
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
                        return protobuf_es.Any.pack(await authorizer.authorize(call.methodName, context, state, request)).toBinary();
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
                        return protobuf_es.Any.pack(await authorizer.authorize(call.methodName, context, state, request)).toBinary();
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
                        return protobuf_es.Any.pack(await authorizer.authorize(call.methodName, context, state, request)).toBinary();
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
                        return protobuf_es.Any.pack(await authorizer.authorize(call.methodName, context, state, request)).toBinary();
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
                        return protobuf_es.Any.pack(await authorizer.authorize(call.methodName, context, state, request)).toBinary();
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
                        return protobuf_es.Any.pack(await authorizer.authorize(call.methodName, context, state, request)).toBinary();
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
                        return protobuf_es.Any.pack(await authorizer.authorize(call.methodName, context, state, request)).toBinary();
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
                        return protobuf_es.Any.pack(await authorizer.authorize(call.methodName, context, state, request)).toBinary();
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
                        return protobuf_es.Any.pack(await authorizer.authorize(call.methodName, context, state, request)).toBinary();
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
                        return protobuf_es.Any.pack(await authorizer.authorize(call.methodName, context, state, request)).toBinary();
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
                        return protobuf_es.Any.pack(await authorizer.authorize(call.methodName, context, state, request)).toBinary();
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
                        return protobuf_es.Any.pack(await authorizer.authorize(call.methodName, context, state, request)).toBinary();
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
                        return protobuf_es.Any.pack(await authorizer.authorize(call.methodName, context, state, request)).toBinary();
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
                        return protobuf_es.Any.pack(await authorizer.authorize(call.methodName, context, state, request)).toBinary();
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
                        return protobuf_es.Any.pack(await authorizer.authorize(call.methodName, context, state, request)).toBinary();
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
                        return protobuf_es.Any.pack(await authorizer.authorize(call.methodName, context, state, request)).toBinary();
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
            };
        }
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
        return this.idempotently({ alias, eachIteration: true });
    }
    always() {
        return this.idempotently({ key: uuid.v4(), generated: true });
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
                    if (!__classPrivateFieldGet(this, _options, "f").idempotency.generated) {
                        throw new Error("`.read()` must be called with one of `.perWorkflow()`, " +
                            "`.perIteration()`, or `.always()`; `.idempotently()` is not " +
                            "(currently) supported");
                    }
                    return reboot.ALWAYS;
                }
                return __classPrivateFieldGet(this, _options, "f").idempotency.eachIteration
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
                    if (!__classPrivateFieldGet(this, _options, "f").idempotency.generated) {
                        throw new Error("`.write()` must be called with one of `.perWorkflow()`, " +
                            "`.perIteration()`, or `.always()`; `.idempotently()` is not " +
                            "(currently) supported");
                    }
                    return reboot.ALWAYS;
                }
                return __classPrivateFieldGet(this, _options, "f").idempotency.eachIteration
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
            .idempotently({ alias, eachIteration: true });
    }
    static always() {
        return Greeter
            .idempotently({ key: uuid.v4(), generated: true });
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
