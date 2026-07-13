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
        return this.idempotently({ always: true });
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
                if (__classPrivateFieldGet(this, _options, "f").idempotency.always) {
                    return reboot.ALWAYS;
                }
                if (__classPrivateFieldGet(this, _options, "f").idempotency.key !== undefined) {
                    throw new Error("`.read()` must be called with one of `.perWorkflow()`, " +
                        "`.perIteration()`, or `.always()`; `.idempotently()` is not " +
                        "(currently) supported");
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
                if (__classPrivateFieldGet(this, _options, "f").idempotency.always) {
                    return reboot.ALWAYS;
                }
                if (__classPrivateFieldGet(this, _options, "f").idempotency.key !== undefined) {
                    throw new Error("`.write()` must be called with one of `.perWorkflow()`, " +
                        "`.perIteration()`, or `.always()`; `.idempotently()` is not " +
                        "(currently) supported");
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
            .idempotently({ always: true });
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
    reboot_native.importPy("tests.reboot.greeter_rbt", "H4sIAAAAAAAC/+y9a3fbSJIt+l2/Ai1/EFkjs7rO656rXjz3eGxXX6+p15Jd7XWPx4uCSFBCmSI4BGmVuqb++43IB5AAMoEEHxIobq/ukkQiE/mIiNwRGbnzRfAQLqYXwSROw+tZdPIiiNNkuboI0i/xYjSNxUfL9ZQemSf/EdIfdw+Lh+z5l9FymSxfjpNJNDydrufjl8totV7O05dfw9k6Oj2hfy+CDwkVXgU30Txahqso4MeD+9toGQXx3YJeF02CeXgXpcFdfHPLD66C9DacJPf0BT03D8JgnUZLqipdRON4GtOjaXIXiVJBPA9Wt1G8DBbLZJUE3OiAfl5H/HGQ8iNhGiTzKEimQbJeZi+l+sRrz4PeNFkG0e/h3WIWXdDbltF/rKN0RXVFM9m2SXC1XseTq35wHwXX8XwShLOZqiml1+m66J3hKgipa1TldTyZUOupgWeibWdBSAVX3HP6lgYinAfz6Gu0pCGZzeJJNODher+ip8LlRNc+OJkuk7tgNJquaWyj0Uh9QZXRsIarOJmn3MN3P/7y8+UH/ZTxpZiDW27RbJbcx/Ob4Mdf338IwsUiCpc0TqItPFZL7jMNEv+uXn4epPF8zF8nafYhi0H4wCMcz2mi40nQu14mX6J5P4hlaT3XEznZMU9teheuxrc8pfHqVr5jnq5oGMVMzOLrZbikmR2cqO4to+skWQ1oeFLqBTc776T8bpR/d+L6YkCvHH8ZZQ0acYPoP3cLGhwS4d7pd4P/OvjraZ9H6dWHD29/+vDu559Y3IPVw4ImVIgXdUDIVXqbrEkirg3J1b0hAVzP/2NNw0FSwz0y/gk57UWDm0FwJSaTquYOqZ6+mj9c9Qc0RyQ69+IF45AEPhjPwvQ2Sot1ifexOrycRNN4Ti24i2h2Jkr0bsOvhuDziwfBr2lUrGO6ns0eXmaNVaKrGqhGUjZxINomZioKJ9nchOnDfBwnxoyoT/QD1+t4tooLgqk/0o+Mk/kq+n31NVyaTxmf6gcn4SrkoUgj80HjU/3gTZLczKKB0LXr9XQwidLxMl6sSLnzcvKhkX5olD/kqua3NJmPSEnuWLOd9RhPuSqiQU7Dm6imEvVEVsFyMTafpj/Nr0akPqt1OpCDb6pH9p38SloQo4iWPOMTa2lRWD3LHTSe4j/1V4lZPMnmY7UMx9F1OP5ifJt9ph9is2p8z3/qrxbx+MvMHC75QdFAVKyC/nqW3Azo/8b39Bf/nxTghVDuiyC+mZPx+yRLfM7aLbXTaLT4oGSYwjgZcEeS6bRqmejLkfpSF+P1cZUks6KxVp/JGQqvx5lxv055qFZSuU1Fux6Pil/KsqQP0Sq+05Yp/7ugMuKj7Bd7Sf59Es1Woa1o9qW77D95rXUU5e+UNBaVw6yAhO9uMVpc/5caTSk8V1vj/ZJXumXaUKH5mLW+QXS3WD2IWlTNb/mDmiqzAiPxpEV+eBatKxvLj/qy0Bg2CKoapaLWXhkqnHVn9c9ZMg41aGGUNRIflKZLPTYqfG9p+pgBkLXd/I2jQLQcFbS9VEp8bSsqF4XUUVJ9ayl4S4tWtHSUU19aihEUo89W0Xz8YC9qPGArTu1ZzsNZSuCDcFg0G92FczLrS0dl+vFR6fHaqu8IXM6ie4aaDbXmT9ZWuArTL9SEkABTU43Gox5VkrOwENBv6Vdv/ryl8sWM1o+7aL6y15V9bSlKmOlrPHaKQ/a1rSjpUqSnxVW+8Iy1kvW1syx9ZbMPPCAO68Bf2YoI1Govwl9ZipDyiAmwl9LfWgreJ8svU/IpHO/LvrYUDdcEY62l+BtHAfGfZBn/0zkJ/MDIeMpV0YrdFXYTGADXVlZ60lbhtfQE7HXIL0vF0mhFUPjG8l79TanAnLyW39LB4oF6Nq+Wkl+P5NfS3KuC5uL8hgT0A/39kVwI/vl/ipZf1SXWatujWZOuySv7LpwtbsPvzOLX5Hepj22PDnQjCwuWWWqUP+GC0OH8oWEdV0/oCtIHc5DpL/3F3XghLEK0HEzDdEV/Gs/RXyP55Uh9WZoPLq3WneoIcmn1paXYOraXWMfCBZ1MYvbaaTV8oFIvo98lHKTFVjkHqYgiRPP1HTmlYmEng81jcpdM1jRWarUndJQO1GtvllFESmxil94JO4Kvk1myPFe/ko+3XI9Xr+aT9+QNRZfReE1e9NfoR/neSxkU8X46XdAzkXp8GZFAFWtQH5mPvQnnZDuTdfo9B17SwvNvOdTE4vgPDi3Jz/4erT7eJrPo/apc+9+5x7ZPzNf9yKuMGILCk+bH5uOXhBdqB8X+QLGK4rfy0/fR6tXkt2i8oi8KFRa/MCuiMV/cczuLz+eflh5umE6PKfxAD/+QzG8u13OOq3wflV/OZkL+9lHZ/bwCEV35lTQq0EEL8smX0TRaEoSKjFBXUe3DRTwwAlkWw8BP3K5WCw+b0RwlqHsqw/KuB4oOic3+JYtKLwrfS/TT+G0hDOBS86bvZSUn5A0zLB2WPOSBBP/8XW804ujQaCSm8GMU3Cfzs1Ugwn4czP3lYRLOV/FYuCMR26CIPNz7WxGFvY0eRCx0PZ+IIKeyGTQKgxPxfDq6jkiYRtlX0eQioCXwE/31mZpFv/boxSLOE/xKorS6EBK2oL9PTn796f3bD/SU+IKfOzkh8ZKaHi0/JL/w3PTEiy70pwNhK86DbL1QX7sGaqDK9c0XG2/5noytfI/43rM2qSdxStiXrD15W6ocPT+jDn1PYJi1Jnj5v4rtlo2QQXb5LrMtRZOq+6+KyA/zcSg+LN/lbHbx4UIrdM0n7paUxihvi+f7igOxaVuEqSoNivisOibiY88hkVUUWyHLOxtRGQ/VDL932Udjw2a8my/WK7naysas4hXvgRSDwD8vJCSRavmfUuGkDLNxaPF4qJczzzJK7TjMS9bM2mneXeD9pZ8Yokq9mooP4lRsMNAC0xO9OpeV9uUuDH9iFhWfloqd6IC5LJ/9SW2Uf6jmiVEP4zQKPpCLJZBKXlYE3E9f815PssqNYGaBNK4TOy9UPDgtFT3zk4uzC7VfdSZae6Y7V66OXsOiES9p3RXvO6MGneVP9R1jyDNdGEK5++Y5gqL0oQwgN3bn45eJfmEQs0+9RzKv51CGM2vxFmMqNXs0Cpc36WjEO9BjgRLOg8p+FQOHP/70MgX5cOmaPynt4UrEbx7aYKtFiBBXwr/4SoStonzwuLbsrxPT1FvtYj7j33yjq1NSUlgTCo5RA2goPNuwQBaebV6mC4+3RwyWllkb7d0QD7hgPuk3GH6rtPlwa6xQbZStua3bUAEKLRf+u2gV8pats0iu0Fy4EQKY7fNBAM9x9TLHYM+Ll56+whDqD72HMasl+4RnvcNjqRvcYjyLcryfNWwXi095Rm31ZN3nuvQf1pXHHD7fhccW3WpYf2xFGiyvrUjzImAr1X5Rcje3rkNtW+exUlkKtBo2vzXDUqb18uVsaU1XNm1YZU1r652KMsvreLUMlw86ecdZtk2fBz/Rf6KJisSWXrnknMHVKJxyBd+N0ogs4cT5Wo4pNS6nlib4rKpH4NNYRma3no1jZMtiVRzh8rf+I12pNw9ybCyfBzBR5W63mLDNx8Vjnq26XJhr6xPe822vP/uajUP3Z8/aiRYzyL3cDxLbyoVvqfnWqityLV5R/nQT4bO9zj4R/ErrN1aoaJlpX8T4YRnO01BsIG0AHhtK7wVHNrxzH5Cy4ZVbtNkDaNaX3QPmrH/h7uFn/ft20FyAUs+xBj4FPgU+BT4FPgU+3SU+rV91/KHqw4cky5J8LbNBvYFqTVkJR5zpaQNx1MQH5NW8wwlLG15bhko1r9i4hV4g1F1yk+GzwTj3G1yYcxdj5wsy61tXgJgu6OWuogi8NjBVdq1zv3AznXurzi1so3uOOvaig4537UMXHa/ausWtddNewz501P6mPeiq/UU7a21r3bVX9Qg6bH+xty5b0839VLim6K40t+YVO1LYmjds2j4f9XQXbAje1JRsFn532dYRnMYeeHR12wZXYjjpLIoW8mSVRJ6pMzISz1fNgRH3632iItXWFBy66tfe3pyl5uw76lgnPLmawcs9umpHWrhz1NP9eHPuibM5Q5Y+iDMVlY/txtw9TBva8I/LmD7czIgXy+7HihffsRczXnzFxi1sb8gLJXeEr2resBtcVfOCrVvng6NqqtgPfqp5oXc2b/FIpF9Wr62MT0JrtPRIp7VVvmF+b7QsZbTa6m7dJJ9MX0uJpgGyFGnOurUUap8B7GxsXXc2bpuHJtmK7kWDbC/y1Zzvw3jG54vf/j6OBBjz1B5nuR2tUs76d7NCOavfqGUeuuQqtZtVyVX7TlYkV+VbtcpDf1zF96JDrpe11aNXkvmipRaVSu1Yh0q171aDSpVv0KoW2lMss1vdKda9U80pVr1Fi1poTbHwXnWm+CpfjSnzJTSoSvnxBiBSfrxZLssl2qM1exNdHWjTIg8VKT28G90oVboTpSjVuUkbPNSgVGov8l96h6/gV/hevOTfUWpHS4Wj9t0sFY7KN2iVhx7YyzRYC3uhRtG0F2vtutQ1ub5bW7SwEq1tPKtYjNEWutaihJYg7yJpNJu2eFxRULUocR2FS5oJQXnWqis8kS0KMMlrm36v1tctHjfIGVukTEr6vpp2+RBT2IXMJya/rwOWXYm620dmq5OW5TC7K4dIclQVU9Yq89KQpGbwXB3SqKqG72FQFbNXcVTlhy2G1SQYO6xxlS3f+cCyiS9uxtEH/ttvXPrgBpNbvfOBVItfYSw1YaPvcOo6Dm5EVcN3PqgmPiiMrPmF9/AWaju4MTZbvwf7yu0pWVfBdu9vW0UNB2hZucjOB5QRZ2E4xbUDvoMpSh/cUHKrd79AERYvLlD0gf8CxaUPb4GiVu98IA0vpTCeJve877CadXXugFLT6BqN3/kpJe3UlSRWfthCalUtBze2uuVdIF7bnHDGy7GzHweR4yEPgMiYkJ9DY69NgX5ZnYrSNeN4a24WY17JcDub+kFYWzUa6HFNmnHcH7rZaizAGq7W/MALrdiHTqzqcuDEJT3Ny7StHrGkcS3imqDmFco69GzNxdDTL/7G2VaVabq4RvNaED+DZG+gUlrZSPmHNexuV39v/qU60u8mIqa6sk3HvOvKepAf1RXf4EB9c0+8Or1xw33om2pKbjbYnrxJNYXbH61v7IRPd7dusyXav+EJ+fJLmkmWaprmFyOunrRue77a/1S1/a6Cpz6GWzOEZjB5Z2eoy+/aFzZqPElrnp/Vp2at9Co1I+S7MtRdZNGwMNQVbTBVdUWbrWtd6farQnM3fDq8aas9loSaghsNs59xrSnbej1o7IFHV7dtsEf6RE0Ne0mlqHmfr/p6X87TdEWEbz1NVyX41uNxmYNvVRvcOdGut60HaSed87nEwrOW7SfN884Jz4ra34rRqqNth2en/aqAzkm0WN1udQbQ9/U+wFK0pgArxSfeoFKW71xc13eIcuAoOtKFk36FGbHBQdlSrkT8Zr8OwLP/tevKyYuaf8EP0U04fghuLn95HbzP7tesKyIuo6cBTiNBscJjvYxm0ddwvgp6yXz20A+myTLIL+sU15rHd4uZuvYzmOXvpMrUg3xPexhcyk0yFQobBO+E+MfL7A2rJBjPYqonHUhl/jH8EslO/H25GKsuhHwxvBiAF8Er831Zs+T8j0O+C+uar71aRkG6iMbxNB5zi+fBFT9xda5quY7kle62utKgF6ZBdkN9cP0grvQTz1wJNRhfqWoWs/VNPO8Hk0QITHorrn+dP1CP7+5oMK9DdW18GiQrvnBVNiW5ZhKbq4HKIpOvHckrsPm/0kLWXIk6MAbmQotsnKbra/GyXqHO8/pbxwavZ8n4ixYW00RI6TW/FhNRqLy/9dv5Yr8f5f2yNY2oPuVqi7Rs4lZCadqmp7/Ov8yT+3mN5Jz9Uajpz7NTVjU5c5UB8JwY1YvT01MSWvk5fywV6I7knDSB7GqSprH4OAluk7SsUFzDVWGGrgISLKlYA6r7RK1fUzJGfHvZaKSC3bKWkbxlvipjn1oIxWdjQrjywchZORlA53d5U9XH4iq7VLRXSPwsTlefHPfk6pH9iYp8rsiHT6lecWUSPTzrfzZaJWK7XE40LG8XL7j5K4tWNrcaE3ET3234lU0Aw4NkHAsDIq/i43oH5XbnKIAbMI1n0Si//zBvgONu1fzRwfdU9E32Z2V83DtWb9+/vnz3y4efL/NmyFVvxY3Pm7Bak8X/1BimskhPDkQc8Kr48etwNmM9+VRY7T9Jm5kt3OI1fNvve3Et7OfzwtNiWPUfnz+LXz+bMqx0f9gkzr2+wTk5Ga0SfQ3tXbS6TSZ8KVHtQHChwmDkVZSnSL/33PqmzBg5DOHj2ySL3X4k02R58/O0UEZHYaj2Y6gssnT09soyJpubrXp/RTkI+jXBj/FkMovuCUbv2GvJHBaastwx0d+zZ0JVunyT8yASh29FnewLTEPyiIXNTJO7SD8m7tYdhbM0GQXpenybe0NLdm9eBN9TcXJRBQ0XOSuzGdV8L9yWgJ2RkCzwDfsrIm2TXn/9wPfbqr/llfdjcfUye/9UX7imMV7G/5Sf0XyNv6QDGphIFSH9+xqT7pFzIp6ll1MP7uTjvWhwMzinWq60eyYfSYU0XvUHJ2y1ZWNHomEy6YD9aHJjSZSmZ/r7l38oMec8gAH/57/1+n+e6UUru/ZFDkY+yZZlS1eZju6yxwZ5CbLz1VXFkXD9zXlFg7Kw3L+SZ1ZV+HCxmKkhNo+eVGz2q/y5d5PiW0j060pK9S8UEsb8LpyHN9w+y0JuPpDKi4d/lH/ltSxm4VjI90gKo62i7JnBL/q31+LhvJox+afzaFbXnHyCSg8PRq/lB5XGybuyxyFJaH2NxoODD/z7a/7VqEgIoNQEo3UOA228gkV7VCydDj7w3/9QfxoWOZpOyayM1J3aVKWt0Upp0sFb8fQ/sofPDQsZTvIjT2H6MB/TAvD2a2SJx6XrRbTs9QdVma7K5bD4Z3EpyWRwmP1WeqAIHvLLxquyyk9yiNCCTZQanfWrb89gE1VdXBSNNbUWBp3aXvWjWFDS09IbSytpWQ+G5Q+Kj5dEeFj6u/hwRS6GlU+KBfjads6Y4zDQKL+Q/i4dzsK760l4UVT+wYyvYF8Vnjw3o5lFhFtABfLX8hNm7Vnykvq7+KzUvEmcLuTCbxWLsqLmj0ttfZP9vbH46iqHolX6r+IzhpUYGr8XHxLKNxT/LU15wlCAVYCKDi0DNSg8YZ2AF4GI3wosIHyKZBpE1IZAop6zNDvSliYKJ/Dz2Um3VKz515FRIS3TZIlIkP5Jj9FAJ6LycUJ4hLFGAZOLRquqpCZfPyjANZL3gOaBbuFQOWC5CuUPdMKMiIEXButMXmF75nsZenGoz4Tqnnnejloqa5J9n7W7IqRUk4NBfNtKLQTJZ43nz2trKVG0tq/NwhF4thk3Z33NkgqtdfsKdFBnLSmzSnVVaHFat6ZEEtK6vCZZaF2wlCZ61voAfllTbHtJZxum/pXqtqU/nG2WRVKquXE37GwHe835O/80rTfJV+Y8sesaT3nX5pw3qvhaAvYRp8vkjjyy5XoWif3AaMwVLx8Gxi7rVBcY5ZWNuMQono6yEqW1MH8ykQ87YawHdhK4Nq+SPJPs9+A/2z1/uZ5FRWSVr3z27aiayi5OClW9CN5NtROqWkeusBzbVLupk/MsCEQrH41uuJ6tStUYFdzfxrTgkhOd3KdiAheL3Lmm2vNv4nmplkn0NbhLJlHQ4130WXKTSj+eHEy2bqmIe0azhWgIeebLUnla8XidpiZEEgQ8CNf/Lk5TEV4w3fL+oFCYG1qRAO10X1RmXA2Ix9i/keOVT0GvUlm+JJPtPrd+Hacj7q8AFcPvCelF1ef6J+UembeRVDp33l4M+86BUK1v6uVISc+w2pym7qgXWQqWwLUhisMN7EAWesqLGMG7AtaUCKsQBqJypebs0zWmDjoaXyzX67PiFT9zwOeYhEWoVqr26R+CiHdr0yBMZa6JTjRJpYLJvX25uUsf3JnQOWaMPHsIXrLiThIJuqmMCHHTR2tZJrhSS/1VcL8kc8GWX1qR+3g2Myok6DERBWhebmK2J4UWDYKf57q199HZbEarA6egJDIEx2aBN/uNCjkaqN+ZyurDYp0itBjqnAWqTdR/zl2REUKjtvBrErMrsVo+sLkRLpD0MrTnQh1a3VarK8tM9vVI9obdCO3BO9wJsQHC1CsWX6HGax9UwVZ1eXNnDomNfC4utvXPaiMAtc0wMNs+3q9zSBkaFMLhauNL/nHh2BSwbOE0R+uLHazG68uKmzejrJkiQKX3VUgyVrrRwjleRtOL+kjRZVTYA9KpVVzruxXn0iRLX0c0H4DT09N3OnQv49bkal/l8eCBbmv/Smw5lrgi9I7JWJhQHbQrjsktQVZSy2G1c+qbwf8rf1bXmlJgQ7yqLrqRx99oOIfZb8WH+o8Yr5NaPjxVo3haDpWI4ZJooCYEeinG53WZnsOw+FK2hFWyRVzIoEThHYnLaCmqGhkn90ZfotLSWeEBqcbEBqORMW6jczsEH7KyGe3ltUcUS4sARLaeLbQ8MHgelNrX53Q3W0n+9yByGcW3ZUWj3o5XI/JUTHRQ3MRQMmjTvZJ4np8UZ/UiPxZtJPCSjedWBuKHCkM3aa3cUq1HFE0qfV7YOxf7RL/++u7N589FZb8U8Eus+TmBEak875bxYnemImzBDfl6nGJo3lgnTa8RRxNOHFelXYyMgkkOw5mYVBG5k/OTMUwsJgJyiUVV2A4CJrQMTqeE+OerrGkDE9Twxhu3kxBhT8zsYEGSkd4ma5p/ud0+EwHJIJqna5G1yvWv5EZmwSSLvUglp2z3vkZq75E+Xi3D6TQeDwzlEpnIQgPK4e6B2gWg0iNqUTnTV4tQndHSz1jMVT8YDg3NE4qbj8hPP394exHwbmywnhMADqRyK/GU26XperEQiKBgvV8EPylERVoSzwV6IzlYLwLhcaUCPaqdU1H/RIVZE/oiH5hZSBPdSOznKcBkeAvb9OENrcc3nDdRtlakXXZZ5w2R3KuOp4HelR/mgday3zz/GpI4k8iJnscK6CnkLEWLU0+FeAnhmwgpKXu8GiJfr1dyxFa3y2R9c0vGlPzgPNn1kuW2VJhRJfWcd7glXC6/9zoiVczrkJvlpUpYfMU+ie40zd2Ed01o4So8Su44LwnKF6+uuad/T1ZiB5/34IXpzILtEvXOyRgX3iQx7GmlpumpRE3B2R/yyT9FqrkubSYQZDnc1VpO/31u+fBNEjwka6X1wfUyuU851zS8DpIFDZZA+yS7M9YH0puUkY2lGk6yZ5039POcfSzpLeT2yPieAx+kOTfCB/l/inX2i66ucKYK64pAo6HE6IP3D+kqulOIveeMRl2vRl+/C2eL2/C7gfIjGDO/k8Moh7jXrwIhpWBDqwdfPzd1vZLLrTAhyvGWplMkiLN/xsqf7/XOimqodixObIDDB0yagPK2vC4/CqQzYJ3qTfX7LYGdJWwiVM/Si2U45vFOF+G85xgHHoLh9PQPnYZSGp0/e2elr2IShv6pZVjpJbK2U9HxXl+tw7R8zh5sJeSaPRfQMyCxJ2W9ExuYafDLAw0hKRsbTDZ0PAnvRdbaoFLNQjyr3enx8MNybYmbzSJqxtA9Rh/oZ/QDPzR4/ev7Dz//+PayNOQXromUqTvDILwPYwUECFs/XEcyDPMg4zv2WFlZWkvC0xQvM6BlTXZZYaOv13fVMPglXMqzgu9XS7b+BbRmeXODX5HPvr3vVk9iA4+i6lmYc5B9am9ErrBSeGsDGC6N9rY9ZlOHpvi4H1WTMFza9nEcXmutP+XtV6UFx8rdFzcUG1D3ovmkV6nYXRutHPTghUwwnCSRPHxGCJMP9hAeJfDOeHycLET4bbxe8hI8e7ioqTGNouB2tVqkF99+e0PSur7mLINv5Ry/nERfv2WYShDtWz5HE6Xf/pf/8V//x8BZ4f/2zJuT8rdcz0fT9VxsgI9W9xzdWyU6aSUaySSW1D26ubtKFcmAU0+nvJDLrspfiMvh67KAS4jaPV5mHN6waOrVtcUatbqy/jQ/Viv35r/qoAyrH9VXUyOXmTus7bwxHTXFCN8U/KDgLzlbVv0USCRlcHHV6Fm/tqZiA0psXbZ/0cyzcSKCU9+wjczGeBaF5oZMGScWE0ngtMFpg9P2ZE6bM8ELegm9hF4+oV5acySfSXDF3rsjDLZYBwLBl62CL3bhaheMachKRRhm8zCMr+4jLIOwzOOEZexG+EnCNPamIGxjhm0caybCOI8bxmk4f/MskWq5l0ePWEsDAuS6Q+RaFjYg2E4i2GabACQLJPsUSLZsnDuAaMtNArJ1I9vK2gqE+8gI13om/LkAW1vnjhHPWsYBMHY7GGsTrR0lw9XwLgDSbgFp/awBkCyQ7CMhWZtZfhoAa2sJcGsBt1rXUMDVJ4WrmmgIiTxI5EEiz9OdiioSdz2X01GFXh3jKSlzAOAvbndaqiBMuzo1ZeHBg4e4uYfYpPFwDeEaPtIpqoLpfZrTVIUmwBksnKoqrozwAh/XC7SQuz4TzFnt2RHizsogAHtuhT2rQoU0m44gTh99B+oE6nwc1Fk1vE+CPKvNAPo00adlfQQCfRoEmvHVPjP8qft1xOhTh/CBPXeBPbVAAXl2DHm6NR24E7jzcXGnNrlPijqdW7fAnOaqCMT5uIgzv5oAyS5IdkGyy5Mlu1SuZ4M+Qh+hj0+mj47LAaGV0Epo5ZNppf1i0GcSJbV27ghDpbZxQLx0q3ipVbR2lC5ac/kuIqmbR1I9rQHCqQinPk441WqWnySmam0JAqtmYNW+hiK6+rjRVY/b5uFQwqGEQ/mIDmXZZED+IH/2uWF7N03Wcz/x+3XOPshteD2LpKNZEMe7h8XDwH4R7926eBTmSW/i9cZqj39rbuGuVo9rTD1cV1nO7qxu4qi+ULfP3kfsZiV3pCA8GGwxViQIYqZJZdSiTutspNflUjXS2tzf0rDd83LNFujKvL+dQ03r9DUt5oNff3r1j1fvfnj1rz+8vSJFLNUkYiBqirgNZO7iMVdKfg25WPyFfFkRGJRqWSVkWubkXRBIG3/5dpakqZjpZD4Xt57Eq4fiqv6iVMGHn9/83LuO5rf9C2rI1ziN1RXEk2gcC2tEM0qtisg4CaeJZiZN5tVm8HgGVwXN6V9J4WE3TdxEHCRsi3iQ5zyGy6hUzX1EokWwhcAYQ3A1AL1ocDM417bznBSYHOTfKpcklzDSeRCtxv1i57mNo2saqGQ6tYYL1XeDf5U/S5JHoIsGmgNPF5Yo10eOa31hKz9dz2Yvp4QAb0hZbi5/eS1efB6k6lrieFq4utlS1z356XdxShLIOK4XD6KBeTE0r05sBAtXQluqkZdER9Jx6pMzz0sjTdM8uQ9uEp41IX/xze1KTtCAY3WWigi0RiRMNCW5LyurUtJHjZvfpMEspgGQjpOlFu1c8do0n/BwUANXtwNLTElcYW2/jlp3nn0HrvXv63BJuJxviL5+CK6U0b0aWAKj6+saoyP1txjseU9Feu7QFK0qpGezLNhF9mCkP1slbs/Xfjd3OJmQtU5dl3M7Aku1l3W7ylgu7656tn6fVj8RlmAohlsZcntHvKJYtJiEJDOhjp8NVomYqJH+woYoqm0iC3tx0hjG4JZXnpJeVGAaeQZHr+LkcjF+yziHo2oC8NhfQeouvh2wJe+JS9KbVwy3+5w3VZurntt959hKPF9Hdjea17Mxu8Lxai3ut49kS/VN9JG2N7QYRvfn3BM2IdTdkNeHWci31su+nbgCNus0C4Boe0uzJ78ZCcg14EVixB3q8X/6rkFUtRnq7x4kCWk1WJdSqACsfJ2srF7D5DNuDZGrW+Ea+FZtEHLMyw7/FMPobo/4+qSxHY03WSOq4eVVChwjcWG0qVuZeS5y7PfjUgrfseBXkjaT/d2Jd/lcPMvNghgtLvn0cGnM0nBs4NjAsYFjA8fmYB0b05zDvYF785TujSmLT+vkOFvymK6O3/3PgGyAbIBsgGyAbMcC2RzrAtAb0NtTojeHWD4tkPNp1ONiOtsN2whnP0U42z4XCG8feHi76fJjqNpTq1p5TqByh65y9tsYoWlPoGm2qYCCPS8Fs94ftSn9HGJ/iP0h9ofYH2J/hxD7sy0EiPwh8vekkT+bUD5x3K+xSY+atFq6aBCO0RMkrxbmAB7RgXtEtruUoFaPr1bVeYBqPRPVyi+JgGI9nWLpWYBaHbhaOZiwu0pakHc6azjrh9Cw60yvv8aauaLH0jJP7vu+41FPSOyR1liqAJmNiG4iuonoJqKbBxvdLFl0xDUR13zKuGZJHJ82olnXmMeMZfrQDPqcSbFVAwgHCAcIBwgHCHewEM5q1wHkAOSe9GCxTSif+IRxY5MeE9Q5rj1B3P/x4/7WqUDw/8CD/22J2n24ZZuqhDcFbwreFLwpeFMH60012nh4VvCsnpSRtklAn5istlXz9utxbXgvyC6ci0e7GAQexaPcD1K65mMSpwuGw64rPlZh+sV2vwd/ng4+0H/fCsyRl/gm/5U99OxKN3n3Gpmd70OSZ/Oh0SxJFiPOsheTYntdfpGcePFIN5uE7ef5D1T8nS79mqZU3HMyDHqz8O56EgZZzRLA5m8apVTDZD2jtrHG9atXjvg1gYfhUl0y8vNSLh2F20je6GflhSSiAsaAEm9HwXo+owkOzgoDJvQsJT/HcGBWfOMnOykygjEOSSh/W5NWR/N0vYzSfI3gdwSk/mvhbEW/xwy9snr4MkH9LL1FX8QngWWeovXN9cM3Qbm7f9NgNquNhS1eseBIBEJDlVSKiStSzDtS9M0ovPTywwPj+smiuaOHi6Jku2DV8Kb0c8GZqFdZPjGe42TJISRxBdPgxIE7eo2Xssi5Jk2VglN2eX9NI2liZzEhZWVh2VMTxckazaP7IB2Tactdk/tI5Mit07JrJiJnLNE8MAroX6kLA68EnL9S9/RdsWTcrWereMEX/RA2Z5ErVSc8XDES5Nz2aOqo7gfpV69EcI4djKwSIUbiBuG+WDnILSrVdxuvhMcYinuEylBFN/4slbdeKZzA+IYkkrH3SdH9MK91dN2coDpvMxTZDcM68/C162bFb6ofuS6MrBotYScu2l4Ey4M5ulcN2+AuWC5v/6ZiRIeVT+wFN7z/Udyiyg7/LFo5AJ8T3EtFK10M2VPYQU+b2/0rjdTQ6+rMzOvKbpcd+ThitXd36H+q5YX7mjg49gufoe8pESXh57veyGCven5XPp0HpvHq9+s7eB2R2i7l/cvDUbZYkejdxGP5seu64MzK5jdIWm6PNr4dvMt/b77alKQpTIfTM14kgz9Uxet1PBn8+uu7Nz0RMxyKrgr1oM/FT36i/+dZw9WjNXPXb/LVlPT2hFaZl4QKk96vkV25SJQKWJ8vuqnCPBBofE2GOeIF9q3bP5XGlRAym0sZpwylNc79vbGuh8MvoVy0l4O6e1SFVaqszLHENKOsvp5jPpquw01p2WDg1SgU4tLTxqc2htt1lTkgeDYnvX5zw/oc8FAeab/pdtxa5bCJohzHvs/Vw/LRLS6hFX6Nh+ha5kCNPq8E6qOLepdXXFpO4jE9+0PXkV/mJwMWo9F4FqbpaES/3SUMzUejPwdej/8HIV1GSFTgrL1G5VEWViy+9TqextQ5uR9QU59oUTCNZ1Gt4hkDwJeHS3Cg3zJScnj9oC96HxlYmGObvdrr2BWQPg8+ffZWUXXtsBpYQ5yfVGClOJ6cOIOBdbBQBobFlxoH2k2Dvo++8dpKt2Uphn6H4tW+4eAcjFj8aobaIvpIOGBatMNZub73bff567hiIU7W3RfjtR/o15/oObvInfWdEWESxaH26c7rwK1423Ab7K7B8NCNiF8EhL8WIV+OLUcgUChcboCIT4Q6Kv/LUcnVer6KZ7yfxqtrGvT41NJVqYEDYU1GItwWf43IU9Wl+o5q2dOLGKOpfTtRit8inELhK/KFrfnrHfXE86+JlLiBI5CeNangigwt7sm5Xw1i8ho2WLQZYwttiN/IV2z7dVvj+i6pAwobiBYjavA4UQMx2AgaIGjwVEEDhwBaYgbKLmwRMjBreNSIAfxr+Nfwr+FfH4N/LQHnsbjXjuUL3vXTe9dKEOFcw7nel3NduC7ukHzs4k11cLUfw9Wuv0MKHjc87sfxuJvvMis53pZrLTfzvy0VYeMeG/cILCCwgMACAgsNgYUC2D6W+EL9Yo0ww9OHGYpiiWgDog37ija47qlH4AGBh7rAg/c91ohBIAbxODGIVlerl8IRjrKITCAygcgEIhOITCAy8ciRCRcwP5YghfdqjnjF08crnMKK0AVCF/sLXTx8SDKSGDUHXQxcNF7pjVDFfkMVFjlBoAKBiqcLVHgJpDVMYSnpE6RoMEE4uAAvHl48vHh48Tv34m0Y9Xh8eK+FDh58Fzx4q6DCf4f//jj++9vfJYqEHw8/3sePL8kL/Hn4893w5xsFs9GvL9UA/x7+Pfx7+Pfw77vu35cx7HH6+Y0LIPz9rvn7FcGF3w+/f29+P4nrD8n85nI958tTvo8ICsHdh7tfdvctYgIvH17+k3n5XvJoc+4tBbc6WFBTIRx9OPpw9OHow9HftaNvA61H4997LX1w6zvg1lvFFN48vPlH8uY/LtnLgDsPd77enZdyAn8e/nxH/HmXQDY79LLkoe3SCxsMdgCEIxCOQDgC4YjDDkco1H2k8QjX0o2AROcCElpQEZFARGJvtxNGq4+3ySwS0nt4txSSJUMoYr/3E5oCghAEQhBPFYJoEERL6KFQYrt7Cy01IXsA7jrcdbjrcNd3fX9hAZIezT2G9csb3PMO3GdYFEy45XDL9+WWfx/Gs4/ku7wVyxb1HUkC8MxLnnlFRuCdwzt/Ku/cQxgtHnqlFI7vwy+HXw6/HH559/zyKiY9Ft/cY3GDf/70/rlFQOGjw0fft4+uVih46PDQHR66E0HCP4d//rj+uZczU/LOVRn45vDN4ZvDN4dv3l3fXGPRY/PMnXYAfnl3/PJMOOGVwyvfl1euR/+gctl1oy8VoIRjvl/H/KPTdYVH/uw8cjlcNXPuPUglR2Jzx7e++g0HrtnfgNsLtxduL9zeZ+P2ZmDv+fi75kf/28IzooKg6egunkxm0T2BqsFd+HBNTiABm+l6Li4WH63ueTCpbxq06nXDAxXV4AgXjDnfPZCyTKdz3X8RfGSYeR+dLSOjjYFqI33hKLaIlnEyiXkBeQhW8V1EMLQMnGfJjaO0eCoM9HAFd/HN7Sq4joLb9fzmPIgH0eDcqUUvGJEvg1u2IsH1+mbgxGW5d67XURXQ4C/da0A90G0NevaCSuyf6okYiuWSrQhbrurbhJkP/juPZRpRJyaptbr7WzJSwYflumZJmAibsIjmE5YbDR1Lw86f1Y/kJ56Sz/UDqXo3VD83AXIvgte30VjYb5L5r5GocxJwbdzb8W1NyZRcrdlEeL5BMh6vl6qWZZ2xr+pUrdGfRfMej2ifnfC/1ttlWsaipXV22QPVoqDcO5aH2tpIWdkdIrPIDArNAGl69n4Vz2YBTy33bkoLoXKr1VqTWangrLG2M3bF1QIRhFMO4Syjl0tJ58B+ehZC0KN4tgWG0mPzL8NmHTBVPZ6voyaQr9wVXrF61VZM4zlbTPvEKnUVNbAQ9GoWZvGQRN+9OnH/KZJxr3C8WgtbLfWTwYuwkGSy42lNeRmAiFmmFL6jRZINPDXwbBUQ0AjCmuJKnKR0TfIghFFVmNaUn0dfhSisljH9Njkne7/K3z7mwAjBkfWqvgfG666jcUjLh1rxeJRFaKChvBht91zUedU5AOJK3HBXtLC+mgVpfENY3wOJHHtgXyxsepioUe2Y47q7WZBDeuwSYJdgX7sEb8I5NTdZp9/H0WySIncPWwQlZ7gkIdgpQO7eU+XuNYqiJXevVGYr9ht7XSDgBQEvtmmwTYNtGmzTNGzTlNH2sWQnNi7cyE58+oBDRTgRd0DcYV9xh/erZElqMl4vU2rYj1GaUvMPKlXR2gPkLT5OUMI6+AhNIDTxVKEJT4G0BCgcdmSLMEVdjQhWIFiBYAWCFQhWIFjREKywQ/RjCVl4LugIXDx94MIhqAhfIHyxr/DFJenqQUcvbB1A8OJxghe2sUfsArGLp4pd+MmjJXRhNyJbRC5qKgRjEtx8uPlw8+Hm79jNt0LZY/Hy/ZY+OPlP7+TbxRQ+Pnz8ffn4NOrparker17NJ4efrtDYG3j/j+P9N04EQgEIBTxVKGAD4bTEBTxszRZBAt/akeqAVAfEQBADQQwEMZCGGEgz1D+WgMgGAADRkaePjngIMEIlCJXsLlRyYsQvMgd7nggZSAV5lPDH1VvzoaB3L1cjsuRZpGMYnIoPTzVfUiFgIpnNTvWfpycFaxZc8mzcRQIGFkdgevpqtWKqCDl3f1Re/Kdcus7+KEdw/jwLTktVJfPgTGui5BULJkkkvf7od/L58wJqaF5oX0gvhWOlq6lcRPKYwGj0WtjOvPk8YfkMeDn/y1i6XUXlFBN9ETg9KdXEvIDylWqKyLZqD+vEElyoZ0bsBy//V0YoJit7q546cXrSoh+0ukdc6VibOlpaw8mkpx1cKdWEsQtFWconIzUQ+r3C4JLg6et9MjdUPHceEJyP5/EqJvdPfDKsvERgEEer+v3yGpv5/lUlNZmZcxUtS0TrOIBsttF5lykR8zhUP5u1/sTi7X9I5OCZb5MNKA2Ea/2TxHfij96JK3JS7cCnRiGVJUsshMU+iZFXtKFsUZTMaivBmEIsJdWGSYK9ofxRbZ3h7mcm3jllhvUZnhW148wnbOcVw6oVnL4NFlr11AIAhbA5xEzP39A9kWLNyANV4s/qU6RiM15ZScbWCxYYo0jlK1fnbD5Z0ZTKXv4jm/7LqGKO2AfKCSCDXFTOg9/W6Sog9C5Xv4XGO0UoUHQZt3YTXwTvpPslwxf6oWCyjgRToHTVRLBduEmylScVL0xBM65JVxGTUSNIHiTT7AHu+NWv8y/z5H5+VapER/3DYDyLCUwJULVahvN0QfBgvpo9yLYMynsk7s6TKc6a31MfWvwwiQbU96VW/ZDcEMJ8CAgC3hLSnJGUyCdZcMdfuIFjWstpqO7CL+RdlocmCtOYhpUxzSS6Xt/ccIiy+EypxE8/f3h7kdMakonIqEW1x0yTyTEoZty8jhSdYnVP42qxvibf5ls5MN/SwHyb8R5/W4lCLR6u9IyVNiDkuAgLe1Ei7f9Z8CiGs0/85WfFNOssnS+ayii8sgw5x9dSbghHhPSknfsGo/q2PbKfEjGMPPRyV4f3HHiA5skkuuLRpNEOZ9SkyYMYb7HrU0XgZVkbcfnf0tHigQzwfCApYUeLJY3ySEiHEA4Xcacvx+r09FctekGPWm118bS97wc6WvPn3wpaR508U4p39u/z0+BfnO87Oxv8RhYqi6pzH66pMwOS4btwNcroMzON8iUllnq2VVixIYyoeuiKCha3S8WO24SUk2SCZzwgHWVMTsJwH5L9WSVOL208W0+ksTtb0NDQ+jzQzopcjTXQJ3DgqITJUqkFvPDMQ+ln3Mhm8DjL7cMv8ZzNp6OGU8MCnf5N8TPHqzNynNYL5sSOZovpesb1OWrILNI52xPhlES/LxKapJjDSHdkdcXS5BwHKRJOd/VOhg+G09P1RiJ82oAp7QFWUlO78BRskUGFzCEEawF+wGaMzIr6ztLmU7wUTaLxjFYyFW/UtUnxrSpL38nRHhnrra5TLs6pXEElgfpt+NVFmT5O7qJgSo4LtT0RMserv6ZaJ/nPa6AnXKEUpahXgoaXhypz3NX2Pn/u5m3Py+vNfvE+weQ+L26ax6mjDvUiPQqD4AO/nvqS3DMf/CT6Gs0S1gWnLqcs6Q8B+YJCnYvjycs6fRovgyvJIOmK23AAmsybGEpq85y7oriqx7y+iiAVc1g74/0vzBg4b4nL95Ixy/CUPXdDSbxGszKingq5dkec2/B7T09/MdaRXJF5dkvDtZ1uuxcOkVLjp9NCnx0Gz0ud/RVxV7Bi99Ci/RQ/LsTYJcxw7/Ip14aE4j5MGUqHFfVmVXXfapFZWVocqXOZ4+KIzW6PbrZHODtDOTtDOrtBO7tBPDtAPZ7IZz/opxQ9bwoH+CQ8kJLw+C3IT149kGBQr8T48Rp8+ctrXsGuozzV4W9yuFmA1mnEY12SH1YbMlI0ncZc+UcwJF1zvtGsxnDwJuLkPNF+VsWJ+FMCqXJ/CB+tU3m9QRpF0gCodVXebiN2G1bLB71A6+ArtVm896SMMUQTlJjH7Osn1ICIYcOcZjKaXAS6veoemll8R5KVTIPv/vrXUm2yhK40HQTvI6leokwa8BJR7lEQ3K5Wi/Ti228zGmtCNvzHzTK8Y+15ebMmHU/l9y9lVd+enOxnhfFZWdotKHZJn57+IaK65mT3B6ORSjP44+wiOAv+heRsWXxEX51S+aIf/K/gr3JP6OyMFi/7a08FhqT/aSkSd0SoJJ/CvOfTrqbzPBcS1hAySgsJ3ahsNnW0NNrfa5OEzWbetfb6r7nFcWtww7Zc+TZf8Ta1sGbvnHLwlLKwa3moD2j/a5hGb7NLUcI0vyGlbIl2AXkP1xBlw+KwQvn3pgnKP/W0P+0xtb9eG43pqlJvDV+3hq3bwdXtYOoW8LQBlm5qLJ2ifxH8kX38p8vEWO+4cm7JL6O75Gtk2ZUXxS0XOfIY80ZEdmNjugjnvZMCGqTR4502ArRX1v25q9ze/U1EnBTA1VEoI/8kWqlsvBG9Kis1FOcdTvKOG/kZ9ekZG6dMbJHX4Z1twf9ulovxqPyy8uaPxu70rDAR71Uqgnq13hcycjg8N98vzESh5YO4+i1axtMHeQ8Xp9WzpQ3Vr+I73m0TWTXG3XpansL16rZ0obXcvZe1ykT9oi3TaYfZbrH64DzPnpOacmJPb+I0V7ITZNSjWRJOTrkPiYAC6zk1Ut2ZyV/RyPNJGJFdYoaUX+TZAKvgbi2VP5XhWxGyDFfhdZiKzFbyumhmZpFReJms55OXq2W8UNFR+t80XkYv6R0vyVyQXfsb2aXrlEVM7LpyXpxhVl8EVyNuH6eziaNVY740cURF81MJq5FumEh6k3cjkuqbveC2qlHg/WVqtUzd+xIvjGCnfn2ha/lMvjgpLhMXPPlLqjGZ6j3Su/ALG2h9VZ0OLvN7m8Y0+ioFaqXGSWzI8xY4T7lo7b05tHKDdi4u1buN7gbBa71YiWshVWf1fYj3Qh3T0tyKDe5wLN/PqEGVsLbPiIO/CNbzeTRmm76M2dXlqxV7sokikM5NS0hD7+J/6rv2ONcxNNuvJSflpE8SwFlCMjWNZ9TOvn3MP/K2tByfkbiZcaQ0UjjTmVLyRYLZbZOFV0bzOJy9TKYv1XIchCuxWH4l68PZBXILQoyfzEhIi1fyqUs05XtSXr5pCGPGgXq8UyrtkB7bMTNVqqj1xQUoS8M9tz5kOxxVMALGLaMZOBZ7HQQGeMEW88PbJmqi/9I49NcRlYtGYoh45M8MMWKD0uuf6csNTZlXks2lhBngYIopgXo/ZURyNJJ3ohrFddPNVkeF4isVYJGKUcZnL7hJvPNUfOciXJIZjBf8dI9wb0zwmeoQuletQl+sWXwzrdg6QyifbYt1Khn/oiTU2zXb1Numm/MXLC82thsvXAl+nqtir2+tYPBLuEwjTkd8TxpB/pClGQP9sDVjS3+Zd6bpiGZJ6k4aD2daT0CdOzNGhtZ8EUPN2EEyWnFx0uKAqTTIzgOz5yetcqEdj9f3VbSSQEmyJCs9NBFJ9mmvJnVf5fzVHk5x5QHWghv7Vhs1aWhCKa+0UEs2uCWJL5/CofF79UFGPbnHkCyHfB+1LW/wP9aEcdKGR4X46LxdKQ79i5Pq9qO6SbloPHzybGvya2sHb7fHj08cicOyx4PszJCqwfK8Blu0Bgm4o3Gm9qjSK+naivNgcl2hJUblrIsD/ZZdthfBvcCJc3UrsUqgI6zMKwIblFNyxOcEL8ZBT2gxveGlWqIIsYqXRemJdTteLIuJTEBgwybC8fy7rpFeQsrDiKzPyDlZTkSaAJX9XaySTpYEfed0ZrgZxYncuPhmTqvyJ/ncS5qadfT5pOwQpmQFxMm6es/wmx04iUqbbU5i6cxUg8Pn8uxMj25NMvTJ2xv1Xes+X2zu8pK+Np4u0xbQavj2egir5D5aoWXzySq7i98/2QpddMfrhrMNZxvONpztPTjbeh3+C29qRcUzoy+4sIYlego0quG4f8poQsEb7WhrQTZqkVBBnLZkMiDtC/ZIBOV2YhhcSUm9OhfJCtc0PPce0gD//9n5/y3d92rSi1oIhKwLldYSbsB19kb/UvKR+ciT2Ky0vVAdYyeMPBwG39lKmoDR7GXhWfOhAe+i0NzFLLnMtBCy7ai6UYUy1ef7lr1Quy/WnGtXxcUfXr3/t9G7NyMmyakjBVj2HJQ6dYP56a+fDVaX/tanqA3nRPudzyKWc4DBHO9ABqI+2wdzNonliPx4vQroS9SUEDBHVrrtuWlv3rT+oC6ApMnQTM8+P2quackc7VCGvzLD0uror70iRXnsq2osCxqoD786BtDjJG/jaeD8uO8n/vHZL9QllykdtZEUE+Y6tXVwrGkhrF/ZPFfDDVfE+vWv/lTAtqtjwwrpIDmryfI/9zxnaJmj5uXR/YSi5Hg7Xy0fFgknN09FEtL8pSZTIV9hxUyVmlSG/SqOCXLAIbjhNGrxhQL2eTBwT8khG8fw2mZlKHmwGodShHEgjL3Zsp75R/+kpE26eJGfqXBqj2lS1iEtsqtIplVeqXddDQoOYTKfxsu7LIFMxxtEYFicc2MQIIO/15EknRH+dcGVU5MxcPOMqLWbsd7XaKTqVCHIxSwci8ytkTzbPpBfC2cj5PWsqon2ATh3PudYaTzYC7LG6ay8V/kra04MJGkaMy1ARmxLzuYymAh6k0mkzqtxEpXRg+Ddm5PyqbdQJrmxxygiiOfiZJlIlwtnaRLQ4k/+efl1cZnEV02QIDii9Y1aE0gvWcbCdB/5t/mck/DCSXDDlS4WlcPzet/AyKdjKEufyqRBo0epbHTQu2fRiSq948MHg5tBIOI3wdXymg/Nfb2izo1vwyQN7pL5l+hB7FCQH0wmIvhenXus9C9MmSRCkg8IHFwhZygd3BfrWGHREIWdyZrCRLwX+W2vk0k0+PWnV/949e6HV//6w1sLeDs1xCQ4+8Mur3+eqZOh6/lkwOexHpK1Je/1lI9kjFlRJzxHgkXCqF1Gls9VlkT4wHqqoy6Wyrh4KtJTWc/TFfMkiOHlrLXTWuoSkfTKdNVzIUdiaMXxVhX9exC2n2mdB6bHb9X9vyjlV7oeV5g3dIT4p58/SAoORdItC5Ak0Ar/uFP6Xrb87I9iw/88y8KLZkfzA7+nlrqUQv5Nm9ezP2yjJKre4aRkJS3John7xegunkxm0T1JnabvWc9HWQ7p6p45IFdJxval91ZLvrTYz6OSxdFvTqrcbLG17YE5MjFtW0WlZMwiz5WNfZrE2uo2uENZZZ+7SlytnG7XFqjLU611UL28Txs0Gpp/+GLL2nSZ0gD4bEC26urjskLWxRC23KB0j6+Cf15+VIF/VIpWnUTVCketGGyYeNFS4ErcFrsgm5LrzHaEU9Ujm67mteYnlrn0hhjT8Kj8ejawBvmtFx3ui+AntWcj6BzsewzyIFVld8Qgx1B7KlfVZXbEsCtrwJVgYLIdwxB5III2SrJraF890L76IPhZblqqEbdU4my+rkPzJivirjEtZpakFfJ/1M6eAM78lDz/epukCkzLP6M70qCvUSEEa61PoP/4jnfV5e6M0FAhSmk0V7trJnJm8lNa6R9Ih/9mqS/lLSHpFglO9TOuc8b3MERy4EQCAGFrm2jnR2NvaGrW1xyvUYRXL/lkHMHr5Ns4TUnxv/3vf/2f3524qTPKjDD56pcPCEfvm9e/og0rlXfukVSUQv4yIOUS3ot7mayEgoaqaOWL4F+yVpkyxWolpL0+/pQb0nAyEkSrIUMovWbR2CfLSTwPyZ8dlZ45b8nd0HdE5Rp0Uv5wMU+1xPWbHajfx6F6z4P1tZba95CnfNcv4l2CkiYrY7xXdEZR2+W0dmIn3WbKVFaI3BY2D+eZVXJGjeb9UWfVbKl9wuWgkox/pE8s6xdhNh1ImCScFXH9wBA9XM9WtlOGvN9uMR4sYfI/ymx899/+5//9f8mgREptj+x8RC/0/qvYeuXzg5KWT+dHKCeIM1ZUtkYaTi3z53Om9Sw/05rNzr/PzzY/HNrrb3wqVx5n/VR3RLZ4TvCzV7z2RXCp2JJKQsjzf6N0SA7CX6qFnfmroqTgTbQok87yss5u3gIZAipmOWQEjdHv0XgtTu5+jUMrFSE54b+lPnprPTmptTPj23SghHOgg+eJDjbdO9pi/8hMv+o6asg+FgFS93lh7b+KXQnVkp762b9w33Ihwj39SlL3SPjU25CwX4p3PwYJuyiyJQd7U+Xl2FXFMT1MZvXSLG+WIHC0xOoF2ThUXnXx8ylp1bOo404DRWAlBys5WMnFT5CS74yUXBpLcJKDk/xQOckrEgxKcsugg5I8rwOU5KXISVcpyT1U271sgJG8C4zkO8MXu8QY7vAUCMlBSL5zyOMJe/YCfWzn0MBHDj7yA+Uj1xIPOvIAdOR7pyPP7CvYyDdKVHm2bOR+Zghk5CAjPxYy8sxU7oGLfBGm6eHSi9fmHWyaC7BFvkKnycUdyQkd5haXgg+2M7Cdge0MbGfVfJ/OcPqYO+fe9Mya7CY7Jt/MguPNgOPK0/Env/Egvqk9dthvQ18k7cD+6ItyuqF81C1cyDIhz5ntVWZAbs6H6wgBstcJThtJby2++mZ7qHWQFL3FRL5nz9BrMyWPStBbGO9u8/MCsAKwArACsIKeF/S8oOc1hQP0vKDnPQh6Xl9XHuy8u45NtItPeMYoGuMUDnGukPOKXYgjYuetCW6olpkuPbh5wc0Lbt7myNvBcPPuZWd158y8ji1NEPNWF3MQ84KY1+gdiHlBzAtiXhDz+hPzOtZa287XgfPy1rg+jVtyrfxOGy4CLW8tLW9d8MB3V9KRvOce3i1ZeWvkCaS8IOUFKS9o9xyHx0HKC1JekPKqd4GUF6S8IOU1yoOUF+gApLwg5XWQ8r6PVq8mv8kUr224eR1JvHvg5jVbvCVFb0aqa1SpdoGfHS+vfaI3yxA4WnreouwdNkuv2ZenJOutUcLeSav8Co8cDZl+keWViD+rT5HqzRI+Sz4ZrRcsQkaRylettyzBOQzOYXAOt+EcNk0DqId3Rj1cWAHAQAwG4kNlIHYJMoiILWMPIuK8DhARl6JFXSUi9tdw9yICPuIu8BHvGnTsEni4A3SgJQYt8c5xkCcW2icesh3DAzsx2IkPlJ24JPggKQ5AUrx3kuKytQVX8Ub5O8+Wq7iVUQJlMSiLj4WyuGw4wVxcys7wSc7YMmFii9yOTvMY23bqD4LOuKAUIIkDSRxI4kASZzECviRxeqL/Aka242Nkq2NMta2Qvf4uiN28Dpx2hsvLklzizc59EIxe+yXqakgjrAU9j83X5c1ttjWx1/kmzF45V1WBQdw7c7cjROJbE1JpFPZRMZhm3I/KBUuvpJM7npF3l5GaKi7Tc8YJ97YTWPcCQGpOVJWARyCalwq2Mafkks8Jd4yDnlBpesNLtXYRlBUvi2wnbAjbiPVSE68wHQqH6vl3XSO9hDSJoVqfIXWynEjOnmn8u1g+B64j4pr3K7PoDO9Ebp08rPtJPveSpmYdfXaTtPu4kt/szKs8SMp2a3L3s2dur7Hfj0rg7oAjHeZxh6cOTx2eOjx10LkjeAA6d9C5g879UOncW4aAwOp+DMGioyd3b447ZQ2shAJA9Q6qd1C9N58tOBiq90dIRdk58Xt9Dgj436vLPvjfwf9u9A787+B/B/87+N/9+d/rl1zbNtqB08A3O0mN23ytHFUbWAIbfC0bvEfQYcudTvcob0kK3yxd4IYHNzy44cH+6uDzADc8uOHBDa/eBW54cMODG94oD254oANww4Mb3sEN/yGfxV3RxBtVHhhX/IYhr2fCHt8oCptlI4BI/hkQyTtk4yk55bOI5k4DTyBjBxk7yNgd6g5e9p3xsrsMKijaQdF+qBTtHjINtnbLNICtPa8DbO2l+E1X2do3Unb30gLi9i4Qt+8RlewSmbgDaeBwB4f7zoGSJ1h6JMBkO4YHOnfQuR8onbtbB8DsHoDZfe/M7jU2GCTvGyXiPFuS901NFfjewfd+LHzvNeYU1O+l5IuWuRePwAJfl7oBKvh9UMG79AVcc+CaA9ccuOYsRgCs8KoGELuBFT7Tww0oweqzXPwJ4kVatCmDrlxo/57vj0zsCZnB/JMIa7HTMyIJ03RONpowx6n0jdJ0u80an5Fa1WYMbUb0lach1/TWHO4GRrC+x4Fwq+WzEba3dADB3X6E3O1+RhM07rbZgpcNLxteNrzsfXrZYHSH4w9GdzC6g9H9cMI3IHdHCOe4eN5bBY30iWp7GbC/F2YY7O9gf68PDx4I+/vjZqOACB5E8CCCBxG8sciBCB5E8CCCBxF8d4ngW3lRjduHrZxaG24CJ3wtJ3y7WIXvDmpdirR71LfkiG8leKCLB1086OJBCOsgFAFdPOjiQRev3gW6eNDFgy7eKA+6eKAD0MWDLt5JF//wIXmtN8dflwMC7cniL0VbdsgTL8mDBhnxRXS3WD2IMm/5t02p4RuqfYZk8LUTvVnCwnOngm8QksMlf7fIAqjfQf0O6vfnSP1uUXYQv++Q+N1mTEH7Dtr3w6V9b5BokL5bJgGk73kdIH0vRWG6S/reWtXdywoo37tB+b4nPLJLTOIOhYHwHYTvO4dInjDpUaCS7Ywe6N5B936wdO92DQDZewCy90cge3fYX1C9b5RE84yp3jcxUyB6B9H78RC9O0wpaN5LSROtciba5zFskWXRBUp378SKTpO423QB5HIglwO5HMjlqrlKHaJQcm/2e/Nfa2qhjEOgmXOoBd+QX+qRP9OQB8tQ7WHMfhvyKGkn9kcelZM95bNwXuUqksmHLRim2+b+dYRf2uucq52IuQVE+2YbtNZl5uWm9MUj4Fputjb7YFpuGPiucysD/AL8AvwC/IJZGczKYFYGszKYla1ZG4fErLxZWAC8yvuOc7SLdXjGOxpjHg5xB6uyf6Ak41S2lACjcmF2wagMRuW6qN4BMSrvdeN307Cg944rSJOr6z9Ik0GabPQOpMkgTQZpMkiTK6TJ3ousbTvt4GmSvd2ixn2/Vj6qDRmBJLmBJNk/8OC79enINnQP99bsyN7yBm5kcCODGxnsh45z9+BGBjcyuJHVu8CNDG5kcCMb5cGNDHQAbmRwI3txI7/9XUajwJF8JBzJzgnfLA0BXMnuvhwMV3JJJsCZDM5kcCY/d87kktKDO3lP3Mll4woOZXAoPw8O5RrJBpeyZTLApZzXAS7lUtTmMLiUW6m8e5kBp3L3OJX3gFN2iVXcoTRwK4NbeefQyRM+PSqEsp3WA8cyOJafBcdyVRPAtRyAa/mRuZYt9hicyxsl5xwJ53JbswXuZXAvHyf3ssW0goO5lJyxUW4GuJgPnou5rBugpQMtHWjpQEtXzYnqKPmSPZmgg9zMzalO4GjeG0dzm9zD58XV7AnlwNl8HJzN9VYI3M0AywDLAMsAy+BwBoczOJzB4QwO58ZTUxYn5fA4nNuHEcDl/FhxkXaxEc/4SGOMxCH+4HRuH1ixcjuXSoLjuTDb4HgGx3NdNPBAOZ73trEMrmdwPYPrGVzP4HoG1zO4nsH13FGuZy93qXHfsJUPa0NI4HxuwfnsF6A4DO5nL/kDBzQ4oMEBDZZHB18AOKDBAQ0OaPUucECDAxoc0EZ5cEADHYADGhzQLg5ocix/SOY3l+s52+3vo9X4tlPUz84itpZflj1l8EGbILTCB107+ZtlLoAG2t2XLtNAW0QB7M9gfwb78zNkf7boOkifd0f6bDOl4HoG1/PBcj03CDQoni1zAIrnvA5QPJeCMp2leG6t6e5FBczOnWB23hMY2SUgccfFQOgMQued4yNPjPQYOMl2Yg88zuBxPlQeZ7sCgL45AH3z/umbHdYXrM0bpdM8X9bmTYwUyJpB1nw0ZM0OQwqO5lLyRJvciR3lM4Cv+en5mm3qAeY5MM+BeQ7Mc9Wcpe7wK7l3/bvBzuyXgQRS5l2SMrdNADx4LuYWkO2bnaM38DJ3mZe52f6AjhlYGFgYWBhYGCzMYGEGCzNYmMHC7Dq0ZHFPDoKFebMoAciX9xz2aBf68Ax/NIZAHMIOzmXvuIk+rugOD4BhGQzLYFhujvEdDsPy428Lg20ZbMtgWwbbMtiWwbYMtmWwLXeHbdnbUWrcBGzltNqAEUiW60mW/QMRneVW9pY2UCqDUhmUyiBNdJzPB6UyKJVBqazeBUplUCqDUtkoD0ploANQKoNS2Y9S+WMp3aE9p7IjnXhzTmXvWzzb0Sc7ckhk89U+8nPnUP7oSG5pl4oAEmV3Xw6HRFnKwlOyKPtoZO+kVbqGR8qHzObI0lTEn9WnSA9nCR+zn4zWCxYjo0jlq9ZbnWCFBis0WKG3YIWWNgK00PuihVaLA3ihwQv9THihqxINYmjLJIAYOq8DxNCl0NKBEEP7qLp7WQEzdAeZoXeHR3aJSdzxPVBDgxp65xDJEyY9ClSynSMENzS4oZ8HN3SmASCHDkAO/djk0Ln9BTv0RplBx8IO7WmmQA8NeugjpYfOTSn4oUuZIK0SQdonZ2yROgIu6L1wQStdAAEeCPBAgAcCPIsR8CXA0xP9F7DNHR/bnBcrrK1gS5o6rzOuXWUmK+SneBOYHwQz2aMSjjmTFGsR0GMzjnmTtW1NTXa+CTdZzqdVR6/ukRvcEX71rdmzNCT7qKhaM5JL5YalV9LjHc/Iw8vYWxVp6zmDhnvbia97gSY1+atK7yNEzesGm59T8s/nBELGQU8oOb3hpVrICNeKl0W2Ez0EdMTiqelgmKSFQ/r8u66RXkK6xbitz/g6WU4kk9A0/l2spQPXCXVNUpaZd8Z6InNPHg7+JJ97SVOzjj57c9fXu5PfbONZgqf+cHjqrfYbRPVw1OGow1GHow6mesQOwFQPpnow1TtPhlpclgNkqveOB4Gq/qgiR+Cq9w9C2cnqZQmw1ZfON4OtHmz17iMKh8pWv+skFTDTg5kezPRgpgczPZjpwUwPZvquMtPXuUWN+36tfFQbMgI1fRtq+trAw5Zbn+7h3i03fZ28gZwe5PQgpwf9rIMjBOT0IKcHOb16F8jpQU4PcnqjPMjpgQ5ATg9yegc5/d+j1cdbkkvhlW9DSu+4221zUnp3EbPJlauP21HUN7Xr2dHTO+Z7s6yD505L3yQdh8pLXxCCp+Sjz+KUOw0egb8d/O3gby8oOXjbd8bbXjSe4GsHX/uh8rU7JRk87ZbBB097Xgd42ktRlq7ytLdQcfcyAn72LvCz7xx37BJ7uENb4GUHL/vOoZAnHNorJLKdlgMfO/jYD5SPvSz54GEPwMO+dx72ir0F//pGyS/Pln+9nVkC7zp414+Fd71iOsG3Xkpu8Mpt2DbfYIvciC6wrvsnQHSYdr2oCmBxA4sbWNzA4lbNKeoMV5Ftb96bs1qz92Qn+ZtpfbwpfZoyg/xpfDwofGqPRvbb8DJJu7A/XqacRykffQsxtEwGdGaYlemg/XPxOkID7XXa1EZV7IXEvtkdKOsyYXFjUuGzZyyuMzL7YCpuGvFuUxUD3ALcAtwC3IKiGBTFoCgGRTEoig+Worit2w9q4n3FMdrFMjzjGY0xDYd4Hz0lsUcgRLXQ5vaDghgUxKAgbo7WHQwF8aPs224c7vPeMAUTcXW5BxMxmIiN3oGJGEzEYCIGE3GFidh/lbXtkx04FbGHO9S4kdfKJ7VhIlAQ11IQ+wQYfPcyHemB7mHeknrYQ75AOQzKYVAOg1TQcdwdlMOgHAblsHoXKIdBOQzKYaM8KIeBDkA5DMphB+UwB+4+0iuzFbZTtMPeN1m2Ixr2vlrrmfAM10zyZukEz51ruEFADpVquCIHoBsG3TDohp8f3XBF0UE5vDPK4aoRBe0waIcPlXa4VppBPWyZAFAP53WAergUbekq9XBLNXcvJ6Af7gL98F4wyC5xiDvUBQpiUBDvHBZ5QqO9wyPbiTjQEIOG+EBpiG3SDyriAFTEe6cittpd0BFvlBjzbOmI25snUBKDkvhYKImtJhS0xKUECO/8h/Y5CQdORuydJNFhLuKqDoCyDZRtoGwDZVs176gzxESuzftOcBL7pBCBl3iHvMTtcvcOnZvYG459sw0y6zIjcVPq4bMnJG6yMPsgJW4Y9G5zEgPkAuQC5ALkgpcYvMTgJQYvMXiJg0PmJd7E/Qc38T7jGe1iGp5xjcbYhkPMj56f2DMgog9jlp8GT3FhVsFTDJ7iusjdwfAU73Ejd9PQn/cOKsiJq+s9yIlBTmz0DuTEICcGOTHIiSvkxN6LrG3L7MC5iT1docZ9vVY+qQ0VgZ+4lp/YN8jQVY5iTzkDTzF4isFTDCZCx9l48BSDpxg8xepd4CkGTzF4io3y4CkGOgBPMXiKG3iKK8dVwVL83FiKa8l4wFGs/j13jmIlBWAoBkMxGIqfL0OxEk/wE++cn1gbULATg5340NmJLbIMbmLL8IObOK8D3MSlCEvXuYm9lNy9lICZuEvMxDtEH7tEIO7QFniJwUu8c0DkCYr2DIxs5+HASgxW4gNnJc5lH5zEATiJH42T2LC5YCTeKAXm2TMS+5om8BGDj/jY+IgN8wk24lKag2eWA7iID5iLWMs/SNpA0gaSNpC0VbOLOkdFVNyk7xQPsTtNCCzEe2Ah9snNey4cxA0gDAzEz52B2G5bwD8MYAtgC2ALYOsLbI3DUGAfBvtw8aAA2IfBPlyb2gL24W67/OAe3l8Mo10cwzOW0RjPcIg4mId9giAl3mH1LFiHCzMK1mGwDtfF6g6OdXjnG7bgHAbnMDiHwTkMzmFwDoNzGJzDneMcbjyaBMZhm7f5yIzD9aGFrvMN18oY2IbBNgy2YfAJOk67g20YbMNgG1bvAtsw2IbBNmyUB9sw0AHYhsE27GAb/pgsv0xnyf02NMO6jorbvG/eYCeDsW7RpYp91DAIV5KWeC9AwiXFQCmUn4CtVig+hmp1yV+wS3qWyhDxUlpk1pr1nTTAtKyrRNV0vYxs4fOrUZYBMhpp/qYSr45Sw2q+SFZwQKs4r4xpVRvrSpFS9orf97clOq5KV+vUhfbUxXvlIvYWuUNlJdb9AB0x6IhBR/z86Ii1foOHeGc8xJnJBAExCIgPlYDYJsRgHraMO5iH8zrAPFyKtnSVedhPu92LByiHu0A5vEugsUuw4Q5sgWsYXMM7xz6e+GdfGMh27A0kwyAZPlCSYUPowS4cgF147+zCppUFrfBGuS7PllbY2xiBTxh8wsfCJ2wazD0QCTftCbND37dQDztp5ZpyCp4tn5z/5vCzZ5ZzbCPvg1LOe9S7TS6XjRhY5cAqB1Y5sMpZjABY5cAqV0r0AqscWOVqNzHAKveYrHKl9CrQye2DTq4mR9WE2OCRe2oeufr8b9W43E0Dc5wxh2COA3NcXXrFwTDHNYUDH48yboPzQiCPq67qII8DeZzRO5DHgTwO5HEgj6uQx22w3Np2xPZJI8dGJ9tOdx1oDu44XMcLpw46/cUFjxs56ZwefCMdXb0v5UXM5sU/tzHxl+0AJ5jBwAxm26ECMxiYwcAMBmYwMIOBGUxkTYIZDMxgYAYDMxiYwZyG5JGZwd6EczLbyTr9Po5mk3QrgjB7Nqe8mdsdJlD7g5adAmeRUqMvy45uO34xvalfqlVtAdaQivHCMRmp/ulaRDZtzsSS73OqLd04HcXzeBWHM1ly2Csmj4mwsxy0dHQdccOz/WJxNHdbti7njG+2Tzw0RmFX3F6W7eMPiRxF822yAf39UoE13R5+oARgJSl4Sh6wev3rnbTaV/fYm5fb7lk+gfiz+hRp3Szh4yiT0XrBomMUqXzVeqsKjGZgNAOjWRtGs5J1ALHZzojNyksB+M3Ab3ao/GY1sgyaM8vwg+YsrwM0Z6XQUVdpzlopuXspAdtZF9jO9oA+dolA3DE7kJ6B9GzngMgTFO0ZGNkOZ4H7DNxnB8p9VpV9UKAFoEDbOwWaxeaCCW2j3J5ny4TW1jSBEA2EaMdCiGYxn3vgRZMsZ46DFjrrIjtRkS5C45SEAIE0MrwtRzj2yrqZd5Ubtb+JGJTCtTouZdLNrHQWOb0qKyXPk5/kfTHyNzzTN7ZPqdgiAcQ7G8N56NNxNsR1FlRvKxk5Hg27+BfdYQyr0Blk1GFlfQCDGBjEwCAGBjGLEfBlENMT/RfQdR0fXRc1rWFZ7PV3wfPldXKwM9RO9jyTOoanYo70IRA87Ze3qTm1sBbvPDZ9kzfb1dY8T+ebED3lpEWmHWmVxVuTvVs7jPYvN8wL7W9PTqQB2EfFbJlxAirHK72S3u14Rj5dRnapOC7PGSLc205m3QvsqLkyVVIe4WdeJdjYnJIvPifIMQ56QrHpDS/VskUoVrwssp28IVgjlkpNwsHUGBys5991jfQS0idGaX1G08lyIvlbpvHvYuUcuM5eaw6ozJgzshP5dvIQ7yf53EuamnX02c3i7elAfrNLX7LL5N5N6d7PntK73nrvg9m7GYR0mM8bTjmccjjlcMpB6404AWi9QesNWu8DpvVuH/sBu/eRRImOnuTbK+Ck2mgPAIDyG5TfoPxuPlxwMJTfj5Z8smnwzzvrA/zf1XUf/N/g/zZ6B/5v8H+D/xv83xX+b+9F1rZptk/WbxLnRqLui9p980a2bi+nqHFfr5VvasNEDQTe7jOstUTexkj4bF226upetzLbbWnuaGvTPdBF3sR636rA2SeFzUvGasWlVjA2TOdoKYJ9UMSDIt622wmKeFDEgyIeFPGgiAdFvDhHCop4UMSDIh4U8aCIdxqSR6aIf89pgZek+8s0/hr9KJevwyCKtzZ9R3Tx1rqfK2l8gwxsln3w3Knj24qlrOhQGeWtneoCr3ydooJdHuzyYJcHu7zVRoBjfmcc8/bFAUzzYJo/VKb5RokG37xlEsA3n9cBvvlSHKqrfPMbqLp7WQHrfBdY5/eGR3aJSdzBQHDPg3t+5xDJEyY9ClSynSMEAz0Y6A+Ugd6lAeChD8BDv3ceeqf9BRv9RmlEz5aNfjMzBU56cNIfCye905SCmb6UNtIqa2RXmRwHzlK/WcLAQZDX2xUHbHlgywNbHtjyLEYAFPaqBlDT1VLYb7ZmHiOzfV2OC/jt/ZnLfBMda4ERWO6Lu6J2lvv2acfgugfXfckTzdgaWrmk3+zeO+0y7/2GuerPng7fx9jvgxR/Y1jTYa58xAAQA0AMADEAMOYjLAHGfDDmgzHfkel2OIz5m8aUwJt/VNGno2fPbxHI0i2tCSmASR9M+mDSbz4qcTBM+k+SLLNxaHHLLBWQ7VfBAsj2QbZv9A5k+yDbB9k+yPYrZPvbrr22nboD5+Bv4Vo1bim28nNtOApM/LVM/G2CF13l428hb2DlBys/WPnBu+vgOwErP1j5wcqv3gVWfrDyg5XfKA9WfqADsPKDld/Byn9JRXdJyn8pmvIYpPy2lm/Jyd/yXeWo2DMh6a8Xic1yHI6Wo79Ocg6Vot/Wp6dk6M+inTsNQYHRHoz2YLS36ToI7XdGaG81peCzB5/9ofLZNwk06OwtcwA6+7wO0NmXAjhdpbNvr+nuRQVs9l1gs98XGNklIHHH0EBmDzL7neMjT4z0GDjJdsIPXPbgsj9QLnuHAoDKPgCV/d6p7F3WF0z2G6XePFsm+42MFIjsQWR/LET2LkMKHvtSokWbPIsd5T5ska7RaRZ7v2SMDpPYW5UG/HXgrwN/HfjrqvlNnWFpqskF8Cb+1vRFGTtBM6+RN6eRZ16SP52RB5VR7fHOfht+Kmkl9sdPlfNJ5ZNgIdmW2YrO3LcytXbrZMGOMGt7HZy1sT+3AXLf7BzTHST3c20O5LOnfvawSo/K/Fw3G90mfgZuBm4GbgZuBu8zeJ/B+wzeZ/A+27NCDof3ecOIAmif9xwiaRcm8QyVNIZLHMJ+9KzP/jEW1dCaUAI4n8H5DM7n5njgwXA+P8HG8s4Zn/12dEH4XIUJIHwG4bPROxA+g/AZhM8gfPYnfPZbem3bcwfO9+zvVDVuI7ZycG0gCnTPtXTPLYIWvjupjrxH92hvyfbsL20gewbZM8ieQefoYAMA2TPInkH2rN4FsmeQPYPs2SgPsmegA5A9g+zZQfb8Wm+Mv5pPWt0V6pOa/SEXkcegf27sy764oD1e/EyJoVuIz2Y5EUfLEu0tU4dKGd3YQfBHgz8a/NHPjz+6UfFBJr0zMulmIwtmaTBLHyqzdCvpBs20ZUJAM53XAZrpUuioqzTTW6q9e7kB53QXOKcfBbPsEre443ogoAYB9c5hlCeUenQ4ZTt3CDZqsFEfKBu1jzaAmjoANfXeqam97DJ4qjfKGnq2PNXbmy+QVoO0+lhIq71MLBisS9kjGyeP7COXY9uElE4TXG+QYdJhtutmbQOFHyj8QOEHCj+LEfCl8NMT/Rfw5R0fX14d2633Wtrr74KLz+twbmfo13yTc7zZ3WXSuCmirkxx/zHYH3XbE/KwbZIPWQu3nhEpm6bLstGyuWjot0tN7ggnvSMNO6MPq0152oxSLU+9rumtOfAN3Gv9XVLtb+xxfrNf5/MgSfj9U8yfPSN/W+P7qPT8bQBLh7n64fXD64fXD69/r14/iPsRiABxP4j7Qdx/iJEjsPgjenSslP4bxqtUq31DFiD7B9k/yP59YpQHQvbfqRycnV8DsEHeC+4EqIIO3AmAOwGM3uFOANwJgDsBcCeA/50AG6zDtt3CA78gYEMXrXGLs5XvbMNauC2g9raATYMjvru8dWnl7vHf8v6ADYURlwngMgFcJgC6YAfnCy4TwGUCuExAvQuXCeAyAVwmYJTHZQJAB7hMAJcJGJcJiHiTM5fBmYRvJDZc8A7fdqn0/OYWQSZ+fPCK/vPZsh3mqEWFGtSWF8cjUssB7vomqI/Z2jD2+vSp/l1Z5OPz5/NSza94HkQd3IDPn40M/dPT00sxWcz1pMOHgkpKpFDqSQqzhYQN5E3MabtyUox45SXb4zS4+iVa3pGFoBJvonnMNJsxpxmTdXyl53wZCOc5SjlWrsg6gzInfzFg+8/IoJumZpt5yUn+UKBDpHIHVHCKcpCdcFL2zV14E49lQmshBq4l5joiRVrKdHXOeRtlcdeRKCq/GY2sQl8MySjLJYMwYaH71fhNHpPNlUPd8eA790KuqoaUFi0Ri8tMs57KvEl5snoYXBWut7yqMIZPogUtTJJqPckXTV7DtdUrlMnTsmgq3PFAHQvsOQgO/x5lu6pBupYiLQnTRbSmIKyDumgj2bLFg9i6lDMpTzaoLR/Oey1U1ev7pCTtPUap4pOGLXTeXbDN9aUiGUqH4l0vyI560A8bEv17tCqJF/Pcxal1YgqDPdLPlcLqhqC2yIKrHax2yVlD/1tFGtOEOLeDpG+cb5hZBsrCumsNVm50yYh73O09/LQp/+fPX843pw7lFpKVYc2MJhvXU16P7BV99gsus95m3I1WBE3rqbTStOSV4wG0sC6WyVf2aO+SZWS3loX8z6W+EEG7i2V1YK/xLhE7TqM/B+5nlGd56gj0ZP3qOWi+jLU72wfVzfvzzMkOJldFzmaYS/YhnVZxJptqF0Kjwe6qRfhJHlY4+8PQdCpCQ+0qdWWzt7189z/LQhnwrnH/ysIEL73e6MR+P0qmv2qNv+J806tzfXlIcFVgB7uSi2MUi6h3WKrSgqVyvmsBqWj5vRLJr1f9QEbLrkp6U16+LXkWhH3KNNR229Cs7X3rXuv2NZc6tYP7MAr1yfMwpJ7ekrQraXLlD27PztzGvmsCNIfS/H/JWkQ1inhckszTuD2u+lVSKLMWVY6C1x0/dXqbm/iUsv+Gc+rh4Fl9zIJr9o/8NK70SdRpPw6m2A7m5k6V6ZYp/45r6SWqDf3gyhQq/fqrILn+jYx0VphWq8l6LJMT89OG+Qunxqd8DdN1pL90eGtUQq5OJvIuOkQXJ45Mjc38Mqdv9nieiTlq42NwT57AMyG5X89WJa+hKGQD9zn0Vv6AKD+0SaVPJkdxOZTN3tHyZ1k0pHlpR+mv2tRIFC+fG2hWcRL3PMDVPA55NhFVUrHpUlVPXtT8C17L69/er9bXaVD35InKVEyjjFRoGc2ir6FKrdfB8nDMW5uSwvRSDF+gmVGD97yRdfJCf8Dnyoth/mS6YiOoq5qliUr3ZKplfuVNNBdB+IkgNxXn8+/Ec2SsT8Yz8teCURbQWV/3bOdfqKcD/lKfTyqcS5OIeVvVNiK14r7Q0chjzfRh+tAcH/9peYg+F4Z88Fb9Yr8CloHBRX33Ls38cVM3nUE0WrNLwVmTF/OjJHjOBEJH0MRullizmJZV71nKvaOztLBen4uji9n9SEbl4qBuyqlY8epBcNhmSdkv+Q20pArubHlV0Gop6BHmD1oI9Q0AOvhWOrivU9o5VXsZcbwuJnEbBO/k7X3nyl3RNxXx+r3kY+r6OL/cCOY85pd6oTWPgvOJPlb6hMzqMp7ozS+mmIgkZ+zv3B8yxuZg2A+2v9PDp1yakhiQ+3Sb3POmFxP/psGVObFXfF+KeGdKDqZYKWezB/PI+UOppzr6uVgvBXkwH+SXJBb0aSrH0+Q3EZPK6c8tUlN1mYHcLnz3ppKcWlwIsrxSf+XoW9jJ1SyILfXKKEq+DXmxQ2kIaX2cle5zLMKtLFZhfuy4IZRjzSwY8s9qM8ryoXZc370hebqOSBFKEZFsMI1mZJ/lx0Mqd7KZ5XymyHKRceEsQH6ateZIi+GfCErrHgczyoZUtO6Wz3HMyjfiDkqfF2v3vko3P1HqOFdTgjr+4lg26Cqhobr2m5IydMOkbB6G2W8OXo9X7KOzgMkRyvk4lD1MpciJIxO82yHSFm4SzW7DCTBGbSJF7JyzXqSllVvunIeScSWoF0mjdsumlq9WGi+TVNz1ZlQml+aT0tzqTOhRaU4H9JbsM5WgWYrSKmK6yvJ+ns+shSFKwV5e2PWUqcx8xVQiMEQNf5Q8b1E8Ly7QiGptP8Mq2R4nw2DxiIleNEDxwRE+4KHgF1ghhINR7D/bUXw3VJ0sv0xnyf12UOabp0Y1PlsGmQH45O2tBf40c+3y41tMSZv108irarDUdV5ho6H1MIN9feZXaVCGZDTB0EU5tCUebDytq+k2xM/KAdxihoXIR2mBcKTI/J3MxY+qcFHeNpfU0jrXok1GqcG7/Pc25PlqqMoHlHYcPzEmTqxcjZXKx9xVKlNt1Ky2RobBmXjk7MQM6tGao4+bZndtm0LyIZG8Dye1p0H6ttwFXsTLl9VU2FnEQ01BKhvNSj5arhCUi8ulaVGUI1ktXRit6tfrebh8EJwiNvoRNo/OL6WMyZCYnzxaiGJs7DriZ4VBp6zrQ/1L9RFP5CYjcjSVF67zSiaiFBf9OjKT+vWHmLjsicNxUgLVfqmouE+/qtRZw4oECrAxhCQXkTDkell3glvwFsbs/otkGMazHO7ha4E1Yd9yPSvnlZqKoZyAnDuqzMNkUZRhs+Lki5R4TcOZ+7KuDX0Uzxn71eRXdSw9nD7RoGkecmvM3ND43ZbLLk4TaX4/EcK5MnXpSp5u0EyQg3rFq/o+QjVMZ+1L9ODWEkPg6rJZDWZD4eXk8qau1A6uBuHsPnxINXdoPLUmCJ+rTOy76C6J/2nJBzcZ7GgtlZVe1J0KzRW156asKQ1IbWcL9Va1+l4pM6HW1WgWhelqlMxdR356DZfPXlhPZ5jnLmoqSJbxDSeek0cYM5EUp9tnoV75WTxvqCMLfA0W7ACvuLQid73/NhEcFFxRv/aOVxHV41qEI3tVGuwr982v07M/ikDkz8EfGj/8GfT+YFKdUm39P/tndVf6/vTzh7cX+U1kt+KyUd4evPrl7eXo48+X//b9Dz9/vKqpQdMjcLyTg3bZoIjbxyLe0pRHLGrqkPfIK87K6yiiaQjlVuVSDPe1Jj2tqWMtNgSqEzNoQSmYC6vZe1/SvxzD1G5LiQXWvmG1DcLon9Rqetkx+bB8+JBkx41fl3dUGxwVa2k4LobjIq8VHmTXX9Kzqwcxj2/5t+fhsVjFoNmDqZOeY/RorOPxVB5Og+B6ujbWLsHVgasDVweuDlwduDpwdeDqtIYaDT5OnYdT2lPa0NMp1QKP57g9npI4tPV87NIED8i5I3/4nlCpa/CI4BHBI4JHBI8IHhE8InhEe/aIyGT/kMxvLtdzPnf7fbQa3/o7QpbC8H+Ozv+xSIGH2+OWnaP0dizDceBOjqVH8G3g28C3gW8D3wa+DXwb+Da79m3KJ22i1cfbZBa9L57RazpxY5aCO+N98iZaPpMzN+b8e5y9sYjLUZ7BMcehm2dxbPc620/hmH2B0wKnBU4LnBY4LXBa4LTAaWmPMVrtyPDFq8xclV1f5O24VErCeTm2vZiKCDT7Ly6pOUYfpjIWh70FU+kOXBm4MnBl4MrAlYErA1cGrsx+c8s0/KiwVnv6MaocvJhj9WKUAPj7MEWJOWYPxon0D9F/UZ2B9wLvBd4LvBd4L/Be4L3Ae9l59ljZgWGO7Eu+4iONv0Y/yrtyvL0YW2G4Mj7ZZPaRe060zrYeNns5NRJ1jK6ObTg6l3dWJ8ueXpCtCrhCcIXgCsEVgisEVwiuEFyhHeGPZgepcIGUvBlo7xdI4aqn7a56wrVM1muZim7Qa7750N+7l49X/Pk9+sxdDhfU+/N6rMoevMPNLQytr2NrQduW+xZrkHcZde/wju2W+LyAzbcPPxQrV2j+TA5yaZXPsHzV5fWA8Q0Q3gu+Wx1g2daKy9uMwj3DGDu+Tn3XU8b/7PPVIlgiy+8jPOL0+7ziI0Xb4BkRcQjEZr4ki82w9LdlnEyAaD5ehI4l38r0geRVq47Rkj7YsOqWbVrh4wd5zgOJSOgh74DPcVyKuNGthR62a4d2a9c2S11ceH6yyUHi6mV+vtccWsGBxfFymTVnxHf7G/9a3vbXYMN8ELBdtXem1o0q/Z66NvktIr/jqz+uNgsBXfvYj+KIeWJsyzADae8HaZtDfRh422zxcaPumrlrsaCZtXQPgdvshycOrxUUoPFDQuO4CnDDPPsDx+n26/o2wu0eV9ZtetnfI+H6VgllW95x9wwAPm7TgdGw3HizA+NRe9vLtvfmHKgx8bkm5jkYlaMlpD8uE2Ijjd/McjQyp2/IOH84dsKXaf35mQeZgbKpfZClEWbcxP74XetQGGFEGPcTYbSO+WGEGq1NP+6Yo89sbr48yuqeLAq5l6tFHFKDAOQBpwMcEXN7S2r1Q08MKLCrb5Yg4GYab8vJ3omEgbI93pCS/Bmg+2PkPj0qt7/KT7qRBWjg6dyE2fRgvH0/Us9nZAyOhT7sKA2BpvjaygxYNaA9NdjBmYA6XqyDNAAlC/AmnN9Ey2Sdfh9Hs0nqbQFK5RDg22GAzz62CO3tJ7RXGu3DCOqVGn3c4bz6GWyx2JUqOvAQXpOMIHh3uMG796tkGW3Mm2UtjSXc6yiAfeh8zwTUDDzW9z0dDrCN+YGcErA1/ciPC3jMZptzA7bqOniAoM7q+J4k8BImgILDBQXHy6W5C7LLA4/2WfkuNwr5NZM+bkiW+dQ7gf5ETduRRB5mXLDEO6UYirZinvrmEEiowDwF5ikwT+2cearskDT0ZL2OJ4Nff3335vNeuKvgNYO8CuRVIK+CbwvyKpBXgbwK5FUgrwJ51T5h+hb0VwDr4L8C/xX4r8B/9YwBvRG33AgIOMoDE3QYE9TPGeDBvg6v24f9QI6v2xt/5AfYvWa0FTeUtcJnBSV8JQmo4pBRBUg1Qaq5DS8eSDVBqrmBsQCp5sEZDZBqPooxAalmAFJNkGqCVBOkmiDVfHr7s7/g5g5oORHaBC8neDnBy7mt1CCEecCZjuDlBC8neDnBywleTvBygpcTvJzg5QQvJ3g5wcvpZQHAy9nlGOF2zJ6IDoLaE9Sem8UCQe2J+B+oPYECtqf23N+JyR2QgwIigB0U7KBgBwU7KHAF2EHBDqoNI9hBwQ66u+2JLLf71XyynbvSWBNcFy8SxuZhfDx+Rs8phUuzL+rGpgk4EFbHpm4cOeFjy1luwwXZVHUHaSJ9DaAvg2Rr4YNrdEiuUYnt/EOYfkm3ojrvLr/5N6A6Pyaq810QpR4zxtYvvF6Nvn4Xzha34XeDFZsHsc6woXg3eQQU3UhlCqS8PVK2kdB2FA3bmWCPCvHaZqtN6nyVNrgLyLWGErilMACBdhaBGtCz/NU0WQY9HvPgazhbR/0gNpHqYLUM4xm9aaQns9e/YDjAL7sI4ps5+Saf7uJ0fB6Eq9XyJUGAeB5NPlfeI6Z9GtCbguHQoqDaHn949f7fRu/ejHiVurDWYkBqn8Wy56ykuOIMd2yDWi0+A7IBhAd6DfVw38QiPiwv6D05e4PrB2qfuxKLcxLGJMaFvg+o7wOl+IP3D+kquqskgtusrTkL0XKZLOU0vJtLbOvq3J30aAVPoJC1zIIEJFgpf8BCyn0P0vFtNFnPbMGFPui9nz8sBW3nI6amgNUbrN5g9QaOBY4FjgWOfSocC6L6o0G34KcHPz346cFPD3564GPgY+Bj4GMvfLz/KxeAjTuAjVvefQBkvAtk3HzLRWdxsc+NEkeGiptnsxUmbry35OCIDfzvIQECBgIGAgYC7hwCfpz7hICIO4aIW1zkA2S8a2Rcf5XTQSDkpmuSjhgp18/uxoi59rKuA0fOPpduAUEDQQNBA0F3AUHv/fI84OWnx8st77EDTN75/Vi26woP43os++WAx3w7lm0u22DhxusnDw8C+94nCeQL5AvkC+TbPeSLe2GPAvviclhcDtsGyuByWFwO2x4A43JYIGAgYCDgbiPgfdx3DMT79ARmvvcQA+nugMis5mbprhKa1V7qfFzEZjWz1wLR1twN3oWTcdb7vjcUD0BYQFhAWEDYjkDYyr3krS/sLt/TDijbISjrmiTA2T3B2cqAHwakrTT7uGFt0yy2gLaVqg48UNssKUC4QLhAuEC4HUO4laZ74ltVDui2u+i2OEXAtnvGtmq4DwvZqkYD17pncANU6wR/B4lpXTICRAtEC0QLRNsRRKtvh/OGsroAMGz3MGxpbgBe9wRe9TgfBmrVrT1uuOqYsxY4VdfQvZyCXO9bMe06BQMYFRgVGBUYtSMY9U04J/iRrNPv42g2Sb2haqkcEGv3EKt9igBc9wRcS8N9GPi11OjjhrH1M9gCzZYqOvCoa5OMANEC0QLRAtF25VLgFYnmZTReL9P4a/SjfIn/7cC20kC3HbwmuGaigHH3dV+wbdAP5OJgW9OP/AZhj9lsgXqt1XXw+jS74Wh3ubCXMAEYAxgDGAMYdwQYX9IYb4yLbYUBi7sHi2vmCah4T6jYNuaHAYptLT9uTOwxly0gsa227iFiu81oBYi9BAl4GHgYeBh4uCN4OLvJ5tV8sl3QuLEmIOXuIWXfSQNs3hNsbpyAw8DQjd04bkDddpZboOvGqrsHtT2MTivc3V74AMIBwgHCAcKfDISfnIxnpDbZPr5cXJYsBumFRFGjsbxT8sIigeqrdCCpx9Xtk7Ico/rRKJ7Hq9HIBd5bV21F1ZlIXNQvwpcmstoQM+f65XqVtEIjaVpUq4NPvh383D8pLrzqMWqF+q30fdZ5eiL7Xc7ACz2tQbqIxvE0Hiu4l16UvS9aT1uQMcvHK36UOSVK6Jo8BBLZaBXfRdkvwX8G5a/4P5NoVnZ8Cu6LMQksusKOvZ1Oo/HqotImqiWap+tlNLoNU1H7P6nS3v0trTv6mXwWhA4NPV7kch/26Tk4PAY5y9JhOJOTdWbH6Nr9MifU6mNZ/SwxDaUWqgEc9ordFjP5hjtMvzBtAP/8PzTug3ly3+sH/5KV7AsAka/hVUCqHjx3S0oJMQjYkRWzuYkFXRuouQ0Xi2g+6fEfxqNqHeVPT8rU5jya/pTm/BNKdBBKJKqq1yFzOqFCm6rQ+2j1avIbSQJ5Tf55okYhKNRBKJQ5ZfV6ZZlcqNem6kX+wjwNxyzuG2maozyU7iCUzjF79fpXP+VQxc1V8eFDkoUMlfvXQhEtpaGGB6KGlrlrUkL3dEMFd6OCb3+XQbftVLFUC1TyAFWyNIdtVNM+/VDRjVXUcsf7ptcli8JQyMNQSMvUNeihe7KhfjtSv71cVw4FPAAFtF6/XK+BzZeeQwV9NhX2cF8qVK6Tmww190KWNxt8b1uFinmo2D7vc4OqdVHVmu6qKqlbqxvhoHItVG7XF8xA3bqsbvYrNBzK5nFBDVTNQ9V2x3wP5eqicjkIv0ta5UOZD3XyUKd9kfRCubqoXPU0pCUda0HyC1XzSQZ7BPZAqF0n08M8DqeV88TaHhuFCnqo4P55iqCAXVRAD+qVkv61JTuC+nmo31PSIkAxO3mcp+UR7vJJn22IFqCyVpU9OXlR8y94tabpW8b/jJZpUPfgyQtabWfR13C+ClaJpn1Ypn8L4uXS+GI8i6M5ydbJSYZ8lOSV1ZM/ezWLw5Qk3nkKXlVykplxOf8s03X1/XuuUs7z9eapMqPAfzY0plUJS05yoWDDtQt+L6nJLfHsl2W/zq+k3af0HJsaBferoWZR96vA196UDiLnOiNVv2p0Q3pC/Eep1iAv8qmsF+eBRbg/n5+o07xe+lOuU5T0VRbL60X5N9GYjFwyryvbqusDXaP/GWxjmZcK61zkT+r5SWqadUkm91PJhuduOr3z3PGl46Qx/8v5EqqESOPn0hFRvEv9sB9aberGzfPohrnWdKk3tUexmjqVRtSwZ9crx6mlLvXP9yxdU1dXeT2jzk7mrjprPQjTrY76HMxqntOH0UpwhMh6KiQsz6antccnutvdpmM+rSc4UhV2f6a37brNmepUb31OjTTOLz09mlEto6WsZjR9lv205nx3uJeOMwjtp/P+mfa0EKnoFGSvzWhv9EAIGN1zcRlkfT4dq6SmdqlrzenRTd2bUg0j5l6lBfJZdrCU7djFzrlybf3nLnx+ndP5dF3qkzNxs6kz98+pM6WIeZf61JQD2NS1iS4/mj67vll3BzoVj/LaNW8Mt3Et1FRVzejuuXbUtnXUpV56JSc1dZJ5yLs9mTvpZuMuXqe2WlpnujRuJ2VRmnA+GR2ABu9+CF4EP/384e1FsBbk0lejq2CxjKbx74Jn+mo0iabhera6CtKE+dmZ8J0zFZLZLJ5ERiXiFoVw/qByWgLOaUkDqnMcBaGqMpqI+uOU676OJ5NoHlw/GJUk66W8O2AcLGbrm3ieDrJvdUsuth3ppnyJc9u0ymSDkU420KIxqFyB8NlvYzecEQAaxdNi/gt9OvzkUTpOR+FiMYoVmfhnI+mlwmYdT9WmaYGvn8RdbQqbHxc55iUb+j+YS/0tM5hXc3Wmp6/DOReWNNQPwXVCUqCJicVLzsb6j6z9wZLmJD0tZvGUc3Vk24a67SSLslazX2LyKt36e/nTHfVKMsXKTt2o31v1STZ3qJpNPRI1mh0qbPJUOmZur+yhfwXiQNnNQnvadrfYmWGpc9R984XmKDi3vSoj4th72sPguAgW5Tg5W9x2zNxdH9YMC42lo33FYbXvPFlG1bL9s5cxtbHl6RG1N7b9gDo6PXSPhxhOS9NqB7O8y9MwqqWtlr2Pbpn4zDHK5V5sPdyVYRl6DF1lAkqtL0yEfTumOvyWPZF9jLqN3UoNtr2lrYfY0eGhcyh4OC3Nqh9FuQvSNIwfK0/tZxwVSZFrIO/111uOpOr00D0e1bGUTSvAkuKORBWgmNsC+wAqBbYZBViKbWoNXUpdGlY6yXDGfK85IJZQf2VQKvH2PQxMlRtEDo6lfW0HyNbFobXjNFCVdtgHS8XWnUP1qvr9jgdKszqUhynMPt9wkHTXhpbuGgOk3m8Ojw5oV0blo+WLHQ1Hdg5fjsN9/mer7mdNH+a9oM7q2s1elsPBld6WYrJ76HT5fLTse7lhbceg0rFhta80JqWXF3wke5Cm6i3ZoiP7cJusR3WU/2Rva2tPytHloXMw2LuytcscSHuEszKOtjDjHobReixRjqK9oW0H0dHdoWscaAhtbSrEVXyih9WwS1MIbx8RmcazZSpY49Oj1rEcr2Eaeg4nR4KaelNqgA4d0jv0r+XjmFmPPA5TGKf2LkgDl+1uvbsU1x1Wbr2rT14pn1H5bDkPWl+0dEAm69Y3X+7D5U1ae1TT51hKIeBojBBfcFl3m606P3FWEnR5Ck/evSkmsXyRXWnIh+PygJaPSRaHZxymq57f+bZzXUXpLGQu5tGsZZ9lKLGpy6VLx7x7LESpVX915FsW7e9mEAsnMXY/hoUwXNNQ2q/EObQRteXX735gXaHOpjFuvIEIw20fblsUtHmwa++Y6ehQNxzZ3fvolqOg7UbZeY0IRluPti362TjItRdBHJrRqMu93/uAqzBpyxEvc/9DnDVMKwRSG+Ganc794GCbLWl992NbjcU2jW8NlzcktjSqOnDrO6bOK+2PfkSz2G/TUFbJeDGGagzLoeSmoXQSsR6aLXVkTu/BGbbG9Bq94nresYPz1+ryIXc/5taIddOQ17MuHtqI16Ug737Am4PYjUFEf9K9Q5sK78Rgj3lJI+tA6sDw9Wr09btwtrgNvxtEvA2Rihb8Ei3v4pRjwW+ieUxgQrGqvQi+T5ZeMeBBmSOxFPN1RuS3iLtX6RSrfD47CYsXpLFXyHKl4SluVPQH0e80fWU3olYWpRwWc7tNYarQ+/lPjwxXl2enFJ7ex+SoTRFHZnz1aqwK98/eZi7L4d3VxKXVrP8dzFwhgFueQJ974p9kHp08Mnubzko+bben1RWiH1SuQW4IyXdgsn34g/Y277U51V2XAdu+wWCbu+ifaP6byIb2OPvuDPBDmvzytsZgF7ehd0AY6viIHk8obOnpHZcO2zbMYIv7t59GFppYjPYnAu5E+oOaeLUdNNjm6ucuTL2F8OgR5z7P/O/25Bd3qwabXDb8NF6bkyVpf95b9fBCt+e2uls22PSm2yeZ43o2pb3Ns+P8xWHMtd7DG2x2weqTzrONe+kRZtk4QtLtOc52FQctr/R8klm1EjbtbTrNszHdnsXyvuZgswsln2RO60id9ja1tqM+HQ+gWveZBttcZ/g0IdVGrpj9xVbdBzm6PffWDd7BFtfoPcnMN9JE7W3i3Qeruj3vzfvMg11d5vYkEtGOQ2p/m5++x72eSFoaLv+6FGMRvNeXeTXdAPavYRoF4iqkSPBfiWvAouXLNJ5E/z9779bdOI6lC777V7AcD7a6lKzLzDoP7tHpcsYlK6YzM2JsZ8XpEysWTUuQzQqa1JBUOFXZ+d8PNgBSvAAgJJISSe1cVbZDInHbF2B/+LBhec8rnzyTgLaQjhudF5dp+dllYTYt473iurDCDUtQUdqqy6rgtgWmD4lkUVsBGlx4tH1YWNXP4YJ89+DOv9Lld1aF5SaJO3+yXOv/vbUeIm8BAn2ALRb6jRWtA7jSzbY+EWpFtA8RHYhElEcjteSJWA/ZqEECsufNamO5cwjlYvabDSZcCEirSGuF45Nwcd+CGqgo7F4yNPfWJbEfbcsLePkib1m6+own3Midf8bZkMEFfiQiwbxyUO862HD34mwfdrKHhE5+cyPmXODvf7jRZ/2BvXxbv+SyiskL2xrDxcco/EZ1Kh0g0JT84PBxpWZGO5JwH+aFqfnY1sW2ICqWgNBhTJ5cpm8PxHIffAJ/LkJakO8FxGLoWMxOj4K/j+nnTKNz5bjZoOZuMBTWnCMsTEojyEhBsePQrm8TuCnvaOTvqG9oFM49vajxS1pXdv0jq47V1ugeyGq5jskdffytpecT6ufieeStqD/Uv/rm7e3rm/cf7z7cSK4EA5+ZSwIXr1fUGUzs7PtJJf8fF3VoPYX+gllfyBTl2VssfPICtkkN8IVqjhtsxZ9PAMgVgdZMIHEYddnsk0vbticXk20ev1e5d74nc3dNDfzC2VZzkR5/purk+xtrFXnfAKNLnujni5BW8UzcIFcILYB6mmd3A81ahXHsPdDXslADXgwe46n1sE54Iax865nON7lSfO8roa890rmHWciGmsSajsST+42qvQ+6vbFC6rAjlrcw96bIcJfrwuXkwi4dQd5+WXvGV1jqT9kbac7GrZirNdavL9zVyvfmbH5xvMWVUsuvt8+9X+Qvk4LZSvvmLXuk8BKzgmc3oDN5JHux8ICwsJ/4v7alrHx3ziZHh894soKyZ+yP6V+v2cO5BdaTGwTE1zUnTagYO6WHbec1/6DSOHaXqDOnsxzRl5h7kF1GG7+GP3MFhV9J4NAB9GhsHNXdx1teiRXfju07+Pc/xD9z570JuwLX+eb63sIt5NyXrTf5hbn/yB4upsfdZO+KWcR++y0bcbZsVKr0ldI8chcyVt4q3dwrvp8VVb6q67PiP6eVUphez7K/ZFf5Cj2YFf5VfLCsprPyB8XHSxo2K/27+HBOeWa5v0sPFXRgVvxn8dGKGswqn5QXylTeM/Yzv0gure/Lwtx6rG2kwKemXFBhqOHyWGN7DbV5Otgvlbik6F2LA7dve/UWqWmCA9ld13kKArWJd9SFEIhJslbStaiB138gVAwRb4zSp9BaJFd2Z+gvcb/epAvfz9JPbYdv0d6KS5hz3dvm/dP4GbGOtR9Jcpm7i5mnWEnzI6rSodzwMEKREOXiJ+AkB4/lla5FF9AeW87ei0/u/z23aN0uXqlL2oRrkR6ZrR94OAIbDiFdUvA47T8uSmzqsnyl41Zs7ivr7sObD5dPSbKKr/70p0dawfrBnofPf+Jj9t2CfPvTcxiEf6JdouHqn/6vv/71f0yuLHexgAXeKowSFljO6boJGhvSZUyU94W5bMpbKCQIX3i3XP/F3cTg7za8dyJUyBXAQwG++oh5HCEkp3O/VU4y96L0q+xK7uyCdLvif4VO8TvajdRvWurm+yVrKywUrYW3CC626XFcYSHc6GF9CwvJOPF83yI0plmvMsmzkfgundAL75Ur5EtNN7mIIbCl4dAC4l0oAjQVons2dlROxYHLW+ss/4+pycwnlI6rJ5+648vaNZd4MBcsyO8WrrqZkqvJIVG7pdiOSLyiyknq1jw1Obirqc2zmVNZsu/FicSB8wviYZXGR+eLvGzqwPyQ6jlZOOsVFUpSU1GyXvkEvO1U9djDhg7dly+S+iZXNdnm+Roc4KUoYf+45HiX9blOGl9y3koaLObhs0xas/SPKR9jvi6ZSgZlVv1oz6MhXLX5R6mC90l/axMKiRFDDd1ZQ3ctequdnw2lchwzaHKUg5tD/otBGUWR7o+m0SfTkMnmWAZy1gr/lRuL9Ik+Wk3dKX20k0PaSY00+m8ZcqoSt4nSd2gNaA1DtIYWGF1iQSV7YlgrKzmrA5dYvVpi6YR0vBmFdZFt7vLF0WvX9wEnpS3jKZSr3BDgH1yo37mYWvOQwa1BMruL1qQAVMneuyzW8ZFdCRf6n9V1fMnJf8vLchzA2OrN0tAOt8qWw8fzPA1b3cCietq2nR+DlGDNr2Y/28u1pKCg0iTSk+6CCDLL3jiTjBzs9EhqNGKppb0p39ZT2FUQXc3XcH5+DgS3Aj+Fn88RaPSWSGLTZ9W5Xqq7AKzvHOC+nOT2FWxesgNbCP7lpPIe5EKRFJcVuYINQ9odhnVLS/bDcCUpOCs8KybtmuTh4icTmwlH1DORSY8zL2oUxlvQeTtMSDDfOC6wu0rJzE1JiSVxFwvgh+eujI3l825W9aU04TghmyniHPkq32QA3PlcEss3pHIPXE60Uze4eVkdGX+MeUbp9uT2EecX6qvle2P5h36+fXs3bc/5UNv5SKJlGD1bbmCd54lc5xJTK05E92wbhl3iGYpZ+Yoz8MJnL6HTydS650K/v4iFWRY3h+B6Aje94Wcdk4V1uRQ7VsAfBOIRq+QSJvgJrWlZHPgnEokrEujXdrlnFSE5CZ3/6oaYzpuh/40wBYBhc3jD+WResUfevykrXpVFydQpFT1IxSZ3cCkKd1ItsuRNJM4iZ/rTrLc54+Jdn/HhVW188qnNeZ/Wn/ibq6Iuqac3uceSmGF+5pN6merjwtdp9sKr7zyFL3pj/3v4UtKEK7m8pROw/ElXUG7Zb8UzT+w6IfqzOLK6ibydydxkQm86qcuTuDnyLlVHeCp9JjWmnF3ICxNyn0lIXdtX7esfP13/1628qgm/0zWTk94J8ZK4Ge/USKYfs5zOTLX9yRqkaLR22KaSxUnho7+BcL05Z1MrdNJRKeVOdpwbGynzLiek99u/pypHt/8a5xBmYBJ0Zh77s3lPynGmoN2koigw86QcnF24OBmpRpxtyJX9Iu4W59yShYyK05CSo9BXibdk8qyLBeWjwMWhHL70Vif5CBY9XbUEu0jdsNV+sDB/b4sqsNJNB4dqQ96UeBB1peuBGKF3UfjMIvdL3iU+tpIaShz8xgz8SgWvrF9iwkwv1xNLDCOsN5/dr3TptI6IOOtAVUpSSMROX4EcHwhoHiwW6ep1GcJd7ilHiN2HZVeXjFQ1q16dLokUE1lxSGalf081L0VkKaFVyd+AYztJxhdzRTZWIPrf5w9h3Kvevucv3NM1vzhBRf8kydxi+p4dVrIVk/W2BglHLP2PV6F7YM3DiRnjSE4VmsnPeWmrcRdu4moeySnPzNPNKHxwPgT+JjtVsQL/dC/yEzBB3jOuXtr4WD5G+RcULZtQp1OI5b+SjdY5lZ6t9UsZ3yq9+pWbs24p4yaOT9w4ccIKyTH/n/qbLR3yig0TLcwD8h55WD8+gq56wdxfL5hR1xQSRh59w/X5Msm6pKU9kgACLmDlsc+8oKYMztaLGXPvvgz63Fsvfwott66MNJwL4gQWArSkf67jpOal+5Kw7m3tC8s0mBeuilZy8VvFv/5+YV3+RuOcy1Lhk98n59OaBvGzQi8wYQfiOA0/GXb/8e2N8+nDzX+++/HDp/uaUh7EuR832FgrcKnpaIKLpFNVENcUED9VD+c8EDi54wKNcw7+J1zWtWLDXXgkVhJVyepHW2cB+dFQFjKZ1s7eygegz+pveXi+07aSZgmgm9uL3mGiCkMVIIM8xm+8Ij888tg1+qiAPo6HQm6PsZD5V4e3g77m02Jgi0cdIe0FWQpvuAv2KF3A8RV2PQKpqjzFJFmlOiSyQ/RRj0BWUUgFiqKwyFrnI6qWfpeHCM9Ufgm6Cyd/xfDIW5Bp1Wz7Zy32kEMY0N905m+E/OrdjoG36MBNrIN8eMVQ1p0AOB3OREu77AWoWOrk0THDM4NVhMoHZWcOg0eHCJbN3uhubVx2QN/G/27k4KoKPSv+U1P6KvSCLB+Kvf1IZurGIO7fdEecc1DVs7t5IJBC1VmuA55fPXmBaD8JU3mTVNpaH26kHdVnZO5lyBgzzjCtzDBVe1I9tbWXOsG/zp7sYDYzwf0LG7Of9VKQ4f24t9Dh3kKKK+6Q0IGP/g/Rav6TeLmYAaQ0njnx57E8+VAWn7fT1tW/mO8LbY2sEGnr8jWoS8+VfCkZxCcGZ8l9jPjO/jv/LdeM0onkdFLUJYbYH1XnoBLUI7dF9p39mv31/o1mjbZ/oxXIUuo988XlPtMi2QAR3G8fTlEyBmOrtgcKeNo9GxiWx0vsshDFeykoDjrD8sIt/hSROSTfoaE6GKLivS2MGM9DZmU1o5A+P6vdRrOrLylfKe2YFQaBL9WVWHv90qxgLX+cpaZh03XVI/UYTvqdzIzKuwQ1Lmm9pmr6yy/v33xpezur0f5eW2Za3X9iuQKCBRgXS2lWyHEW2bXbU3u9n+5eVVEz6ebVnm3ke1vpHy3sb1V3pnZtmXzjSjVrucHmMvn85y/yID61gvdv3tLv7t7+/Pq/nP98+1/O399ev3l7w7aQEkh9lw7ARD3J8cXGP1x/XbfU4Dsub0I2c4J7vPht15b9frE1ZrrsiCDEPVfvFyhHR7OnZzCd/3FWsxV3uWu/4G7L6v6SZr9D0TXmZ6RciHVM0oWnBmnhjZzVrhrsZRQ+lxxopivqVrfMXJjqRAVe5qJgUhe120fcOnUrdh6E6DARZqa8wvQ9tUq9slg0BCr5st2ZY9t0K045ZvkkqXqmfu8P6rI0tUDG0JAX5DyQJaSOzWgMF7lL3SCD4OXkIt1w1JToLcVqn74C5gMuw7VyRaXkCJatlvbu4puuuLTr+V6TQnHJE883swghHw3fTg3PtHumIVWxYptWbpR4c28Fb1+6j64XTKBM2Fk2KFIgcqWWMdo2P0ak3v/czvlOtlqr8yLmzCYexNOBcyT16CvZAiWptmofn+zqkcoON9d/I6ebI2L4JEf43pZjp6M/sf4ws/6sLSl9dOt5yklyXiIaLxBxRe/3cHyOTW2XE6Ny7Y8unZNgt/c2iahx6dtbVyTDdHZDRLYdW3nzrz6x/dBdxNn5OvsbdEYjKiGuLSrEMtWCmLwYqBguEFQEUKvfpNs+zxGRHFA1mVzV6iRfVsAMYLCq2K4u2CHBhRg8ljgK+nDxW3rKkCXEdkTuWrqagHnMuhDzg3VuWIvQXFo8+XVF5sCMEfVohwQ8m5tUh+P3i3/nPh+QFMhr+EgLNGvLOTijCyjsgkeJUARvlOUu4R4uWjB4eR4XUnfI6/yP+uJrtEQ4Q16c+lGOT6vXJSVPVp6Lzsz9lp6KI62cp4ZcePHKTajKR/oiDMhlhUVAri91/m2nMXopXUDXxvAUh6hAfN3lxb3HNk9ge8NSwIk1kZiVYfkC7KevXsC4YGm2Sj6TwOKjlGBZXQkflpin+3sBLwNkQ0ZoAqHeWylNYUnLs2sLzPJm1qhEBthvtWKW+1v/ItOnEndoWky1Ku7dM3CtryAJv+f6tM1sLcN5itts1ZCRGqbsJPVFtokG8AIXGeux2Fg7q/IuFFOjkX9bwNz37AVeTNdtmph/B8eV7ppsm7obSUs9WWdcT2Gh/Mx5ri6DkkRb7kLektzLU2vnZvViJt97Nudz7c1+Uzm13/Mdaml7Ojev+3zhLdisnaXYBCRoHkYRzOF8av8Ps+JMFJ965V22VsqJK6iKp3ghfFdfoVi7w8P5Bf/UMtOB81vOXBXJVjmBlZfGOGXi0lH6WYa135+34SF49JrCFMvz9LzSb1C3nfv29yJud25klcUTIoxTbRoMyRr4x5nFTyIXyDe84Itz64+S+v5onV/UDxTxS401Bst2ayotdgbtLKFgUJ2BrKTrD8GoAMfjVJJ1A2Mw2pipoB8+Qr5x/mtq9EoeyMvylZsuw0ojNsv9bfZyld0xq35kVpT2liDlSzk2jWKvf0+jFEAWAEDsgEguo7K4f8N4/TcVCx5emoiYOENVgwHl4SW2Hk2zLS94Apk/mPpDwDKyjRf26gSQ+j/Xj4GQnxQ7lacqNlNzvlgxn5lfWR/ZGR2+ZvaWuaXkkxvDoIrV4x+MiyydnOHch+K68g9tLSybLDDrwbCqH9XtYhruRqtAp9mOUJZxqxlYNCviSYv18ypOl19t9cbA9AUYKol4IOP7yqdivBSmYbRel4IXQKMrJIPg5/7rMyAIvklpNVw8A1JA8AoZjOxC0gf1Qe9ZHaOTs1QV/FQ5jVZ+BGeqSlKRjtD21M+pDdH7u7c313fvP/w8rUnkcS05+Xt+fv534sMRLv4QABcrdv8YO0xBEkDs2A4Y+4qfzrjnyB6bqSq38XlRDr/g5yThxW3Yd8/Oxx85j8hO2T16mpmjwMdurLA7Ke1WcdUYU53uqjjyyvRYxdHHAyLN6LutsFtHq4L9OF3FT6vVHkBQnJsvzZIie17pYsHd5jw+hew52+15Z0R6YsF9mNP/05nbnSe5gw258wb8NdWlSkY+QE6nMLyft/aegvKtvIYXG+TummKw5c9h8j69b5YsGIBpPLTsnzuPLHurycA2u/hYfxB6h3EVz7c/rJLLHcxHN/9yD7W3eJWA8VjLbiBoc8jvtntVjUZfUU4TQeSKPB1pbO7C7GJy0es9ZCEp5Xh+xyhrPRv3mie7G+m3v/LDe+2MeKk0HHnd7STvSDJ/2n3AJYX0cGaVNbPqbo43+IWrYfYe/U8l5sqh59xeqvkPJPn0FPqENXr3pWL+7T4uGfPt23XpmE8b2Hyg37me/8lLnt7+OicsMNx5sCsloMeWjvA1Z8rtPb7ifRzdwuim4MDOw5q+2MjxquC6PcZMafRpJV2smOU3OpkPYun9HgaOpRYedfmguzVoh0hdVkofQ3b51TTm0aLuaps2xQJesbFUZIX0cOUha+YOMpG/3r5IsmDwOli0YzW1JfYVa6lt+C6Qbn1ZO8jy7Izv14qu3dJYxicJIFgceb+UgPkTcTj3b9TfrkiUbM7SrQE2TuWdAdNdgUv11eZnDaH/V9Ydy00KSf1e3GgRW0CtcBPvwSfWYh1lOZtJ4D7DPzh5imWDznJAv0oP/vE8pxdFXb2YZvkMAvJCy1/wHNLi1UVIGHXISyXAWOhUz7yACh6KhN2krLXsuACrnj5WrEjQQ9OWejE0VtD5t7Zy7C2M9HvVjkX5+7LKvrLebMXy7D2KpAmcCv3Rjeeu/5pq0gWM3EUc0JFy5uzfpVRVr6x0nALr44Z+FWSaFU/5uQDfZ5UUSvlGv85ndmA5Yum4uoxUTgUNMgbiIuSDoQWwM6hA2ePkZkjk/wjyEz3IlcMVQ62NwI6I4XwnpLhhzHY48169IeSVBWkwIm9BOFuwMCii+dZ3oD6sgenDW50sqDTUw57jB0YzVazszbJ9uXlJuZSbmXFRO3IaMq2a9CFNlPwKtDhI3d7ATrfWNu/Y2swT+LZmgO3uEJ6eAz7yTmf6vWJjs/Q1et8Bed/HomadqPNtw0Yfh2yjnXANTs9P94MzkX2v3ZSXP4XOe0DOOyZUb6r6dvIraMW49Ggh3YZpdk1WOj333U/SVfq9onVq9VG+gE5+QE4+l/3CQYcvd/gGYzRS0+2WI3mKU0CvuJ5bfZA0S6c+0sfR7w/K72/gWot5KkV5XlIEa/Yy8/rBHZelH4bgferTRW+I6nLtKDXPVKkqr+E0MuRphAhx4nzS5XyiHuVx+4JOz7Oc4PzSq3M5mU4YHcPRP42TyJAmESpCx6cydEQmQWdZ1EScOvafOurGdkxW3u2Ju5OfH459clChDLxQY91JH8cpYtBThCwB+2nvUtQOUY92qLsx4W7OAZ8gIbQf55kzVpn++LLiMfTvQyKKksR5AeHxhLK49G+DMqoa02HbcXc5CE7P0fcol0L6faVJakWRPIpOf0BOf0nl58A1BA6p6h86/r2tWjuu47DrrtKknO4UcPR0L2XpiwbVq0n2IDr/QTp/t6x56PpbcP3u+Oy59exNp+Lt/8YSZ0gTlVTTUs39uO2sVKmEt6mlVDqgTj6Fzryfzpyqi/1SUSKlCx+Rv9ZY1ctQrKqrlG6nt47uTWq69PvaTHTKB9H1DmgdvUil5yxLinfyO6LqoenRTmh7ZtptwsgTTLfQr8SX2++NkvLVPI4+fkiZGECGVKWEEJ3nsi5iToa6EepTdoZODLjTvLSn5/z7lV83/d4sna7+afT8A/L8cC0kOv5OLLxuaMdk44fLkH2C6Yt7nuk7y566e2LvHV7FWWVISZGzg6T0PQeji9qcybuN1wmZuS5d/z7Z70/qZttX1qfIXXHHw7wYd0IL8o34cFvBRZzqO3V+rnUfr9zgPtNxL+8G6NwElkAW1prdQu8lsbVc+/7mu/9/7fre0qPfCPcJXm/rHIArIBlDKIyWY0OVkquPYcgcKGi2PJfJ9vLiNyEFmz/rLX6/mJxLrq+n5acF/aZuRtYJdvkze4Ff3fC7GNxLWeE+DORMXeodjNiP8JD9+pfbuw8/vb2pFrJio+bEKzKnLZjP7qJ1TltKt0pD62BRyVTDmqU6VtCYd3QK/Ai3/1yK5yaai6mLqnMX8hcrjcz59teShPdGt3hLnLm0W5I7t0s3Xu+Tdf10Ll5Gq2/B6rmO9Nro8+pSa/NcSejLsnvmqVX/UE2k3qpRT2utWu2jCnqeuijukdKOTZok+j7xW8PRX7TgLwqK02u3IdGhnVYMMmUyWTfITavHqwd9emm87B6dSNtORKVIvfYn+uTAO7mWmrTBJl6m1hZ77XDUqYwL7qZXOX47uEUZnUkrzkSmJj13JerksY0jnBqz6VXEo02L2zQCMkmFq3Q3vckRi25nCG6nrC4Dcj/yFKMtuyGlOfXYHSmSqDZ2S+rEqXlv1KuMospgySz5IHqmg3ommer02yGptai5H9IaUr/cjyY3Z8tep5CPU+12jp2oEhc/g3AxQk2G5GMKiRJ3A290KRSNoBu9jfV5n1mS1DG/39yPbIfqfWR92rS6kwjoQ9rdeS5oS793oCWK03wnWm4t/dqRlmUQbLoUUWUNzHmSHqXTwyVIP91HVUV67UJUWdsauxGNqfTKlShz0bXlTor55yTO5OiJ2dCV9NuVpAoyCEdSzALWmhu5luWQ650TKWU2a+pCStnMcr6jmtVrDwikNgGRuWNQxii6fF/oIhq7iEwPeu0bSgmsdoI1ygpkgmR8kqYrM/IWO7qEhlm0chbdm/RSSlOuTWSDq4NDmn5ZYXrtAeS6s5MjUKRHMvEHStvqMaapO4OdJ8z3K4eRmr1qdlJx1/dxUdEFl16qU/0m1WvUazd2vU7PjGj2eoPsscfRpAfKOZx+5c1R+guzJBs7vo7epgNvI1WoXjsbjW41xjv05tUr0ENnI02RD9NsNPl0Aj1P06LOHrB7QocmZaET6yJJQa3y9Tt/gaEK7pbawFQXjbIemFv3MZZYZ2csV/z2jCZPBnQp/v29G5P0MyoR9roj/IYQv2jpNzdi3g/+/ocbfc5qEo/RhoFmfGBbVa7/ueB1vrCnv1C5agvdDtUFHfhvLEORO5/TcQTjZ81iWY6IO39iPmFqeTaxp+AXImI9uxuWnGdbyvPaT7yVT1jKNRLFFvmVSkfk5wmonCISJD59a53wQp+9x6fEenK/FYpxrYW3XBJ4mLoZaMb9xVY8IrnT7OcwEELLppPrgPom+kIwJ1a4FO4rorqxsLhYst6wUrnfcdJX4ita7zz5TPVrWhYgjOVvv/N62CyTvsQMf2qlfuWK/hXlbC0rO3/ulxdpbyuuPE6fzr6EKzMv0/K3Guctt09TfwujUTTxXFnMchyHjYHjXE6kz9nOs7dY+OTFjbbvbD+qdulz2qgvueaWk1Fln/ObFFYRTCXJJhtIfmMl857FXKhgE8WpVTaEXI4wQoWR4c9Lh4UnMrpZB5C2i2UwqnqMc6F1VtpcKCoMqOZGhPpqN0jYTMXnwbQx92J6PFcsnMSAsJLFaPDWxyRJRL6w4ohMIXmZI1tWTMY1NLypr8PVBiaWy6zXk/1yS51gasKuUmhVs44pcmKVv8c0gUNKEyhJJTX2S31ySf96bzwtXHefy8B1gtfcd5RorHrxtTxzWOlr9I1DurC+mpDrdFzjY78Np4WLcKoJhU7w/ptuk61V78XQJj6SP4U+c0jX2BCqGfKUP6fjOxWD0G+zau5R9dnaTs+5HjgpXUUr9GnBJApSk/wLXfAgXHCylaKD7pjaocGADNYS2/Da6pR3p+izD5PZT6Ii6sRrUgXRpCdDRz0QR71xEqYq4uaRuSwF1Sn56brxGJr5te2d5ZkCT91Ld58QsUZd5HnqatVGkcUNvfcwvTcR4kQ3bjwwQzfQFvy7OuXiCbr1w2SWrCqLUapI/dPou4fku6kIHZ/K0Im4EJ1lNfniCXnsuuEYlum17pULKSlP3i13lnmzTjkKiRHrtaOY/hA980A984skCeUpu+aXgZtfC4w2Sa7PE2S2dZzStErU0ecoVTyG3ndIjDeSOC8gPE7CP1num2oY+m5czX2rKgPq6fnXQyR6raiBKhenRBWUWSvR1w7C1y6p/Bw4MOUQeX7U0/G32qEYirG153uL6WJP1/N2lxVXqQrF1KUaRSil+USfOzCf68qSyZ6ix3WHaGTNfW0pr+6pONm/sUQAOVezVYlqxtS5H7edTjiVcCkdrEQHdFmD0cP20cNSdbFfpGl3x+5XNVb1MhSrau5S5fmNT2/52n0a54rga/MyKx9E5zqg5esilZ6zlGQxPp3Vq3ochmBiLRxd1qRDPMEzzAfKf109dWmWqbHmcfTAQzreDDKkSiOE6DzLMg+e0EHnuuEYmvE1982aFNqn55oPlCm8ohxmqb/1T6NfHpBfhqyj6JZTs6sbjWEZXnOfbJpK/ASzRx4rY3o1Qd7uKdB3eBWd+ZByUmYnx+h7Di65iykrdxucUVmtZibYK1tw/uqIrjKBNr4aQpE4tPYFySUPxIqfwrW/4GnX3YAPgEcV1Y2/MiNNntZx2ltrRaKqDb2yfJJcsIeWXvTMDIKWE6+fGS8GHJlwTPE6qviDe6eQhPp+6wZoESRKtLms07eydxQPx2nW9G2a6STaFBNet3blRcNrL6Tp2rMM8+W7K4rp2/e6MqPdazMaXp2RdhSuz+AGqKqklXsy6u/KkNyXobszI2+bkosxKuWUbscoWKryCoztNRhZvv7XkqzNxndeGNwAVL3hovjJ0guo0ZRMSmONYLWTvTIW51x0V6l8m3poRQLTuufRP6N/HpB/5tY3KPecN8zdvXPBTHdxzj9U00aPxzdLEnvmr6LtNp1w4xtotbn3DF9Dv41+e0B+u2CSg3LfEmvd3YvLbHcXZy73aOPy6fq8zTn3fuCExuju0d2ju9/N3atMdFCeX58uefdJoCab8i7zQa0LHNvUoE4OXZgYDpM12XBGeAzDR5/YK5Dqw3ppE+pUN8y3v4W/cpNAzZPo9tHtD8TtywxwYE5fnYF5H5evSdC8m8PXurYxu3t5tmml2+8+DTO6f3T/6P5r3X/ZEAc8DcgTNzedDhR5nfefFpSub2TTgzpZdX5WOEwW56bokFnmWZwhcIYYxQwhM8phTQxqe91jPtAkkt5pGtD6ulF7/0JSbLX77yxbNAYD6OrR1de7emGAQ/b1hczTjZ19MTF1A2//SZKZfEQsTEmW7Twbs+P0041ZmfqEunp2JonQ26O3HwYvs2CHw+JnSkx0D56mLCX2TnxNuScblzdX5fXOefRDJLzGRTu6cXTjEjdeNb5BuXJVKu3d3bky0/YuLl3jysbp1ospwyVOvbtc2ujS0aWjS9e49NT0BunQi7m693fnpVTe+zjza1nK9vG48lJG8pwPr2bm3gNEr00ibO6gldiJLmd3S86pgWPaxynt5ZDac0btOKJMf2RVtOJ99J6n5HUUHqeUvLrO1RTdTFnzlP6l5Fs+SfOVGzmUGmdSdCSThlm0c96g+/TSTaHX2lS5uMLDFd4YVnhlUxzUCk9upbuv8BT5rndZ4Sld2sjOzmtSD+YP0R8on3Xj45Vm+b52fR8PXOIcMKTz9VJrHdZBe40h73HiXmfWOx291/vBcc0NmrThuanhQPm0m84MZlmAd3wd5wWcFwY0L0hNdVDTgsaKd58VdDa9y6Sg94DjmhNM05bn09geK5934zS3uycSblIWTiY4mQwpOW6tWQ8rb66hse+RUtfU9HfKtmvuVAcyAZ2dvdL8Z732PRJQI9U9dPbKuoO7E1zqAjLH8N2SaZVF3442q9CDQuDGATfYWDdM+ViHbfoPqphukLDs+WHyREubi0rB02Z3KFiXL08hdRvsggv6LO3vgufm9x6fkuw568Glj0DR8ZQ6S+uF+D4tkv4VLhNC/S5hCfhFDfT9Z+pLvpF4YtORsK6TxJ0/gcsnv658bw5VeekVCf+iIwY1nwcuFfi5db+gYwnf3FvhA2T/iW3rWvZtmt6fTye0mqw427pd0/rE65YbsaZ74Go3VOuo6FZUq6lTpO2PCP07JgG7QcAP6TOsnKn1sIbLAmC+eiBsvqGDtKC1wHCnJRde/uXutU1FRp3xE/Fh9lquAzaXWwsvdp8fvMc1bXsMc1Q6DLQ5Lhub9EYE1oB8V2BkqiPC5wF+a4Lrw200m2xWLQ4xH473S1Z6paAzNnekJcA38Px31Dwjwm7XiBO4VIL2/htMj1xFwnVkzddxEj5b929ogXf0NaAPwO//DdMqV8EzWC+RAOZh58mNnbR0bsv/xk0R7lDJlkQgI+oxP7Cp3PU/i4/TRmd/WP9tlb+CHwviJ+4X6gTBBqdnbAmjL1m4a1aCrCfairhL8JZ0BLMZE7oztVTtzvlv4VQN22HDtSlZMawW7qFEMfDB2ZnwSs7t/Iks1j65o1L4hxvRASmOgvj88kLxwsXUusiuMybu1xuyJBEBP509qXmEY+HZg5OsWe8X5HkVUmdBtX7nJmpebrm5WXt/oVbtv6Yuw33gddW3svIKlMeurs6mDPoeXcGGAVeFdAa5kpR87XvUPc0qb6bvnJWKvhJ3dOxSZlYUW0llbduhNfzVt8sluCWDF7+n80g2b4rXeBnXa7r+ibx/GbV8+7DoNI+O1O/VHUfixRTuG9iruEIJhTJFRNSkUF4Eb2o+9/b+Hc83tJg2v0GR+WZK0gvuVbSkHEn5DdouK4h3QZ8ssdXe1ORRbL1j6oRguqpq2CW6suv7UVe4pHR5Dpt2e6DIaNO8J+qkC3tJW1Oepr5uOlM4VdxYHLozxo1bLjspt58LlBQkq6Gpl01nLNW5kKbDrTwl0nio5cTnttpbokE3bm2JNNm0mRUC7z4KUC6Et1RON9qrAnlR8lpaGmcdSrXftKcpUFdjk5lWVyLvpmbLZ68qNeVp6mvQR12BYg1tiD3utxI2LNy0JU0W5aal82FxOEi4hZ8dZxtQ5nFjwNj49g4042cAqqUo+bnAankQyEOEOzf+ugUZzs/Pb1KAKoY7SEWUu+A7LhGfSRmglb/jlIOZcAsk30Dhmyz0f0GY0FLmITX/xAuI9UDmLiCHL4RDbNGGFrfd9Ag5brRh0FNMnl0aHc/jtEjCG5GDn9L2XIZR7niA71txCDs7ZGLne7YFqv/GRqB0byy/pTmJPFLOHT7346nsalPtzpxY9m0BodxDRCwN7dIasVjLvxX/CZ13vMW20ofE+fYX1189uX+x4cuYL+foX+8XSqa/wH9ol9LNmmla8kz8ziH6bAPT8QIvcZzimBS3Kgc3KID0AehX3mR7Q1YkWIBOUQXi9/vyFoORWbD/AzfqAp67TtifbgqiuysAUdmdxZNSoS+AyW/gLfgFNvE1CF9Y8bm3rPdvGOxKn+YwLXvIA/kAWFcskmGzpYGyH6kVvribe3FBMZj8M1idlxT3716VCuN3Vnu8w8t1AvugtBXk1xW72Ti04vVqRRdJ1jwK4/i7fJsBII+n9N1SkcIWn7z5kzVnGwH5zUo2DjlEewX+CPYtg9KASEt9IlFpQ5LvQuZezauEHsndOtDr7evvFykoXNz3LCC3mfnU67tkG07WZFpnuotZ/ELS2fmTGwTEd6iPpBNHlHu19I3kXWE0MFXxv3Keka65qIDE2jN1AeKxS3g9D5JrrU3qdwoNKPsZtsdHHU25GiHBH0hAIpfOm58ZXM9B++3dxQXE60uxdur9r6FwvvXFphG+c+XFT2x3izcvZvvgkSjDhjmjsAeZkTpYQ2lRrCeX+13+m/lNLq9sM70kP6ASZJ8lIV8TyHc3zZYGBRHY2yXGZLp7oTdkKS0vIsuJ7PyV5Fze+iG3qJHqk/MYreZMqeJb+vilGAxJaRXWRDbGQJmQrZ2g/tj+JXCjzQ2b+xcAxms2j+m3M654wA7JvXNPv6P+kAl7S9Og+gTDoywP6nf4QmQGf9ufqGapt6b5k5y8cA6PnqufFRvYM72tQiFiBXyZrgMKEp1oW+Mu3MSVcBmeGIs1tv/Of6sHdEvvoDoza1HZCoZb8KYzme9VFzCxqdWBCjppfy811bkcTWDtLnbHpt2xxdf27SZOyLOAHlQcA+nHBdfjpL6KKjdnSIDWVd4jDJKxDJsDe9wErnCX2xKdBdm39jyk659ZZlXMSkFQ6/g1/cb++cOd8+7DLz+/uVKrKLs83rBZeh2SaTlrJlfzXwJYTQV3zF2rRW3Btimf+M+UDa4Ory/z69wGuXgcKi8+pDWrEo58OCny4bgBxz2ug410SZIJJebl02feuX6saL63VKiPXWmo/QnWbh8CEi4vzyvfnk9A8Nnn5xoRl1+lLTRuQ/qJtHT1qJcGBGhR3bSP/ZQPtaAHVosXUbFSkqoX7WwCn1h/oGN/fqbVOPPNwcuJUlnUJgddyIaYL6D07c1G8c3b29c37z/efbixgXDI5jK5/+uD33gffHN9b3EdPa6fSZBc1kw0zxzHmWkfWp6zBShjQ/7yy/s3VkpCXK/pnAafXD5sqPCK8zCbs9kjk9+t85oKnlxAbzJdCJc8fr34TSem3y9qyj0HghOPChn7iBVpqGUX/15XOABCm3DNrE8E4C5fqodLEYpHEQSkfBH0H5qlT60fZ5Gco5nkylP5lkcg+iWU60z59ivrfZBiA/9zZv3Z/r//bP81H1bTHnHzAb4dAAn3AvbezqP36oWjt5SY3Pv4sjiPwKolZkUJuBn+zJmgxsbShdk63i6cdaVqplWpn6VT8sqdf73kBdW8zOw9Lw/Ob+LvZkUYyeL/yUQh9kQAX4zCF1C5BZn7VA0XXDAxFQtQ5BbWKgwjf/PvmvIz0Mb1nkGg5HntM954IkrxaI9pKxaw4hQgaRHoyeOp1fKpzsXUIATwyofC7s+6SucXFXLRT99KdUm/mGheLbCPC14oz15Oy5HBFKX43t5iE5M87WdPElPh5Sokn8pFLT/xxCQlcDFClVi8FJvyS0CXl5/PlAF9odgfqGGzYqaGL3CTKr3yZdumn97e/f3DG+fjzYe7D9//8s55e3Pz4ca5+6+Pb2+vLN+Lk89gy6q1r5hMbbE58gUWwJ9l1bRYftEYNO23/mg6qDcfX+/14s3b7z/QECr36pnEpNKw4m1xKcrPK30UXe2RbmTtFlBGJg3RD0nDc52FkPNKEXDmi2YCVcZacRJ92W+PQzRy93EqbVuYtDCjJZd2KEK2+I6J2GWj69M1YXxeQID5/iI70RNYYbQgsLwolcBmB8E7p/8LA38DdP4F57mzwwvV8kplsPWV6DPfBLCrA8XBm3InbwFtCuaE26ZE3hJDrDXGHQyweEBGuVEWr1dwRYOdqUZppuCLcyHINDSXPJEGlTxWlJUgsYPs+TMTKJaHjOwfAiArljbNi6PUDQ7i8LY85hZ28LnDFlnsXWm5paLokpSVJk69VSf3V9ZP6zjhi12xGkvPLsHmWLb6EgfZ+Lxfxct5ixWo0/X39NO3b2SSEC/CL70oi/+m3Sp9sI3g2Somtea6XZTtQLINA+6UNbskJQ2QF1oSybZ4iWFp6pJqYV3dMJKVzZqSQDR1FgUhr0IMrWpLqOAwtd0rS0jFAMjHFbDvL2KgK5MQqORBUkumxfAlM7enagkLkrieH8uzFq7j6tIaSpT5wemZZuGd028eBuYU3CfBZfHTifU/rT9z9a56thQCzpvCleoYIFANhBtK4RHxu+CXZqpOlbphPKpcO2WhoYDYqnicZF/88oEET5Mry/Vjxk6BTf/IeiRJkh7AYvAAoFgxU55SGfdiWIWM7xlY5gVzf73gBcDp3MC6F0NyD8Hjs/uVlIpZkIf14yM7x+fGHo0hzs52GuqJqeqzOQCmFvjNXQozg8JHxSUYTLbXXngjFj5qwolUj/MyrNZd+JckyEy7WXguHexyVGoyCB6YI5+H8t0vdVsfSTBHRac3XzoSOXw+dxoHeVjIw0IeFvKwkIeFPKxB87AKJ/p6RMMqnlVEFhaysJCFhSwsZGEhCwtZWMjCOgILq7AgQRIWkrC6IGEVlGw8HCz2GylYSMFCClb/KVgFH9QKA6sMniNjChlTyJhCxhQyppAxhYwpZEwhYwoZU8iYQsYUMqbGyZjKJyhF4hQSp5A4hcQpJE4hcWrQxClZ1u0e8aek2cWRRoU0KqRRIY0KaVRIo0IaFdKojkCjkq1LkE2FbKou2FQyXRsPqSrfO+RWIbcKuVX951bJPFJrSa7yhe+Z6kpShArIRxIXkriQxIUkLiRxIYkLSVxI4kISF5K4kMSFJC4kcY2TxKW4uRr5XMjnQj4X8rmQz4V8rkHzuRTzG1K7kNqF1C6kdiG1C6ldSO1CahdSu5DahdQupHZ1Su1SxCLI8kKWF7K8+s/yqoES2s6ppfcWSNBCghYStJCghQQtJGghQQsJWkjQQoIWErSQoIUErdERtDZ34et0rSWYA0jPQnoW0rOQnoX0LKRnDZyeJZndjkfOEtsm6dRtk+dVwrfU38JfSMdCOhbSsZCOhXQspGMhHQvpWB3SsWpWIkjAQgJWAwJWjXaNiXIliS+QcIWEKyRcDYFwpQEH2qdbqT0Fkq2QbIVkKyRbIdkKyVZItkKyFZKtkGyFZCskWyHZatRkqxJTA0lXSLpC0hWSrpB0haSrEZGuSqaB5CskXyH5CslXSL5C8hWSr5B8heQrJF8h+QrJV43JV6U4A0lYSMJCEtbQSFgKsKBbMpbccyApC0lZSMpCUhaSspCUhaQsJGUhKQtJWUjKQlIWkrLGRsoicfJjGDzecArTO5LMn5CLhVws5GIhFwu5WMjFGjYXSzK5IQULKVhIwUIKFlKwkIKFFCykYCEFCylYSMFCCtY+FCxJeIHMK2ReIfNqAMwrDTTQOuFK7SeQZ4U8K+RZIc8KeVbIs0KeFfKskGeFPCvkWSHPCnlW4+ZZfYo8CEKRaIVEKyRaIdEKiVZItBoR0YrPbsi0QqYVMq2QaYVMK2RaIdMKmVbItEKmFTKtkGnVnGnF4wukWiHVCqlWg6NaFcGBVrhW8Jy0lrfLJTX0CjsB/O6177nx1sV878bklkTfvLnK3YiyakF9ZHYhswuZXcjsQmYXMruQ2YXMLmR2IbMLmV3I7EJm1ziZXT+Q5NNT6BO+w4uMLmR0IaMLGV3I6EJG15AZXYVZ7XhMroTEVO4CFnjkbWODItqJVC6kciGVC6lcSOVCKhdSuZDK1SGVq24pglwu5HI14HLVqdd4yFyF0AJJXEjiQhJX/0lcUjyg7URZMs+APCrkUSGPCnlUyKNCHhXyqJBHhTwq5FEhjwp5VMijGhmP6h1t6ycveXrLdleoP0MuFXKpkEuFXCrkUiGXatBcqsrMhpmxkE6FdCqkUyGdCulUSKdCOhVmxsLMWMimwsxYe5CpKrEFEqqQUIWEqv4TqpSgQNukKpWHQGIVEquQWIXEKiRWIbEKiVVIrEJiFRKrkFiFxCokVo2UWCWiOqRVIa0KaVVIq0JaFdKqRkGrEvMakqqQVIWkKiRVIakKSVVIqkJSFZKqkFSFpCokVTUgVQm1QkoVUqqQUjUcSlUJEOiKUFX0DmZ0qiJ/xpg3o0wOyEqAxvwDaBpSkpRxJbk2TcfI6NphIJEE1iEJbGdlRuaYMXMs71f+G3lkyCNDHhnyyJBHhjwy5JEhjwx5ZMgjM+CRZbs9MvwWNgGKueqLq/YLpX1VMHkVX+2TAGuQqIZENSSqIVENiWpIVBs0US2d0Hp4jWK5achVQ64actWQq4ZcNeSqIVcNuWodctWM1yTIWkPWWhcXK5b1bDz8tbRnSFxD4hoS1/pPXCt7orYZayV/gFQ1pKohVQ2pakhVQ6oaUtWQqoZUNaSqIVUNqWpIVUOqGlLVdqGqvXGDRxKF6/idR/xFjIw1ZKwhYw0Za8hYQ8baoBlrpXkNU6shXQ3pakhXQ7oa0tWQroZ0NUythqnVkKSGqdX2oKaVIgtkqCFDDRlq/WeoKQCBVohq8Fyp/LfLJTXuCs8BvOy177nx1qF878bklkTfvHnVuYhSNIA9XoWJV2HiVZh4FSbywpAXhrww5IUhLwx5YcgLQ14Y8sLGeRXmbRJG5IbM11HsfSOiDGRtIWsLWVvI2kLWFrK2Bs3aks5uPUw6pm0nUrqQ0oWULqR0IaULKV1I6UJKV4eUrv0WKMj0QqZXF+nItEo3HgKYtJtIA0MaGNLA+k8D0/qo1shg0lr2pITpyqrdGUB6GNLDkB6G9DCkhyE9DOlhSA9DehjSw5AehvQwpIeNkx52Q9wFssOQHYbsMGSHITsM2WGjYofJJrceksN0zURuGHLDkBuG3DDkhiE3DLlhyA07BjdMtz5BahhSw7qghul0bjzMMFkvkRiGxDAkhvWfGKbzUG3fZqnxE8jUQqYWMrWQqYVMLWRqIVMLmVrI1EKmFjK1kKmFTK2RMbVep8us62CBSb2QtoW0LaRtIW0LaVvjo23VznQ95HAZtxkJXUjoQkIXErqQ0IWELiR0IaHrGIQu48UKsruQ3dUFu8tYAcdD9artMvK+kPeFvK/+876MfVfbJDBTD4KMMGSEISMMGWHICENGGDLCkBGGjDBkhCEjDBlhyAgbBSMsFxF+Iu7XG7IkESyLLiVb7N78s4hanVvB/wJM7x9u9AViwGzhm5LDmEVdMc1UvrjfAviV9QlWhkVOSDrjT2kXaS9i0GGX7wYyCFTwWPIvPdJwN7AeNnlGT3Gqb5U7UuwE327Mc5Sk+5TvF9o1/C6DXXzzgVD1om4v/EqC3UOAWCQIV74pSSZeLam82pWTX2pJL9nOrXRXvrjpy6E5r4IrpdCq42xJDGzPwHHKBp9KrmzXkoblpQNzXv7fkuepW39ehQm1wE3K2NhB53Jv2++3f//EC5Lu+PFqI7avzugLdfK8YY8Cc0JT3kvkJYblfWKP1pUnsFCzEsXDNWVy0oJJgRlXRFNa3pjoU/l/ytRCGARb5fM/65agqc5VuVYKr6FZh2bmYle4VlwT2qB0ckXRETuzR7kOGD16F7lB7M5BQGZFC2VoRjBl410xgKvyarRiTOogtProrFqBHPoWfZvNZTTYKgmmJHL543l9nVU1Wka+kixlpf2Xbk9ngyVxeHWDJnslYzkWF+m+tp4/ZG9JoobqFgVXLNf37Z+8X8lCKEnMVptySZ0zcOu+sLC6Z5sk90LW93xzli5e5BuTy/OL31gHUvP//cKCLddVRL554Tr2N1R01OMw4IyuY1xFOecLb8kakFj3ouH3gL3Bsl+w8X1qJWRhqwp4H8QJFWxKSXOtgLxIu0a+kWizrQVaBYMGQYOqj+lo2FQ/Lysdntzb5zX6V/BuOf0rOTc+LbXh3I7vhrbzpsIN5ebgOovKPzqrVjBMN1TqP7ohdEMHdUM5/Su7IeEMRuKIcsttlSvKL99rnVHh4ZmsmoE6pPIooEtCl3RYl5TXwJJTYuHwODxSFq8r3NE28q8zqNyTs0rpw/RCxc6jC0IXdFAXtFW/rf/h2w/ODQGv8Y34m6vitpJ6Z0DupSQoecdQfsGmr2oh6OrLzbB482OkGiRdjqZnfyue1eGehVf+VuxUSBXRD92F4rAk07mqrB0HyEZVQB6+Ed7Cca52mED0U9MuEGZxFpM1UJygA8poyEQaQ1tT62K/xdE52du5V4wVl/lD/n2s0JwqmeEahPA+ESdqS82TnpSF/2zbRnmbyLtF4Sn8HOxZ6X3If1u/BMDcm1m//Hz79k62n82PJiqLWXjzBMoCYgow5bQldqdkZQWCBAhsG9R7DMKIfH724vmXMyndnm+6xyIVAZz7WBCXTYRs0qdzNl3rBKt1MrUuPZvYU0kxbOc9Y7QsPeIvOAVjMgX2fPwUruknkNfkwnEW4frBJ846gBOs8xB29p0LSaHf3Mhz6ZN8//pbSP22G2wstj5KPNdnNcDaaEk9eRLz5sL+Ne/RRSxrqBvRlxI4Qiv59u6JNRAcOm3S9mGWUYVnXgnYdrkXWB83tJKgzObk5XiF4wOMFio4dKygh5D2XXxC9SaEIVpLTuO9gsZwu7+wPL6ysXdwDa+st1kGie8isajg7FDOMgViC52+4LySV0zmES4tQoeTqqItG6jL6wmkokidC124eHRkplaoev77SaZnbEwgvQU/KkElzNLUsFWZa/khsHC8ZzIVCullB0KeCY2nriyOasfAUMxOhtijd4uy2VHeAiNv6aAnbscTm3CAc7o4tT7vENQb6+J0B1X8MpEY6C//y/KeqRf/RuDM5ZU1fyLzr9xUA+4IqN+NPT7UdJLgZzOtFzj0OJ/TsDVIgKcuKZkzi1zr8ebj6zR3Apub7F3HksZ/mc1UxzX/zUxmLZMW6suMxqg+jc3vZuhfpHz27OhklnBH7lOm0qW14kShgEjkJZkesnaKrzBmNqN25lqaa57e0cgPkOWGkg6OvLnaE+Rs8SAap3su9TvKZ9Xn49Sjsd/QS8dRLvH9hnRb225DWhSG0La8ssGZvfewhnwHS0NN2hKWgQV+GGRHSf8wTvPhZJlGdpr1uFOAg0Q/ideVKSOcAgygqSWHYMiWLlRWtBBvsfPszN6yX7O/3r/R+g1HbtdXO2UrKk5zOQWsWz1MVCfBc6XYedvTt68sXqbA1YJMKi0AOYYVF6VeqlwNBWW1l95XQsvK2ngIUEShdqmK0+DzfiU3tZqvWBSTyivrE6cdZ+eM0jiDHa1mQ8wy3KUpBZn+XsQCRbM4uA/5c3jw4D0+JYqK4Bw4DWnm68hLNrCmSVG+2PoOapu7ATuuB99srCSCA1AQVQr2YZp3M8WCIaZU1AQNheCYNnNOY1gek8ZwdpwFatNSQj/IYhURWqfoI43V3bXPsiJ+lx70U9TkrpOnKUup+I1EEeRUZMMAIoMFLgvEeJxXGDD5sfNXZ8qD93zoefKKcurE+6n1FL4Aaj5lZ+Xv83p0zxaC0Jb0/Jh0McgrEiTz7cikZ+VX64iuMVntNDAVxzliEbDmc6dC7KoovNJsAPoDiyfnKLWZwRS2uY1lFmFi0TlXVGPNBaclywxTXuNpLdMgsWJljpFyxauziXrWLuUByw+VSTYwzVyQ+rUSfq8dUq4JP7C4I1xH8gSl0qykwkFktikBd7YVbHW0cJIiJtQsk8hdwinKJKzNVKfsY1HlavYr2B5iZ/67rC35hmXfyNZbIl2dQsWMktkVtnzLdlm3qbwd3JqN5YoGy4UyVWZBZEMwKwyUUaLGgv3/cZYfM0l+PNn7dIEdbZwHd/41XC4VIy2+tb/nvyUpYF6ePJ+wlF46FWDFKwMYZZrILULNMNqC+uydlbNuaVrMzllMmiRClIua3FLG6sMhJTrJOFnjnauzmrKzAZWlbmFw7TZLJ9sSVnMtSgWnTdA+O7H/P9Cc+gK1zeOFpJkua8sSARyk5bxgQriYGr2TJt2UxJZ3Ic8GY1ROKVo1emdi35KIru28f5G78DaJqNevS0pWSmVQG8rmvYD+tYleq7iVwYoqdQxZgh4HoPRU665q2/bKeu1TX8vmN+E+xFYFz4UEuXQMCqE2wSF9WkzAZmHvma2yqaEbvL7wYuorAjKHzBEGql9yhvYc+nBZM2jbzR94EeZv2J4QkUSQ0FU+38NhhRuUtE0CB5ssdA3gE1aISB8FS3fgpRiUlOMDWV/Jhq1jGZMmInPIJrL4dxjYiGVPNygOIp+HlBWTpQdMt7L41BVz+RqUdkmDLODq+JsJfTdiya7WNARYwzZiwBbeidjeMihNRGR8v7KSkF2xQIQOVRXd/rsbM6Bpm2HzfHJlZOswMXnBmpydmXiRzLI0SSELGwg1udfK5dof3YgnvBJuR9LX+jxb6X8bti1b9KDllFr52lX5wApJb2UnzmsS3QpEIJ8+nzqDgqnzfDb8jovoWylFe7Ec/iQ4FVoO3zgk9qM95SlzPMYceyDljDnFMtYr6noJDdkh22LOwwUJN9c0/Z+mCDiq6ML1AmzD+58AK/D3Q3ZlxkabIFCdLIeuPtgSkJUBm+EOH366HOWZBWr02g8fYVXF0hXUz5DnKfOMbbJC26XLJp7KJOb/rMtgyblzS9eDO1LY8s+1st6k5/gvfmN//F6bl5K1kl3ewEfVts9rpkvtbMlSO1dmjRorzXyERqLbTM6XE00uZ5EdRy/DVzRUZamfvGQtcqALhUxvfeFGAukRycuU4QVia66UKNE2SyLJhyVVym0GD7a44KfGYa64TBcT+uHylmnJRmBqkdpa2LkSafYKKSWNvDp/tn7FlktU2qRpkrwZtXVX01HpWqdPKFnOm/KfhKyYnoSR9+jBBu5yHcw5KJoiroLAQWfrkE4SLDUTmFmppFT1wTUA+YJ7zLW4vQRWFRdx4H4lDsCIFxnpRXY3CzwM1RR1ks2c6R5SAxrdXbS5C7PMjgLdOCkapXQE+kurVDS3K5rl6erHIIVbJzikOyLdEemOI6Q76maxHtIfO/OISDPsM81Qp6WHoB3q629EQ9QV3RYtUdv8U6QpIqVQTinUKYoRxRBJgUgKRFIgkgKRFIikQCQFIikQSYFICkRSIJICkRTYF1KgNMTbjySoixaRNIikQSQNImnwuKRBcY9sem+JTeWW8HvJ38Jf/WELarcrkD2I7ME92IPymR7ZhMgm7JxNKFW9frIL65uKbMO92YbU5iGezO5VTUNQqrXScW+NcFZCWE6YmFhq5lAIipVmH4aoeIp6M2hhmwoSCYxIYEQC4+gJjPLZbjxERnNPiYTG4RAa5Vp7eGKjqh0tEhzlVXRDdFR0BwmPSHiU465yhUHiIxIfkfiIxEckPiLxEYmPSHxE4iMSH5H4iMRHJD4OmPhY8kRtECDl0SMSIZEIiURIJEIiEXIPIqRiuwMJkUiIbEyILK8AkBiJxMgDEyNLKjgEgqSuyUiUbI8omUImSsZkSRBNGHDUZf5IF8E36yCgj78jyfzptAiTkgHoMU9S2trO6JGnqhzd39ka+9Q/ObAEdGKYGBexslYvSNq6b7Wp+tSoBvIskWeJPMsx8izVk+RwrskehMtF5mavmZtqOzgIYVNXfTOeprrk1uiZmsaf+G3ZVc+E92HvyuVUa5fx9dhVMcyqH+F92MgARQYoMkCRAYoMUGSAIgMUGaDIAEUGKDJAkQHacwaoJEDck/ipDjWR74l8T+R7It8T+Z5mfE/N3gjSPJHmuQ/NUzbNI7sT2Z3dszslmtdTUmddS5HLuT+XE9bysMp0Ij66zhKGFxicklFvwM37gSSfnkKf3Mpj1hEzNgs97y9Vs9TMrjiap6cHgxKmSlBIlUSqJFIlR0iVlM1OQ05Baer5kLjYZ+KiTCsPwViU19uIqigrsi2OorS5mDISaYaphsgUBFNEIkEQCYJIEESCIBIEkSCIBEEkCCJBEAmCSBBEguCgCIKF0G4/ZqAsOkRKIFICkRKIlMDjUgIL080j91bMXwrP1R9OoHS/AcmASAbcgwxYnNKRBYgswM5ZgAWV6yf9T91E5P3tzfuDQPEFRpXHZrBjlB/mBgSvd9QjAV79NvOrp0T2q/S+v4Q/SVO7Iv2dpk4MTqg6gSEBEAmASAAcIQFQNWMNmQS4ixdEImCfiYAq7TwEGVBddyNCoKrYtkiBymYjMRCJgamWqJQEyYFIDkRyIJIDkRyI5EAkByI5EMmBSA5EciCSA5EcOChyYCW8248gqIoSkSSIJEEkCSJJEPMGGnEEldsRyBNEnuAePMHq7I5cQeQKds4VrKhdP/mC+mYiZ3BvziD4Dwe8x9YXUkWtDHcLPDEhsZNkDoq+9583mDW0a9bgKWnDwASqFhbyBZEviHzBEfMFi/PUGNiC9f4PuYJD4AoWNfOQTMFyza3wBIuFts0SLDUZOYLIESzDlkUVQYYgMgSRIYgMQWQIIkMQGYLIEESGIDIEkSGIDEFkCA6SISiCu2b8wGKEiOxAZAciOxDZgcgO3IkdWNp+QG4gcgMbcAPTeR2ZgcgMPBgzUChdv3mBskYiK7AFVqDwjzlOoBjjBhww2Pi+AUA5ph7wJ07vOSlaoGwA+ssNlLe2K4LgySrHEEVbIzbkCyJfEPmCI+QLaiawIZMGd3SHyBzsM3NQo6OHoA9qq2/EIdSU3BaRUNd4ZBMimzBVFI2eIKUQKYVIKURKIVIKkVKIlEKkFCKlECmFSClESiFSCgdFKZRFePvxCjWxIpILkVyI5EIkF/b0fmLdtkB/KIe6ViLvEHmHe/AOpZM/kg+RfNg5+VCmef1kINa2FGmIe9MQwUlRzygG10mZPTMp22jbT+AjpUQTf3MJ0E7Ji1Jnso6CTIafiPv1hizpKiyYE9u52b57VoNBMNioFn/YYh38eU2gWkBS+NP5j0rEhm2fqdnHNLJ9n6426ZLusrgp9QMJaAw0T7eRC4/ezp/IYu2zSPwfbvRlUoqLnRc6QtBgPkRX8pEzKrpYMIjKcbzAo5FcdbCh/9Uh+rfqR+01r1p2bgEv4/Dkvrbfb/8uCepK2je7NK5Us4sfKN7KxxSzfAOrgxuL/jUZXLrOqtvhhOUVrM2yP7Y0oOwr+LEg/nZnVsLSMRBRdSiFNctGlNqaeJtvf8qhSOmLJqCi/M3Ejb/G8hdgLGfwQ/51TpSziqhroUom75X7EgxL2GX3ewtdUEpZ99K4xbsl28K8aCpjgeJe7U0TLIiK4bVXst0vhfXxHdtIvxnEV1Q36wC05q1+iXR+z3o/uYciM/iC4zTxerXixxVe+FZ2Rs3UxRnnH30CG6qwZHiyAP+ATds84LOBHap1LDZeaWcZlqQpkX7rPUNTIEIEKI+W8IdzUwqM0HS+LBcj/z2t+VYMZiYvJg274CxtR64canVORaQzAa2a5rRsBx1+ibyEHEyJmXFCjdGVdETfB74XkE/sCdhKhWD1s+mDNyRe+8kXI//K+fDVbmxJxDDNSUm020ecXwLYx5/VPPTz7ds7tS0bduvIxs7VZMzW/sq6Z8RR1sVQTLVXHN0Kn72E4VZ8HKJ76XGC1F8AaYbvb9OSaAckcDvU5NDIzqlTnojEof+NsIifwVK8Es0qirdwyqow2lVt5uZYdc431/fomoOuUhyyXJJ5EvfH9eUGRb4TC7KImJHNhFzkFQAfm5OLGSuq3Czb9V/cjWJFsg683LDNdnuZ1bwKvSCZiV7a249kG2iTJie/mAq0eNQrmxnuIjeIXQZx7HNqQvqwkre/82FA9vs4p/9KTeD7Aq2f6DsxubYoJMUaAk6c6UnL/22lKwTJIiC/ba0sZuHNEyhrakGBNSU2UqayouChQTw0OE4XIPP4PTwuN0avM9pTbnldOsSxtmJ9jc6x5YtSnrPZ7dxaoXVDP6hWPKm1/RetSF+giiwlGs/mHtpqZlK6B/Mne/jD+x+pq3KhT+hE3f4ik566y2u50TG71H3P4IeanJhxGdM/TE8CdHDwTI8WbDm/pZBeEWuUlhTTurGe1ola9UAusnacHEN9F5x/UFv0jCeXqmaDIPGWJNeLfxK27356GEC+98eFAoot6QgROE1hd79Ed9NBbbhOd6MHL4ncaJNSbpTlKTmzEo22f6Y/yELQdQyaEcFJRjokSyj0LzS2pQJbKJtCm+DvEjHsqekKLUbUAlGLcaMWEoseDniBnrF1zzhaSEUioEMgK9JqGwEskhJbwllkbUW4Rd74zPUYYS4VB2P0ltQfIGzTL9hGYjTG6E2mRLPsLzWOU9GhWeUT9ctSVZpJPx0ePKQPPBEl6golousOZ+sHZ4XQqQGOkFtHnzZ+pBiI40JJykZ1hCqdvDZgGNWrMKq5/tfrNsJOCDuNG3bST22IQKHrHDUYpVf/Q+BSdS1oBFHpC28JrarpAQJXCFwhcKUBrvT2gxjWYTEs4zAX4ayu4KxkKwKnDG0pxNMI19jcha8hIVC0nidifX2KGJdkGI6NcEmb1Bm+ddJ60Fch1gkIIRqEaMYO0ag9c1+vA9vT+keMM6hleBiUQVd/Q4xBXXRrCIOm9SeNL2AE348IXq2fhhd19TkgNloXYzjcXTi8gWsg5qkI0kFm0bBENq3FQKUFzanHxKXi+hQbV5p2kBj5ZPWj70I1FRjGzhg7n1LsLPfgw4qhjb3CicTScpkePqZWtaPF2FpeRScxtqI3GGtjrN2rWFuupyOLuWvX2Rh7Hyz2TlcsyiC8JKwmwRaV1Y9h8HizDgL6+DuSzJ9OMAaXjMKRQ29pi7qKuE9aCbrnDcc+dUbsOgXBWIqVtXpBshPJtpma1KgAhu4Yuo88dFc7/uEcS+iLexkvGKDWkoNgALrqm4X+6pLbivg1bUfSvrzxVXtGNn3P8AG1VhtT6atSnlU/GiC13SiWQDChMzABxgvuenciLgFnCSIACEEimfaCRn7v0MlDB3wYeoUdpE06DHhwanrQVyHWCQhje4ztTyq2L3jm3m/H72b9pxJ5F2R4hNC7VH+bsXeh6G6C72LrcZsdw+h+hdEF/Rz+9rrZuhgj4cNFwvwmz2oozGXT5HpEknx6Cn3Cbjk9wesv890/8jWYxaZ0dR3macq7b0JTCQRjW4xtR379pMTj9j2mNbTy8V7zKJHZQa57lNbb7NpHSZFtXf8oay3GqhirHjlWlenl4GPUmnUsxqadXblIEucFRt6JYehBzfKiaBCavHM9/xOdJN/+Oids2E8vHK0MwXFDUklzOgpLT1j2fRSeTjAYomKIOu4QVeWF+x6m7mDxow1VVbI7RLiqrrtRyKoqtqWwVdlqDF0xdD1y6KrSzcGHrwbrXQxhuwphl3TwHVjS0aWEGH6qchWRtBDOXD+EUUIWpxvIigHoRxibNabjIPbkpN4/wamFguErhq+nEb4Wfe9QgtdaWx996FqU2yED13LNrYStxUJbDlpLLcaQFUPWnoSsRc0cTcCqXNtiuNp9uOrywc8Fq0IcDYKWdMnSRbRy2Jgzre24wea2FR1FmcMXWI+GXjKsGCBigDgMg1E4vr5HevVmCvZIoogOgrALJ16vVj4L9y4Vi3waP1AVv/xcWEnmQq5kYi3pSi8BBfyskyg7UZOKaDdw4MsXReNy66zl+UU6ABdcp1/EP2n7qWqvqQAfqN3ToHax9ulkv6RLR/rUxW/lMHJiOw7YseP8fmF981zrnq/hPlMv98VOC7hk/5xko345T7vGv7g/l7ZYHQKY92XuBiy0ot0BFUn7ou/J+dleq+D91qOflT00t/npDmWYuwL474v8Y5VlzNQmI1sQnwyuUnKPhwBUKlU2hDvK5SHOoY1iNbdAF6PceOW+BJc556h80cid6OfxuncMHpwY4gYI4BgBOL1SGmHrJVM3TsrGFKFDFRsufpKtSWZZkNcg/H7jBo8kCtexSiBj39ovDcBx0ZZKYzoCXU5W6t3nAKYG7S7cxG2Q+Zf7ctb8xqUIBWpWDMAgDYsQcm5YygNxIxI5SfiVBI2HBmTdsJD12ls0Hdtk/dCwiNxWgbKkOImMGuMmxNH0qb6YlvyZ2lchoImA5rgZL/IlyXDS4OMUiFMgToG7ToGjBSzl7uwQuKWq5kZEMHmhLRHBFC3GCxrkjU9nmu21DJqHU703e5abqdHDMDcYPZjeImfybN7PGzYZRtDoUfDZZj2jntnowZz/NSyYe1m8T6NfdD+5/zFGbVN7nKV/TDV7rqzoWaQC3MoLuFn6h/pRMMQZ/FA/IkxwNq/b7czb3yz/D11LQQAz/kv9GFjfDH5oOkLtbgY/1I/kLG6m5QqWFzaz9I/hXWlSC1sia7OrXYdFOvQOg0Bi6jJK0mgAR98mYURuyHwdxXSh+hPHWk5vK0I6DMfdkFA0qaNtiRPXg0MgM2xIlVVBpubY5jXZj1wHnNXDX+2yUHaJgJvqUJ1+ICCMgPC4AWHdxDAkWLj/zme0IJxOhQ4BxenrbwTI6YpuCZbTth7BORU4x6dIhHh6BfHodHkHoIe9NhO/hwclGIYaCCh0BSjEIAA6cEICKc+f6qlUNA2iyhu6lERwQTYKx8UW5C3qCFo4bSXoqQhrxIOBPQb24w7sNU6578dedzP90cbVGgkeIqzWVt8oqtaU3FJQrWs7ngjEOPnIcbJGPQef/shsNYzBb1fBb0THXxr7ygTTIOqh65U4idbz5DpY4CY7m3Vqh+S4QbFB8zqKkFFXDrgXtiCr5KkB570zndlFHzA+x/h83PG56WQxnE34vjie0QICpipzCHTAvC2NoALTalrCDYx7hRvz8sYzH4Db8v2CG0y12niLnkl5xn4Ob3t+j2AE0Yqu0Ip5KgzHDRaOeuO+VmjbMagLTSEAycYz8TeX7FSPRUMGN9afzBVrIbr2sZ7CF9mSNCcn++8sj5L+mY9vb5xPH27+892PHz4VM39Snb3JVNZ5n2tvOjc6tyJv5R21nX+40ZeieyyEX3uOCe3oV7I99QwHi+xffnn/ZnD9r/TvrHy2q2hW5spwplkU58dOse7OhlReYH6Y61fupdGvFtnyEAt/a1Bg1aUWnbLiZF3+IJomnhOhmZ17XO7DmVhn7KfcA1OJzej/5V9SYczo/+syhE6Kareiw5jmVdvV1Uyk4w2F2AVtZgVK6oX8vC67M6+jis+kI1wdIRi6ek/w/u7tzfXd+w8/T3UD6vov7iZmPdq7mfXtuf7x0/V/3SobMvfpwsVyfqHTo//6CU6rxbd0pOOlR+LL4vj+QAISefPMpvg7dCkD2BAYFqRCLtRTWAYImVHhFJ8pp/wwADpKBYgmlPUhbdrnz1+mpa+uYWXFvlN3pojSORzFg5+ad4rdByHTpVDg0ZXUpTRbihEcIR/E+twpeyUy7mowqzUZDWhJb6+ko2hX9Yyaf+UzxbtpwoFZOoCq50S74EHxp+JJ6BN9Cn6pgOM5NzWZ8VcCgKo4Uzcc22sYMSct7Ux14FsyQlPNw9qD38XRkD/DEJbtYNQu9bcDE2fOx9BgaFsXDABTa6xGvSw6pn5Vy6rTwVZyAD5HNLhSQCdZVoyZEF9xvC4nqlT2WUcu0yLqM8unT+pS3b5z/ZicNVSxw6hWOrbNlSo/rZUnpeKK7Uq+7DOax7rw9kat22+SULrPYp1Uc4sfNHK6lTGCff0djLvZlKYLFKRrntyJKTchX67au5lAq/mfzTv4pdablhxW5nmu6jNiy/TBZhITzVGjVbuMsnyEKsoz28nBGKUtSUdjZjCBFVShdtR3YxKwsg9wn9Pu5A/2+8gXau1iqKK9fCL80jrlo3+C6n4DFPbzG6YIrM1vufDmCZQ1hXnqyy47qt1qx1bmSN1A6sbRrFnmjYfDoDghB9LhTVVtrwl34Svk9a4lTkK+SOQdKBrP/LFJdshqWk/kKPSBo5DXcmMeAkh9Bj+mTdNGthcKKnkHihWxsV8z4hgY8QwOG4xKWQwmAWntiOwTlBbmpXFxKVheo9SiGoRud9HmLswIF2Kq7GXMLW3pgGJwRfu7isn7L9hxSEU91hgbY2x89NhY5zV7fyN2l4Y80phUJ++WYlRdFXjgHqPLY0eXOv00PHHfeXxouDrDePGg8aJ2DhlX/JhEGydhE5Og5G8pXtJRaC0SKR2xHECoWWrxYEPOSj8OE3r2WeDjklL92GNIiiFpz0JSuXcdcWhqbuAnEaLK5d9JqCqvCkNWDFn7FbLK9bSfoWvt6g5D2COGsIq5ZuShbJrORxnTloalSahDdfXHMHi8WQcBffwdSeZP/QxpJQ0dUiQrbX5nAWzfpdo9OzH2qQNwEu+Z0LgHjl3FbSV7OqjcldLESBgj4eNHwmqnPBwe8zA9xVhja7VGtRVSq2tAwrKi8VUTQUZyzwJwtVYbE5SrUp5VPzoaI9lsTYvR+mGjdc2kNbIgHdTEp111It5XZwmdhdBcMgZNzqKS5NNT6BN2ILmfh4fzLRzSIeJiuzs7TNxbAQ5bCtWxxRgYY+DjH96VeMNR7f6aGuxYD8lK5NvWYVlJ0bibi8Hk0Y+3SvSyL7u3NasrjP8Oe0BVNjeM7KAqSZwX6KMTQyfBSvKdbhAovHM9/xNdzr39dU6YivUy2qu0ckARn6TtXUV9/Rbm8KUhH2OMADECPHoEqPKQo4oCdzHekUaCKjm3FA2qiseIECPCY0eEKt3sS1RosPrCyPCgkaFyvhhXdLik3XRgReaQtKPUaiqdbyGwuH4Io4Qseh0jijYOMELMWt51fNhHMQ5dErLxxcgQI8PeRIZFvzjKuLDebEceFRZl3HJMWCwcI0KMCPsSERY1s2/xoHK1hdHgUaLB0iwx1ljQ5d3MRYKi4w0CiBu69qm//LkHwaCsoQOKCOXN7yos7L1URyET5UhjlIhR4tGjRI3DHFWouKMVjzRe1Ei7paBRUwNGjhg5Hjty1KhnX8JHs1UZxpAHjSF108e4Akm4i5Wqi+iqk64XZ9I17LafoP/8Imd20a61vSK4ZAwGKnNZc2fxTH6Xb1WHJNoyKTY5nj+RxdovGVi1/FLqhpcnEtQtbBZ0cckOL6d/bNdT2VfwY0H8xK0ud/JLHedWNBPuFP+HG0lHlF9lm3aIL1H4Z+5q5cNalzaPGtM0vUTejb/GU9aVGfyoXm6d1nrV/B7qYhN2WBPyZdf19vX3C8myiPVFfT+7Zsl1F7lB7DJTFKsu+bJXsUSTPpym0LJLqbK+ZMukO2jvbbJ++GJ2ZXf36iYxoh2klHvLfr/9W7OIh49Vt4UXlQXuuS98oHiL6QB9mP1W3UNOB5I+QoJ4HRHnyY3ZkPyLtuUyZwfyd3N9LN5DXnb2QsbZPCO0s49XBFe1f1DXOacvPiTOt7+4/urJ/YvNBttZPfzVBiN7vxjOfc1NhHGqN662pAFl6ZpBc70UOd7r2xctM8GQ8sGKtds65ctEAkb+8r8s73kVURf2TKOJK4uu4OZfOcQZEI+u+iNrFcYeHwnLjR7X8Jz14saWO5/TSS1IqOg2kpIf6aqfxq7W483H15bQSGYk9q4dD+iHqUpXByH/zUx6s28L9eWAC4P68J7jVkA1vJW4T8DaoG8cdrZxrum0xAKgNzQSuqN/wK44/P7fVA5glJeGz9pB+HI5sf6YR+8gZCgZsGJo869M1cFZFU5imlkqQDYo6TjuNFdzX/lDtJr/JF5XuimngMU57QSIUqBPUvUDcSMSOUn4lQSautkiQbRf5mcduR+U273ZFJ6z1rq1kNxei82y8z5O376y2IsbE1lBJpXmh9e04qJISpXnvzyTLCiuF4sUfoONbC9YhtEzi/EB2xR7xKz59llNn+UGd1mVxRNxYUPbvru+/U/n9vXf37755ce3U4W5bl2M7cUhb93lhI/b9jtumxcXEwkMTB3FZaGp1OUn6xXsEEidGqwpqRWwPpV3Cdh6s3bPsdoG3W3qtfsCOYuclYxf/kLm0vPdlj+a149ZWZeMdj4F8JkbN7yT3LolyfXin4R28hvpK2SUb+MJIUd9Fk33ob2bdr1hfO9GD14SudEm3ZtSlgdpM2Obt91+FFspIF+J/tk/0x9kIfa1DJoRkW+wBHCXUOhfRIZaZVNoE/yj4FkFnRsBrCUR3XDQLTQBBNv6D7ZJVOMQmJu02kbQm6TElhA4WVvHAcRlLsoIjas4IqO3pH4DAb3DAXoS9TXG9TIFmWV/qRG+in7MKp+oX5aqyUz6KQKHCBwicIjAIQKHLQKHergC8cN+4Yc0qHK2i7dZIfBvcpvjNhQaArKoaO4JgYwDERiCLePEG1XqNwLoUe9bEIVEw0AUsj0UUm9thwAk61rQ7K5RbeFtXTeq7wEilohYDgSx1GsygpcIXiJ4ieAlgpcIXgrw0hgGQRyzZ3cdbwXnlDFNhVAboWWbu5BGV9R/rueJCLP6C25KGntS0OYAhNXTka4bxVHgc2rz6GsuM4SZjg4zqZXmMCCTrv6GEJO66NYAJk3rBwQvIYDTPYCj1pR9M68hHoJ4COIhiIcgHmKChxjFToiG9A0N2dDOg2S54FIZMzBEItHWoutS6rphQCKlRp8sNNJz4Q0MIimP5uigErnZIGSCkIkBZCFXnsNDJ6p2tAihyKvoBEpR9AYhFYRUFJCKXGMQWkFoBaEVhFYQWjkUtFIbeyHE0nOIJU3fr8RaSiJuErZTFfgxDB5v1kFAH39HkvlTb6EWSVtPCWEZgKi6PzsU+9Sw+fKNk5djZa1ekBznBJpMUGPAbNT2N5yzZ33RH4SD2oOD1Hp5EBRIV30z8EddcluYj6bt4zicVbV3PDV1QIRIrV/GR6aqEpxVP8IjTIgrIa6EuBLiSm3iSkYRJ8JJPYOTQAw+FZsTcbk5SxAcgEgSebYHSHyKPDrjDwQ84o09XfSon8LqPy9HOorjw3YK5oE8HAReTJCPgtIcAXkp1d8m9FIouhvspdh65NkgiqJCUQqagvwaxEEQB0EcBHGQg+EgqtgJgZC+AyEvTHJVJIRLtEF0/QNJPj2FPrlN6FzUVwik0MgTgj56LZzeQx7F0RsB1CEzA4Q4EOKQQgwyZTkEtCGvtxGkISuyJShD2lqEMBDCyCAMmYYgdIHQBUIXCF0gdNEddFET+yBk0S/I4pEk1L9TeTkxCAzmz7wAGwTB71zPh8ns7a9zwqy0ryhFpaEnhFT0Xki9RyuqIzgCxEJlEohaIGohRQ9UCnMI5EJddyP0QlVsSwiGstWIYiCKkaEYKi1BJAORDEQyEMlAJKM7JMMgNkI0o19oxpKKzHmhMnNIKjSqERVBthAwXz+EUUIWfcc0RDNPENHoqYAGg2ek4zciNKNoDIhlIJahxROK6nJIJKNccys4RrHQllGMUosRw0AMo4JhFHUEEQxEMBDBQAQDEYzuEQxlLIT4RV/xC5eLLIdeCCE2CI0/0SYvfTqN9RS0SNt3QmhFX0XSe5giG7gR4BMlvUdgAoEJKTxQ0pNDIBKVKhtBEaXSWsIgym1E8AHBhwx8KCkHog6IOiDqgKgDog7doQ7qmAbhhn7BDS9CUlT6qdAaxLJv3OCRROE6Vs2t/UAZSs08IbCh5wLq/iqO1D00uICD+wDW/MalxCvaAdKwmJj4y4ZFCOk1LCXvTBsPDci6YSHrtbdoOrbJ+qFhEbn5S7+CNGgMXbg7mj7VF9MNFFd2KyNA5ORzxHDuHEJHh44OHR3i1cfFq+Ve9BCwtarmRui1vNCWQGxFi8dxJVYeX+IXYWkeTrXU7Fk+tRg9DBOI0YPpJagmz5ZRLIMmwwAaPQqO3axn1H0bPZhz0oYFc1eMN5gdbsdC7gmMLy/L0LD0j6nyUVH5LFJBIOUV3Cz9Q/0oGNkMfqgfEeY1m6sW7VK0Lv8PXUtBcDP+S/0YWNYMfmg6Qm1qBj/Uj+SRytzfujK5Oc3SP/ASOdx/wv0n3H/C/acW959qYW7churXNtQiFZizZBKjylCSYYNNj9skjMgNma+jmMbCP5E4dh97mzBd2tgT2qEahLAOAd+yjiurgnsGYpvXZD9y3WFiKQ/dUfYD5EIcwa6AzjqHtDfQe+VCDLY1DFans4dAYvX1N8JjdUW3hMpqWz8WbJZ1ChG+wyF8Oq3aAedjr83Eb0SSEElCJAmRJESSWkSSDMNRxJP6hSfFIDYqDyE3J13izOShaQO84oYaxVCwJVlbTwhaGoKoen/qWjqII0B2NLaBp7ERWZEiGxqdOQSwoq2+Ea6iKbklWEXXdjy9jUhJhpRoFAVPciP+gfgH4h+If3SHf5jFTAh/9Av+iKjUpOiHTJwNImq65qcecz1ProPFoFg2tQ0/IVhkcELsniCxIKvkqcFpuG6gl3pBjQCHMbXM4bBtjqhMiPW0hvWY6uUhgB/ztjRCgUyraQkSMu7VOFg3zC0g5+ZwSJKpfhnzb5gEZ+wncm8Qe0LsCbEnxJ5axJ72CEwRiOoXEDVPRei4wcJRs3JqRb0dA2p/1v2nyOMzOijPvTV3A2b24LEsN9iIlsa0qda9cytU/p52M1fMKiLfIPJwrRdWmrWkE7+1CMGmXev+XRjaEVleTu5piQsriTbwRaGE1JZs6+/hCy0smlovdJxdWigdUNqW8GVbOv0kfT5XBEyI8BJVk+1giRZ8Iu7XG7IkEdVN2nhoXu7Nezhin7aQyhnmcOokoDChQrQIhw+UcgTCb1T9WQxlxe6SJBseqLGmx6wNxYGWdt+6XMIiMIEGTbbyn/t0srFKLbgqKjPAGtQEA48a66U031PVZtzVyvfmzN/qUgSpZsDr7evvF1+qxTN3VS71NR0R98Enn3cLkOUgRfp8mnBT9zD9nES0O/Zb8UcaemdxE8T+8W2yfvhihEaAwtWNWbayS//YNq266FNjISb5oHZacClQU/lkz8yDTz70VfZb8QyzwZlFgnhN3dOTG7PO/YuWeglfzdhCWfFuPp3KLN/jstMW0mIuCjRJ6FkD3JaV2AU2W7B5vQq3gcWz3yeEtw9dbt0jpoH7TBpmkKtNf7jw5gmURddItMCj4PlcEQ6F2R9XO2TGPhwIf0wK+cr6EPgb654vS+9jtrq9T7Yipx/FT+Gahg339+kSj64xp5YrKes+TSB+n70Ur9yXgL5gd7sdUdDnqbXrxsXp7FzkTe4QuxPF+hrtQOSLammXodC6cewkgHcyyuVXTcKIuw5d7zrk9c14ZwEkOoMf06ZJ/iZntfaS8x+m7lZhOAJ3uOQIYHrUmUTfvLmIUy9rUwLm21OTRS8iy/zjtpN9rBgLW7H0NkYOWd1iSpyVtkXkVU5sAePhVhBuBeFWEG4FjXwrKIWe29oD0njsAe/zDGoPhyWAShc0TTK7keR68U9CO/mNjAC2zHfnlPLzjUOK3WNGbjpKDYEjN3rwksiNNs7eadskqmr/TH+QhVkeN+7Yv8FqwV1CoX9xYkLFoN58o03wj5N5MK+epwWtSqQ8HIQVrQUBXwR8W0r4WFXgg+R5lFXbLL1jtcS2sjpK2joOMDhzpEaIcMVdGl5gI/FuCCofMH1kVX2NseVMQWbZX2qws6Ifs8onuptYJGoyk36K4HU9eK2PvBDDRgwbMWzEsBHD7h2GXe+4Eco+DJRNw2tnu0CeFdCiBphoLt4cGcit6NkJ4d3jky2CeeOEvlWaeloouN5jISCONoSA+KkB4nqfcAhsvK4FjWByfeEtIeY1PUDwHMHzgYDnek1GHH3sOLpxRIeQOkLqCKkjpI6Qeu8g9Z18OKLrh0HXcxG0U0baFQJrBMxu7sIsb5BYk4wCcpf066QA93HJtfc3eskH/NRQY7XRjev6LwQ/Tw78VKv2YaBPXf0NgU910a3BnprW40VlCCvmYEW1pux7U9lJo3RGy0DE6BCjQ4wOMTrE6HqI0Rl7cEToDoXQbWjHnG1WbiE/BtBJpNUajFPKXjw6mK7Uv5OF68Yj54HBduWBP2X4Tm6MCOMhjDcaGE+u4oeH81TtaBHWk1fRCbyn6A3CfAjzKWA+ucYg3NcQ7qtdRiLsh7Afwn4I+yHs13PYz8iTI/x3JPgvvV1MiQOWxNcEJ6Li/TEMHm/WQUAff0eS+dMYYEBJt04J/RuXVLs/1hv71F3wlR4/sRMra/WC5DjnyGUyPTE8UW3VwzlB3hdVQ6jy1KBKtfUcBKHUVd8MmFSX3BYeqWn7OI5YV70Snn0+IHqp1i/jg89VCc6qH+FBZAPM02jxjFAnQp0IdSLUiVBn/6BOYweOCOeBEE4YYp+KxIm4TJwlCAVwTYms2gO++HpkfHgmr/10Ac3By7X/NEbpgJ803FgwOqQtIhY4HiywoNpHAANL9beJBhaK7gYOLLYeaYkI7KmAvYKmIB2xKTSnWgYiNofYHGJziM0hNtd3bE7nwRGcOxY4x8PAKjrHpdUAxvmBJJ+eQp/cwkQ/Aliu0J8TguPGIsfew3DFgT4t+E1mXAi7Iew2YNhNptKHgNvk9TaC2WRFtgSvSVuLsBrCahmsJtMQhNN2htNqlnEIoyGMhjAawmgIo/UORjPw3AifHQY+eyQJddpUFny+hUVKXjgNUJZ3rufDDPX21zlhpjcCxKzSpxNCzcYkz94jZ9XBPi30TGVoiKAhgjZgBE2l1odA0dR1N0LSVMW2hKYpW42IGiJqGaKm0hJE1XZG1QyWeYisIbKGyBoia4is9Q5ZM/TeiK4dBl1bUnE4L1QeDkkFQlW3IqQWUJnrhzBKyGJEGJvo0QkibMOX5WDwtXSoTxNdK5oYYmuIrY0AWysq9SGRtXLNreBqxUJbRtVKLUZMDTG1CqZW1BFE1PZG1JTLOsTTEE9DPA3xNMTTeounaX03ommHRtNcLo4cliYE1AB9+SQivBFAaGlXTgg7G4H0eg+aZWN8WmhZyZoQJkOYbMAwWUmbD4GPVapsBIyVSmsJESu3EaEwhMIyKKykHIiB7YyBqZdnCH4h+IXgF4JfCH71DvzSO21EvQ6DeqUhFVXTVCANcJI3bvBIonAdq9YugwO7Sj06IcxrPLLs/t7K1KE0uK2Su1jW/MalxCvaAdKwmJj4y4ZFCOk1LCXvfhsPDci6YSHrtbdoOrbJ+qFhEbkZT7/YNGgMhFeaPtUX0w0iXPZApwUMy2ee4dzliz4RfSL6RNw2wW2T+m0Tua8/xO6JquZGmyjyQlvaS1G0eBxXTeexNX7BtObhVEvNnuUToNHDMM0ZPSj02ujZMoJn0GQYQKNHYfox6xmdZIwezE0lhgXzCQNvBj/cxpncExhfCp4Bgukf6p0hUfksUsE/5XXmLP1Ds9tEjWwGP6a1m2dzVWghBSzz/9C1FAQ347/Uj4FlzeCHbtdu/TCDH+pH8mBt7u+6nUBadfoHXs5evw1ai9jhbijuhuJuKO6G4m5o73ZDjXw3booeZlN0kQrDWTJpUK0tyafBvtptEkbkhszXUex9Iz+ROHYfx3Dfk7RfJ7RfOja5HmKHgI2Rsiq4fC22eU32I1czJsHyKB9ld0ou79Pao9LZ/JB2qnqvh7gjcGI7AjrLOsS+gL7+RrsDuqJb2iPQtn4sOwWsU4g3Hw5v1mnVDqgze20mfiOuWY9rGq6sEd1EdBPRTUQ3Ed3sHbq5gwdHjPMwGGcMIqFjLWTipOvJmRzYaACM3VBNHyHeKevWCcGdI5Nq79OjSMf7tNBGjcVh2hRE+waM9mk0+xBgn7b6RlifpuSWoD5d2zHNCqJ3GXqnURRMubIzJme2/ENIDiE5hOQQkkNIrneQnLkDR0TuMIhcRCUiBeRkomqA3NCVB3WD63lyHSzGSkas7eMJIXVjlnf35LAFWSVPDc6ld4MG1sv0tKBBU3sfDinxiHqH8OOJwY+m1nMILNK8LY2ASdNqWkIpjXs1DnIic15ITTwcuGmqX8Y0RSbBGfuJFMV6OHSPNTZio4iNIjaK2Chio73DRvf05giUHgYonaficWhg6qiJjLVi3I4BYCo8Ki2SJCvpeUqROswndc48m6fSP7YgRHUKq2IELJDPLpIh7tcbsiQR1RpiO7fQ5KvSwMG060EsuY28aWTu+9b5A9WJ8234bYGDpZFpREolxBsap1LZz614/ehGFrVg635F1SktkAX768Cnw2i9kItKAS9pE0AXotC3/DBcTamM6YB58ycLJA8C3kDl2+rKzShWDstE5uUqyEGahmymW2eKFab9SKgvOiv581wiM7X7Li5V5ga4QppS3Wx1q00VZZeGINdqmw+3A4N8OVGWwtxtVtRWlIolLdcSUPAZW6lJYjHjAaEfk4iahP0+8BLP9b1/EaMhYa3N/GTiby4l7TqTvKizl0tpWlfbcVcr35uz4YWEU+JTNolMray+M4UXnft0aWOlFllMJ0Fg4vNo1x1HXnnVPxcbs/Oi9Hr7+vvFl2rxrFflUl9Td+A++OTz552gMj3oWzIB6cOZerwVf6QgXAagsBjvNlk/fDECTw/gliVzejuresXWkdwlyTSXllH8QPEW0wH6MPuteAYGkj5CgnhNJ9knN2ZD8i/aFp1n4O/mUyjO8uNUXnoIGbPpCPRPaGeDLS9WYifbWg20efddTPb7ODuVhSaA9bW+LTlwGXW/AxS4z6RhGuvaHOwLb55AWXS2owWabCntoxhloR9sb/KYmiAz4uFsPw5W+drdQSwq0HSXtcvkdPYP8yp+iD3CYn3NNgLzZbW02Vdo3jg29MAdGOXBriYwx82/rjf/8vpmvMEHEp3Bj2nTBNkT3GTCTSbcZMJNpnFvMjmO2FRnfWptr0kRBg98P0kCxWZr9tpRkjdIjP4sJ4dxbWuxzJLprN4kES1Jrhf/JLST38jwMbB8b44LheVb0gkiNg7BdY9NuOkgNQQo3OjBSyI32jh7Z4CVaKf9M/1BFmYpYbmf/AarFXcJhf7FiQkVmHrHhzbB3wUq2UNrFRp5UqidRLDDAe/QQFo1EIQUj5D/uKo3B0l7LKu2YbrjapFtZTmWNHYccGPmwIwwx4qbMrxeUOJVELY8YDrlqvoao5eZgsyyv9Q4ZkU/ZpVPdPfkSdRkJv0U4VGERxEeRXgU4dEWMwdrMZHxoaTlaATBUkX6YkJtIlslzgpIRQMILsduHReMqujYcRFVRaM6AVdHJ1mEkXoFIzXT5Xo9PSn0Ve+tEIhFC0JM9vCYrN4qDwHP1rWgGVKrL70l0LamC4jfIn47EPxWr8kI5SKUi1AuQrkI5SKUy6FcYwRmfKiuJrRBgFcO8ObSjTplsFcxnI3Qwc1dmOWLEbHdGFBfSbeOjflKmtQR4jsqmfZRIHWDfWKgpdrY+no/3R5KgMjbMZA3tWodBnfT1d8UdVOX3Rrmpmk+XhKHmFYO01JriuEtcQgRIUSEEBFCRAgR7QMRGYVsYwSIFOtvhIdU8NCGjrezTQW8zQErHcvWcIRSFDI2jKhUXJ+wolLTDoAZjUbWfRaQ6eCfMJYkN8phYUpGyoHY0rGxJbmqHR5jUrWjTaxJXkcnmJOiO4g9IfakwJ7kGoMYFGJQiEEhBoUY1IEwqNoQcOxYlGTdjpiUISaVhhdKcKo0uE2AC6p9P4bB4806COjj70gyfxoBNiXp1ZEhKUmLukGiRiXQ7o/axT51FHwlyin8cdPL01sQeY04TwvSUtvycA509kHLECQ7AkimVt6DYGO66htCYuqi20LCNI0fx3HHqlfAc4gHxM3U+mV8CLEqwVn1IzwUiGgbom2ItiHa1iLaZhTmjhBkUyz3EVtTYGsgeJ8OmBPxEXOWMGSAqElGsj3c5VMEd26PDknj3eoVlMabdAgsbegy7aNA6gb7lKGugrH1nrVlrgQIRB0diCqo1hGQqFL9rUJRhbK7waKKzUc2FqJKKlSpoCnIwkJcCHEhxIUQFzoULqQK2UYPDG3X34gMmSJDL2zMqtAQH8sGOMIPJPn0FPrkNqHT3/AxoUJ3josFFZrSCQY0Etn1SQCqwT0prEdmRH3HeAyEjdjO4bEdmSodAtOR19sMy5GV2RKGI20uYjeI3WTYjUxDELNBzAYxG8RsELPpDLOpCbHGh9VU1tGI0cgxmkeS0KmEjpQTw1DBTJ0fugZh/TvX82HefPvrnDCHMHxYptKl40IzleZ0As+MSI59E4RukE8KqlEZVt/hGkPBI2RzeMhGpVKHgG3UdTeDblTltgTfKJuNEA5COBmEo9IShHEQxkEYB2EchHE6g3EMQrHxQTnSNTbCOXI4Z0kHy3mho0VjADFcVAErQ9gCHHD9EEYJWYwH1BEd6gekIxrTKaAzeAn2SwjqAT5JKKdoTkMBcrQiRxjneDBOUZ0OCeKUa24HwimW2jKAU2oywjcI31Tgm6KOIHiD4A2CNwjeIHjTOXijDLvGC93kVtUI3NQBNy4frBxsI4avQcifBhvDR2vS2o4L06St6ASfGb6wejLskiE9KSimZCt9x2D00kXw5fDgS0mBDoG6VKpsBreUimsJZyk3EgEWBFgygKWkHIisILKCyAoiK4isdIasqAOm8UEq+UUyYilyLOVFjBHVsXS4GoTjb9zgkUThOlZN4EODUEodOi6SUmpMJ4DKaCTY/S1KqT9rcHcSd1qs+Y1LiVe0A6RhMTHxlw2LEHJuWEre+zceGpB1w0LWa2/RdGyT9UPDInITrn7Ja9AYGmk4mj7VF9OCb1L7nZMCH+WzzHDuk0NPiJ4QPeEunhAR+sMj9HIvewigXlVzM7xeXmpLsL2iyeO46TAPqfH7DTUPp2pq9iyfe4wehhnG6MH03m2TZ8vAnUGTYQCNHgXPb9Yz6t+NHsx5ccOCua/GiykPt0cj9wTGd1JmAGD6x1T5qKh8FqlQlvISb5b+oX4UjGwGP9SPCPOazVWreilAmf+HrqUguBn/pX4MLGsGPzQdoTY1gx/qR/LgbO5vXZncnGbpH3g3KO644Y4b7rjhjlt7O261iPr4Nt4kITDuv8n33xbpUDlLNlZU80qj12Az5zYJI3JD5usopoH3TySO3ccR3Pgg7dZxt+akTepkg25kMj0EOM2GSFkV3LwS27wm+5HL01k9/NUuD/IuIGATfaiT9UltjehsfUgbJP3WQYSjDw9H6zT7EKC0vv5m0LSu7JYAam3zxwJTs04h2Hk4sFOnVTtAnuy1mfiNoBqCagiqIaiGoFp7oJphFDw+aE25qEeATQ6wxTBgVAXEiDnpomomj64bIDM31A7HB7bJenVcrE3Wok6gtnEJtIfiqBnqkwK6NHbW92QE5hqAONPhcSaNYh0CZtJW3wxl0hTdEsikazwmMkDcKMONNIqCSQ0QDUI0CNEgRIM6Q4PMArXxgUGqhTdiQXIsKKLjJYWCZAPZADigUQb10et5ch0sRsrBqu3icTGi2uZ1AhiNWO7dc2QWZJU8NTgV2on8d5HtScFVpvY/HI5WH/QP8bHD42OmmnwIsMy8Lc2QM9N6WoLRjLs1Dt4W8yTI2joc+maqX8YMLibBGfuJ7C3E6xCvQ7wO8br28Lo94uTxgXdGIQIieXIkb54OnuMGC0fN8aod5O0YbEN9gAmLA19NIFHO7WUSgJ0pjunQ6fbqTKIp3N4upanJbNd/cTcxN35Row134niBs6aD719OpMtHhWNiRa6oQnu0SczjSUv2w3B1KZ8wWOFZMWlaWcnDxU8mNhttUc9EJo6XiDaqU3nAf6yWKAM4v6eKeUuib96ciuh9QOcD8ok98ZrOne6DTz6bPnhD4rWffCnWVsIfOG5UbXo6jHR6oE9IsZTtI04KTugfKiIXeVU07EpRV8/Pzz+SCKYiyw2sc4+9xkfz3OJqQyP7tAEleO2eRb/3MLmHYrV0ZcFS0gqfvSQhi6l1zwVzfxELsyjicwFdFPAZmpZBHczCLreu5FM+EYs29sWNFlntrh/S2V7M8F4QkEjUem9dvjx586dSEa5P3R9dHNBpG2wEliUrWH4tJrb1kf5By4nC9eOTxV4m30hUKoCNFlRGGxxZ8Xq1om51YX33nUV+pX/OqdXPfSgIJucnUnr7nsvwnloBeFnis6ZTl/1IC2PNolMesRbhC/g+4j7bp+tcJL4j5y2mwuqnzABn8ONMMUO+So3Eildk7i29uZi14q051G0WbF0aK6vYLDkubIoJ37BVpA4R3npBbtImj95FbhC7bAVgVnRryHTd9hP7Ld1i6go1/rdyNR3EncVaC6sE0WGR2vRMuWmBOti5Dg5aqeC/wH0mDbKd1mb7XXjzBMqhYQItTFPaXhpe1uD6bTdU6xY2/PIed89NPQet6JhW1M0OnvHuXfs7d3mVnDSsq25nrljX2b4bb/li5JjwbjtrhWZVcdH9d84OtGsmqgFbUieAVWbtPWu8qybfUdthN+2YO2n77aJJd9DyemS0SwYSm8GPGmBVnfW1Aj9+SsGC+zTAu5/SWNu3zh/ciJxbMBjUEUWVeLgYE97zB6fWOvAJjaFfyEVEtkgEOJUoLAOWEHtOafDMQ3YLYEmIvDdQnUUXHAlM1XMaqj+6EYTvsibkotv7out7VfbDactY8eeibSyyPi81Ytv/MsSajoZ1n4Xr9lllN6UwFab6eFW7n59zveaLEsX2fQ3gUNmMzIMPuZbUARAGQESlKgkoIalRA0wUKi0UqwEp1JvIHLSQRGY7of9GeyVlB0JdlN7/XE5Mt8KJv5M6ZcvW9wFderi+9y+yg0Jlg55peuJvLoc3iGeH2zffa+N63z3rA+xX771Xvc8+daM96l32p9Vbh4U1PszWH6MwCau6Xt6vjVgkmzdHrZnUan93u6c7b+aWcN+zdjc1W9jQVG1msmR/6TpsDxTvliTXi38S2qFvpE0wr7/Qb77Hp4QAF/vdIhB8Oio0eMzJTeX0f9r7tubGcSTdd/0KhutB0qyKdab38uANxaynLj3ererusF1RO8fjoGmJttkliwqSslvTp//7yQRACiQBErxI1iU7ol2yTIIAMpHI78tkogXx5IZ3fhy64cppXJVUsQTtn+CHNzUrUxpiTBSGf48N/tmJPNAB/flb8PiZKf1Vc5FoFsGmKeW9I38VAicOmNZjF+vx4FhphTA2TU4rH9mYo1a0pkOBder1Kvq4v4R1uvArWevC8q68Q7kaifTunvRWqKQR950Kf5x+UkPYguzHhW9GGoZLoQJj5bdHTazvK8XdCe9cm3Me2nqoRwRzXYJ5T+eSeGbimfXvQWWJZpX3XoNv5sm1Wb65etXs11s+2nThHeedAbo5ayd2nOE/GnCIEqNxfIy0ZvDHRE5rp6BDnvoodYwoskOnyJovneqlQUR2jtsqN9XEadOC7XjBHhy9Xb6CNs10Vz29Meld3nAH/HdFz4kKJyr8Fanwcu0kVpxY8QNmxY2AJRHkdQny/Z9W4sqJKzflyitQQR3aPLFXGeK81moiDn0bHHq8FomT59M14mpEe66ugrSOlbDLVLehDV2vmNDjIuuVE9ApVU86S/R/J0pXpVRU/mNLxLneaB49bd5U0Q+QHNZryeap4bJntyCG9c12UcGjtNt7wAoTB9sdB6vXhEoGlqppUDUNqqahZncrsQhxu/W53f2eVGJ2idk1rLZR6s+3rL5RYxlRNY6tMLormAZnfbqAkBUjdBWiak2N5aA6UWRd0bq5po6X3i1MxMZoXtJlons7U0JTJSP69xXoX7VxJRq45QI4cDpYrTXbpYV1feiIHlY33z1NrBkG0cVHSxerNYJoY6KNiTbugDYuxTZEH7ejj/d3colGJhq5EY2swQOd0slGy4po5deglROrquWXc7Jrws2BTD8H84eL5XwOl37y4skjUXIt6GXFfB4Vq6wcf5dkMiksccisNNEMrLkT+0+eeJkz0j7Jn8fGb+03098K/ST6eTv0s974Us2OHVgyh8dc6xVu44R12aOb89T6Vjuhp0s6vb+lLYrLimpPbIDI1uuOUeGJopTGxa/o/EGivon6NqS+K5EYMd61Ge/9nlMiuonoNiW6S1BDW37beBERrb0NWhvndwbycEIuEOceJYJktkJQ7SlBznAcSU1p1dCPmG9OJmBzhPMxaBepR5X4qWJyOXGUMUSU8dtQJQ+dL81oyZYJ09yzu2JMM812UQ+4rNeUyHu8/GdGEyiBd//5xFcra1vt3xKP15LH27tJJSKPiDzjkrZlDm3Lc+BqrCMqZvs6ZB4XW5HN47JqQLj86MXfHoOZdxm7sUepfc3JwcxEHhMpmBt4h2Qg6SZRiw2VTKdElBu6FYJSZQyJmKyp0AdHSKq0YtNEpPqZjQlIVXNd5Goqu0mM4xExjioNIKaR8iUpX7JRvmQJdiCCtS7Buq+TScQqEauGGZJKf7xlaqTBsqGcyC3QqA9e7LygIJwIJYE+lyyZBszUJ9efoav18beJxzSN2KnmzGlhMo+JPVUMvkMGlfSUWNSWylamTMSmboVN1RlIYlQbKPfBsao67dg0s6p/bmN2VddkFwyrtrvEsh4Ry6rTAmJaiWklprUR01qBMYhtrcu27vOEEuNKjKsh46r111uyrobLh5jXLTCv9yALB/clMJVCGqAsBQm1YLbO7oIw9qbEa7XnX8VUHiP7mg59A9wraSgxrw0UTa9IxLpulXXNmkXiXGur9cEyrlnN2Bbfmn9qa7Y122CXXGuuq8S0HiHTmtUB4lmJZyWetRXPqsQTxLI2ZVn3bzqJYyWOtSbHmvPPO2JYS5cO8atb5VddLguJXRXSacBcJRt4B5SVDqHXwv716Mzk5q3xmBlEvH56h1TifgrkladXMX3VzNkb63wu1l8kHG50pqceuB3zB4YXcN0C+EIQM7IGvu3Zo1wTCzSt0EoUuQ+edY9Ix5q78PtwhN599Bgs4Rtc/n3HmQbLu5kH/iuY2WgCvZo6Tj/X4LMb+i5cFaEBcZ8Df2q585XFvRnwiFjraGXuZ/4kjng30WLwkfSjfAfdEG6A+YxyiMS6emSdirzZPXRjfSFuWAwlPeMTwfIBHvllBY2DDQxybfjzqT/BPHtG8KCOphYNG7kLYKziG2Y1YUpgLnKN9BPt7lvoJ8IuZB+C8muM1A6xijWWG64tLwxh4ELXnWi5WMwYyTcYKuEkqO3gWuf6x0ME0VaMynVtyjqP6pHONzfloOH+pJ8Mus/1NYFs0HdQ2yUI6w7W8OTRmy5nsOHegy8FV/V/z5OHQ9txcF06zh9969l3rVvuW12DlbqxkwYG7NdhOtODSTIs/ofbk54KVbYZw8SdM+cThoGqYDqGk16vrrfeq4WlrmsQ/DXW603xSTqlHeu1edQrZakOjOHOmadNU9uFx7XgnvNt7T7pXEXC1iINFBS2AdOWQ33Rwn2ZDySj1BU5khGZCU9iSikNj4uDN9OEnVMEsUZzS9ToQDEm5I5VZn9wfrp/j1Mw0wBGfnDnD14YLCPVRB/qoR25QR9TdlNh6B1SEkelS3t/Fm1CsDY8gZZvHmxmWrUg9K95E8hLtLhdqEyLFmTqudVUoBxbNLBc+tM28xgv71rcLuleeUSoohNu7Dkl4yhvoqWp05syOm4mR1apt1A65JsMKxlWMqyHyH+pLd6maTDdUxtneKob7OCgJE1P9/dUeTkThJ8lr7kw0cLq6/hCqbwQLW/lRUJfK6/L55hUdBEnqfIytIjVowC7V3mRZN0MGuQ2bH0hpeZ2lZqrXr1GNFyatJN8GGkCUazJcahiW/Juyzj5oL4MF8gYf6j/LJbGeKJyeJUJRPIvup6hUMb8H/UluCrG+EPTaVgPY/xRnZ0kfda1xZfCOPkwohPH6MQx0xPHSok6Shuumza8v9NJacOUNmx6ypgG9bU8X8xo7dDJYtsIKE4TUTgsPTECPclJp0FM6DIOQu/CmyzDCID7F55FcxxRRuXQjynWqJmADiOOR6hdB0CPMylpm8cDDiObt24/cFVyFnc/2Hk5m9KVTdWwSs0oJpSjFssMHkWGdlz1D46vL9PGTbP25c9uzN2XNdsBg1/a633m8flLN8Qad84al2mMIXfMbhmLf4nFJBbTmMU0cP6Jy6zLZe77pBKjSYymKaNZ6h235DVrrCNiN7fBbkYoEJhpIZHkhT5QHaWoGpBRWCNxk1zUsdWgVc3nMdGn6vF3yJ6SwhIl24nKVagUFafdCv1aYi+pQm0zLT84UrRERzbNiZY+ujElWtJqF1VryzpNpWuPiOksUQSqXytdQPVrqX6tCdnJKdxqBEIMbl0Gd8/nlAhcInANK9mW+fEty9maLyKqabsF8hZFpORuVXJqwISB2YU1vpzEZ/PpEWesVk7DMdGvBpPRIRd75Bq496l9U28RPzZ8y79ztaujVpTFmmOUTI0gZbTugNofHEFrqn2bZmvN+9GYujV9RAeZrcaj2d8sV7YSKce1e+bXVHeM8l2ZlMbsJ+W6Uq6rca5rTXhArGld1vSQJpgoVKJQTXNgjf3uOvmwiTXLUKoNVxhlx26DYJ0kwnHc+dTR58pWCpGPeTKDNWk5n4IQltvpeh5APFHeRJzjdno385iJWF+K7AWIE2y84wxYqSer6uac/cebbHwi9Bt+NmHl2CKhlMjmjDL7d7unrs38KL7OPZ+bsJtOmFrSiZ3jePE4oha1USsL9k79SYztgG2GxqoorWYKmFcwOpdOdPBIz6Uj85BlC+WdZLep9z21RvUYVVkcx3eelqbTzLRVVbEtlhUuP5RJ9IbtD35gP7gY01BjpT9dVx2zZIfefXnGoD/VZ/HZCt+nERuitwNV9xhcyE+MxDLBcwmU+tNIeccNnRvW+tywQ1VR0SPZ1hkfTCbvBmP8Maq81LCQcjrWnVgr+8NxsIJKSVynSbE5Lz6b/urBgJ6PpYKhNOJXBPHZbnSJ5Y9HpJtzd91kAlv4vG5458ehG66cxiXSFLpq/wQ/vGl1zTS+oT1jEMG9xwb/DKgShKM/LQUeP6vledfVYY2OEitArMCeFocsrs/dhvFk1zqyazWLEBbHS/yC6HSqkpUkQ0HxDE7+UejJPnIUep+OqAqiKg5cU5PKZkUjWpu4SI3NOP1UTWEU7M648E11I0pTNFZ+SwxJpzXSPJjfdI8ZZ6BHA3Qt+ajHx51oBv+KNIq2R10yKkcpcwIhrwtCWmh2teYS5UKUy35SLuVbELEvx2b46hEx5dpDnAxxMuZI18grJHqG6JnjUVrRx3IrS6QNkTZVpE281iAnT+BotKsRrl9dBenbP8JLpbcg2vBDigl9VXZI2Z9uuSHSoV3imzpUgiohE4lCJAot0dm1ifXfIWKmnYWoyzfop+T42IZ9gkmVuzohe0L2x6KyKa7XW7NaqJ7gcF04vHJittWLghZCbgwNK2TSGsfk3APCM11h4lxTO4ONC/3aHEYm3doXrNxAKUyFTtiZsDMt2dl1nV1ijzC0meVog6XVU0SYel8ASqkXQNiasPWxqa4SY6utHGHtbWLtZN/Xgu6ckJoAJBDq52D+cLGcz+HST148eSRc1AJzK+bzNaG2sjudImxSoB1/6SGagdlzYv/JEwlDUZsTRjpRrwr1IYhOEJ0W/+zaYFPZ7dcOdsP01AT7+smmLH3R6aJc9zKNvtJ1ITaA2IAj0diEBNBbv9rZ80UrMS5+RdnrnVIIuABmID8n5AJ07lGCSBwoBNse7nGv60hKEKiGvjvYPunPBsH9MUh798RVJQ5Cy4SWDwLXZizqboeca6zlVugzMyUUYt4bz1y1UxKYJDB5LCqrRpMZa0ah5K3iwBc290UgyGXS5OA2L/72GMy8yxi8Ior4tTjUT57I1zzcL9uPTg/5I13ZUVRaW+g6oRIKJRRKS3J2XWbVdxrTmliCmofaKaaAMOwOn/Wl36UJuxJ2PXRVTY6nU1gtwqqbPEjOi50XnHEnwinHI+VkETSAG59cf/YN/LSPv008NtcEOZrD08JkviJEVfSlS5hKerPLULWR8MuES5CVICstzdl1laXfadhqahXqQVfdVBB83V1MULF7E4QlCHsM6ip6p7NgBGU3CGXvYdIddLdgoxbTDupcEEULaHJ2F4SxNyVg0h7QiqncATib9mQTYJY0ZnehbA3B6wVLMJZgLC3L2XW5fd8LEFtuD5pB2Ow0EIDdfUSg3LEJvhJ8PXxlzYHXrO0i6LoV6OrySZeAqxBDAxDywZ0/eGGwjFQiO9QXRXODfkWAWehJlwDzqGS7uRopsETdqRu7DSuj8E2CdblVC1wzWjSB6KrF7UKWLVq48wDUhk4cfPfmraYCZdmigeXSn7aZx3h51+J2f+o9MQg9WbU465dl4jgl4yhvohNLpLc0xHgQ47Gf3ITaNdjtIl60QdEGRRtUEwpOvdqpipzodGJYDA5u52ay+joutMoL0RRUXpQUXa66Tl7WBl3EWaq8DJdo9ShgIVZeJC03gwb5otrHYn6laJTIUyJPD19ZRd/Uu07t6n2JdR4nH0wOrWePGocqxkt9AzfY4+RD9S1ousf4o/pSMW3jicqBV/0nW/Kx/IvJSFArx/yf6svRvo/xh8GAwcqP8Uf1pZKtH0ufTZ7BDf84+UBVGbvk1qfJinQYiRCBmcst0gb062UchN6FN1mGkf/sfeEsxXEQ7MqhvyLNrulPl2T7EUp7k4wGmz7tI7B6TmTzJ9gPXMjO4u4HOy+AWgizsZZUaQHRoUSH7icdWmbId50U3XUTUo+qKpMEEVYpYcVt3x7SIwb+A5EkRJIci8qKHpZZvQaECbt9LP4lCN0lhI5QUqDWQlROYorHap+4AcLC7PlNAqxje81KNZ+viNHV3ekSopMC7fhbV01VoELEBL8JftMCnV0bGP6dfgmrhnmoh61LJoRex9pd/FG9nxNiJsR8JBorOlhiyujtrA3C3xDmXYl+VQJpgF1g/4/icDmJz+bTIw4sV07DKwJYg751iWaPXCM2Fzmaeov4sbNjsDvRijpSJ7RLaHc/campcd/twPNumI96ANh05inQLDrNhLyPYeaaXgMBaALQx6i+oremdrF2KJrZjzH7SWHoLnH4JJGY486njj4oXSlZPub/msxghfPH97jg7nE2Yf0MJrNoBLMa5ff6c1AcdGTZG45sR0903/nE7jzt5dZZ7u8DaHRY8vzMEsJe9IxfuiyaAsQKkc0O8jifFh0cybkxejuWvdUpN5KZgG+e+/3Cu/dCD+zgtfJb27mcPHrT5Ywl3tW6kcds0ttPJWX5BohkuVgE+NYgzDDCnFvZIg1vGZ6Q7pgH1m0ynbe4zuazFVr0eeSDOrtMa9FbRg2+gy9A4PgRWwfc0pORAjwOFgDr3Cj5NWShKLTOAZrTRMPxdlg4PoxHaiJ9FsMWt5JO3MKzprgUYBDQFqCMiTvvx3hki+VKLYTJLGEfg2UM2OcZkJYbwSABBok5WC8jcB/ldw1RnKeql61B1CWIQoADG3qT32XgAdLrm8X22epwfTAIF0swFU/exzAMNLtO/4sfRShSsUWlLSeQEqaMf3P7n1Zf3QQC4FWwBBOEDTE8x6aZqQVMmHXBxveXfpl1FAObs/dH0+0+ebupBvYatpiMW6HPqEreNO2/K6szKImFCo2aC0aXXwW7g2slHbErBwp+z7M/YSfWipX0V7DVl+JbG/E1/wibjVoB0ha2oQHJw7agAjmrnrFSxf6/sa5+/vDz4DGOF9Hpu3cP8LDlnT0Jnt5xRXk79Z7fPQXz4B2MEZyNd//6ww//MTy13Ok0tWm49hO7xu2Ju1jMkKDAfdlWPBN2GtDTFz5Md/biriJc8asoUQXcXqVGOM8xAbMVI0Pz6CVTXGxcugvfWCsC5swLbUkz/GwpWBz3turttkhYdbZfjY02gJFi2Of3rO+M3Zr6UzSV0cKb+PcrJG3YBmfx98TBlD65K+gnOC6WB0Z2uUg1g83MW4DyjALJ3Kd6KLo2OH39CLbvCWwfU4txRmCMQa2tgPeJ+eS9Fm88Jho+Tj5kL5GU1FxBt62cG1PMSqWseMPSSP/UmmcgwsTbKyH/C56gxAmzwa8FByhnlgEEu80YOk4y5YhcW7L9GXdWciD5HAm4VnRzleAZPkov6ZoQmPJDGrCUTv1Hlz9C2QepYft8/VnVnaZ9MHoEQwbxcjHTOPSjgvAKTGcaJKGV0/nKqa+8bZbQZvW4g+4YP01CzLEfz7yGBZAw2tXwVnf6qweq+Nzk/k4XZeXCK49V0mqs2Me2vkqb9WIHVu/ebIpkQThfl/ARtwn3dTuykFo7uQP/+YThiQizFqR7bhfgWCeXJwxINLKW85mHKN7rh96a6MDFHwYyJz0LggXycyIlAplnxBMrlhwBlitGizIBWPPghghq8o9G7MkARoZJeyNd9jXpCWvyRPQF2Y3ZSe7B67HKrHkyauvW5tCIPUqxuGsu4UQHVbbMaUsm97oPwPd6ujh3lQlWsXCZXueoN3kiWJCt6gF1o/B5ozZSm3oFIyhJWxf+yzdeHenM31EZki/2v6sIvXnnzXpc2U2NgdZnATDrXFm0j+UtVV2UWlz1lRVxagPR14lFdy/T3dVNrdCLQ8o+vFRVKxZrEl6WV7hRDJlp3Jj9VMd7UdnG+EP951TNxumnUUmKhDerb19NzFfedNUyqrup9W01foe0vZam6y2UGNFAsRaq5K1Nt8mPvcl2r5fhcGSdnM+f3RnmnoYPyydvHjOAalsf4CsMDi1gVKf/mJ9Y/8jceWJZb60zq5/0p89paZH+hgw/tGL1RbkZ6IWdcTr6f9E02RcjEe2h66drUB5W/y8npcq5N+utsb6aLL9exwa61DiXGOZKozzM+LsafydvYUGBmaPNoVjW3T6br0bI06A/rVqfmiypYd65zXjHUq7nqSIK9iHAaJs/n8yWU08ORuMWw5bKLd56y/KGUNsVbQByemHN3IFgvrNozyKIfI4d1kt26k2XjP2xFWPj82L9C4xc7v5o2NNeV7abj3rGOVnDUmywnvOWiQJy7p7aixDEWoohuSjTDtgcmDoMmA6GyibQ3Fv6PLfkCTlcrHkQIm/Nc9JnyS2uQb7ynuK3QzvP9GeyFhNhVyaL1pJZyhiez318gcH/p2cotWSs6TqPZ6tB8zFIADwpFdwA1f8YLiZfxO0KaC8HNktal/LDckZNmTSenShd1/gOxX7JJotX0QkKg5bebcvV7/WGTZ7TbIJ52kDZQ/K16cselJ3i3MPkP+ZmNmuji62b7ikKPgTEORBzjMWSbfzxb4OhSZJ1gVlZm4UHb44mw1t3Kk4vVqs//ysqgMM22mQFJQ9J/6LLkxU5E/xuLUXEL/oJrhn0MwUEhb/whb9U1ddk7fJQyLjPF3JffZFcIzpPWpQv7jTJT3ZhignXmV0vm52Q17Fe0RDi3cu71MtKn2g7PMNRtorDfMbJoOBypfdnx5bzvzhDjA7YL/jaWVEHErvJ+1ZqKUv37toCEGLlhdhlW6C+tHS2RxX7z7CQMNI+HbtlKrYqDZvn4mCONfvQIECPEcLM3sdSrWEHdSOjxGPrTyPrMXg5rQAUfwtelPmr8jW/fLxwvv188T+fPv/8LZvLnWaQn0s9bZuaoB45DOe7tz6Mh1nar1/PP+zSKCtHos5YNxeqKjwmz4rGj0knq9iQPHn1wncwpyVZ7lWTls/6V16eM5WyUTLIuJYuVxhLnPMx+1k0OTClY/i/+AeYrTH8P6owSUpFyDjtnSjCsDCd0FrWYWYtVvVqDU621a1eQRTZKcV5rl6t51cfL86uzn/+yUwAAulBZ+r2sLo7Z5+/nf39UpvMiNsh6xI4UOnnwX0Y/BO2wKtw6fFNjqda65ZOT7UQTs0Jo0YFFhROxP6+kf36OZZt3gxvmfWy0SIg7XId2lQAIQXdTCrj69QdaZPr0zLfp23Oz6bWQs2EQVoAG84ePEATTgtRsxDfWF//1/KfFiHsQBhVObUmj97kOw9Ezj2fvcmjir68uJHlTvA9p3kMU7/KtfoAI8MEvIeLX96nB4eyIGsdrncOXyZ6KHhfiYyX/zJWJyS0fJhEMps8TEvAdZZc103+X2mEquvcuvb5dQ0q3VQk1Rkm1jlq5lAbx2CvaefeC65T1uZUGxzjr8hewTTz92PvTz7+tkD7MX+w7oNlGD8qFyl/a70yj2BkPUCn+78LrVfNxNB2BLP+R/9EkStnni9nnDNnnjenDz+k8qqqW6QWXaNkk2ZSBH8mnO6AEE3KzfQMFlTj5DejBDiDJDjjRDiTEHA3CXGtk+J2R513XZWN1LjafmQjqyV5bOUT3zqBrb4QIg88Ja0UhGMnCwPczT4mdJlKpWpMdSVUuRAOJNu2Rt5Wr3kmVprZNNZnB5UXycoEkJvFWCvrVsl1qkrOSTZLNGg/4K0Np6dNCspuI8WRpBlA2tzB3S/elY8c996U/GcltWZA0bEk09RdYLVXq+yeHqBarHdzt2I32b9GUhWaJ1hwaAZ5YQpWhnYywRe2RBFYNhdoxfH6t8/wLNeGBi+8mffscuuZNIaVwcJQ+gOf1sju9XigIznfTFyPnTnDAYCtTgSNxUZmXhzMk7yTcHha+WKtg7ri3IN5nOAOgyWANJGt+yUo15pjSMr7fWJfry/jTznFTJ9CiOvl0Qd/HmM42VU3ZUH4hTef4n4zVtcRxO+KWnzNu3UzUmTXPnnBMh7/+wgViG9iUUl+5RvrPeMrwDi+eP1nXmxlarFaSCDDWfCAVbzccM4dE16RxQ9zbbB6Xo9uBBuiN7fSOWUaz7NWeYWYcDnHhuy8XZ558wFOx9Aaj63/UzRO0I0HkLXoh9o+3Z+8x16wcstsKfV/5x/+6Cu7tkrryWDBsRNlmyd//XplfftonV18tC6vzj9/tr6dnV+d//QjrxUYg7Ljcog92/p7sGQFo5IFvoCtE70LTcNJrS077dEtWwCJMNZ9Y51f9xssDmbYa5qdsrzfaWDBRHu4Kt1wxawPeiZMv7DjUYAzk0oUK/jMvWcstDaZLEP7pFedK5pYt2wNF8w3li3pT8ELtAy9ZlYiXiLRZd0yRb9lQ+R6nOQyY+YyG4HUxKP7jOYEBgR2PvShm1PL+23iLdZlbR68OOIqMlW/UfrTz1cfT3mtnBemhszvg0bXDYkpF6rDLoDnPHtZcxwsHx5T0TDBuDOsUbfSKP4T2PcIPkiNPAUhbh+eG6bLKffUZDKwt48r8UYueCqZV1zjCZMfrtHoBToTvPBfV+sxreeCWxY+17002u04/hysoDPA2naSvWKl7pxfo3VpsnVdvLH467qApHTdYGjlIw9uHIdv4WH+3JverB/tLmHAof9PuIc9HLlYY4YPb3bWLUT2Wfr5phC2z3c392TNOI0GIm0nqAODzASOerkagKc1AiTrm3+NgnniNcm7C04Y/LYerrhmncOEd9oYEo0GciOSo8OyKuAG8RdWfq7PvuzLV3EGqf8YvGD99eRqOT1o3cY1u+xGTqxlf1dlViWZLpFIjVC+FsX7qHrPSchXtPsQBOAFOKzc/t3yno0e9/cnN7ZFqdKr4L8jOYEluzii5QIV2GY+e5rybzPBCjENdR6j6CuOFCbouoIzX49bzicb1bpLkddyUyhc1m5qdG9GZCcqk7IkUokUHICBEsiToSQnFU9epyUpHq0T3rCwellK7kaWL0/2zUcZ0E9hpW9ZiGqU++sZTnxaGfemhi1QBISTdGM2Z6c6lRAFfxN1yLEl7AgJRcwidCfY32jhKlYVx74M+d+f/J44O7k08z8G/dyffPDWhieKqn3wEN7aiRgSIjEJD5yoSgriERZwE9sZ74JnrFUI+6aXQBWOyJADQArochL6C0WhxgW71uEFEP0JS8YqPgwwjDcb62fpCv71PuNF9vuvl1c/f/l4kUOgRa+XCTz0ouVMJPanIEFIVekD1l72rOlhFcpurAkb0AalRlhvLRZAs94Hi1W1dnSoIeZa0ommaLSFW/6MsmhcAfkqTRSD21icSaQA9YEGA2X7xQ0j74M/icvrvcuduuZvCPdvysu6cwdOfnfFGZRUgte9BlcWOOvzbjHPR+5hyezDvGfHIpq4KY35ISfML2QYGOy55hFsa+dX9nbU+9ui+1fqvOX29dyOrnglVVQf3zM/T+Wp1fPSWnpodb2zRDJpye9k4tkyGIPupy/uCJbPSuxqciDXaUWJygY+nHyUce6sgFMr8xrbA++Us7j7IXmlbSQJhXHgJbdkIixyNbCqG3gCkkQs7pZjJu23Qh577ZTtthfMJ5jzP17I35u2bmFAT4sAj05AjHF7iE7x3QrWCQvuSu9r3cXO85/d2eLR/bMzBzX8NWILJzsdav/juz+fjivaUe0LOdtS1YQwLHofyOit17VOSTXh1aW4y9771SiivgHORGdexByvCezC30oaCoLv/roD/NeS/JPFwkkKyKc3yV+W3LqMH8flLifLN1gfsWHjLdqaOoUNT77LjgPu/DpMPUuqNJT4p8lOi7Kt13HpTvP+40vpigZqd13zNdMtXiYeI3PcQl0Fl3GIERzNTWLzHIt/zW4cqi7LevUpMa8J5F3jlN2sDUr2r/nWuAkSTn4uQKihr3OPY8yOMps0Dlen+4K749S8Hgu+Vkg+DYmsZ2NQET0ox7PKgESZRdWgmYLu6y9Z76kjw1IxclztxUtjfLeJnkePmDB0Kwf2MDjKosCaxiZBGHqTeLZaxylZxE5MMwZHRbCVxeV4xFrTFlYAS8dtlwFvlUTLjuPMa4Eubs8nYKBoPpeMw6J1+bvfJ31neWlFXVyPLfJi0fwA+6tgMyQxfQF9X8/uraJzt9adN3F5DNuPFG3xs7W4Q3SLQeXbeP0yED9nCx70/uwnfCqMzpssFWzJG+sJnumDNK3Ix4/u3AuW0Wxlq6IHFTJSL1XBDLAlVZbtYbDE9Qunn0036o9MKSYW6lUogqok2Bf3O8JrLMucaDWLGt9KqQNiVkRaIsyZdLjauiUp3I2HwITBy5yVoOOxb6HQ8Ccc1DKcs1i0oplMqN76jtlSbsiOcoYmgmU48bCJGUwIMwp+rCtU9uQ/POJRc6hvS5ZKFC7nLPckuAeH+CkIVyxvIQgjb8QfhCBT0dJ9GDzB8HyWupmoMM88QeHzNP9Q7Dp2yXrinxQOnEJiyjw6RVP7sp8LBWCELdK+3Jc6Lu68Dqi8YHfY66kysyqmNsK/F32y/+ZGLAF3IHhxzQgaq9WGVCunXjwqYaZdHWtYPS3rTNNKtK1OkIXhggoC0kgLs6pu6yMZ5Y5fTX1dRiwc0S9Nwh9UHYms/bvYe8/ughA2HP1luEU4vD/lM2Qa06o1z2ISRpX3ZJ8eLiaiz0zYl7z7FccdD9uHwIR3XJBnKEjo/l7taqzLBpZHuzOwOIshPy+vRDF/SRekSm/FIztPvs499vaJN032IubVCCq9kLbC1kWbiMcFO1x3GxEPdkuNgIe4Ph/v6Ir6NaF8+cnDo16XVG9C8bLh9Q1O+9Qzu40Z3dZMriGD24C5LWFsazO1DRhahVGtZmSbMrH1GNihtpxYbaa1FsNawax2x6puilEtsKmbIfBqEXdawq6EqNMRdPl3OTog5Log4koJuAbEW1eEW32yzZRoS6Z+OZ/53z02ZyU02Qin/8PPeE+uFQcF57BXxsxpOkbK5Rri+1fCx03Yuw6Mi1szb/ySKHdjjo8DDAbacuexV2Jd2IqwOf4yz4t4aQtLleSrlwTB1LqHody5SS0UZJiwlknxVZwR6yUSV/lmmD7AHeFTyuIk4+ZHJIshrFUZ/q54NSmvgk04xSZ8ojGXmPKIOtcg/8pjhoxSUYfd0IYdUIad0IXdUIWtaMIKijAnkQI1WEULboR90rJOw8Kb0XWRexlqL0PsXMPLwLoZUO8GpNcF6C3BufFBDL1eGzBehVcz8KpruMoaL6LVSxB68nb/fqTpyT2ugV2zt+1Ryp7ccUrco8Q9Styrl7gnrx9K36P0PUrfo/Q9St+j9D1K36P0PUrf2+30PQPfjZL4KImPkvgoiY+S+CiJj5L4Ok/ik3dgSuWjVL5XSuVTsfddR0gyRHshUCKdrdNVzKR4XA8FTjoMnGgkRjEUiqEcQgxFIgi2E0jRrCeKqVBMhWIqFFOhmArFVCimQjEViqnsdkylnhtH4RUKr1B4hcIrFF6h8AqFVzoPr2g2Y4q0UKTlgCMtOmZeEXRZXQXvk0OCCkzlDtRW4KptJwvL9p4W8Yrd8xE/SQGWiisPr5yCUnhUXqEG+0vlFUp+pfIKVF6hO3KPyis0Ie2ovEKmESqvUI+XlDhJM1eByi1QuYXDKLeg1Hgqv1D6bTflFypwWPdYVyHoKqT78TeOFgjx7jHizQmRkC8hX0K+hHwJ+RLyJeRLyFeFfKtdBkLAhIAPEQHnNJ+Q8KEj4ZzAFYgYvNXPwfwB2p5DFz558eRxP8rqq3pefOHu+NCxYloIFBMoJlBMoJhAMYFiAsUEigUoNvMUCAsTFj4QLKxQeILABwiBFXKuRL68tP5OFeffQAx4lwvJqORBZWSojAyV4q9ZQUa1kKh+TFOqyIAyakwdtaCQSqgkc0qpLbXUjGKq6DrVj6H6MVQ/hurHUP0Yqh9zvPVjajhxVD2Gqsfsw/ZO1WOoegxVj+lQ00q0LZ1yqh7TunqMaium2jFGQjQULdWO2bWgiaDfC1GTH73422Mw81A1vP1IFMx0uUZJfvGow0sRzEwI5QZSbiDlBlJuIOUGUm4g5QZSbiBHe1UuAiUFUlLgYSQFZjSdsgG3kA1Yh2rqAtlmJFxEtJ9cf/YNDM7HxLJQHZj9gLEFwRGUJShLUJagLEFZgrIEZQnKCm/SwE0gOEtw9jDgbEHbCdIe3gtuBSHrUa0QP2Ha/cK0QmyEaAnREqIlREuIlhAtIVpCtFlEq3cSCM8Snj0sPCt0ndDs4aJZIdsEy/7XZAb958AoB26/CT94LaPJLKpZrEU0UYC1DVCqFgInD0lO+HwdvJqghs0g1mSMBFUJqnYDVXcTfb6xPvvz79Zywb1phVvEXkhBN0fMQQqj/FhqJXEc8Gp/LnwH69kHJJDOHVwyGN7CJWAeUqAltQGCX7gP+LbbbRaXgMvPfWlwmB4emUtj/xrZector31SGHr6efNQO4G++NRZZDtrLOzYD14sabHYutIbZNRXH7nzRtqh96QNQvCE4F8LweenP7XopRg+uWivUTyf5C2ieGagNgfiS/wmQu+E3g8DvSdKTrC9Y9heJ606j0K7xu9J+8Ug9Ad3/uDB6ucDiHaquKr2llynWxwpssPFVnODpDKrVGaVyqzWK7OaW0JUYLUpT2bAlzXmzVrwZyU8mjmf1pZXa8avVXSdCqxSgVUqsEoFVqnAKhVYPdoCq2buG5VWpdKq+7CxU2lVKq1KpVU71LQSbUunnEqrti2tmtuEqaiqkfgMhUpFVV89tTFPsxciJJcxgM0LcLnDyH/2vnhR5D54+xEnUXa9RnlVzf35TMkdDqIoR0ChFAqlUCilXihFuZAooEIBFQqoUECFAioUUKGACgVUKKCy2wGVOk4chVUorEJhFQqrUFiFwioUVuk8rKLciim4QsGVzQZXmlH9Xcdc1Kx8IfKCVQ27DLxs7zw7Vc9rxF3Ut79mgYpNFlRUjZZKVdRgiqlURcmvVFWRqip2RwRSTYYmBB9VVcw0QlUV63GYKX9p6ClQcQYqznAYxRlUCk+FGkq/3fABeGXQrGuYrHpWESUDvgL3bjmJz+bTznMVr9b78jZwc+VYaoBog7b2KJGxcjSU1EhJjYeQ1Cghge1kNlauLMpypCxHynKkLEfKcqQsR8pypCxHynLc7SzHpg4dZTxSxiNlPFLGI2U8UsYjZTx2nvFYuS1T9iNlP75S9qNxrKDrEE81rQ9i6vXelPxnXSTAlHldlosRAwz7l93Ue2N9jaAvd6vkBBrrm+d+XzflI7x78uYgJ3BEmdPnTsBjTIw6AMApo8ShJcTHb5/hka4NnQGTLFIfJjMfGojsXo+dE5aYiMyDpBjHID13Qb7gWvmt7VzCDjNdzrwbEHkuIsbQcxH4w84Uhv7Uu9HEw/4khcagAfduVqCS3ovvr681JuaJS80W0rsZ5Ro4QzcXW7hZP8zlds/hncWf15k1aMMatMVFtjCSN4WomuL2ys6lbTDLmIbnQCOlABv8dpp/GLhf8mNl57lAmhkbY7kTo6T9fB19YQkSpJ8IalC4PAvmK5/OlinokLXA3xyviPUTMbE/Sf5nUUaXqyj2ngrHuucmRHZcbdYo3yG+zr/PAfGptgghQLSxUjf/+E/rRLdfnFyJDKhltISpWnEUx9a9C2vFW8BXc5g3+CqZm+QpI+vl0Z88Jug+Wi4WbEB4b1qc5x9z7aOtk0vPY4h15j/5cWRhCtOp9RjHi+j03bu0ian3jL88gL+OLuTbhyWs0Yj//S2/9d1JZY4PN/BialG69nT5tFD4Cb+rU4z4Ft0/NVEYsX6ugg/+pCTAlFEYjEoI18U0k+EPTTKj0Oy/uqC1KVMAmpvSBqf5fBU/8mGbQZw7SC8aZeyOKmnFeEr107qpqV1PA4ykcmr1ftMfvfLrqhKVWqtd6o11OTtJow31LL+bRmKnbbWj8mirtLeYZqBkqmVZ/69eskr59bkDRpUXw/csuGl/FB+KaTBievKjQOfP+QBu7hV8wMNT8d//G8wlNAtT97QIYnBoVlVBK6lL0l32+frz7roEbT2AntqUJdEWY+3JGbnYjb6njsSDF2NgqLiohPt5KcJAV3CTxgQmiQmlUSAOfELvPg2hO+lXI5O3LvhCyqVuDNJJS7RxnHzoeqPEWTufdmqvsEkbf4Bqt7FZnI06m06TWUBGyp/zzuAmGQfMH4EpBJAUu7Zsndg3KkuE2hzZPwKO/yKuAqXJDmZQvOuR517bV2eX/+Ncvv/bxw9fP39ci8f2o4D3azCUXymR/Gg+HwUFBT/MCwdD24mZJgotGo6EYgwHqhdasuoiGZCx9Dl7UTIl4+SDspdm6lRUpRZqJCYmqxN/9PT7F0+Dr797Nd6yMu8ZVmxBu767bXArSf8UsL0uKt1lxDVr3MV0bRa402ggNyLvFp3uroUMEdiM+tLFfbA0SS9PdcstDxuzEhOTb0s3FI2mO/PdaCwedJ3pwQ07oLfPrugrto7v3qr0Rvi76rbH4EWTA1U+e2efv539/VJ5I8xd+Qhe3FXUH1mf3FnkDfXvCJZ34JePF8751ceLs6vzn39q0g+wtOewLtjm0S/phjI7If9aYi9nWJxHdz6deWuVuF/OJ3EQzCIbwH3su7kkysIGIOxaYQfIPjeTJygGy0Z3wv9yhX84GdbcIYb5HUAO8U8KCaAJTTPODH2k5FfQxoyr3LFksNa/WH1BtPQNDiznjcu/ZC+TLdU4442W7C88AWOL+wvtBLQT0E5wCDsBak4CCfRq8/Lozdf6kl9tyDMAhHxa8LSH5LccF4ZtsODVf8MSEQGsdMBpF26u+3hh/0Z5fK1s41NSSFfWQYVTjVByimAN6RQeFi5OxwBHolBiI/RTY88w3Dc24wOIvafCBzAacm1HgXyAtQ8gJV6SI0COADkC5AiQI0COwBYdAWHayRV4dTogkcT2/ABikcllIJfhyFwGkeCrdBvWV7V1GWq7C73avkKJn1DqI2zSPzDaJjvdRXpvrJW7uD+1vDlujb3/D1OqAOyWehkA");
}
importPys();
